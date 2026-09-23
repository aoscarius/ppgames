/* ==========================================================================
   P2P POKER ENGINE — LOCALIZATION & GAME LOGIC FIXES
   ========================================================================== */

let currentLang = 'en';

const TRANSLATIONS = {
    en: {
        you: "You",
        avatarHint: "Avatar updates automatically from your name",
        enterUsername: "Enter Your Username",
        createTable: "Create New Table (Host)",
        orJoin: "Or Join Room",
        joinBtn: "Join",
        pasteRoomId: "Paste Room ID...",
        pokerRoom: "Poker Room",
        connecting: "Connecting",
        online: "Online",
        invite: "Invite",
        spectatorMsg: "You are spectating this hand. You will be seated when the next round starts.",
        pot: "Pot",
        currentBet: "Current Bet",
        waitingDealer: "Waiting for dealer...",
        noCommunityCards: "No community cards",
        hostPanel: "Host Panel",
        variant: "Variant:",
        dealHand: "Deal Hand",
        fold: "Fold",
        check: "Check",
        call: "Call",
        raise: "Raise",
        draw: "Draw",
        tableChat: "Table Chat",
        chatPlaceholder: "Chat room connected. Send a message!",
        typeMessage: "Type message...",
        send: "Send",
        logsHeader: "Peer & Game Logs",
        lobbyWaiting: "Lobby Waiting",
        yourTurn: "Your Turn",
        turnOf: "Turn: {name}",
        drawDiscardPrompt: "Select cards to discard, then click Draw.",
        waitingForAction: "Waiting for action...",
        winnerLabel: "Winner: {name} ({hand})",
        winnersLabel: "Winners: {names} ({hand})",
        winnerFoldedLabel: "Winner: {name} (All folded)",
        folded: "Folded",
        allIn: "All-in",
        seat: "Seat {num}",
        handTypes: {
            HIGH_CARD: 'High Card', ONE_PAIR: 'One Pair', TWO_PAIR: 'Two Pair',
            THREE_OF_A_KIND: 'Three of a Kind', STRAIGHT: 'Straight', FLUSH: 'Flush',
            FULL_HOUSE: 'Full House', FOUR_OF_A_KIND: 'Four of a Kind',
            STRAIGHT_FLUSH: 'Straight Flush', ROYAL_FLUSH: 'Royal Flush'
        }
    },
    it: {
        you: "Tu",
        avatarHint: "L'avatar si aggiorna in automatico dal nome",
        enterUsername: "Inserisci il tuo Nome Utente",
        createTable: "Crea Nuovo Tavolo (Host)",
        orJoin: "Oppure Entra in una Stanza",
        joinBtn: "Entra",
        pasteRoomId: "Incolla ID Stanza...",
        pokerRoom: "Stanza Poker",
        connecting: "Connessione",
        online: "Online",
        invite: "Invita",
        spectatorMsg: "Stai assistendo a questa mano. Ti sederai alla prossima partita.",
        pot: "Piatto",
        currentBet: "Puntata Attuale",
        waitingDealer: "In attesa del mazziere...",
        noCommunityCards: "Nessuna carta comune",
        hostPanel: "Pannello Host",
        variant: "Variante:",
        dealHand: "Distribuisci",
        fold: "Passa",
        check: "Check",
        call: "Chiama",
        raise: "Rilancia",
        draw: "Cambia",
        tableChat: "Chat del Tavolo",
        chatPlaceholder: "Chat connessa. Invia un messaggio!",
        typeMessage: "Scrivi un messaggio...",
        send: "Invia",
        logsHeader: "Log P2P e di Gioco",
        lobbyWaiting: "In Attesa Nella Lobby",
        yourTurn: "Il Tuo Turno",
        turnOf: "Turno di: {name}",
        drawDiscardPrompt: "Seleziona le carte da scartare e premi Cambia.",
        waitingForAction: "In attesa di un'azione...",
        winnerLabel: "Vincitore: {name} ({hand})",
        winnersLabel: "Vincitori: {names} ({hand})",
        winnerFoldedLabel: "Vincitore: {name} (Tutti ritirati)",
        folded: "Ritirato",
        allIn: "All-in",
        seat: "Posto {num}",
        handTypes: {
            HIGH_CARD: 'Carta Alta', ONE_PAIR: 'Coppia', TWO_PAIR: 'Doppia Coppia',
            THREE_OF_A_KIND: 'Tris', STRAIGHT: 'Scala', FLUSH: 'Colore',
            FULL_HOUSE: 'Full', FOUR_OF_A_KIND: 'Poker',
            STRAIGHT_FLUSH: 'Scala Colore', ROYAL_FLUSH: 'Scala Reale'
        }
    }
};

