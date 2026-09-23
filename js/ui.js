/* ========================================================================
   UI RENDERING - Renders the poker table UI into the DOM
   ======================================================================== */

// Full re-render of the poker table from the current gameState. This is
// the single UI update function -- called after every local or networked
// state change (see game-logic.js, network.js, events.js) rather than
// doing incremental DOM patching. Wrapped in a try/catch so a rendering
// bug logs an error instead of silently breaking the whole page.
function renderTableUI(){
    try{
        // --- Top info bar: pot size, current bet to call, game phase/status text ---
        document.getElementById('potDisplay').textContent=`$${gameState.pot}`;
        document.getElementById('currentBetDisplay').textContent=`$${gameState.currentHighBet||gameState.currentBet||0}`;
        
        let phaseDisplay = gameState.phase;
        if (gameState.phase === 'LOBBY WAITING') phaseDisplay = t('lobbyWaiting');
        else if (gameState.phase === 'SHOWDOWN' && gameState.showdownSummary) phaseDisplay = gameState.showdownSummary;
        document.getElementById('gamePhaseText').textContent = phaseDisplay;
        
        // --- Variant label and the shared community cards in the middle of the felt ---
        document.getElementById('variantLabel').textContent=gameState.variant==='holdem'?"Texas Hold'em":"5-Card Draw";
        const cc=document.getElementById('communityCards');
        cc.innerHTML=gameState.communityCards.length?gameState.communityCards.map(c=>cardHTML(c)).join(''):`<span class="text-slate-400 text-[11px] sm:text-xs italic">${gameState.status==='in-progress'?t('noCommunityCards'):t('waitingDealer')}</span>`;
        
        // --- The 8 seats around the table ---
        for(let i=0;i<8;i++){
            const el=document.getElementById(`seat-${i}`),p=gameState.players[i];if(!el)continue;
            // Empty seat: just show a placeholder "Seat N" slot.
            if(!p){el.innerHTML=`<div class="w-12 h-12 sm:w-16 sm:h-16 rounded-full border border-dashed border-slate-700/60 bg-slate-950/40 flex items-center justify-center text-slate-600 text-[9px] sm:text-[10px] font-bold">${t('seat', {num: i+1})}</div>`;continue;}
            const turn=gameState.status==='in-progress'&&gameState.activeTurnSeat===i, local=p.id===gameState.myPlayerId;
            // Only render this seat's cards face-up if it's the local player's
            // own seat, or it's showdown and this player didn't fold; the
            // gameState the client received has already redacted anything
            // it's not allowed to see (see publicStateFor() in network.js),
            // so this is mostly about which cards get the face-down back
            // vs face-up styling. During the local player's own draw phase,
            // each of their cards also gets a `draw-card-N` class so the
            // global click handler in events.js can toggle it for discard.
            let cards='';
            if(p.cards?.length) cards=`<div class="flex gap-0.5 -mb-2 z-10">${p.cards.map((c,j)=>cardHTML(c,!local&&gameState.phase!=='SHOWDOWN',local&&gameState.stage==='draw'?`draw-card-${j}`:'')).join('')}</div>`;
            // Seat card: avatar, name, chip stack, dealer-button badge,
            // a pulsing highlight when it's this seat's turn, and status
            // tags (folded / all-in / revealed hand name at showdown).
            el.innerHTML=`<div class="flex flex-col items-center">${cards}<div class="w-16 sm:w-20 bg-slate-900 border ${turn?'pulse-turn border-emerald-400':'border-slate-700'} rounded-2xl p-1 flex flex-col items-center shadow-2xl relative">${gameState.dealerSeat===i?'<span class="absolute -top-1 -right-1 bg-amber-400 text-slate-950 text-[8px] font-black w-3.5 h-3.5 rounded-full flex items-center justify-center">D</span>':''}<img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(p.name)}" class="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-slate-800 border border-slate-700 mb-0.5"><div class="text-[9px] sm:text-[10px] font-bold text-slate-100 truncate w-full text-center">${p.name}</div><div class="text-[9px] font-mono text-emerald-400 font-extrabold">$${p.chips}</div>${p.folded?`<span class="text-[8px] font-black text-rose-400 uppercase">${t('folded')}</span>`:''}${p.allIn?`<span class="text-[8px] font-black text-amber-400 uppercase">${t('allIn')}</span>`:''}${p.evalResult&&gameState.phase==='SHOWDOWN'?`<span class="text-[8px] text-blue-300 font-bold">${localizedHandType(p.evalResult.typeName)}</span>`:''}</div></div>`;
        }

        // --- Figure out the local player's own seat/turn status, used to
        // drive which action buttons are enabled below ---
        const mySeat=gameState.players.findIndex(p=>p?.id===gameState.myPlayerId), mine=gameState.players[mySeat];
        const myTurn=mySeat>=0&&gameState.activeTurnSeat===mySeat&&gameState.status==='in-progress';
        const drawPhase=myTurn&&gameState.stage==='draw';
        
        // --- Enable/disable the fold/check-call/raise buttons: only
        // usable on the local player's own turn, and not during their
        // draw-phase turn (that uses the Draw button instead, added below) ---
        document.getElementById('foldBtn').disabled=!myTurn||drawPhase;
        document.getElementById('checkCallBtn').disabled=!myTurn||drawPhase;
        document.getElementById('raiseBtn').disabled=!myTurn||drawPhase;
        
        // The combined check/call button's label switches to "Call" when
        // there's a bet the local player still needs to match.
        const check=document.getElementById('checkCallBtn');
        if(check) check.textContent = myTurn&&mine&&gameState.currentHighBet>mine.currentBet ? t('call') : t('check');
        
        // --- Host-only admin panel (deal/variant/bot controls), and the
        // spectator banner shown to anyone not seated once a hand is live ---
        document.getElementById('hostAdminPanel').classList.toggle('hidden',!gameState.isHost);
        const startBtn=document.getElementById('startGameBtn'); if(startBtn) startBtn.disabled=gameState.status==='in-progress';
        document.getElementById('spectatorBanner').classList.toggle('hidden',!(mySeat<0&&gameState.status==='in-progress'));
        
        // Comprehensive Turn Messaging
        // One-line status message telling the local player what's happening
        // right now: prompting them to discard, telling them it's their
        // turn, naming whose turn it is otherwise, or showing the
        // showdown result once the hand has ended.
        const sum=document.getElementById('playerHandSummary');
        if (gameState.status === 'in-progress') {
            const activeP = gameState.players[gameState.activeTurnSeat];
            const activeName = activeP ? activeP.name : '';
            if (drawPhase) {
                sum.textContent = t('drawDiscardPrompt');
            } else if (myTurn) {
                sum.textContent = t('yourTurn');
            } else if (activeName) {
                sum.textContent = t('turnOf', { name: activeName });
            } else {
                sum.textContent = t('waitingForAction');
            }
        } else if (gameState.phase === 'SHOWDOWN' && gameState.showdownSummary) {
            sum.textContent = gameState.showdownSummary;
        } else {
            sum.textContent = '';
        }

        // The Draw button (5-card draw variant) isn't part of the static
        // HTML markup -- it's created once on first render and reused
        // afterwards, since it only needs to exist for that game variant.
        // Clicking it sends the currently-selected discard indices
        // (drawSelection, toggled by the click handler in events.js) via
        // requestAction(), then clears the selection.
        let drawBtn=document.getElementById('drawBtn');
        if(!drawBtn){
            drawBtn=document.createElement('button');drawBtn.id='drawBtn';drawBtn.className='px-3 sm:px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-30 text-white text-xs font-extrabold transition';
            document.getElementById('actionControls').prepend(drawBtn);
            drawBtn.addEventListener('click',()=>{requestAction('draw',0,[...drawSelection]);drawSelection.clear();});
        }
        drawBtn.textContent = t('draw');
        drawBtn.disabled=!drawPhase;
    }catch(e){logMessage(`Render error: ${e.message}`,'error');}
}
