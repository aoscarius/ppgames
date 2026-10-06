/* ========================================================================
   CHESS GAME LOGIC - match lifecycle, move validation, bot AI.

   Mirrors the poker architecture in game-logic.js: the host is the single
   source of truth. Every function here is called ONLY on the host (see
   network.js hostHandleChessMove / startChessMatch / etc.) and mutates
   gameState.chess directly; the resulting gameState is then broadcast
   verbatim to every peer (broadcastState() in network.js), same as poker.

   Rules (legal moves, check/checkmate/stalemate/draw detection) are fully
   delegated to the vendored chess.js engine (js/chess.js) rather than
   reimplemented here -- exactly like hand-evaluator.js was verified
   against the battle-tested `pokersolver` library, chess.js is a
   long-standing, widely used, well-tested chess rules engine, so this
   file only has to translate between gameState and a `Chess` instance.
   ======================================================================== */

// Fresh default state for gameState.chess. Called whenever a room is set
// up for the chess game (see resetGameSpecificState() in network.js) and
// again every time a new match starts (startChessMatch()).
function defaultChessState(){
    return {
        fen: ChessJS.DEFAULT_POSITION,
        moveHistory: [],           // [{san, from, to, color, captured, promotion}]
        whitePlayerId: null,
        blackPlayerId: null,
        status: 'waiting',         // 'waiting' | 'in-progress' | 'ended'
        result: null,              // 'white' | 'black' | 'draw' | null
        resultReason: null,        // 'checkmate' | 'stalemate' | 'insufficient-material' |
                                    // 'threefold-repetition' | 'fifty-move' | 'resignation' | 'draw-agreement'
        drawOfferBy: null,         // playerId currently offering a draw, or null
        capturedByWhite: [],       // piece letters (lowercase) white has captured from black
        capturedByBlack: [],
        positions: {}              // position key -> times seen (threefold repetition; the engine is rebuilt from FEN every move so it can't count them itself)
    };
}

// Rebuild a live chess.js instance from the serialized FEN stored in
// gameState. gameState itself never holds a Chess instance directly
// because it has to survive JSON.stringify/parse on every network sync
// (see publicStateFor/fullHostStateFor in network.js) -- only plain data
// can cross that boundary, so the FEN string is the source of truth and
// the engine is reconstructed on demand wherever it's needed (host for
// authoritative validation, any peer for local legal-move highlighting).
function loadChessEngine(state=gameState){
    return new ChessJS.Chess(state.chess.fen);
}

// Position identity for repetition: board, side to move, castling, en-passant (not the move clocks).
function chessPositionKey(fen){return fen.split(' ').slice(0,4).join(' ');}
function chessCountPosition(cs,fen){
    const k=chessPositionKey(fen);
    cs.positions=cs.positions||{};
    cs.positions[k]=(cs.positions[k]||0)+1;
    return cs.positions[k];
}

function chessColorOf(state,playerId){
    if(!playerId)return null;
    if(state.chess.whitePlayerId===playerId)return 'w';
    if(state.chess.blackPlayerId===playerId)return 'b';
    return null;
}

// The two seated players who are actually playing this match, in seat
// order. Chess is strictly 2-player; any additional joiners are already
// routed to gameState.spectators by handleJoin() in network.js (same
// mechanism poker uses), so the first two non-spectator seats are it.
function chessMatchPlayers(state=gameState){
    return state.players.filter(p=>p&&!p.spectator).slice(0,2);
}

// Host-only: (re)start a match between the two seated players. Colors
// alternate each match (loser/second player of the previous game plays
// the opposite color) so a running series doesn't lock one human into
// always-black against the bot; the very first match assigns randomly.
function startChessMatch(state=gameState){
    const players=chessMatchPlayers(state);
    if(players.length<2)return {ok:false,error:t('needTwoPlayers')};
    const prevWhite=state.chess?.whitePlayerId;
    let whiteId,blackId;
    if(prevWhite && players.some(p=>p.id===prevWhite)){
        // Alternate: whoever was Black last game plays White this game.
        const prevBlack=state.chess.blackPlayerId;
        whiteId=players.find(p=>p.id===prevBlack)?.id || players[0].id;
        blackId=players.find(p=>p.id!==whiteId)?.id || players[1].id;
    }else{
        const shuffled=Math.random()<0.5?players:[...players].reverse();
        whiteId=shuffled[0].id; blackId=shuffled[1].id;
    }
    state.chess=defaultChessState();
    state.chess.whitePlayerId=whiteId;
    state.chess.blackPlayerId=blackId;
    state.chess.status='in-progress';
    chessCountPosition(state.chess,state.chess.fen);
    state.status='in-progress';
    return {ok:true};
}

