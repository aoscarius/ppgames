/* ========================================================================
   GO GAME LOGIC - rules, scoring, match lifecycle and bot AI.

   Rules implemented (the usual "Chinese / Tromp-Taylor" family):
     - stones are placed on intersections; a connected group with no
       liberties is captured
     - suicide is illegal (a move that captures first is fine)
     - positional superko: a move may not recreate any earlier board position
     - two consecutive passes end play and start the SCORING phase, where
       either player can mark groups as dead; when both accept, the result
       is area scoring (stones + surrounded empty points) with komi.

   Same host-authoritative pattern as the other games: every function that
   mutates gameState.go runs ONLY on the host and the result is broadcast.
   The board is a flat array (index = y*size + x) holding 0 empty, 1 black,
   2 white. Go is perfect-information, so nothing needs hiding from peers.
   ======================================================================== */

const GO_SIZES=[9,13,19];
const GO_KOMI={9:6.5,13:7.5,19:7.5};
const GO_COLOR={b:1,w:2};

function goHashBoard(board){
    let h1=0x811c9dc5|0,h2=0x1b873593|0;
    for(let i=0;i<board.length;i++){
        const v=board[i]+1;
        h1=Math.imul(h1^v,0x01000193);
        h2=Math.imul(h2+v*(i+1),0x85ebca6b)^(h2>>>13);
    }
    return (h1>>>0)*1048576+((h2>>>0)&0xfffff);   // 52 bits: exact in a double
}

function defaultGoState(size=9){
    const board=new Array(size*size).fill(0);
    return {
        size,
        komi:GO_KOMI[size]||6.5,
        board,
        turn:'b',
        blackPlayerId:null,
        whitePlayerId:null,
        status:'waiting',        // 'waiting' | 'in-progress' | 'scoring' | 'ended'
        result:null,             // {winner:'black'|'white', reason:'score'|'resignation', black, white}
        lastMove:null,           // board index of the last stone, -1 for a pass, null at the start
        passes:0,                // consecutive passes
        captures:{b:0,w:0},      // stones each side has captured
        hashes:[goHashBoard(board)],   // every position so far (superko)
        moveCount:0,
        dead:[],                 // board indices of stones marked dead (scoring phase)
        accepted:[]              // player ids that accepted the current marking
    };
}

function goMatchPlayers(state=gameState){
    return state.players.filter(p=>p&&!p.spectator).slice(0,2);
}
function goColorOf(state,playerId){
    if(!playerId)return null;
    if(state.go.blackPlayerId===playerId)return 'b';
    if(state.go.whitePlayerId===playerId)return 'w';
    return null;
}
const goOther=c=>c==='b'?'w':'b';

/* ---------------- board geometry ---------------- */
function goNeighbors(size,i){
    const x=i%size,y=(i-x)/size,out=[];
    if(y>0)out.push(i-size);
    if(x>0)out.push(i-1);
    if(x<size-1)out.push(i+1);
    if(y<size-1)out.push(i+size);
    return out;
}
// Connected same-colour stones containing i, plus their liberties.
function goGroup(board,size,i){
    const color=board[i],stones=[i],seen=new Set([i]),libs=new Set();
    for(let k=0;k<stones.length;k++){
        for(const n of goNeighbors(size,stones[k])){
            const v=board[n];
            if(v===0)libs.add(n);
            else if(v===color&&!seen.has(n)){seen.add(n);stones.push(n);}
        }
    }
    return {stones,libs,color};
}

// Try to play colour `color` (1|2) at idx on `board`. Does not mutate `board`.
// Returns {ok:true,board,captured:[...]} or {ok:false,error:'occupied'|'suicide'|'ko'|'bounds'}.
function goTryMove(board,size,idx,color,hashes){
    if(!Number.isInteger(idx)||idx<0||idx>=size*size)return {ok:false,error:'bounds'};
    if(board[idx]!==0)return {ok:false,error:'occupied'};
    const nb=board.slice();
    nb[idx]=color;
    const opp=color===1?2:1,captured=[];
    for(const n of goNeighbors(size,idx)){
        if(nb[n]!==opp)continue;
        const g=goGroup(nb,size,n);
        if(g.libs.size===0)for(const s of g.stones){if(nb[s]!==0){nb[s]=0;captured.push(s);}}
    }
    if(goGroup(nb,size,idx).libs.size===0)return {ok:false,error:'suicide'};
    if(hashes&&hashes.includes(goHashBoard(nb)))return {ok:false,error:'ko'};
    return {ok:true,board:nb,captured};
}

