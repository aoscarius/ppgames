/* ========================================================================
   MONOPOLIO NETWORK/HOST ACTIONS - one packet type carries every player
   action; the host validates and applies it with processMonopolioAction().
   The transport itself (sendTo/broadcastState/...) lives in core/network.js.
   ======================================================================== */
function hostStartMonopolioMatch(){
    if(!gameState.isHost||gameState.gameId!=='monopolio')return;
    const r=startMonopolioMatch(gameState);
    if(!r.ok){showAlert('Game Error',r.error);return;}
    appendChatMessage('System',t('monMatchStarted'),true);
    broadcastState();renderTableUI();scheduleMonopolioBot();
}

function hostHandleMonopolioAction(data,conn){
    if(!gameState.isHost||data.roomId!==gameState.roomId)return;
    if(conn?.peer!==data.playerId)return;   // a peer may only act as itself
    const p=gameState.players.find(x=>x?.id===data.playerId);
    if(!p||p.isBot)return;
    const result=processMonopolioAction(gameState,data.playerId,data.action,data.sq,data.trade);
    if(!result.ok)sendTo(conn,{type:'ACTION_ERROR',message:result.error});
    broadcastState();renderTableUI();scheduleMonopolioBot();
}

// Local helper used by the UI of whichever browser the player is on.
function requestMonopolioAction(action,sq,trade){
    if(gameState.isHost){
        const result=processMonopolioAction(gameState,gameState.myPlayerId,action,sq,trade);
        if(!result.ok){showAlert('Illegal move',result.error);return;}
        broadcastState();renderTableUI();scheduleMonopolioBot();
    }else{
        const host=peerConnections[gameState.hostId||gameState.roomId];
        if(host?.open)sendTo(host,{type:'MONOPOLIO_ACTION',roomId:gameState.roomId,playerId:gameState.myPlayerId,action,sq,trade});
        else scheduleHostRecovery();
    }
}

// Host-only: after any state change, if a bot has to act (play its turn,
// answer a trade offer, or withdraw one a human is ignoring) let it make ONE
// decision after a short delay; the change it causes re-schedules.
function scheduleMonopolioBot(){
    if(!gameState.isHost||gameState.gameId!=='monopolio')return;
    if(botTimer)clearTimeout(botTimer);
    const ms=gameState.monopolio;
    if(!ms||ms.phase!=='in-progress')return;
    const who=monoWhoActs(ms);
    if(!who)return;
    const seq=ms.tradeSeq,turn=ms.turn,hadTrade=!!ms.trade;
    const delay=who.kind==='timeout'?30000:550+Math.random()*450;
    botTimer=setTimeout(()=>{
        const cur=gameState.monopolio;
        if(!gameState.isHost||cur?.phase!=='in-progress')return;
        if(cur.tradeSeq!==seq||cur.turn!==turn||!!cur.trade!==hadTrade)return;   // stale: something else already happened
        const id=cur.pl[who.idx].id;
        let choice;
        if(who.kind==='timeout')choice={action:'TRADE_CANCEL'};
        else if(who.kind==='respond')choice=monoBotRespond(gameState,who.idx);
        else choice=monoBotChoose(gameState,who.idx);
        let result=choice?processMonopolioAction(gameState,id,choice.action,choice.sq,choice.extra):{ok:false};
        if(!result.ok){
            // never leave the table stuck on a bot: fall back to the safe move
            const fb=who.kind==='respond'?'TRADE_DECLINE':who.kind==='timeout'?'TRADE_CANCEL'
                :{roll:'ROLL',buy:'PASS',end:'END_TURN',debt:'BANKRUPT'}[cur.step];
            result=processMonopolioAction(gameState,id,fb);
        }
        if(result.ok){broadcastState();renderTableUI();scheduleMonopolioBot();}
    },delay);
}
