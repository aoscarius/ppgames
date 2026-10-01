/* ========================================================================
   CHESS NETWORK/HOST ACTIONS - host-side handlers for chess packets and the
   local request helpers used by the chess UI. The transport itself
   (sendTo/broadcastState/...) lives in core/network.js.
   ======================================================================== */

function hostStartChessMatch(){
    if(!gameState.isHost||gameState.gameId!=='chess')return;
    const r=startChessMatch(gameState);
    if(!r.ok){showAlert('Game Error',`Game error occurred: ${r.error}`);return;}
    appendChatMessage('System',t('chessMatchStarted'),true);
    broadcastState();renderTableUI();scheduleChessBot();
}

function hostHandleChessMove(data,conn){
    if(!gameState.isHost||data.roomId!==gameState.roomId)return;
    const seat=gameState.players.findIndex(p=>p?.id===data.playerId);
    if(seat<0||gameState.players[seat].isBot)return;
    const result=processChessMove(gameState,data.playerId,data.from,data.to,data.promotion);
    if(!result.ok)sendTo(conn,{type:'ACTION_ERROR',message:result.error});
    broadcastState();renderTableUI();scheduleChessBot();
}

function hostHandleChessResign(data,conn){
    if(!gameState.isHost||data.roomId!==gameState.roomId)return;
    const result=requestChessResign(gameState,data.playerId);
    if(!result.ok)sendTo(conn,{type:'ACTION_ERROR',message:result.error});
    broadcastState();renderTableUI();
}

function hostHandleChessDrawOffer(data,conn){
    if(!gameState.isHost||data.roomId!==gameState.roomId)return;
    const result=requestChessDrawOffer(gameState,data.playerId);
    if(!result.ok)sendTo(conn,{type:'ACTION_ERROR',message:result.error});
    broadcastState();renderTableUI();
}

function hostHandleChessDrawResponse(data,conn){
    if(!gameState.isHost||data.roomId!==gameState.roomId)return;
    const result=respondChessDrawOffer(gameState,data.playerId,!!data.accept);
    if(!result.ok)sendTo(conn,{type:'ACTION_ERROR',message:result.error});
    broadcastState();renderTableUI();scheduleChessBot();
}

// Host-only: after any chess state change, if it's now a bot's turn, make
// its move after a short delay (mirrors scheduleBot()'s pacing in
// game-logic.js so bot moves don't feel instant/robotic).
function scheduleChessBot(){
    if(!gameState.isHost||gameState.gameId!=='chess')return;
    if(botTimer)clearTimeout(botTimer);
    const cs=gameState.chess;
    if(!cs||cs.status!=='in-progress')return;
    const turnColor=loadChessEngine(gameState).turn();
    const toMoveId=turnColor==='w'?cs.whitePlayerId:cs.blackPlayerId;
    const toMove=gameState.players.find(p=>p?.id===toMoveId);
    if(!toMove?.isBot)return;
    botTimer=setTimeout(()=>{
        if(!gameState.isHost||gameState.chess?.status!=='in-progress')return;
        const mv=chooseChessBotMove(gameState);
        if(!mv)return;
        const result=processChessMove(gameState,toMoveId,mv.from,mv.to,mv.promotion);
        if(result.ok){broadcastState();renderTableUI();scheduleChessBot();}
    },600+Math.random()*500);
}

function requestChessMove(from,to,promotion){
    if(gameState.isHost){
        const result=processChessMove(gameState,gameState.myPlayerId,from,to,promotion);
        if(!result.ok){showAlert('Illegal move',result.error);return;}
        broadcastState();renderTableUI();scheduleChessBot();
    }else{
        const host=peerConnections[gameState.hostId||gameState.roomId];
        if(host?.open)sendTo(host,{type:'CHESS_MOVE_REQUEST',roomId:gameState.roomId,playerId:gameState.myPlayerId,from,to,promotion});
        else scheduleHostRecovery();
    }
}

function requestChessResignAction(){
    if(gameState.isHost){
        const result=requestChessResign(gameState,gameState.myPlayerId);
        if(!result.ok){showAlert('Game Error',result.error);return;}
        broadcastState();renderTableUI();
    }else{
        const host=peerConnections[gameState.hostId||gameState.roomId];
        if(host?.open)sendTo(host,{type:'CHESS_RESIGN_REQUEST',roomId:gameState.roomId,playerId:gameState.myPlayerId});
        else scheduleHostRecovery();
    }
}

function requestChessDrawOfferAction(){
    if(gameState.isHost){
        const result=requestChessDrawOffer(gameState,gameState.myPlayerId);
        if(!result.ok){showAlert('Game Error',result.error);return;}
        broadcastState();renderTableUI();
    }else{
        const host=peerConnections[gameState.hostId||gameState.roomId];
        if(host?.open)sendTo(host,{type:'CHESS_DRAW_OFFER_REQUEST',roomId:gameState.roomId,playerId:gameState.myPlayerId});
        else scheduleHostRecovery();
    }
}

function requestChessDrawResponseAction(accept){
    if(gameState.isHost){
        const result=respondChessDrawOffer(gameState,gameState.myPlayerId,accept);
        if(!result.ok){showAlert('Game Error',result.error);return;}
        broadcastState();renderTableUI();scheduleChessBot();
    }else{
        const host=peerConnections[gameState.hostId||gameState.roomId];
        if(host?.open)sendTo(host,{type:'CHESS_DRAW_RESPONSE_REQUEST',roomId:gameState.roomId,playerId:gameState.myPlayerId,accept});
        else scheduleHostRecovery();
    }
}
