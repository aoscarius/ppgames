/* ========================================================================
   POKER MODULE ENTRY - registers poker with the core (see the module
   contract in core/game-registry.js) and owns every poker DOM listener.
   Loaded last, after constants/evaluator/cards/logic/net/ui.
   ======================================================================== */
registerGame({
    id:'poker',

    // Poker keeps its historical fields at the root of gameState.
    stateDefaults(){
        return {
            variant:'holdem', phase:'LOBBY WAITING', stage:'lobby',   // stage: lobby | preflop | flop | turn | river | draw | showdown ...
            pot:0, currentBet:0, currentHighBet:0, minRaise:20,
            currency:'USD', startingStack:1000, smallBlind:10, bigBlind:20,
            dealerSeat:-1, activeTurnSeat:-1, handNumber:0,
            communityCards:[], deck:[], showdownSummary:''
        };
    },
    resetRoom(){
        gameState.phase='LOBBY WAITING';gameState.stage='lobby';
        gameState.communityCards=[];gameState.pot=0;gameState.currentBet=0;gameState.currentHighBet=0;
    },
    createPlayer(base){
        return {...base,chips:gameState.startingStack,currentBet:0,folded:false,isBot:!!base.isBot,cards:[]};
    },

    render:renderPokerUI,
    subtitle:()=>gameState.variant==='holdem'?"Texas Hold'em":"5-Card Draw",
    configSummary:()=>`${currencySymbol(gameState)}${gameState.startingStack} · ${gameState.maxSeats} ${t('players')} · ${money(gameState,gameState.smallBlind)}/${money(gameState,gameState.bigBlind)}`,

    // The host first fills in the table configuration (stakes, seats, variant).
    hostFlow:openPokerConfig,

    // Hole cards are private: every peer only sees its own until showdown.
    publicState(copy,peerId){
        copy.deck=[];
        const revealAll=copy.phase==='SHOWDOWN';
        copy.players.forEach(p=>{
            if(!p?.cards)return;
            const mine=p.id===peerId;
            const shown=revealAll&&!p.folded;
            if(!mine&&!shown)p.cards=p.cards.map(()=>null);
        });
    },

    onMessage(data,conn){
        if(data.type==='ACTION_REQUEST'){hostHandleAction(data,conn);return true;}
        if(data.type==='TABLE_CONFIG'){
            if(gameState.status==='lobby'){const r=applyTableConfig(data.config);if(r.ok){broadcastState();renderTableUI();}}
            return true;
        }
        return false;
    },
    startRequested:startHand,
    scheduleBots:scheduleBot,
    removeBot:removeBotFromTable,
    onTableReset:pokerOnTableReset,

    // A player dropping mid-hand is folded so the betting round never stalls.
    onPlayerDisconnected(i){
        const p=gameState.players[i];
        if(p&&!p.folded&&!p.out){
            p.disconnected=true;p.folded=true;p.actedThisRound=true;p.lastAction='Disconnected';
            if(gameState.activeTurnSeat===i)advanceAfterAction(gameState);
        }
    },
    // The previous host no longer owns a seat after promotion. Chips already
    // committed stay in the pot; removing the seat keeps the game moving.
    onHostPromoted(oldHostSeat){
        const wasActiveTurn=gameState.activeTurnSeat===oldHostSeat;
        gameState.players[oldHostSeat]=null;
        if(wasActiveTurn&&gameState.status==='in-progress')advanceAfterAction(gameState);
    },

    // Called once, right after board.html has been mounted.
    bind(){
        const $=id=>document.getElementById(id);
        $('pokerConfigBackBtn').onclick=()=>showScreen('gameSelectionScreen');
        $('pokerConfigContinueBtn').onclick=()=>{
            const cfg=readPokerConfig(),err=validatePokerConfig(cfg);
            const box=$('configError');
            if(err){box.textContent=err;box.classList.remove('hidden');return;}
            const r=applyTableConfig(cfg);
            if(!r.ok){box.textContent=r.error;box.classList.remove('hidden');return;}
            createRoomNow();
        };
        $('startGameBtn').onclick=()=>{if(gameState.isHost)startHand();};
        // Player action buttons: each calls requestAction() (poker/net.js), which
        // applies the action locally on the host or asks the host to apply it.
        $('drawBtn').onclick=()=>{requestAction('draw',0,[...drawSelection]);drawSelection.clear();};
        $('foldBtn').onclick=()=>requestAction('fold');
        $('checkCallBtn').onclick=()=>{
            const s=gameState.players.findIndex(p=>p?.id===gameState.myPlayerId);
            requestAction(gameState.currentHighBet>(gameState.players[s]?.currentBet||0)?'call':'check');
        };
        $('raiseBtn').onclick=()=>requestAction('raise',Number($('raiseInput').value));
        $('allInBtn').onclick=()=>requestAction('allin');

        // Selecting/deselecting hole cards to discard in 5-card draw. Cards are
        // tagged `draw-card-N` by renderPokerUI() while it's the local player's draw turn.
        document.addEventListener('click',e=>{
            const el=e.target.closest('[class*="draw-card-"]');if(!el||gameState.gameId!=='poker'||gameState.stage!=='draw')return;
            const m=el.className.match(/draw-card-(\d+)/);if(!m)return;
            const i=Number(m[1]);if(drawSelection.has(i))drawSelection.delete(i);else drawSelection.add(i);
            el.classList.toggle('ring-4');el.classList.toggle('ring-blue-600');
        });
    }
});
