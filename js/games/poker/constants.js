/* ========================================================================
   POKER CONSTANTS + POKER-ONLY RUNTIME STATE
   Card/deck constants shared by deck creation, rendering and hand
   evaluation, and the client-side draw selection.
   ======================================================================== */
const SUITS = ['♠','♥','♦','♣'];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
// Numeric rank value for comparisons/scoring, e.g. VALUES['2'] === 2, VALUES['A'] === 14
const VALUES = Object.fromEntries(RANKS.map((r,i)=>[r,i+2]));
// Relative strength ranking of poker hand categories (higher = stronger),
// used by evaluate() in evaluator.js to compare hands.
const HAND_TYPES = {
    HIGH_CARD:1, ONE_PAIR:2, TWO_PAIR:3, THREE_OF_A_KIND:4, STRAIGHT:5,
    FLUSH:6, FULL_HOUSE:7, FOUR_OF_A_KIND:8, STRAIGHT_FLUSH:9, ROYAL_FLUSH:10
};
// Indices of the local player's own hole cards selected to discard (5-card draw variant)
let drawSelection = new Set();
// Host-only timer driving the paced runout (all remaining players all-in):
// the board is dealt street by street with a pause in between.
let runoutTimer = null;
const POKER_TIMING = { runoutStep:1500 };   // ms: identical pause before every street of the all-in runout (must stay <= 1000)
// Client-side render bookkeeping for the deal / reveal animations.
let pokerBoardShown = 0;       // community cards already on screen