function t(key, vars = {}) {
    let text = TRANSLATIONS[currentLang]?.[key] || TRANSLATIONS['en']?.[key] || key;
    Object.keys(vars).forEach(k => {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), vars[k]);
    });
    return text;
}

function localizedHandType(typeName) {
    if (!typeName) return '';
    const map = {
        'High Card': 'HIGH_CARD', 'One Pair': 'ONE_PAIR', 'Two Pair': 'TWO_PAIR',
        'Three of a Kind': 'THREE_OF_A_KIND', 'Straight': 'STRAIGHT', 'Flush': 'FLUSH',
        'Full House': 'FULL_HOUSE', 'Four of a Kind': 'FOUR_OF_A_KIND',
        'Straight Flush': 'STRAIGHT_FLUSH', 'Royal Flush': 'ROYAL_FLUSH'
    };
    const key = map[typeName];
    if (key && TRANSLATIONS[currentLang]?.handTypes?.[key]) {
        return TRANSLATIONS[currentLang].handTypes[key];
    }
    return typeName;
}

function updateStaticTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
        const key = el.getAttribute('data-i18n-ph');
        el.setAttribute('placeholder', t(key));
    });
    const langBtn = document.getElementById('langToggleLabel');
    if (langBtn) langBtn.textContent = currentLang === 'en' ? 'IT' : 'EN';
}

const gameState = {
    roomId: null, isHost: false, myPlayerId: null, myPlayerName: 'PokerPlayer',
    hostId: null, status: 'lobby', variant: 'holdem',
    phase: 'LOBBY WAITING', stage: 'lobby',
    pot: 0, currentBet: 0, currentHighBet: 0, minRaise: 20,
    smallBlind: 10, bigBlind: 20, dealerSeat: -1, activeTurnSeat: -1,
    communityCards: [], deck: [], players: new Array(8).fill(null),
    spectators: [], unreadChat: 0, unreadLogs: 0, handNumber: 0,
    showdownSummary: ''
};

let peerInstance = null;
let peerConnections = {};
let drawSelection = new Set();
let botTimer = null;

const SUITS = ['♠','♥','♦','♣'];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const VALUES = Object.fromEntries(RANKS.map((r,i)=>[r,i+2]));
const HAND_TYPES = {
    HIGH_CARD:1, ONE_PAIR:2, TWO_PAIR:3, THREE_OF_A_KIND:4, STRAIGHT:5,
    FLUSH:6, FULL_HOUSE:7, FOUR_OF_A_KIND:8, STRAIGHT_FLUSH:9, ROYAL_FLUSH:10
};

