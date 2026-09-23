/* ========================================================================
   HAND EVALUATOR - 5-card hand scoring and best-hand evaluation
   ======================================================================== */

// Score exactly 5 cards and classify them into a standard poker hand
// category (high card through royal flush). Returns:
//   { type: numeric rank from HAND_TYPES, typeName: display name,
//     ranks: tie-breaker card values in priority order, score: single
//     comparable number combining type + ranks }
// Algorithm:
//  1. Sort cards high-to-low and count how many of each rank value appear
//     (`counts`), then group by that count (`groups`, e.g. pairs/trips/quads),
//     sorted so the biggest/highest group comes first -- this is what lets
//     four-of-a-kind beat a full house, a higher pair beat a lower pair, etc.
//  2. Get the distinct rank values (`unique`) to check for a straight: five
//     consecutive values, with the special case A-2-3-4-5 ("the wheel",
//     stored internally as 14,5,4,3,2) counting as a straight with a 5 high.
//  3. Check if all 5 cards share a suit (`flush`).
//  4. Walk the hand categories from best to worst (straight+flush, quads,
//     full house, flush, straight, trips, two pair, one pair, high card)
//     and set `type`/`name`/`ranks` for the first one that matches.
//  5. Collapse type + ranks into a single `score` integer (base-15 encoding,
//     since card ranks run 2-14) so two hands can be compared with a plain
//     numeric >, which is how evaluate() below picks a winner.
function score5(cards){
    if(!cards || cards.length!==5) return {type:0,typeName:'Invalid',ranks:[],score:0};
    const s=[...cards].sort((a,b)=>b.value-a.value), counts={};
    s.forEach(c=>counts[c.value]=(counts[c.value]||0)+1);
    const groups=Object.entries(counts).map(([v,c])=>({v:+v,c})).sort((a,b)=>b.c-a.c||b.v-a.v);
    const unique=[...new Set(s.map(c=>c.value))].sort((a,b)=>b-a);
    let straightHigh=0;
    if(unique.length===5){
        if(unique[0]-unique[4]===4) straightHigh=unique[0];
        else if(unique.join(',')==='14,5,4,3,2') straightHigh=5; // A-2-3-4-5 "wheel" straight, Ace plays low
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
    // Encode type as the most-significant digit and each tie-breaker rank
    // as a base-15 digit after it, so bigger `score` always means a
    // strictly better hand and hands can be compared with a plain `>`.
    let score=type; for(const r of ranks) score=score*15+r;
    return {type,typeName:name,ranks,score};
}

// Generate every k-card combination (order doesn't matter) from `cards`,
// via a standard recursive backtracking "choose" algorithm. Used by
// evaluate() to try all 5-card subsets of a player's 7 available cards
// (2 hole cards + 5 community cards in Hold'em).
function combinations(cards,k){
    const out=[];
    function rec(start,chosen){ if(chosen.length===k){out.push([...chosen]);return;} for(let i=start;i<=cards.length-(k-chosen.length);i++){chosen.push(cards[i]);rec(i+1,chosen);chosen.pop();}}
    rec(0,[]); return out;
}

// Find the best possible 5-card poker hand out of any number of available
// cards (>=5) by scoring every 5-card combination with score5() and
// keeping the highest-scoring one. This is what lets a player's best hand
// be computed from their hole cards + the shared community cards.
function evaluate(cards){
    if(!cards || cards.length<5) return {type:0,typeName:'Incomplete',ranks:[],score:0};
    let best=null; for(const c of combinations(cards,5)){const x=score5(c);if(!best||x.score>best.score)best=x;} return best;
}

