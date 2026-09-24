/* ========================================================================
   GAME STATE - Shared game state object, P2P/network vars, card constants
   ======================================================================== */

// The single source of truth for the whole table. On the host this object
// is the authoritative game state; the host mutates it directly via the
// functions in game-logic.js and then broadcasts it to every peer
// (see broadcastState() in network.js). Clients never mutate it themselves
// -- they simply replace it wholesale whenever a STATE packet arrives
// (see handleNetworkData() in network.js) and re-render from it (ui.js).
const gameState = {
    roomId: null, isHost: false, myPlayerId: null, myPlayerName: 'PokerPlayer',
    hostId: null, gameId: 'poker', gameName: 'Poker',
    status: 'lobby', variant: 'holdem',       // status: 'lobby' | 'in-progress'
    phase: 'LOBBY WAITING', stage: 'lobby',                  // stage: 'lobby' | 'preflop' | 'flop' | 'turn' | 'river' | 'draw' | 'showdown' ...
    pot: 0, currentBet: 0, currentHighBet: 0, minRaise: 20,
    currency: 'USD', startingStack: 1000, maxSeats: 8,
    smallBlind: 10, bigBlind: 20, dealerSeat: -1, activeTurnSeat: -1,
    communityCards: [], deck: [], players: new Array(8).fill(null), // max 8 physical seats; table may use fewer
    spectators: [], unreadChat: 0, unreadLogs: 0, handNumber: 0,
    chatHistory: [], logHistory: [], showdownSummary: '',
    kickedPeerIds: [], kicked: false, backupHostId: null, backupState: null, network: null
};

// --- P2P / networking runtime state (not part of gameState because it's
// per-peer connection plumbing, not game data that gets synced) ---
let peerInstance = null;      // this browser's PeerJS Peer object (see network.js)
let peerConnections = {};     // host only: map of peerId -> open DataConnection to each client
let drawSelection = new Set();// indices of the local player's own hole cards selected to discard (5-card draw variant)
let botTimer = null;
let hostRecoveryTimer = null;
let hostRecoveryInProgress = false;
let roomJoinConfirmed = false;
let joinHandshakeTimer = null;          // setTimeout handle used to pace/delay bot turns so they don't act instantly

// --- Card/deck constants shared by deck creation, rendering and hand evaluation ---
const SUITS = ['♠','♥','♦','♣'];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
// Numeric rank value for comparisons/scoring, e.g. VALUES['2'] === 2, VALUES['A'] === 14
const VALUES = Object.fromEntries(RANKS.map((r,i)=>[r,i+2]));
// Relative strength ranking of poker hand categories (higher = stronger),
// used by evaluate() in hand-evaluator.js to compare hands.
const HAND_TYPES = {
    HIGH_CARD:1, ONE_PAIR:2, TWO_PAIR:3, THREE_OF_A_KIND:4, STRAIGHT:5,
    FLUSH:6, FULL_HOUSE:7, FOUR_OF_A_KIND:8, STRAIGHT_FLUSH:9, ROYAL_FLUSH:10
};
