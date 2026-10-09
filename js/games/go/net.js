/* ========================================================================
   GO NETWORK/HOST ACTIONS - host-side handlers for go packets and the
   local request helpers used by the go UI. The transport itself
   (sendTo/broadcastState/...) lives in core/network.js.
   ======================================================================== */
function hostStartGoMatch(){
    if(!gameState.isHost||gameState.gameId!=='go')return;
    const r=startGoMatch(gameState);
    if(!r.ok){showAlert('Game Error',`Game error occurred: ${r.error}`);return;}
    appendChatMessage('System',t('goMatchStarted'),true);
    broadcastState();renderTableUI();scheduleGoBot();
}

// One generic host handler: validates that the sender is a seated human, runs `fn`, syncs everyone.
function hostGoAction(data,conn,fn){
    if(!gameState.isHost||data.roomId!==gameState.roomId)return;
    const seat=gameState.players.findIndex(p=>p?.id===data.playerId);
    if(seat<0||gameState.players[seat].isBot)return;
    const result=fn(gameState,data.playerId);
    if(!result.ok)sendTo(conn,{type:'ACTION_ERROR',message:result.error});
    broadcastState();renderTableUI();scheduleGoBot();
}

// Host-only: if it is a bot's turn (or a bot still has to accept the score), act after a short pause.
function scheduleGoBot(){
    if(!gameState.isHost||gameState.gameId!=='go')return;
    if(botTimer)clearTimeout(botTimer);
    const g=gameState.go;
    if(!g)return;
    if(g.status==='in-progress'){
        const toMoveId=g.turn==='b'?g.blackPlayerId:g.whitePlayerId;
        const toMove=gameState.players.find(p=>p?.id===toMoveId);
        if(!toMove?.isBot)return;
        botTimer=setTimeout(()=>{
            if(!gameState.isHost||gameState.go?.status!=='in-progress')return;
            const mv=chooseGoBotMove(gameState);
            const result=mv.pass?processGoPass(gameState,toMoveId):processGoMove(gameState,toMoveId,mv.idx);
            if(!result.ok&&!mv.pass)processGoPass(gameState,toMoveId);   // should never happen; never stall the game
            broadcastState();renderTableUI();scheduleGoBot();
        },500+Math.random()*600);
    }else if(g.status==='scoring'){
        // Bots accept whatever marking the humans settled on.
        const botIds=[g.blackPlayerId,g.whitePlayerId].filter(id=>gameState.players.find(p=>p?.id===id)?.isBot&&!g.accepted.includes(id));
        if(!botIds.length)return;
        botTimer=setTimeout(()=>{
            if(!gameState.isHost||gameState.go?.status!=='scoring')return;
            botIds.forEach(id=>{if(gameState.go.status==='scoring')processGoAccept(gameState,id);});
            broadcastState();renderTableUI();scheduleGoBot();
        },900);
    }
}

// ---- local request helpers (used by the UI): the host acts directly, others ask the host ----
function goRequest(type,fn,extra={}){
    if(gameState.isHost){
        const r=fn(gameState,gameState.myPlayerId);
        if(!r.ok){showAlert('Go',r.error);return;}
        broadcastState();renderTableUI();scheduleGoBot();
    }else{
        const host=peerConnections[gameState.hostId||gameState.roomId];
        if(host?.open)sendTo(host,{type,roomId:gameState.roomId,playerId:gameState.myPlayerId,...extra});
        else scheduleHostRecovery();
    }
}
const requestGoMove=idx=>goRequest('GO_MOVE_REQUEST',(s,id)=>processGoMove(s,id,idx),{idx});
const requestGoPass=()=>goRequest('GO_PASS_REQUEST',processGoPass);
const requestGoResign=()=>goRequest('GO_RESIGN_REQUEST',resignGo);
const requestGoToggleDead=idx=>goRequest('GO_DEAD_REQUEST',(s,id)=>processGoToggleDead(s,id,idx),{idx});
const requestGoAccept=()=>goRequest('GO_ACCEPT_REQUEST',processGoAccept);
const requestGoResume=()=>goRequest('GO_RESUME_REQUEST',processGoResume);