function chessGameOverResult(chess,repetitions=0){
    if(chess.isCheckmate()){
        // The side whose turn it is has been mated, so the *other* side won.
        return {result: chess.turn()==='w'?'black':'white', reason:'checkmate'};
    }
    if(repetitions>=3)return {result:'draw',reason:'threefold-repetition'};
    if(chess.isStalemate())return {result:'draw',reason:'stalemate'};
    if(chess.isInsufficientMaterial())return {result:'draw',reason:'insufficient-material'};
    if(chess.isDrawByFiftyMoves && chess.isDrawByFiftyMoves())return {result:'draw',reason:'fifty-move'};
    if(chess.isDraw())return {result:'draw',reason:'fifty-move'};
    return null;
}

// Host-authoritative move application. Returns {ok:true} or {ok:false,error}.
function processChessMove(state,playerId,from,to,promotion){
    const cs=state.chess;
    if(!cs||cs.status!=='in-progress')return {ok:false,error:t('noMatchInProgress')};
    const color=chessColorOf(state,playerId);
    if(!color)return {ok:false,error:t('notAPlayerInMatch')};
    const chess=loadChessEngine(state);
    if(chess.turn()!==color)return {ok:false,error:t('notYourTurn')};
    if(typeof from!=='string'||typeof to!=='string')return {ok:false,error:t('illegalMove')};
    if(!['q','r','b','n'].includes(promotion))promotion='q';
    let move;
    try{
        move=chess.move({from,to,promotion});
    }catch(e){
        move=null;
    }
    if(!move)return {ok:false,error:t('illegalMove')};

    cs.fen=chess.fen();
    cs.moveHistory.push({san:move.san,from:move.from,to:move.to,color:move.color,captured:move.captured||null,promotion:move.promotion||null});
    if(move.captured){
        if(move.color==='w')cs.capturedByWhite.push(move.captured);
        else cs.capturedByBlack.push(move.captured);
    }
    cs.drawOfferBy=null; // a move implicitly declines any pending draw offer

    const over=chessGameOverResult(chess,chessCountPosition(cs,cs.fen));
    if(over){
        cs.status='ended';cs.result=over.result;cs.resultReason=over.reason;
        state.status='lobby'; // free the table for a rematch, mirrors poker returning to lobby-ready between hands
        appendChatMessage('System',chessResultSummary(state),true);
    }
    return {ok:true};
}

function requestChessResign(state,playerId){
    const cs=state.chess;
    if(!cs||cs.status!=='in-progress')return {ok:false,error:t('noMatchInProgress')};
    const color=chessColorOf(state,playerId);
    if(!color)return {ok:false,error:t('notAPlayerInMatch')};
    cs.status='ended';cs.result=color==='w'?'black':'white';cs.resultReason='resignation';
    state.status='lobby';
    appendChatMessage('System',chessResultSummary(state),true);
    return {ok:true};
}

function requestChessDrawOffer(state,playerId){
    const cs=state.chess;
    if(!cs||cs.status!=='in-progress')return {ok:false,error:t('noMatchInProgress')};
    const color=chessColorOf(state,playerId);
    if(!color)return {ok:false,error:t('notAPlayerInMatch')};
    // The opponent had already offered a draw: offering back simply accepts it.
    if(cs.drawOfferBy&&cs.drawOfferBy!==playerId)return respondChessDrawOffer(state,playerId,true);
    cs.drawOfferBy=playerId;
    const p=state.players.find(x=>x?.id===playerId);
    appendChatMessage('System',t('drawOfferedBy',{name:p?.name||'?'}),true);
    // A bot opponent never clicks the accept/decline modal (that's a human-
    // facing UI affordance), so without this the offer would otherwise just
    // sit there until somebody's next move happens to clear it (see the
    // "a move implicitly declines" comment in processChessMove above).
    // Resolve it immediately instead, same as a human declining on the spot.
    const opponentId=color==='w'?cs.blackPlayerId:cs.whitePlayerId;
    const opponent=state.players.find(x=>x?.id===opponentId);
    if(opponent?.isBot)return respondChessDrawOffer(state,opponentId,false);
    return {ok:true};
}

function respondChessDrawOffer(state,playerId,accept){
    const cs=state.chess;
    if(!cs||cs.status!=='in-progress'||!cs.drawOfferBy)return {ok:false,error:t('noDrawOffer')};
    const color=chessColorOf(state,playerId);
    if(!color||cs.drawOfferBy===playerId)return {ok:false,error:t('notAPlayerInMatch')};
    if(accept){
        cs.status='ended';cs.result='draw';cs.resultReason='draw-agreement';
        state.status='lobby';
        appendChatMessage('System',chessResultSummary(state),true);
    }else{
        cs.drawOfferBy=null;
        appendChatMessage('System',t('drawDeclined'),true);
    }
    return {ok:true};
}

