/* ========================================================================
   GAME LOGIC - Betting rounds, hand progression, showdown, bot AI
   ======================================================================== */

// Sum every seated player's current-street bet. (Informational helper --
// note the actual pot total is tracked separately on state.pot as chips
// are charged; see charge() below.)
function collectChips(state){
    return state.players.reduce((n,p)=>n+(p?.currentBet||0),0);
}

// Start a fresh betting round (called when moving from one street to the
// next, e.g. preflop -> flop): clears everyone's current-street bet and
// "have they acted yet" flag, and resets the bet-to-beat back to zero with
// the minimum raise back to one big blind.
function resetBetRound(state){
    state.players.forEach(p=>{if(p){p.currentBet=0;p.actedThisRound=false;}});
    state.currentHighBet=0; state.currentBet=0; state.minRaise=state.bigBlind;
    document.getElementById('raiseInput').value=gameState.minRaise;
}

// Move chips from a player's stack into the pot. Clamps the amount to
// never go below 0 or above the player's remaining chips (so a call/raise
// that exceeds their stack simply puts them all-in for whatever they have
// left). Returns the actual amount charged.
function charge(state,p,amount){
    const a=Math.max(0,Math.min(amount,p.chips));
    p.chips-=a;
    p.currentBet+=a;
    state.pot+=a;
    if(p.chips===0) p.allIn=true;
    return a;
}

// Players still contesting the pot this hand: seated, not spectating,
// not folded, not already busted out. (Includes all-in players, unlike
// eligibleToAct in utils.js which excludes them since they can't act again.)
function liveUnfolded(state){return state.players.filter(p=>p&&!p.spectator&&!p.folded&&!p.out);}

// Is the current betting round finished? True if at most one player is
// still live (hand is over), or if nobody remaining can act (everyone
// left is all-in), or if every player who *can* still act has matched
// the current high bet and has already acted this round.
function bettingComplete(state){
    const live=liveUnfolded(state), canAct=live.filter(eligibleToAct);
    if(live.length<=1) return true;
    if(canAct.length===0) return true;
    return canAct.every(p=>p.currentBet===state.currentHighBet && p.actedThisRound);
}

// Award the entire pot to the single remaining player because everyone
// else folded (no showdown needed). Records the result and ends the hand.
function awardSingle(state,winner){
    winner.chips+=state.pot; winner.lastAction=`Won ${money(state,state.pot)} (all opponents folded)`;
    state.showdownSummary = t('winnerFoldedLabel', { name: winner.name });
    appendChatMessage('System', state.showdownSummary, true);
    state.pot=0; state.status='hand-ended'; state.stage='ended'; state.phase='SHOWDOWN'; state.activeTurnSeat=-1;
}

// End the hand at showdown: evaluate every remaining (non-folded) player's
// best hand (hole cards + community cards, via evaluate() in
// hand-evaluator.js), find the highest score, and split the pot evenly
// among all players tied for that best score (any odd remainder chip goes
// to the first winner). The evaluator also stores the exact five cards that
// form the winning hand in `evalResult.bestCards`; the UI uses that data to
// highlight the winning combination for every peer. Falls back to
// awardSingle() if only one player is left uncontested. Builds a localized
// summary message for chat/UI and marks the hand as ended.
function resolveShowdown(state){
    const live=liveUnfolded(state);
    if(live.length===1){awardSingle(state,live[0]);return;}
    const results=live.map(p=>({p,e:evaluate([...p.cards,...state.communityCards])}));
    results.forEach(x=>x.p.evalResult=x.e);
    const best=Math.max(...results.map(x=>x.e.score)), winners=results.filter(x=>x.e.score===best).map(x=>x.p);
    const share=Math.floor(state.pot/winners.length), remainder=state.pot-share*winners.length;
    
    winners.forEach((w,i)=>{
        const wonAmount = share + (i===0?remainder:0);
        w.chips += wonAmount;
        w.lastAction = `Won ${money(state,wonAmount)} (${localizedHandType(w.evalResult.typeName)})`;
    });

    const handName = localizedHandType(winners[0].evalResult.typeName);
    if(winners.length === 1) {
        state.showdownSummary = t('winnerLabel', { name: winners[0].name, hand: handName });
    } else {
        const names = winners.map(w => w.name).join(', ');
        state.showdownSummary = t('winnersLabel', { names, hand: handName });
    }
    appendChatMessage('System', state.showdownSummary, true);

    state.pot=0; state.status='hand-ended'; state.stage='ended'; state.phase='SHOWDOWN'; state.activeTurnSeat=-1;
}