function generateId() { return 'poker-' + Math.random().toString(36).slice(2,9); }
function activePlayers(state=gameState) {
    return state.players.filter(p => p && !p.spectator && p.chips > 0);
}
function contenders(state=gameState) {
    return state.players.filter(p => p && !p.spectator && !p.folded && !p.out);
}
function eligibleToAct(p) { return p && !p.folded && !p.out && !p.allIn && p.chips > 0; }
function nextSeat(state, start, predicate=eligibleToAct) {
    const n = state.players.length;
    for (let step=1; step<=n; step++) {
        const i = (start + step + n) % n;
        if (predicate(state.players[i])) return i;
    }
    return -1;
}
function logMessage(msg, type='info') {
    const box = document.getElementById('logMessages'); if (!box) return;
    const e = document.createElement('div');
    const color = type==='error'?'text-rose-400':type==='success'?'text-emerald-400':'text-slate-400';
    e.className = color+' leading-snug';
    e.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    box.appendChild(e); box.scrollTop = box.scrollHeight;
    if (document.getElementById('logsDrawer')?.classList.contains('translate-x-full')) {
        gameState.unreadLogs++;
        const b=document.getElementById('logsBadge'); b.textContent=gameState.unreadLogs; b.classList.remove('hidden');
    }
}
function appendChatMessage(sender,text,isSystem=false) {
    const box=document.getElementById('chatMessages'); if(!box) return;
    const e=document.createElement('div');
    if(isSystem){ e.className='text-[11px] text-amber-400 bg-amber-950/40 p-1.5 rounded border border-amber-800/40 font-medium'; e.textContent=text; }
    else {
        e.className='bg-slate-800 p-2 rounded-xl border border-slate-700/60';
        const n=document.createElement('div'); n.className='font-extrabold text-emerald-400 text-[10px]'; n.textContent=sender;
        const t=document.createElement('div'); t.className='text-slate-200 mt-0.5 text-xs'; t.textContent=text;
        e.append(n,t);
    }
    box.appendChild(e); box.scrollTop=box.scrollHeight;
    if(document.getElementById('chatDrawer')?.classList.contains('translate-x-full')){
        gameState.unreadChat++; const b=document.getElementById('chatBadge'); b.textContent=gameState.unreadChat; b.classList.remove('hidden');
    }
}
function createDeck(){
    const d=[]; for(const suit of SUITS) for(const rank of RANKS) d.push({suit,rank,value:VALUES[rank]});
    return d;
}
function shuffleDeck(deck){
    for(let i=deck.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [deck[i],deck[j]]=[deck[j],deck[i]]; }
    return deck;
}
function cardHTML(c,hidden=false,extra=''){
    if(!c || hidden) return `<div class="w-8 h-12 sm:w-11 sm:h-16 rounded-lg bg-gradient-to-br from-blue-700 via-indigo-800 to-slate-900 border border-blue-400/50 flex items-center justify-center shadow-md poker-card shrink-0"><span class="text-blue-300 text-xs sm:text-sm font-black">♠</span></div>`;
    const red=c.suit==='♥'||c.suit==='♦';
    return `<div class="w-8 h-12 sm:w-11 sm:h-16 rounded-lg bg-white border border-slate-300 flex flex-col justify-between p-1 shadow-md poker-card font-extrabold shrink-0 ${red?'text-rose-500':'text-slate-950'} ${extra}"><div class="text-[9px] sm:text-[10px] leading-none font-black">${c.rank}<br>${c.suit}</div><div class="text-center text-xs sm:text-sm leading-none font-black">${c.suit}</div></div>`;
}

function score5(cards){
    if(!cards || cards.length!==5) return {type:0,typeName:'Invalid',ranks:[],score:0};
    const s=[...cards].sort((a,b)=>b.value-a.value), counts={};
    s.forEach(c=>counts[c.value]=(counts[c.value]||0)+1);
    const groups=Object.entries(counts).map(([v,c])=>({v:+v,c})).sort((a,b)=>b.c-a.c||b.v-a.v);
    const unique=[...new Set(s.map(c=>c.value))].sort((a,b)=>b-a);
    let straightHigh=0;
    if(unique.length===5){
        if(unique[0]-unique[4]===4) straightHigh=unique[0];
        else if(unique.join(',')==='14,5,4,3,2') straightHigh=5;
    }
    const flush=s.every(c=>c.suit===s[0].suit);
    let type=HAND_TYPES.HIGH_CARD, ranks=unique, name='High Card';
    if(straightHigh && flush){ type=straightHigh===14?HAND_TYPES.ROYAL_FLUSH:HAND_TYPES.STRAIGHT_FLUSH; name=straightHigh===14?'Royal Flush':'Straight Flush'; ranks=[straightHigh]; }
    else if(groups[0].c===4){ type=HAND_TYPES.FOUR_OF_A_KIND; name='Four of a Kind'; ranks=[groups[0].v,groups[1].v]; }
    else if(groups[0].c===3 && groups[1].c===2){ type=HAND_TYPES.FULL_HOUSE; name='Full House'; ranks=[groups[0].v,groups[1].v]; }
    else if(flush){ type=HAND_TYPES.FLUSH; name='Flush'; ranks=unique; }
    else if(straightHigh){ type=HAND_TYPES.STRAIGHT; name='Straight'; ranks=[straightHigh]; }
    else if(groups[0].c===3){ type=HAND_TYPES.THREE_OF_A_KIND; name='Three of a Kind'; ranks=[groups[0].v,...groups.slice(1).map(g=>g.v).sort((a,b)=>b-a)]; }
    else if(groups[0].c===2 && groups[1].c===2){ type=HAND_TYPES.TWO_PAIR; name='Two Pair'; ranks=[Math.max(groups[0].v,groups[1].v),Math.min(groups[0].v,groups[1].v),groups[2].v]; }
    else if(groups[0].c===2){ type=HAND_TYPES.ONE_PAIR; name='One Pair'; ranks=[groups[0].v,...groups.slice(1).map(g=>g.v).sort((a,b)=>b-a)]; }
    let score=type; for(const r of ranks) score=score*15+r;
    return {type,typeName:name,ranks,score};
}
function combinations(cards,k){
    const out=[];
    function rec(start,chosen){ if(chosen.length===k){out.push([...chosen]);return;} for(let i=start;i<=cards.length-(k-chosen.length);i++){chosen.push(cards[i]);rec(i+1,chosen);chosen.pop();}}
    rec(0,[]); return out;
}
function evaluate(cards){
    if(!cards || cards.length<5) return {type:0,typeName:'Incomplete',ranks:[],score:0};
    let best=null; for(const c of combinations(cards,5)){const x=score5(c);if(!best||x.score>best.score)best=x;} return best;
}