function chessResultSummary(state){
    const cs=state.chess;
    const name=id=>state.players.find(p=>p?.id===id)?.name||'?';
    if(cs.result==='draw')return t('chessDrawResult',{reason:t('chessReason_'+cs.resultReason.replace(/-/g,'_'))});
    const winnerId=cs.result==='white'?cs.whitePlayerId:cs.blackPlayerId;
    return t('chessWinResult',{name:name(winnerId),reason:t('chessReason_'+cs.resultReason.replace(/-/g,'_'))});
}

/* --------------------------------------------------------------------
   Bot engine: iterative-deepening alpha-beta negamax with a time budget,
   piece-square-table evaluation, capture quiescence search and MVV-LVA
   move ordering. The search stops as soon as CHESS_BOT_TIME_MS has elapsed
   and the best move of the last COMPLETED depth is played, so the host's
   UI never freezes for long no matter how complex the position is.
   -------------------------------------------------------------------- */
const CHESS_PIECE_VALUES={p:100,n:320,b:330,r:500,q:900,k:0};
const CHESS_BOT_TIME_MS=800;
const CHESS_BOT_MAX_DEPTH=6;
const CHESS_MATE=100000;

// Piece-square tables, written from White's point of view with rank 8 on the
// first row (the same orientation as chess.board()). Black uses them mirrored.
const CHESS_PST={
    p:[[0,0,0,0,0,0,0,0],[50,50,50,50,50,50,50,50],[10,10,20,30,30,20,10,10],[5,5,10,25,25,10,5,5],[0,0,0,20,20,0,0,0],[5,-5,-10,0,0,-10,-5,5],[5,10,10,-20,-20,10,10,5],[0,0,0,0,0,0,0,0]],
    n:[[-50,-40,-30,-30,-30,-30,-40,-50],[-40,-20,0,0,0,0,-20,-40],[-30,0,10,15,15,10,0,-30],[-30,5,15,20,20,15,5,-30],[-30,0,15,20,20,15,0,-30],[-30,5,10,15,15,10,5,-30],[-40,-20,0,5,5,0,-20,-40],[-50,-40,-30,-30,-30,-30,-40,-50]],
    b:[[-20,-10,-10,-10,-10,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,5,10,10,5,0,-10],[-10,5,5,10,10,5,5,-10],[-10,0,10,10,10,10,0,-10],[-10,10,10,10,10,10,10,-10],[-10,5,0,0,0,0,5,-10],[-20,-10,-10,-10,-10,-10,-10,-20]],
    r:[[0,0,0,0,0,0,0,0],[5,10,10,10,10,10,10,5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[0,0,0,5,5,0,0,0]],
    q:[[-20,-10,-10,-5,-5,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,5,5,5,5,0,-10],[-5,0,5,5,5,5,0,-5],[0,0,5,5,5,5,0,-5],[-10,5,5,5,5,5,0,-10],[-10,0,5,0,0,0,0,-10],[-20,-10,-10,-5,-5,-10,-10,-20]],
    k:[[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-20,-30,-30,-40,-40,-30,-30,-20],[-10,-20,-20,-20,-20,-20,-20,-10],[20,20,0,0,0,0,20,20],[20,30,10,0,0,10,30,20]],
    // King table once the queens are gone: centralise instead of hiding.
    kEnd:[[-50,-40,-30,-20,-20,-30,-40,-50],[-30,-20,-10,0,0,-10,-20,-30],[-30,-10,20,30,30,20,-10,-30],[-30,-10,30,40,40,30,-10,-30],[-30,-10,30,40,40,30,-10,-30],[-30,-10,20,30,30,20,-10,-30],[-30,-30,0,0,0,0,-30,-30],[-50,-30,-30,-30,-30,-30,-30,-50]]
};

// Static evaluation from White's point of view (centipawns).
function chessStaticEval(chess){
    let score=0,material=0;
    const board=chess.board();
    for(const row of board)for(const sq of row)if(sq&&sq.type!=='k'&&sq.type!=='p')material+=CHESS_PIECE_VALUES[sq.type];
    const endgame=material<=1400;
    for(let r=0;r<8;r++)for(let f=0;f<8;f++){
        const sq=board[r][f];if(!sq)continue;
        const table=sq.type==='k'&&endgame?CHESS_PST.kEnd:CHESS_PST[sq.type];
        if(sq.color==='w')score+=CHESS_PIECE_VALUES[sq.type]+table[r][f];
        else score-=CHESS_PIECE_VALUES[sq.type]+table[7-r][f];
    }
    return score;
}

// MVV-LVA: take big pieces with small ones first; promotions and checks early.
function chessMoveOrderScore(m){
    let s=0;
    if(m.captured)s+=10*CHESS_PIECE_VALUES[m.captured]-CHESS_PIECE_VALUES[m.piece]/10+1000;
    if(m.promotion)s+=CHESS_PIECE_VALUES[m.promotion]+900;
    if(m.san&&m.san.indexOf('+')>=0)s+=50;
    return s;
}
function chessOrderedMoves(chess,onlyNoisy){
    let moves=chess.moves({verbose:true});
    if(onlyNoisy)moves=moves.filter(m=>m.captured||m.promotion);
    return moves.sort((a,b)=>chessMoveOrderScore(b)-chessMoveOrderScore(a));
}

const CHESS_TIMEOUT={timeout:true};
let chessSearchDeadline=0,chessSearchNodes=0;
function chessCheckTime(){
    if((++chessSearchNodes&127)===0&&Date.now()>chessSearchDeadline)throw CHESS_TIMEOUT;
}
function chessInCheck(chess){return chess.isCheck?chess.isCheck():chess.inCheck();}

// Only captures/promotions are searched at the horizon so the bot doesn't
// stop in the middle of an exchange and misjudge it.
function chessQuiesce(chess,alpha,beta,sign,qdepth){
    chessCheckTime();
    const stand=sign*chessStaticEval(chess);
    if(stand>=beta)return stand;
    if(stand>alpha)alpha=stand;
    if(qdepth<=0)return stand;
    for(const m of chessOrderedMoves(chess,true)){
        chess.move({from:m.from,to:m.to,promotion:m.promotion});
        const val=-chessQuiesce(chess,-beta,-alpha,-sign,qdepth-1);
        chess.undo();
        if(val>=beta)return val;
        if(val>alpha)alpha=val;
    }
    return alpha;
}

function chessNegamax(chess,depth,alpha,beta,sign,ply){
    chessCheckTime();
    if(chess.isDrawByFiftyMoves&&chess.isDrawByFiftyMoves())return 0;
    const check=chessInCheck(chess);
    if(check)depth++;                                   // check extension
    if(depth<=0)return chessQuiesce(chess,alpha,beta,sign,4);
    const moves=chessOrderedMoves(chess);
    if(!moves.length)return check?-(CHESS_MATE-ply):0;  // mated (prefer faster mates) or stalemate
    let best=-Infinity;
    for(const m of moves){
        chess.move({from:m.from,to:m.to,promotion:m.promotion});
        const val=-chessNegamax(chess,depth-1,-beta,-alpha,-sign,ply+1);
        chess.undo();
        if(val>best)best=val;
        if(best>alpha)alpha=best;
        if(alpha>=beta)break;
    }
    return best;
}

// Picks a move for the bot to play in the current position. Returns
// {from,to,promotion} or null if there's no legal move (game over).
function chooseChessBotMove(state,timeMs=CHESS_BOT_TIME_MS){
    const chess=loadChessEngine(state);
    let moves=chessOrderedMoves(chess);
    if(!moves.length)return null;
    if(moves.length===1)return {from:moves[0].from,to:moves[0].to,promotion:moves[0].promotion||'q'};
    const sign=chess.turn()==='w'?1:-1;
    const cs=state.chess,plies=cs?.moveHistory?.length||0;
    chessSearchDeadline=Date.now()+timeMs;chessSearchNodes=0;

    let bestMove=moves[0];
    let scored=moves.map(m=>({m,v:0}));
    let exact=null;   // exact (full-window) scores of the last completed depth <=2
    try{
        for(let depth=1;depth<=CHESS_BOT_MAX_DEPTH;depth++){
            let alpha=-Infinity;const cur=[];
            for(const e of scored){
                const m=e.m;
                chess.move({from:m.from,to:m.to,promotion:m.promotion});
                // Full window at the root of the first plies, so equal-ish moves can be told apart.
                const val=-chessNegamax(chess,depth-1,-Infinity,-(depth<=2?-Infinity:alpha),-sign,1);
                chess.undo();
                cur.push({m,v:val});
                if(val>alpha)alpha=val;
            }
            cur.sort((a,b)=>b.v-a.v);
            scored=cur;bestMove=cur[0].m;
            if(depth<=2)exact=cur;
            if(Math.abs(cur[0].v)>=CHESS_MATE-100)break;      // forced mate found
        }
    }catch(e){
        if(e!==CHESS_TIMEOUT)throw e;
    }
    // Opening variety: among clearly-equal early moves pick randomly.
    if(plies<8&&exact&&Math.abs(exact[0].v)<1000){
        const top=exact[0].v,pool=exact.filter(e=>top-e.v<=10&&e.m===bestMove||top-e.v<=5);
        if(pool.length&&pool.some(e=>e.m===bestMove))bestMove=pool[Math.floor(Math.random()*pool.length)].m;
    }
    return {from:bestMove.from,to:bestMove.to,promotion:bestMove.promotion||'q'};
}