// Progress the hand to its next street once the current betting round is
// complete. Two different flows depending on variant:
//  - Texas Hold'em: preflop -> flop (deal 3 community cards) -> turn (deal 1)
//    -> river (deal 1) -> showdown. Each transition resets betting.
//  - 5-card draw: betting1 -> draw phase (players swap cards, handled by
//    processDraw) -> betting2 -> showdown.
// After moving to the new stage, finds the next player who can act
// (starting after the dealer). If nobody can act (e.g. everyone's all-in),
// it either recurses to auto-advance straight through remaining Hold'em
// streets with no further betting, or goes straight to showdown.
function advanceStage(state){
    if(state.variant==='holdem'){
        resetBetRound(state);
        if(state.stage==='preflop'){state.stage='flop';state.phase='FLOP';state.communityCards.push(...state.deck.splice(0,3));}
        else if(state.stage==='flop'){state.stage='turn';state.phase='TURN';state.communityCards.push(state.deck.shift());}
        else if(state.stage==='turn'){state.stage='river';state.phase='RIVER';state.communityCards.push(state.deck.shift());}
        else {resolveShowdown(state);return;}
    } else {
        if(state.stage==='betting1'){resetBetRound(state);state.stage='draw';state.phase='DRAW';}
        else if(state.stage==='betting2'){resolveShowdown(state);return;}
    }
    state.activeTurnSeat=nextSeat(state,state.dealerSeat);
    if(state.activeTurnSeat<0){
        if(state.variant==='holdem' && state.stage!=='river'){ advanceStage(state); return; }
        resolveShowdown(state);
    }
}
// After a player takes a betting action, decide what happens next:
// award the pot outright if only one player is left, move to the next
// street if the betting round is now complete, otherwise pass the turn
// to the next eligible seat (or advance the stage if none can act).
function advanceAfterAction(state){
    const live=liveUnfolded(state);
    if(live.length<=1){awardSingle(state,live[0]);return;}
    if(bettingComplete(state)){advanceStage(state);return;}
    const n=nextSeat(state,state.activeTurnSeat);
    if(n<0) advanceStage(state); else state.activeTurnSeat=n;
}

// Validate and apply one betting action (fold / check / call / raise) from
// the player in `seat`. Rejects the action (returning {ok:false,error})
// if it isn't that seat's turn, the player can't act, a check is attempted
// while facing a bet, or a raise doesn't meet the minimum-raise requirement.
// On success, charges the appropriate chips via charge(), records a
// human-readable lastAction for the UI, marks the player as having acted
// this round, and calls advanceAfterAction() to move the hand forward.
// This is the single entry point the host uses for every player action,
// whether it came from a human (via requestAction() in network.js) or a
// bot (via botAction() below).
function processAction(state,seat,type,raiseTo=0){
    if(state.status!=='in-progress'||state.activeTurnSeat!==seat) return {ok:false,error:'NOT_YOUR_TURN'};
    const p=state.players[seat]; if(!eligibleToAct(p)) return {ok:false,error:'CANNOT_ACT'};
    const toCall=Math.max(0,state.currentHighBet-p.currentBet);
    if(type==='fold'){
        // Fold is a 5-card-draw-only action in this project. Texas Hold'em
        // intentionally uses the other three controls only.
        if(state.variant==='draw') return {ok:false,error:'FOLD_NOT_AVAILABLE'};
        p.folded=true;p.lastAction='Fold';
    }
    else if(type==='check'){if(toCall!==0)return {ok:false,error:'CHECK_FACING_BET'};p.lastAction='Check';}
    else if(type==='call'){charge(state,p,toCall);p.lastAction=p.allIn?'All-in':'Call';}
    else if(type==='allin'){
        if(p.chips<=0)return {ok:false,error:'ALREADY_ALL_IN'};
        const previousHigh=state.currentHighBet;
        const target=p.currentBet+p.chips;
        charge(state,p,p.chips);
        if(target>state.currentHighBet){
            state.minRaise=Math.max(state.minRaise,target-previousHigh);
            document.getElementById('raiseInput').value=gameState.minRaise;
            state.currentHighBet=target;
        }
        p.lastAction='All-in';
    }
    else if(type==='raise'){
        let target=Math.floor(Number(raiseTo));
        const minTarget=state.currentHighBet+state.minRaise;
        if(!Number.isFinite(target)||target<minTarget) return {ok:false,error:`MIN_RAISE:${minTarget}`};
        if(target>p.currentBet+p.chips) target=p.currentBet+p.chips;
        if(target<=state.currentHighBet) return {ok:false,error:'RAISE_TOO_SMALL'};
        charge(state,p,target-p.currentBet); state.minRaise=target-state.currentHighBet; state.currentHighBet=target;p.lastAction=`Raise to $${target}`;
        document.getElementById('raiseInput').value=gameState.minRaise;
    } else return {ok:false,error:'UNKNOWN_ACTION'};
    p.actedThisRound=true;
    state.currentBet=state.currentHighBet;
    advanceAfterAction(state); return {ok:true};
}

