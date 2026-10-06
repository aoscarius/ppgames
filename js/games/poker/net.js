/* ========================================================================
   POKER NETWORK/HOST ACTIONS - host-side handlers for poker packets and the
   local request helpers used by the poker UI. The transport itself
   (sendTo/broadcastState/...) lives in core/network.js.
   ======================================================================== */

function hostHandleAction(data,conn){
    if(!gameState.isHost||data.roomId!==gameState.roomId)return;
    const seat=gameState.players.findIndex(p=>p?.id===data.playerId);
    if(seat<0||gameState.players[seat].isBot)return;
    const result=data.action==='draw'
        ?processDraw(gameState,seat,data.indices||[])
        :processAction(gameState,seat,data.action,data.amount);
    if(!result.ok)sendTo(conn,{type:'ACTION_ERROR',message:result.error});
    broadcastState();renderTableUI();scheduleBot();
}

function applyTableConfig(config={}){
    const currency=config.currency==='EUR'?'EUR':'USD';
    const startingStack=Number(config.startingStack);
    const maxSeats=Math.max(2,Math.min(8,Math.floor(Number(config.maxSeats))));
    const smallBlind=Number(config.smallBlind), bigBlind=Number(config.bigBlind);
    const variant=config.variant==='5card'?'draw':'holdem';
    if(!Number.isFinite(startingStack)||startingStack<=0)return {ok:false,error:t('stackError')};
    if(!Number.isFinite(maxSeats)||maxSeats<2||maxSeats>8)return {ok:false,error:t('minMaxSeats')};
    if(!Number.isFinite(smallBlind)||smallBlind<=0||!Number.isFinite(bigBlind)||bigBlind<smallBlind)return {ok:false,error:t('blindsError')};
    gameState.currency=currency;gameState.startingStack=startingStack;gameState.maxSeats=maxSeats;
    gameState.smallBlind=smallBlind;gameState.bigBlind=bigBlind;gameState.minRaise=bigBlind;gameState.variant=variant;
    document.getElementById('raiseInput').value=gameState.minRaise;
    gameState.players.forEach(p=>{if(p&&gameState.status==='lobby')p.chips=startingStack;});
    return {ok:true};
}

// Poker's half of the shared "Reset Table" flow (see resetTable() in
// core/network.js, which calls this after handling the game-agnostic
// parts: releasing disconnected seats, clearing spectators/kicks, going
// back to lobby). This resets every SEATED player's per-hand chips/cards
// and the table's own betting state, while keeping everyone seated.
function pokerOnTableReset(){
    clearTimeout(botTimer);
    clearTimeout(runoutTimer);runoutTimer=null;
    drawSelection.clear();

    gameState.players=gameState.players.map(p=>{
        if(!p)return null;
        return {
            ...p,
            chips:gameState.startingStack,
            currentBet:0,
            contributed:0,
            folded:false,
            allIn:false,
            out:false,
            cards:[],
            evalResult:null,
            drawDone:false,
            actedThisRound:false,
            lastAction:''
        };
    });

    gameState.phase='LOBBY WAITING';
    gameState.stage='lobby';
    gameState.pot=0;
    gameState.currentBet=0;
    gameState.currentHighBet=0;
    gameState.minRaise=gameState.bigBlind;
    gameState.dealerSeat=-1;
    gameState.activeTurnSeat=-1;
    gameState.communityCards=[];
    gameState.deck=[];
    gameState.showdownSummary='';
    gameState.runout=false;gameState.runoutStep=0;gameState.winnerIds=[];gameState.sidePots=[];gameState.drawNotes=[];

    const raiseInput=document.getElementById('raiseInput');
    if(raiseInput)raiseInput.value=gameState.minRaise;
}

function removeBotFromTable(seat){
    if(!gameState.isHost)return;
    if(!Number.isInteger(seat)||seat<0||seat>=gameState.maxSeats)return;

    const bot=gameState.players[seat];
    if(!bot?.isBot)return;

    clearTimeout(botTimer);

    // A bot that leaves during a hand is treated like a folded/disconnected
    // player. Any chips it already put into the pot stay there as dead money
    // (the seat is cleared below, so resolveShowdown() adds them to the main pot).
    if(gameState.status==='in-progress'){
        bot.folded=true;
        bot.out=true;
        bot.actedThisRound=true;
        bot.drawDone=true;
        bot.lastAction='Removed by host';
        // afterSeatLeft() needs the seat to still exist while it works out whose turn is next.
        afterSeatLeft(gameState,seat);
    }

    gameState.players[seat]=null;
    appendChatMessage('System',`${bot.name} ${t('botRemoved')}.`,true);
    broadcastState();
    renderTableUI();
    scheduleBot();
}

// Paced runout: when everyone left is all-in, the host deals the remaining
// board street by street with a pause between them (see runoutStep() in logic.js).
function scheduleRunout(){
    if(!gameState.isHost)return;
    if(gameState.status!=='in-progress'||!gameState.runout){clearTimeout(runoutTimer);runoutTimer=null;return;}
    if(runoutTimer)return;   // one pending step at a time
    const delay=POKER_TIMING.runoutStep;
    runoutTimer=setTimeout(()=>{
        runoutTimer=null;
        if(!gameState.isHost||gameState.status!=='in-progress'||!gameState.runout)return;
        runoutStep(gameState);
        broadcastState();renderTableUI();scheduleBot();
    },delay);
}

function startHand(){
    if(!gameState.isHost)return;
    const r=initHand(gameState);if(!r.ok){showAlert('Game Error', `Game error occurred: ${r.error}`);return;}
    appendChatMessage('System',`Hand #${gameState.handNumber} started. Blinds ${money(gameState,gameState.smallBlind)}/${money(gameState,gameState.bigBlind)}.`,true);
    broadcastState();renderTableUI();scheduleBot();
}

function requestAction(action,amount=0,indices=[]){
    if(gameState.isHost){
        const seat=gameState.players.findIndex(p=>p?.id===gameState.myPlayerId);
        const r=action==='draw'?processDraw(gameState,seat,indices):processAction(gameState,seat,action,amount);
        if(!r.ok){showAlert('Game Error', `Game error occurred: ${r.error}`);return;}
        broadcastState();renderTableUI();scheduleBot();
    }else{
        const host=peerConnections[gameState.hostId||gameState.roomId];
        if(host?.open)sendTo(host,{type:'ACTION_REQUEST',roomId:gameState.roomId,playerId:gameState.myPlayerId,action,amount,indices});
        else scheduleHostRecovery();
    }
}