/* ---------------- scoring ---------------- */
// Area scoring. `dead` = indices of stones to remove first. Returns the
// per-point owner map (0 neutral, 1 black, 2 white) and both totals (komi included in white).
function goScore(board,size,dead,komi){
    const b=board.slice();
    (dead||[]).forEach(i=>{if(i>=0&&i<b.length)b[i]=0;});
    let bs=0,ws=0,bt=0,wt=0;
    const owner=new Array(b.length).fill(0);
    const seen=new Array(b.length).fill(false);
    for(let i=0;i<b.length;i++){
        if(b[i]===1){bs++;owner[i]=1;}
        else if(b[i]===2){ws++;owner[i]=2;}
    }
    for(let i=0;i<b.length;i++){
        if(b[i]!==0||seen[i])continue;
        const region=[i];seen[i]=true;let touchB=false,touchW=false;
        for(let k=0;k<region.length;k++){
            for(const n of goNeighbors(size,region[k])){
                if(b[n]===1)touchB=true;
                else if(b[n]===2)touchW=true;
                else if(!seen[n]){seen[n]=true;region.push(n);}
            }
        }
        if(touchB&&!touchW){bt+=region.length;region.forEach(r=>owner[r]=1);}
        else if(touchW&&!touchB){wt+=region.length;region.forEach(r=>owner[r]=2);}
    }
    return {owner,blackStones:bs,whiteStones:ws,blackTerritory:bt,whiteTerritory:wt,black:bs+bt,white:ws+wt+komi};
}

/* ---------------- match lifecycle ---------------- */
function startGoMatch(state=gameState){
    const players=goMatchPlayers(state);
    if(players.length<2)return {ok:false,error:t('goNeedTwo')};
    const size=GO_SIZES.includes(state.goSize)?state.goSize:9;
    const prevBlack=state.go?.blackPlayerId;
    let blackId,whiteId;
    if(prevBlack&&players.some(p=>p.id===prevBlack)){
        // Colours alternate between games of a series.
        whiteId=prevBlack;
        blackId=players.find(p=>p.id!==prevBlack)?.id||players[0].id;
    }else{
        const order=Math.random()<0.5?players:[...players].reverse();
        blackId=order[0].id;whiteId=order[1].id;
    }
    state.go=defaultGoState(size);
    state.go.blackPlayerId=blackId;state.go.whitePlayerId=whiteId;
    state.go.status='in-progress';
    state.status='in-progress';
    return {ok:true};
}

function goEndMatch(state){
    state.status='lobby';       // table is free for a rematch (same as the other 2-player games)
}

function processGoMove(state,playerId,idx){
    const g=state.go;
    if(!g||g.status!=='in-progress')return {ok:false,error:t('goErr_nomatch')};
    const color=goColorOf(state,playerId);
    if(!color)return {ok:false,error:t('goErr_notplayer')};
    if(g.turn!==color)return {ok:false,error:t('goErr_notturn')};
    const r=goTryMove(g.board,g.size,idx,GO_COLOR[color],g.hashes);
    if(!r.ok)return {ok:false,error:t('goErr_'+r.error)};
    g.board=r.board;
    g.captures[color]+=r.captured.length;
    g.hashes.push(goHashBoard(r.board));
    g.lastMove=idx;g.passes=0;g.moveCount++;
    g.turn=goOther(color);
    return {ok:true};
}