// Deal and set up a brand-new hand. Runs entirely on the host in response
// to the "Deal Hand" button (see startHand() in network.js). Steps:
//  1. Refuse if a hand is already in progress, or if fewer than 2 players
//     are seated with chips.
//  2. Reset per-hand player fields (folded/allIn/out/bet/cards/etc) and
//     deal a fresh shuffled deck.
//  3. Rotate the dealer button to the next seated player after the
//     previous dealer (or seat 0 for the very first hand).
//  4. Deal hole cards to everyone still in (2 for Hold'em, 5 for draw).
//  5. Post blinds: heads-up (2 players) the dealer is small blind and the
//     other player is big blind; otherwise small/big blind are the two
//     seats after the dealer.
//  6. Set the opening bet-to-beat/minimum-raise and hand the turn to the
//     first player after the big blind.
function initHand(state){
    if(state.status==='in-progress'){
        return {ok:false,error:'HAND_IN_PROGRESS'};
    }
    const seated=state.players
        .map((p,i)=>({p,i}))
        .filter(x=>x.i<state.maxSeats && x.p && !x.p.spectator && !x.p.isSpectator && x.p.chips>0)
        .map(x=>x.i);
    if(seated.length<2){
        return {ok:false,error:`NOT_ENOUGH_PLAYERS:${seated.length}`};
    }

    state.handNumber++; state.status='in-progress'; state.pot=0; state.showdownSummary='';
    state.communityCards=[]; state.deck=shuffleDeck(createDeck());
    state.players.forEach(p=>{
        if(!p)return;
        p.folded=false; p.allIn=false; p.out=p.chips<=0; p.currentBet=0;
        p.lastAction=''; p.evalResult=null; p.cards=[]; p.drawDone=false; p.actedThisRound=false;
    });

    const oldDealerPos=state.dealerSeat>=0 ? seated.indexOf(state.dealerSeat) : -1;
    const dealerPos=oldDealerPos<0 ? 0 : (oldDealerPos+1)%seated.length;
    state.dealerSeat=seated[dealerPos];
    const nextSeated=pos=>seated[(pos+1)%seated.length];

    const cardCount=state.variant==='holdem'?2:5;
    state.players.forEach(p=>{ if(p && !p.out) p.cards=state.deck.splice(0,cardCount); });

    let sb,bb;
    if(seated.length===2){
        sb=state.dealerSeat;
        bb=nextSeated(dealerPos);
    }else{
        sb=nextSeated(dealerPos);
        bb=nextSeated((dealerPos+1)%seated.length);
    }

    if(!Number.isInteger(sb)||!Number.isInteger(bb)||sb===bb||!state.players[sb]||!state.players[bb]){
        state.status='lobby';
        return {ok:false,error:'BLINDS_ASSIGN_FAIL'};
    }

    charge(state.players[sb],state.smallBlind);
    charge(state.players[bb],state.bigBlind);
    state.currentHighBet=Math.max(state.players[sb].currentBet,state.players[bb].currentBet);
    state.currentBet=state.currentHighBet; state.minRaise=state.bigBlind;
    document.getElementById('raiseInput').value = state.minRaise;
    state.stage=state.variant==='holdem'?'preflop':'betting1';
    state.phase=state.variant==='holdem'?'PREFLOP':'BETTING 1';
    state.activeTurnSeat=nextSeat(state,bb);
    return {ok:true};
}
// Handle a player's card-swap during the 5-card draw variant's draw phase.
// Validates it's actually this seat's turn to draw and that they're still
// in the hand, discards the requested (deduplicated, in-range) card
// indices, and deals replacement cards off the top of the deck until back
// up to 5. Once every remaining player has drawn, resets betting and
// starts the second betting round (betting2); otherwise passes the draw
// turn to the next player.
function processDraw(state,seat,indices){
    if(state.status!=='in-progress'||state.stage!=='draw'||state.activeTurnSeat!==seat)return {ok:false,error:'NOT_YOUR_DRAW_TURN'};
    const p=state.players[seat]; if(!p||p.folded||p.allIn)return {ok:false,error:'CANNOT_DRAW'};
    const valid=[...new Set(indices)].filter(i=>Number.isInteger(i)&&i>=0&&i<5).sort((a,b)=>b-a);
    valid.forEach(i=>p.cards.splice(i,1));
    while(p.cards.length<5&&state.deck.length)p.cards.push(state.deck.shift());
    p.lastAction=`Drew ${valid.length} card${valid.length===1?'':'s'}`;
    p.drawDone=true;
    const remaining=state.players.filter(q=>q&&!q.folded&&!q.out&&!q.drawDone&&!q.allIn);
    if(remaining.length===0){
        state.players.forEach(q=>{if(q)q.drawDone=false;});
        state.stage='betting2';state.phase='BETTING 2';resetBetRound(state);
        state.activeTurnSeat=nextSeat(state,state.dealerSeat);
    } else state.activeTurnSeat=nextSeat(state,seat);
    return {ok:true};
}
// Simple heuristic AI that plays one turn for a bot player, run only on
// the host (bots have no real connection -- the host acts on their behalf).
// - During the draw phase: keeps any card involved in a pair-or-better
//   (checked by counting how many cards share its value), or, if the hand
//   has no such pairing, keeps only high cards (value >= 12, i.e. Q/K/A);
//   everything else is discarded via processDraw().
// - During a betting phase: evaluates its best current hand strength and
//   makes a rough odds-based decision -- raise with a strong hand
//   (occasionally bluff-raising on two pair+ when unopposed), call small
//   bets or decent hands, otherwise fold. Raise amounts are capped at the
//   bot's remaining stack, and if the chosen action turns out invalid it
//   falls back to a plain call/check.
// After acting, broadcasts the updated state to peers, re-renders the
// host's own UI, and schedules the next bot turn if one is due.
function botAction(){
    if(!gameState.isHost||gameState.status!=='in-progress')return;
    const seat=gameState.activeTurnSeat,p=gameState.players[seat];
    if(!p?.isBot)return;
    if(gameState.stage==='draw'){
        const s=score5(p.cards), keep=new Set();
        if(s.type===HAND_TYPES.ONE_PAIR||s.type===HAND_TYPES.TWO_PAIR||s.type===HAND_TYPES.THREE_OF_A_KIND||s.type===HAND_TYPES.FULL_HOUSE||s.type===HAND_TYPES.FOUR_OF_A_KIND)
            p.cards.forEach((c,i)=>{const count=p.cards.filter(x=>x.value===c.value).length;if(count>=2)keep.add(i);});
        else p.cards.forEach((c,i)=>{if(c.value>=12)keep.add(i);});
        processDraw(gameState,seat,p.cards.map((_,i)=>i).filter(i=>!keep.has(i)));
        broadcastState();renderTableUI();scheduleBot();return;
    }
    const cards=[...p.cards,...gameState.communityCards], ev=cards.length>=5?evaluate(cards):score5(p.cards);
    const call=Math.max(0,gameState.currentHighBet-p.currentBet);
    let action='fold', amount=0;
    if(call===0){
        if(ev.type>=HAND_TYPES.TWO_PAIR&&Math.random()<0.45){action='raise';amount=gameState.currentHighBet+gameState.minRaise;}
        else action='check';
    } else if(ev.type>=HAND_TYPES.THREE_OF_A_KIND) {action='raise';amount=gameState.currentHighBet+gameState.minRaise;}
    else if(ev.type>=HAND_TYPES.ONE_PAIR||call<=gameState.bigBlind) action='call';
    if(action==='raise') amount=Math.min(amount,p.currentBet+p.chips);
    const r=processAction(gameState,seat,action,amount);
    if(!r.ok) processAction(gameState,seat,call?'call':'check');
    broadcastState();renderTableUI();scheduleBot();
}
// Arrange for botAction() to run after a short delay (650ms, so bot moves
// feel paced rather than instant) whenever it's currently a bot's turn on
// the host. Cancels any previously scheduled bot turn first so turns never
// stack up or double-fire.
function scheduleBot(){clearTimeout(botTimer);if(gameState.isHost&&gameState.status==='in-progress'&&gameState.players[gameState.activeTurnSeat]?.isBot)botTimer=setTimeout(botAction,650);}
