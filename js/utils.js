/* ========================================================================
   UTILITIES - ID generation, player/seat helpers, logging, deck & card helpers
   ======================================================================== */

// Short random identifier used for room IDs, bot player IDs, etc.
// Not cryptographically secure -- just needs to be unique enough locally.
function generateId() { return 'poker-' + Math.random().toString(36).slice(2,9); }

// Seated players who are still able to play (have chips and aren't
// spectating). Used e.g. to decide when a hand can start.
function activePlayers(state=gameState) {
    return state.players.filter(p => p && !p.spectator && p.chips > 0);
}

// Players still "in" the current hand -- seated, not spectating, haven't
// folded, and haven't already busted out (`out`). Used for showdown /
// pot-award calculations.
function contenders(state=gameState) {
    return state.players.filter(p => p && !p.spectator && !p.folded && !p.out);
}

// A player can still take a betting action if they exist, haven't folded,
// haven't busted out, aren't already all-in, and still have chips.
function eligibleToAct(p) { return p && !p.folded && !p.out && !p.allIn && p.chips > 0; }

// Walk the seat array clockwise starting just after `start`, wrapping
// around, and return the index of the first seat matching `predicate`
// (defaults to eligibleToAct). Returns -1 if no seat qualifies.
// This drives both "whose turn is next" and dealer/blind rotation.
function nextSeat(state, start, predicate=eligibleToAct) {
    const n = state.players.length;
    for (let step=1; step<=n; step++) {
        const i = (start + step + n) % n;
        if (predicate(state.players[i])) return i;
    }
    return -1;
}

// Append a timestamped line to the "Peer & Game Logs" drawer, color-coded
// by severity, and bump the unread-logs badge if that drawer is currently
// closed. Used throughout game-logic.js and network.js to trace what's
// happening (hand dealt, action taken, connection events, errors, etc).
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
// Add one message bubble to the table-chat drawer. `isSystem` renders it
// as a highlighted system notice instead of a normal player message, and
// bumps the unread-chat badge if the chat drawer is currently closed.
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
// Build a fresh, unshuffled 52-card deck as {suit, rank, value} objects,
// combining every suit with every rank (see SUITS/RANKS/VALUES in state.js).
function createDeck(){
    const d=[]; for(const suit of SUITS) for(const rank of RANKS) d.push({suit,rank,value:VALUES[rank]});
    return d;
}

// Randomize a deck in place using the Fisher-Yates shuffle algorithm.
// Returns the same array for convenient chaining, e.g. shuffleDeck(createDeck()).
function shuffleDeck(deck){
    for(let i=deck.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [deck[i],deck[j]]=[deck[j],deck[i]]; }
    return deck;
}

// Render a single playing card as an HTML string.
// - If `c` is falsy or `hidden` is true, renders a face-down card back
//   (used for opponents' hole cards, or an unrevealed card slot).
// - Otherwise renders the face-up card, coloring hearts/diamonds red and
//   spades/clubs dark. `extra` lets callers tack on extra CSS classes
//   (e.g. a highlight ring on cards selected for the draw variant).
function cardHTML(c,hidden=false,extra=''){
    if(!c || hidden) return `<div class="w-8 h-12 sm:w-11 sm:h-16 rounded-lg bg-gradient-to-br from-blue-700 via-indigo-800 to-slate-900 border border-blue-400/50 flex items-center justify-center shadow-md poker-card shrink-0"><span class="text-blue-300 text-xs sm:text-sm font-black">♠</span></div>`;
    const red=c.suit==='♥'||c.suit==='♦';
    return `<div class="w-8 h-12 sm:w-11 sm:h-16 rounded-lg bg-white border border-slate-300 flex flex-col justify-between p-1 shadow-md poker-card font-extrabold shrink-0 ${red?'text-rose-500':'text-slate-950'} ${extra}"><div class="text-[9px] sm:text-[10px] leading-none font-black">${c.rank}<br>${c.suit}</div><div class="text-center text-xs sm:text-sm leading-none font-black">${c.suit}</div></div>`;
}