function collectChips(state){
    return state.players.reduce((n,p)=>n+(p?.currentBet||0),0);
}
function resetBetRound(state){
    state.players.forEach(p=>{if(p){p.currentBet=0;p.actedThisRound=false;}});
    state.currentHighBet=0; state.currentBet=0; state.minRaise=state.bigBlind;
}
function charge(p,amount){
    const a=Math.max(0,Math.min(amount,p.chips)); p.chips-=a; p.currentBet+=a; gameState.pot+=a;
    if(p.chips===0) p.allIn=true; return a;
}
function liveUnfolded(state){return state.players.filter(p=>p&&!p.spectator&&!p.folded&&!p.out);}
function bettingComplete(state){
    const live=liveUnfolded(state), canAct=live.filter(eligibleToAct);
    if(live.length<=1) return true;
    if(canAct.length===0) return true;
    return canAct.every(p=>p.currentBet===state.currentHighBet && p.actedThisRound);
}
function awardSingle(state,winner){
    winner.chips+=state.pot; winner.lastAction=`Won $${state.pot} (all opponents folded)`;
    state.showdownSummary = t('winnerFoldedLabel', { name: winner.name });
    appendChatMessage('System', state.showdownSummary, true);
    state.pot=0; state.status='hand-ended'; state.stage='ended'; state.phase='SHOWDOWN'; state.activeTurnSeat=-1;
}
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
        w.lastAction = `Won $${wonAmount} (${localizedHandType(w.evalResult.typeName)})`;
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
function advanceAfterAction(state){
    const live=liveUnfolded(state);
    if(live.length<=1){awardSingle(state,live[0]);return;}
    if(bettingComplete(state)){advanceStage(state);return;}
    const n=nextSeat(state,state.activeTurnSeat);
    if(n<0) advanceStage(state); else state.activeTurnSeat=n;
}
function processAction(state,seat,type,raiseTo=0){
    if(state.status!=='in-progress'||state.activeTurnSeat!==seat) return {ok:false,error:'NOT_YOUR_TURN'};
    const p=state.players[seat]; if(!eligibleToAct(p)) return {ok:false,error:'CANNOT_ACT'};
    const toCall=Math.max(0,state.currentHighBet-p.currentBet);
    if(type==='fold'){p.folded=true;p.lastAction='Fold';}
    else if(type==='check'){if(toCall!==0)return {ok:false,error:'CHECK_FACING_BET'};p.lastAction='Check';}
    else if(type==='call'){charge(p,toCall);p.lastAction=p.allIn?'All-in':'Call';}
    else if(type==='raise'){
        let target=Math.floor(Number(raiseTo));
        const minTarget=state.currentHighBet+state.minRaise;
        if(!Number.isFinite(target)||target<minTarget) return {ok:false,error:`MIN_RAISE:${minTarget}`};
        if(target>p.currentBet+p.chips) target=p.currentBet+p.chips;
        if(target<=state.currentHighBet) return {ok:false,error:'RAISE_TOO_SMALL'};
        charge(p,target-p.currentBet); state.minRaise=target-state.currentHighBet; state.currentHighBet=target;p.lastAction=`Raise to $${target}`;
    } else return {ok:false,error:'UNKNOWN_ACTION'};
    p.actedThisRound=true;
    state.currentBet=state.currentHighBet;
    advanceAfterAction(state); return {ok:true};
}
function initHand(state){
    if(state.status==='in-progress'){
        return {ok:false,error:'HAND_IN_PROGRESS'};
    }
    const seated=state.players
        .map((p,i)=>({p,i}))
        .filter(x=>x.p && !x.p.spectator && !x.p.isSpectator && x.p.chips>0)
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
    state.stage=state.variant==='holdem'?'preflop':'betting1';
    state.phase=state.variant==='holdem'?'PREFLOP':'BETTING 1';
    state.activeTurnSeat=nextSeat(state,bb);
    return {ok:true};
}
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
function scheduleBot(){clearTimeout(botTimer);if(gameState.isHost&&gameState.status==='in-progress'&&gameState.players[gameState.activeTurnSeat]?.isBot)botTimer=setTimeout(botAction,650);}

