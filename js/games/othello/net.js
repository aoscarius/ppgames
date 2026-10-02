/* ========================================================================
   OTHELLO NETWORK/HOST ACTIONS - host-side handlers for othello packets and
   the local request helpers used by the othello UI. The transport itself
   (sendTo/broadcastState/...) lives in core/network.js.
   ======================================================================== */
function hostStartOthelloMatch(){
    if(!gameState.isHost||gameState.gameId!=='othello')return;
    const r=startOthelloMatch(gameState);
    if(!r.ok){showAlert('Game Error',`Game error occurred: ${r.error}`);return;}
    appendChatMessage('System',t('othelloMatchStarted'),true);
    broadcastState();renderTableUI();scheduleOthelloBot();
}
function hostHandleOthelloMove(data,conn){
    if(!gameState.isHost||data.roomId!==gameState.roomId)return;
    const seat=gameState.players.findIndex(p=>p?.id===data.playerId);
    if(seat<0||gameState.players[seat].isBot)return;
    const result=processOthelloMove(gameState,data.playerId,data.r,data.c);
    if(!result.ok)sendTo(conn,{type:'ACTION_ERROR',message:result.error});
    broadcastState();renderTableUI();scheduleOthelloBot();
}
function hostHandleOthelloResign(data,conn){
    if(!gameState.isHost||data.roomId!==gameState.roomId)return;
    const result=requestOthelloResign(gameState,data.playerId);
    if(!result.ok)sendTo(conn,{type:'ACTION_ERROR',message:result.error});
    broadcastState();renderTableUI();
}

// Host-only: after any othello state change, if it's now a bot's turn
// (including after an auto-pass), make its move after a short delay
// (mirrors scheduleChessBot()'s pacing).
function scheduleOthelloBot(){
    if(!gameState.isHost||gameState.gameId!=='othello')return;
    if(botTimer)clearTimeout(botTimer);
    const os=gameState.othello;
    if(!os||os.status!=='in-progress')return;
    const toMoveId=os.turn==='b'?os.blackPlayerId:os.whitePlayerId;
    const toMove=gameState.players.find(p=>p?.id===toMoveId);
    if(!toMove?.isBot)return;
    botTimer=setTimeout(()=>{
        if(!gameState.isHost||gameState.othello?.status!=='in-progress')return;
        const mv=chooseOthelloBotMove(gameState);
        if(!mv)return;
        const result=processOthelloMove(gameState,toMoveId,mv.r,mv.c);
        if(result.ok){broadcastState();renderTableUI();scheduleOthelloBot();}
    },500+Math.random()*500);
}

function requestOthelloMove(r,c){
    if(gameState.isHost){
        const result=processOthelloMove(gameState,gameState.myPlayerId,r,c);
        if(!result.ok){showAlert('Illegal move',result.error);return;}
        broadcastState();renderTableUI();scheduleOthelloBot();
    }else{
        const host=peerConnections[gameState.hostId||gameState.roomId];
        if(host?.open)sendTo(host,{type:'OTHELLO_MOVE_REQUEST',roomId:gameState.roomId,playerId:gameState.myPlayerId,r,c});
        else scheduleHostRecovery();
    }
}
function requestOthelloResignAction(){
    if(gameState.isHost){
        const result=requestOthelloResign(gameState,gameState.myPlayerId);
        if(!result.ok){showAlert('Game Error',result.error);return;}
        broadcastState();renderTableUI();
    }else{
        const host=peerConnections[gameState.hostId||gameState.roomId];
        if(host?.open)sendTo(host,{type:'OTHELLO_RESIGN_REQUEST',roomId:gameState.roomId,playerId:gameState.myPlayerId});
        else scheduleHostRecovery();
    }
}