function processGoPass(state,playerId){
    const g=state.go;
    if(!g||g.status!=='in-progress')return {ok:false,error:t('goErr_nomatch')};
    const color=goColorOf(state,playerId);
    if(!color)return {ok:false,error:t('goErr_notplayer')};
    if(g.turn!==color)return {ok:false,error:t('goErr_notturn')};
    const p=state.players.find(x=>x?.id===playerId);
    appendChatMessage('System',t('goPassed',{name:p?.name||'?'}),true);
    g.lastMove=-1;g.passes++;g.moveCount++;
    g.turn=goOther(color);
    if(g.passes>=2){
        g.status='scoring';g.dead=[];g.accepted=[];
        appendChatMessage('System',t('goScoringStarted'),true);
    }
    return {ok:true};
}

// Toggle the whole group containing idx as dead/alive (scoring phase only).
function processGoToggleDead(state,playerId,idx){
    const g=state.go;
    if(!g||g.status!=='scoring')return {ok:false,error:t('goErr_nomatch')};
    if(!goColorOf(state,playerId))return {ok:false,error:t('goErr_notplayer')};
    if(!Number.isInteger(idx)||idx<0||idx>=g.board.length||g.board[idx]===0)return {ok:false,error:t('goErr_bounds')};
    const grp=goGroup(g.board,g.size,idx).stones;
    const isDead=g.dead.includes(idx);
    g.dead=isDead?g.dead.filter(i=>!grp.includes(i)):[...new Set([...g.dead,...grp])];
    g.accepted=[];            // any change of the marking needs to be accepted again
    return {ok:true};
}

function processGoAccept(state,playerId){
    const g=state.go;
    if(!g||g.status!=='scoring')return {ok:false,error:t('goErr_nomatch')};
    if(!goColorOf(state,playerId))return {ok:false,error:t('goErr_notplayer')};
    if(!g.accepted.includes(playerId))g.accepted.push(playerId);
    if(g.accepted.includes(g.blackPlayerId)&&g.accepted.includes(g.whitePlayerId))finishGoByScore(state);
    return {ok:true};
}

// Disagreement over dead stones: play on. (turn is already the side that passed first.)
function processGoResume(state,playerId){
    const g=state.go;
    if(!g||g.status!=='scoring')return {ok:false,error:t('goErr_nomatch')};
    if(!goColorOf(state,playerId))return {ok:false,error:t('goErr_notplayer')};
    g.status='in-progress';g.passes=0;g.dead=[];g.accepted=[];
    appendChatMessage('System',t('goResumed'),true);
    return {ok:true};
}

function finishGoByScore(state){
    const g=state.go;
    const sc=goScore(g.board,g.size,g.dead,g.komi);
    g.result={winner:sc.black>sc.white?'black':'white',reason:'score',black:sc.black,white:sc.white};
    g.status='ended';
    goEndMatch(state);
    appendChatMessage('System',goResultSummary(state),true);
}

function resignGo(state,playerId){
    const g=state.go;
    if(!g||(g.status!=='in-progress'&&g.status!=='scoring'))return {ok:false,error:t('goErr_nomatch')};
    const color=goColorOf(state,playerId);
    if(!color)return {ok:false,error:t('goErr_notplayer')};
    g.result={winner:color==='b'?'white':'black',reason:'resignation'};
    g.status='ended';
    goEndMatch(state);
    appendChatMessage('System',goResultSummary(state),true);
    return {ok:true};
}

function goResultSummary(state){
    const g=state.go,r=g.result;
    if(!r)return '';
    const winnerId=r.winner==='black'?g.blackPlayerId:g.whitePlayerId;
    const name=state.players.find(p=>p?.id===winnerId)?.name||'?';
    if(r.reason==='resignation')return t('goWinResignation',{name});
    const diff=Math.abs(r.black-r.white);
    return t('goWinScore',{name,diff,black:r.black,white:r.white});
}

/* --------------------------------------------------------------------
   Bot: a lightweight heuristic player (no tree search). For each legal
   point it adds up simple tactical and positional features, never fills
   its own eyes, and passes when nothing is worth playing. It is a casual
   opponent -- good enough to teach the rules, not a strong engine.
   -------------------------------------------------------------------- */