function publicStateFor(peerId){
    const copy=JSON.parse(JSON.stringify(gameState));
    copy.deck=[];
    const revealAll=copy.phase==='SHOWDOWN';
    copy.players.forEach(p=>{
        if(!p||!p.cards)return;
        const isMine=p.id===peerId;
        const shown=revealAll && !p.folded;
        if(!isMine && !shown) p.cards=p.cards.map(()=>null);
    });
    return copy;
}
function broadcastState(){
    Object.values(peerConnections).forEach(c=>{if(c?.open)c.send({type:'STATE_UPDATE',state:publicStateFor(c.peer)});});
}
function sendTo(conn,payload){if(conn?.open)conn.send(payload);}
function hostHandleAction(data,conn){
    const seat=gameState.players.findIndex(p=>p?.id===data.playerId);
    if(seat<0||gameState.players[seat].isBot)return;
    const result=data.action==='draw'?processDraw(gameState,seat,data.indices||[]):processAction(gameState,seat,data.action,data.amount);
    if(!result.ok)sendTo(conn,{type:'ACTION_ERROR',message:result.error});
    broadcastState();renderTableUI();scheduleBot();
}
function handleNetworkData(data,conn){
    if(!data)return;
    if(data.type==='JOIN_REQUEST'&&gameState.isHost){
        const empty=gameState.players.findIndex(p=>!p);
        if(gameState.status==='lobby'&&empty>=0){
            gameState.players[empty]=data.player;sendTo(conn,{type:'WELCOME_SYNC',state:publicStateFor(data.player.id)});
            appendChatMessage('System',`${data.player.name} joined Seat ${empty+1}.`,true);
        } else {
            gameState.spectators.push(data.player);sendTo(conn,{type:'WELCOME_SYNC',state:publicStateFor(data.player.id)});
        }
        peerConnections[conn.peer]=conn;broadcastState();renderTableUI();
    } else if(data.type==='ACTION_REQUEST'&&gameState.isHost) hostHandleAction(data,conn);
    else if(data.type==='START_REQUEST'&&gameState.isHost) startHand();
    else if(data.type==='VARIANT_REQUEST'&&gameState.isHost&&gameState.status==='lobby'){gameState.variant=data.variant==='5card'?'5card':'holdem';broadcastState();renderTableUI();}
    else if(data.type==='CHAT'){appendChatMessage(data.sender,data.text,false);if(gameState.isHost)broadcastPacket(data);}
    else if(data.type==='WELCOME_SYNC'||data.type==='STATE_UPDATE'){
        Object.assign(gameState,data.state);
        gameState.players=new Array(8).fill(null).map((_,i)=>data.state.players?.[i]||null);
        renderTableUI();scheduleBot();
    } else if(data.type==='ACTION_ERROR')alert(data.message);
}
function broadcastPacket(packet){Object.values(peerConnections).forEach(c=>{if(c?.open)c.send(packet);});}

