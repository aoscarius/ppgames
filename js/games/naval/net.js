/* ========================================================================
   NAVAL BATTLE NETWORK/HOST ACTIONS - host-side handlers for naval packets
   and the local request helpers used by the naval UI. The transport itself
   (sendTo/broadcastState/...) lives in core/network.js.

   Because fleets are secret, every host handler also checks that the packet
   really arrives on the connection of the player it claims to speak for
   (conn.peer === data.playerId); othello/chess don't need that, they have
   nothing to protect.
   ======================================================================== */
function hostStartNavalMatch(){
    if(!gameState.isHost||gameState.gameId!=='naval')return;
    const r=startNavalMatch(gameState);
    if(!r.ok){showAlert('Game Error',r.error);return;}
    appendChatMessage('System',t('navalMatchStarted'),true);
    broadcastState();renderTableUI();scheduleNavalBot();
}

function navalPacketOk(data,conn){
    if(!gameState.isHost||data.roomId!==gameState.roomId)return false;
    if(conn?.peer!==data.playerId)return false;
    const p=gameState.players.find(x=>x?.id===data.playerId);
    return !!p&&!p.isBot;
}

function hostHandleNavalFleet(data,conn){
    if(!navalPacketOk(data,conn))return;
    const result=processNavalFleet(gameState,data.playerId,data.ships);
    if(!result.ok)sendTo(conn,{type:'ACTION_ERROR',message:result.error});
    broadcastState();renderTableUI();scheduleNavalBot();
}
function hostHandleNavalFire(data,conn){
    if(!navalPacketOk(data,conn))return;
    const result=processNavalShot(gameState,data.playerId,data.r,data.c);
    if(!result.ok)sendTo(conn,{type:'ACTION_ERROR',message:result.error});
    broadcastState();renderTableUI();scheduleNavalBot();
}
function hostHandleNavalResign(data,conn){
    if(!navalPacketOk(data,conn))return;
    const result=requestNavalResign(gameState,data.playerId);
    if(!result.ok)sendTo(conn,{type:'ACTION_ERROR',message:result.error});
    broadcastState();renderTableUI();
}

// Host-only: after any naval state change, if it's now a bot's turn make its
// shot after a short delay (same pacing as scheduleOthelloBot()).
function scheduleNavalBot(){
    if(!gameState.isHost||gameState.gameId!=='naval')return;
    if(botTimer)clearTimeout(botTimer);
    const ns=gameState.naval;
    if(!ns||ns.phase!=='in-progress')return;
    const botId=ns.ids[ns.turn];
    const bot=gameState.players.find(p=>p?.id===botId);
    if(!bot?.isBot)return;
    botTimer=setTimeout(()=>{
        const cur=gameState.naval;
        if(!gameState.isHost||cur?.phase!=='in-progress'||cur.ids[cur.turn]!==botId)return;
        const shot=chooseNavalBotShot(gameState,cur.turn);
        if(!shot)return;
        const result=processNavalShot(gameState,botId,shot.r,shot.c);
        if(result.ok){broadcastState();renderTableUI();scheduleNavalBot();}
    },700+Math.random()*600);
}

/* ---- local request helpers (called by the UI of whichever browser clicked) ---- */
function navalHostConn(){ return peerConnections[gameState.hostId||gameState.roomId]; }

function requestNavalFleet(ships){
    if(gameState.isHost){
        const result=processNavalFleet(gameState,gameState.myPlayerId,ships);
        if(!result.ok){showAlert('Game Error',result.error);return;}
        broadcastState();renderTableUI();scheduleNavalBot();
    }else{
        const host=navalHostConn();
        if(host?.open)sendTo(host,{type:'NAVAL_FLEET_REQUEST',roomId:gameState.roomId,playerId:gameState.myPlayerId,ships});
        else scheduleHostRecovery();
    }
}
function requestNavalFire(r,c){
    if(gameState.isHost){
        const result=processNavalShot(gameState,gameState.myPlayerId,r,c);
        if(!result.ok){showAlert('Illegal move',result.error);return;}
        broadcastState();renderTableUI();scheduleNavalBot();
    }else{
        const host=navalHostConn();
        if(host?.open)sendTo(host,{type:'NAVAL_FIRE_REQUEST',roomId:gameState.roomId,playerId:gameState.myPlayerId,r,c});
        else scheduleHostRecovery();
    }
}
function requestNavalResignAction(){
    if(gameState.isHost){
        const result=requestNavalResign(gameState,gameState.myPlayerId);
        if(!result.ok){showAlert('Game Error',result.error);return;}
        broadcastState();renderTableUI();
    }else{
        const host=navalHostConn();
        if(host?.open)sendTo(host,{type:'NAVAL_RESIGN_REQUEST',roomId:gameState.roomId,playerId:gameState.myPlayerId});
        else scheduleHostRecovery();
    }
}
