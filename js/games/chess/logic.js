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
   Bot: the search itself lives in bot.js (ChessBot), a fast bitless 0x88
   engine; this wrapper only picks the difficulty and guarantees the host
   always gets a LEGAL move back (chess.js validates it again in
   processChessMove, and a random legal move is the fallback if anything
   inside the search ever throws).
   -------------------------------------------------------------------- */
const CHESS_BOT_LEVEL_ORDER=['easy','medium','hard','expert'];
function chessBotLevel(state=gameState){
    return CHESS_BOT_LEVELS[state.chessBotLevel]?state.chessBotLevel:'medium';
}

// Picks a move for the bot to play in the current position. Returns
// {from,to,promotion} or null if there's no legal move (game over).
function chooseChessBotMove(state,level){
    const chess=loadChessEngine(state);
    if(chess.isGameOver())return null;
    try{
        const mv=ChessBot.chooseMove(state.chess.fen,level||chessBotLevel(state));
        if(mv)return {from:mv.from,to:mv.to,promotion:mv.promotion||'q'};
    }catch(e){
        if(typeof logMessage==='function')logMessage(`Chess bot error: ${e.message}`,'error');
    }
    const moves=chess.moves({verbose:true});
    if(!moves.length)return null;
    const m=moves[Math.floor(Math.random()*moves.length)];
    return {from:m.from,to:m.to,promotion:m.promotion||'q'};
}