function initHostLocally(username){
    gameState.isHost=true;gameState.myPlayerName=username;gameState.myPlayerId=generateId();gameState.hostId=gameState.myPlayerId;gameState.roomId=gameState.myPlayerId;
    gameState.players[0]={id:gameState.myPlayerId,name:username,chips:1000,currentBet:0,folded:false,isBot:false,cards:[]};
    history.pushState({},'',`${location.pathname}?room=${encodeURIComponent(gameState.roomId)}`);
    renderTableUI();
}
function initPeerNetwork(){
    peerInstance=new Peer(gameState.roomId);
    peerInstance.on('open',id=>{
        const b = document.getElementById('roomStatusBadge');
        if (b) { b.textContent = t('online'); }
        logMessage(`Room online: ${id}`,'success');
    });
    peerInstance.on('connection',conn=>{
        peerConnections[conn.peer]=conn;
        conn.on('open',()=>{if(gameState.isHost)sendTo(conn,{type:'WELCOME_SYNC',state:publicStateFor(conn.peer)});});
        conn.on('data',d=>handleNetworkData(d,conn));
        conn.on('close',()=>{delete peerConnections[conn.peer];const i=gameState.players.findIndex(p=>p?.id===conn.peer);if(i>=0&&gameState.status==='lobby'){gameState.players[i]=null;broadcastState();renderTableUI();}});
    });
    peerInstance.on('error',e=>logMessage(`PeerJS: ${e.type}`,'error'));
}
function joinRoomPeer(roomId,username){
    gameState.isHost=false;gameState.myPlayerName=username;gameState.myPlayerId=generateId();gameState.roomId=roomId;
    peerInstance=new Peer(gameState.myPlayerId);
    peerInstance.on('open',()=>{const conn=peerInstance.connect(roomId);peerConnections[roomId]=conn;conn.on('open',()=>{conn.send({type:'JOIN_REQUEST',player:{id:gameState.myPlayerId,name:username,chips:1000,currentBet:0,folded:false,isBot:false,cards:[]}});});conn.on('data',d=>handleNetworkData(d,conn));conn.on('close',()=>logMessage('Disconnected from host','error'));});
    peerInstance.on('error',e=>logMessage(`PeerJS: ${e.type}`,'error'));
}
function startHand(){
    if(!gameState.isHost)return;
    const r=initHand(gameState); if(!r.ok){alert(r.error);return;}
    appendChatMessage('System',`Hand #${gameState.handNumber} started. Blinds $${gameState.smallBlind}/$${gameState.bigBlind}.`,true);
    broadcastState();renderTableUI();scheduleBot();
}
function requestAction(action,amount=0,indices=[]){
    if(gameState.isHost){
        const seat=gameState.players.findIndex(p=>p?.id===gameState.myPlayerId);
        const r=action==='draw'?processDraw(gameState,seat,indices):processAction(gameState,seat,action,amount);
        if(!r.ok)alert(r.error);broadcastState();renderTableUI();scheduleBot();
    } else {
        const host=Object.values(peerConnections)[0];
        if(host?.open)host.send({type:'ACTION_REQUEST',playerId:gameState.myPlayerId,action,amount,indices});
    }
}

