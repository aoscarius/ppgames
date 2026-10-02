/* ========================================================================
   OTHELLO (REVERSI) GAME LOGIC - match lifecycle, move validation, bot AI.

   Unlike chess, Othello's rules are compact enough to implement directly
   rather than vendoring a library (the entire rules engine is the ~60
   lines below: legal-move detection by flanking in 8 directions, flipping,
   and the no-legal-move auto-pass/game-over logic). Mirrors the host-
   authoritative pattern in games/chess/logic.js and games/poker/logic.js:
   every function here runs ONLY on the host and mutates gameState.othello
   directly; the result is broadcast verbatim to every peer.
   ======================================================================== */

const OTHELLO_SIZE=8;
const OTHELLO_DIRS=[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];

function defaultOthelloState(){
    const board=Array.from({length:OTHELLO_SIZE},()=>Array(OTHELLO_SIZE).fill(null));
    board[3][3]='w';board[3][4]='b';board[4][3]='b';board[4][4]='w';
    return {
        board,
        turn:'b',
        blackPlayerId:null,
        whitePlayerId:null,
        status:'waiting',       // 'waiting' | 'in-progress' | 'ended'
        result:null,            // 'black' | 'white' | 'draw' | null
        resultReason:null,      // 'no-moves' | 'resignation'
        lastMove:null,          // {r,c} of the most recent placement, for highlighting
        passMessage:null        // set briefly when a side had no legal move and passed
    };
}

function othelloMatchPlayers(state=gameState){
    return state.players.filter(p=>p&&!p.spectator).slice(0,2);
}

function othelloColorOf(state,playerId){
    if(!playerId)return null;
    if(state.othello.blackPlayerId===playerId)return 'b';
    if(state.othello.whitePlayerId===playerId)return 'w';
    return null;
}

function othelloOpponent(color){ return color==='b'?'w':'b'; }

function othelloInBounds(r,c){ return r>=0&&r<OTHELLO_SIZE&&c>=0&&c<OTHELLO_SIZE; }

// Cells that would be flipped if `color` plays at (r,c); empty array means
// the move is illegal (no flanking in any direction).
function othelloFlipsFor(board,color,r,c){
    if(board[r][c]!==null)return [];
    const opp=othelloOpponent(color);
    const flips=[];
    for(const [dr,dc] of OTHELLO_DIRS){
        let rr=r+dr,cc=c+dc;
        const line=[];
        while(othelloInBounds(rr,cc)&&board[rr][cc]===opp){
            line.push([rr,cc]);
            rr+=dr;cc+=dc;
        }
        if(line.length&&othelloInBounds(rr,cc)&&board[rr][cc]===color)flips.push(...line);
    }
    return flips;
}

function othelloLegalMoves(board,color){
    const moves=[];
    for(let r=0;r<OTHELLO_SIZE;r++)for(let c=0;c<OTHELLO_SIZE;c++){
        if(othelloFlipsFor(board,color,r,c).length)moves.push({r,c});
    }
    return moves;
}

function othelloCounts(board){
    let b=0,w=0;
    for(const row of board)for(const cell of row){if(cell==='b')b++;else if(cell==='w')w++;}
    return {b,w};
}

// Advance `turn` past any side(s) with no legal move, exactly like real
// Othello: a side with no legal move must pass automatically. If NEITHER
// side can move, the game is over. Returns {over, passed} where `passed`
// is the color that was skipped (for the "X had no move and passed"
// message), or null if nobody needed to pass.
function othelloAdvanceTurn(state){
    const board=state.othello.board;
    if(othelloLegalMoves(board,state.othello.turn).length)return {over:false,passed:null};
    const other=othelloOpponent(state.othello.turn);
    if(othelloLegalMoves(board,other).length){
        const passed=state.othello.turn;
        state.othello.turn=other;
        return {over:false,passed};
    }
    return {over:true,passed:null};
}

function othelloGameOverResult(board){
    const {b,w}=othelloCounts(board);
    if(b===w)return {result:'draw'};
    return {result:b>w?'black':'white'};
}

function startOthelloMatch(state=gameState){
    const players=othelloMatchPlayers(state);
    if(players.length<2)return {ok:false,error:t('needTwoPlayers')};
    const prevBlack=state.othello?.blackPlayerId;
    let blackId,whiteId;
    if(prevBlack&&players.some(p=>p.id===prevBlack)){
        // Alternate colors each match, same spirit as chess's startChessMatch().
        const prevWhite=state.othello.whitePlayerId;
        blackId=players.find(p=>p.id===prevWhite)?.id||players[0].id;
        whiteId=players.find(p=>p.id!==blackId)?.id||players[1].id;
    }else{
        const shuffled=Math.random()<0.5?players:[...players].reverse();
        blackId=shuffled[0].id;whiteId=shuffled[1].id;
    }
    state.othello=defaultOthelloState();
    state.othello.blackPlayerId=blackId;
    state.othello.whitePlayerId=whiteId;
    state.othello.status='in-progress';
    state.status='in-progress';
    return {ok:true};
}

