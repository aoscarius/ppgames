/* ========================================================================
   POKER HELPERS - currency formatting, chip-based seat predicates, deck and
   card rendering. Loaded lazily together with the rest of the poker module.
   ======================================================================== */

function currencySymbol(state=gameState){
    return state.currency === 'EUR' ? '€' : '$';
}
function money(state, amount){
    const value = Number(amount || 0);
    return `${currencySymbol(state)}${value.toLocaleString(currentLang === 'it' ? 'it-IT' : 'en-US', {maximumFractionDigits: 2})}`;
}

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


// Build a fresh, unshuffled 52-card deck as {suit, rank, value} objects,
// combining every suit with every rank (see SUITS/RANKS/VALUES in poker/constants.js).
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
    // Keep hidden cards visually identical across peers. The winning-card
    // highlight is deliberately never applied to a hidden card.
    if(!c || hidden) return `<div class="w-8 h-12 sm:w-11 sm:h-16 rounded-lg bg-gradient-to-br from-blue-700 via-indigo-800 to-slate-900 border border-blue-400/50 flex items-center justify-center shadow-md poker-card shrink-0"><span class="text-blue-300 text-xs sm:text-sm font-black">♠</span></div>`;
    const red=c.suit==='♥'||c.suit==='♦';
    return `<div class="w-8 h-12 sm:w-11 sm:h-16 rounded-lg bg-white border border-slate-300 flex flex-col justify-between p-1 shadow-md poker-card font-extrabold shrink-0 ${red?'text-rose-500':'text-slate-950'} ${extra}"><div class="text-[9px] sm:text-[10px] leading-none font-black">${c.rank}<br>${c.suit}</div><div class="text-center text-xs sm:text-sm leading-none font-black">${c.suit}</div></div>`;
}

// Stable identity used only for local rendering. Card objects are recreated
// when state snapshots cross the network, so object-reference comparison is
// not safe; suit + rank uniquely identify every card in a standard deck.
function cardKey(card){
    return card?.suit && card?.rank ? `${card.suit}${card.rank}` : '';
}

// Return true when the supplied card belongs to the evaluator's exact best
// five-card combination. This intentionally checks the winning subset rather
// than highlighting every card in the winner's hand.
function isWinningCard(card,bestCards){
    const key=cardKey(card);
    return !!key && Array.isArray(bestCards) && bestCards.some(c=>cardKey(c)===key);
}