function renderTableUI(){
    try{
        document.getElementById('potDisplay').textContent=`$${gameState.pot}`;
        document.getElementById('currentBetDisplay').textContent=`$${gameState.currentHighBet||gameState.currentBet||0}`;
        
        let phaseDisplay = gameState.phase;
        if (gameState.phase === 'LOBBY WAITING') phaseDisplay = t('lobbyWaiting');
        else if (gameState.phase === 'SHOWDOWN' && gameState.showdownSummary) phaseDisplay = gameState.showdownSummary;
        document.getElementById('gamePhaseText').textContent = phaseDisplay;
        
        document.getElementById('variantLabel').textContent=gameState.variant==='holdem'?"Texas Hold'em":"5-Card Draw";
        const cc=document.getElementById('communityCards');
        cc.innerHTML=gameState.communityCards.length?gameState.communityCards.map(c=>cardHTML(c)).join(''):`<span class="text-slate-400 text-[11px] sm:text-xs italic">${gameState.status==='in-progress'?t('noCommunityCards'):t('waitingDealer')}</span>`;
        
        for(let i=0;i<8;i++){
            const el=document.getElementById(`seat-${i}`),p=gameState.players[i];if(!el)continue;
            if(!p){el.innerHTML=`<div class="w-12 h-12 sm:w-16 sm:h-16 rounded-full border border-dashed border-slate-700/60 bg-slate-950/40 flex items-center justify-center text-slate-600 text-[9px] sm:text-[10px] font-bold">${t('seat', {num: i+1})}</div>`;continue;}
            const turn=gameState.status==='in-progress'&&gameState.activeTurnSeat===i, local=p.id===gameState.myPlayerId;
            let cards='';
            if(p.cards?.length) cards=`<div class="flex gap-0.5 -mb-2 z-10">${p.cards.map((c,j)=>cardHTML(c,!local&&gameState.phase!=='SHOWDOWN',local&&gameState.stage==='draw'?`draw-card-${j}`:'')).join('')}</div>`;
            el.innerHTML=`<div class="flex flex-col items-center">${cards}<div class="w-16 sm:w-20 bg-slate-900 border ${turn?'pulse-turn border-emerald-400':'border-slate-700'} rounded-2xl p-1 flex flex-col items-center shadow-2xl relative">${gameState.dealerSeat===i?'<span class="absolute -top-1 -right-1 bg-amber-400 text-slate-950 text-[8px] font-black w-3.5 h-3.5 rounded-full flex items-center justify-center">D</span>':''}<img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(p.name)}" class="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-slate-800 border border-slate-700 mb-0.5"><div class="text-[9px] sm:text-[10px] font-bold text-slate-100 truncate w-full text-center">${p.name}</div><div class="text-[9px] font-mono text-emerald-400 font-extrabold">$${p.chips}</div>${p.folded?`<span class="text-[8px] font-black text-rose-400 uppercase">${t('folded')}</span>`:''}${p.allIn?`<span class="text-[8px] font-black text-amber-400 uppercase">${t('allIn')}</span>`:''}${p.evalResult&&gameState.phase==='SHOWDOWN'?`<span class="text-[8px] text-blue-300 font-bold">${localizedHandType(p.evalResult.typeName)}</span>`:''}</div></div>`;
        }

        const mySeat=gameState.players.findIndex(p=>p?.id===gameState.myPlayerId), mine=gameState.players[mySeat];
        const myTurn=mySeat>=0&&gameState.activeTurnSeat===mySeat&&gameState.status==='in-progress';
        const drawPhase=myTurn&&gameState.stage==='draw';
        
        document.getElementById('foldBtn').disabled=!myTurn||drawPhase;
        document.getElementById('checkCallBtn').disabled=!myTurn||drawPhase;
        document.getElementById('raiseBtn').disabled=!myTurn||drawPhase;
        
        const check=document.getElementById('checkCallBtn');
        if(check) check.textContent = myTurn&&mine&&gameState.currentHighBet>mine.currentBet ? t('call') : t('check');
        
        document.getElementById('hostAdminPanel').classList.toggle('hidden',!gameState.isHost);
        const startBtn=document.getElementById('startGameBtn'); if(startBtn) startBtn.disabled=gameState.status==='in-progress';
        document.getElementById('spectatorBanner').classList.toggle('hidden',!(mySeat<0&&gameState.status==='in-progress'));
        
        // Comprehensive Turn Messaging
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

function setupEventListeners(){
    const input=document.getElementById('usernameInput'),avatar=document.getElementById('welcomeAvatarPreview');
    input.addEventListener('input',e=>avatar.src=`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(e.target.value.trim()||'PokerPlayer')}`);
    const room=new URLSearchParams(location.search).get('room');
    if(room){
        document.getElementById('contextActionContainer').innerHTML=`<button id="joinTableBtn" class="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow transition flex items-center justify-center gap-2"><i class="fa-solid fa-right-to-bracket"></i><span>${t('joinBtn')} Table (${room})</span></button>`;
        document.getElementById('joinTableBtn').onclick=()=>{joinRoomPeer(room,input.value.trim()||'PokerPlayer');document.getElementById('welcomeScreen').classList.add('hidden');document.getElementById('gameScreen').classList.remove('hidden');};
    }
    document.getElementById('createTableBtn').onclick=()=>{initHostLocally(input.value.trim()||'PokerPlayer');initPeerNetwork();document.getElementById('welcomeScreen').classList.add('hidden');document.getElementById('gameScreen').classList.remove('hidden');};
    document.getElementById('manualJoinBtn').onclick=()=>{const r=document.getElementById('joinRoomInput').value.trim();if(!r)return alert('Enter a Room ID');joinRoomPeer(r,input.value.trim()||'PokerPlayer');document.getElementById('welcomeScreen').classList.add('hidden');document.getElementById('gameScreen').classList.remove('hidden');};
    document.getElementById('startGameBtn').onclick=startHand;
    document.getElementById('variantSelect').onchange=e=>{if(gameState.isHost&&gameState.status==='lobby'){gameState.variant=e.target.value;broadcastState();renderTableUI();}};
    document.getElementById('addBotBtn').onclick=()=>{if(!gameState.isHost||gameState.status!=='lobby')return;const i=gameState.players.findIndex(p=>!p);if(i<0)return alert('Table is full');const names=['BluffBot','HoldemAI','Stacker','AceBot','ChipMaster'];gameState.players[i]={id:'bot-'+generateId(),name:names[Math.floor(Math.random()*names.length)],chips:1000,currentBet:0,folded:false,isBot:true,cards:[]};broadcastState();renderTableUI();};
    document.getElementById('removeBotBtn').onclick=()=>{if(!gameState.isHost||gameState.status!=='lobby')return;const i=gameState.players.findLastIndex(p=>p?.isBot);if(i>=0){gameState.players[i]=null;broadcastState();renderTableUI();}};
    document.getElementById('foldBtn').onclick=()=>requestAction('fold');
    document.getElementById('checkCallBtn').onclick=()=>{const s=gameState.players.findIndex(p=>p?.id===gameState.myPlayerId);requestAction(gameState.currentHighBet>(gameState.players[s]?.currentBet||0)?'call':'check');};
    document.getElementById('raiseBtn').onclick=()=>requestAction('raise',Number(document.getElementById('raiseInput').value));
    document.getElementById('shareRoomBtn').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);alert('Invite link copied!');}catch{alert(location.href);}};
    
    // Language Toggle Switch Handler
    document.getElementById('langToggleBtn').onclick = () => {
        currentLang = currentLang === 'en' ? 'it' : 'en';
        updateStaticTranslations();
        renderTableUI();
    };

    const chat=document.getElementById('chatDrawer'),logs=document.getElementById('logsDrawer');
    document.getElementById('toggleChatBtn').onclick=()=>{chat.classList.toggle('translate-x-full');gameState.unreadChat=0;document.getElementById('chatBadge').classList.add('hidden');};
    document.getElementById('closeChatBtn').onclick=()=>chat.classList.add('translate-x-full');
    document.getElementById('toggleLogsBtn').onclick=()=>{logs.classList.toggle('translate-x-full');gameState.unreadLogs=0;document.getElementById('logsBadge').classList.add('hidden');};
    document.getElementById('closeLogsBtn').onclick=()=>logs.classList.add('translate-x-full');
    document.getElementById('chatForm').onsubmit=e=>{e.preventDefault();const x=document.getElementById('chatInput'),t=x.value.trim();if(!t)return;appendChatMessage(gameState.myPlayerName,t);broadcastPacket({type:'CHAT',sender:gameState.myPlayerName,text:t});x.value='';};
}

document.addEventListener('click',e=>{
    const el=e.target.closest('[class*="draw-card-"]'); if(!el||gameState.stage!=='draw')return;
    const m=el.className.match(/draw-card-(\d+)/);if(!m)return;const i=Number(m[1]);if(drawSelection.has(i))drawSelection.delete(i);else drawSelection.add(i);el.classList.toggle('ring-4');el.classList.toggle('ring-purple-400');
});

window.addEventListener('DOMContentLoaded',()=>{
    setupEventListeners();
    updateStaticTranslations();
    renderTableUI();
    logMessage('P2P Poker Engine with IT/EN localization initialized.','success');
});