function othelloResultSummary(state){
    const os=state.othello;
    const name=id=>state.players.find(p=>p?.id===id)?.name||'?';
    const {b,w}=othelloCounts(os.board);
    if(os.resultReason==='resignation'){
        const winnerId=os.result==='black'?os.blackPlayerId:os.whitePlayerId;
        return t('othelloWinResignation',{name:name(winnerId)});
    }
    if(os.result==='draw')return t('othelloDrawResult',{count:b});
    const winnerId=os.result==='black'?os.blackPlayerId:os.whitePlayerId;
    const winnerCount=os.result==='black'?b:w;
    const loserCount=os.result==='black'?w:b;
    return t('othelloWinResult',{name:name(winnerId),winner:winnerCount,loser:loserCount});
}

// Host-authoritative move application.
function processOthelloMove(state,playerId,r,c){
    const os=state.othello;
    if(!os||os.status!=='in-progress')return {ok:false,error:t('noMatchInProgress')};
    const color=othelloColorOf(state,playerId);
    if(!color)return {ok:false,error:t('notAPlayerInMatch')};
    if(os.turn!==color)return {ok:false,error:t('notYourTurn')};
    const flips=othelloFlipsFor(os.board,color,r,c);
    if(!flips.length)return {ok:false,error:t('illegalMove')};

    os.board[r][c]=color;
    for(const [fr,fc] of flips)os.board[fr][fc]=color;
    os.lastMove={r,c};
    os.turn=othelloOpponent(color);
    os.passMessage=null;

    const adv=othelloAdvanceTurn(state);
    if(adv.passed){
        const passedName=state.players.find(p=>p?.id===(adv.passed==='b'?os.blackPlayerId:os.whitePlayerId))?.name||'?';
        os.passMessage=t('othelloPassed',{name:passedName});
        appendChatMessage('System',os.passMessage,true);
    }
    if(adv.over){
        const over=othelloGameOverResult(os.board);
        os.status='ended';os.result=over.result;os.resultReason='no-moves';
        state.status='lobby';
        appendChatMessage('System',othelloResultSummary(state),true);
    }
    return {ok:true};
}

function requestOthelloResign(state,playerId){
    const os=state.othello;
    if(!os||os.status!=='in-progress')return {ok:false,error:t('noMatchInProgress')};
    const color=othelloColorOf(state,playerId);
    if(!color)return {ok:false,error:t('notAPlayerInMatch')};
    os.status='ended';os.result=color==='b'?'white':'black';os.resultReason='resignation';
    state.status='lobby';
    appendChatMessage('System',othelloResultSummary(state),true);
    return {ok:true};
}

/* --------------------------------------------------------------------
   Simple bot engine: a positional-weight heuristic (corners are great,
   cells adjacent to an empty corner are traps, otherwise prefer moves
   that flip more discs), no search needed -- Othello's branching factor
   and the fact a weak heuristic already plays reasonably well make a
   full minimax overkill for a casual bot opponent here.
   -------------------------------------------------------------------- */
const OTHELLO_WEIGHTS=(()=>{
    const w=Array.from({length:8},()=>Array(8).fill(2));
    const edge=[0,7];
    for(const r of edge)for(let c=0;c<8;c++)w[r][c]=5;
    for(const c of edge)for(let r=0;r<8;r++)w[r][c]=5;
    for(const r of edge)for(const c of edge)w[r][c]=20; // corners
    // cells diagonally/orthogonally adjacent to a corner are traps that
    // hand the opponent that corner next turn
    for(const [cr,cc] of [[0,0],[0,7],[7,0],[7,7]]){
        for(const [dr,dc] of [[0,1],[1,0],[1,1],[0,-1],[-1,0],[-1,-1],[1,-1],[-1,1]]){
            const r=cr+dr,c=cc+dc;
            if(othelloInBounds(r,c)&&w[r][c]===2)w[r][c]=-10;
        }
    }
    return w;
})();

function chooseOthelloBotMove(state){
    const board=state.othello.board,color=state.othello.turn;
    const moves=othelloLegalMoves(board,color);
    if(!moves.length)return null;
    let best=[],bestScore=-Infinity;
    for(const m of moves){
        const flips=othelloFlipsFor(board,color,m.r,m.c).length;
        const score=OTHELLO_WEIGHTS[m.r][m.c]+flips;
        if(score>bestScore){bestScore=score;best=[m];}
        else if(score===bestScore)best.push(m);
    }
    return best[Math.floor(Math.random()*best.length)];
}