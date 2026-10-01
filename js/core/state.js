/* ========================================================================
   CORE STATE - the game-agnostic part of the shared state object plus the
   P2P runtime plumbing. Nothing here knows about cards, chips or boards.

   Each game owns the rest of the state:
     * a game may declare `stateDefaults()` in its module; the fields are
       merged into gameState when the game is loaded (poker keeps its
       historical root-level fields this way);
     * new games should instead keep everything under `gameState.<gameId>`
       (chess does: gameState.chess), so games can never collide.
   ======================================================================== */

// The single source of truth for the whole table. On the host this object
// is the authoritative game state; the host mutates it via the active
// game's logic and then broadcasts it to every peer (broadcastState() in
// core/network.js). Clients never mutate it themselves -- they replace it
// whenever a STATE packet arrives and re-render from it.
const gameState = {
    roomId: null, isHost: false, myPlayerId: null, myPlayerName: 'Player',
    hostId: null, hostPlayerId: null, gameId: 'poker', gameName: 'Poker',
    status: 'lobby',                          // 'lobby' | 'in-progress' (meaning of "in-progress" is per game)
    maxSeats: 8, players: new Array(8).fill(null), // physical seats; a game may use fewer
    spectators: [], unreadChat: 0, unreadLogs: 0,
    chatHistory: [], logHistory: [],
    kickedPeerIds: [], kicked: false, backupHostId: null, backupState: null, network: null
};

// --- P2P / networking runtime state (not part of gameState because it's
// per-peer connection plumbing, not game data that gets synced) ---
let peerInstance = null;      // this browser's PeerJS Peer object (core/network.js)
let peerConnections = {};     // host only: map of peerId -> open DataConnection to each client
let botTimer = null;          // setTimeout handle used by any game to pace bot moves
let hostRecoveryTimer = null;
let hostRecoveryInProgress = false;
let roomJoinConfirmed = false;
let joinHandshakeTimer = null;