function goIsOwnEye(board,size,idx,color){
    const nbrs=goNeighbors(size,idx);
    if(!nbrs.every(n=>board[n]===color))return false;
    const x=idx%size,y=(idx-x)/size;
    let oppDiag=0,off=0;
    for(const [dx,dy] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
        const nx=x+dx,ny=y+dy;
        if(nx<0||ny<0||nx>=size||ny>=size){off++;continue;}
        const v=board[ny*size+nx];
        if(v!==0&&v!==color)oppDiag++;
    }
    // Interior eye: at most one hostile diagonal. Edge/corner eye: none.
    return off>0?oppDiag===0:oppDiag<=1;
}

function goBotCandidates(g,colorInt){
    const size=g.size,board=g.board,opp=colorInt===1?2:1,out=[];
    const stoneCount=board.reduce((n,v)=>n+(v?1:0),0);
    const hoshi=goHoshi(size);
    for(let idx=0;idx<board.length;idx++){
        if(board[idx]!==0)continue;
        const r=goTryMove(board,size,idx,colorInt,g.hashes);
        if(!r.ok)continue;
        if(goIsOwnEye(board,size,idx,colorInt)&&r.captured.length===0)continue;

        let score=Math.random()*1.5;
        const x=idx%size,y=(idx-x)/size;
        score+=r.captured.length*12;

        // own new group
        const grp=goGroup(r.board,size,idx);
        if(grp.libs.size===1&&r.captured.length===0)score-=14+grp.stones.length*3;          // self-atari
        else if(grp.libs.size===2)score-=1;

        // neighbouring groups before/after
        const seen=new Set();
        for(const n of goNeighbors(size,idx)){
            if(board[n]===0||seen.has(n))continue;
            const before=goGroup(board,size,n);
            before.stones.forEach(s=>seen.add(s));
            if(board[n]===colorInt){
                if(before.libs.size===1)score+=before.libs.size<grp.libs.size?10+before.stones.length*2:0;   // rescue from atari
                else if(before.libs.size===2&&grp.libs.size>=3)score+=2;
            }else if(board[n]===opp){
                if(before.libs.size===2)score+=5+before.stones.length;                    // put in atari
                else if(before.libs.size===3)score+=1.5;
                else if(before.libs.size===1)score+=10+before.stones.length*2;            // capturable (already counted partly)
            }
        }
        // shape / position
        const line=Math.min(x,y,size-1-x,size-1-y);
        score+=line===0?-5:line===1?-0.5:line===2?3:line===3?2.5:1;
        if(stoneCount<size)score+=hoshi.has(idx)?4:0;
        // stay near the action
        let near=0;
        for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
            const nx=x+dx,ny=y+dy;
            if((dx||dy)&&nx>=0&&ny>=0&&nx<size&&ny<size&&board[ny*size+nx]!==0)near+=(Math.abs(dx)+Math.abs(dy)<=2)?1:0.4;
        }
        score+=Math.min(near,4)*0.9;
        if(stoneCount>6&&near===0)score-=3;
        out.push({idx,score});
    }
    return out;
}
function goHoshi(size){
    const e=size===9?2:3,m=(size-1)/2,hi=size-1-e;
    const pts=size===9?[[e,e],[hi,e],[e,hi],[hi,hi]]:[[e,e],[hi,e],[e,hi],[hi,hi],[m,m]];
    return new Set(pts.map(([x,y])=>y*size+x));
}

// {pass:true} or {idx}. Looks at the position of the bot's colour in state.go.
function chooseGoBotMove(state){
    const g=state.go;
    const color=GO_COLOR[g.turn],opp=color===1?2:1;
    const cands=goBotCandidates(g,color);
    cands.sort((a,b)=>b.score-a.score);
    const best=cands[0];
    // After the opponent passes: pass back if we are ahead on area (stones + closed territory).
    if(g.passes>=1){
        const sc=goScore(g.board,g.size,[],g.komi);
        const mine=color===1?sc.black:sc.white,theirs=color===1?sc.white:sc.black;
        if(mine>theirs&&(!best||best.score<12))return {pass:true};
    }
    // Nothing useful left (or the game has gone on far too long): pass.
    const lateGame=g.moveCount>g.size*g.size*1.3;
    if(!best||best.score<(lateGame?8:3.5)||g.moveCount>g.size*g.size*2.5)return {pass:true};
    return {idx:best.idx};
}
