/* ========================================================================
   P2P NETWORKING - PeerJS connections, state sync, host/client messaging
   ======================================================================== */

// ----------------------------------------------------------------------
// NETWORKING MODEL
// This game uses an authoritative-host / thin-client architecture built
// on PeerJS (a WebRTC wrapper): the host browser owns the real gameState
// and runs all game logic (game-logic.js); every other browser ("client")
// just sends action requests to the host and replaces its own local
// gameState with whatever snapshot the host broadcasts back. There is no
// server beyond PeerJS's public signalling service used to establish the
// initial WebRTC connections -- gameplay traffic goes peer-to-peer.
//
// Message types exchanged over each PeerJS DataConnection:
//   JOIN_REQUEST    client -> host   : "let me into the room" (seat or spectate)
//   WELCOME_SYNC    host -> client   : full state sent right after joining
//   STATE_UPDATE    host -> clients  : state re-broadcast after anything changes
//   ACTION_REQUEST  client -> host   : a betting/draw action to perform
//   ACTION_ERROR    host -> client   : that action was rejected, with a reason
//   START_REQUEST   client -> host   : (unused by UI today, but supported) ask to deal
//   VARIANT_REQUEST client -> host   : ask to change game variant while in lobby
//   CHAT            either direction : chat message, relayed by the host to everyone
// ----------------------------------------------------------------------

// Build the version of gameState that's safe to send to a specific peer:
// strips the server-side deck entirely (clients never need it and it
// would leak card order), and hides every other player's hole cards
// unless it's showdown time and that player didn't fold (in which case
// their hand should be revealed to everyone). This is what keeps each
// player from being able to see opponents' cards by inspecting network
// traffic. `peerId` identifies which player's own cards should stay visible.
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

// Host only: push a fresh, per-peer-redacted state snapshot out to every
// connected client. Called after essentially any change to gameState
// (an action was taken, someone joined, the variant changed, etc) so
// every client's local copy stays in sync.
function broadcastState(){
    Object.values(peerConnections).forEach(c=>{if(c?.open)c.send({type:'STATE_UPDATE',state:publicStateFor(c.peer)});});
}

// Send one message to a single open PeerJS connection (a no-op if the
// connection is missing or not open yet).
function sendTo(conn,payload){if(conn?.open)conn.send(payload);}

// Host only: process an ACTION_REQUEST received from a client. Looks up
// which seat that player occupies (ignoring bogus requests from unknown
// or bot player IDs -- bots never send real network requests), applies
// the action via processDraw()/processAction() from game-logic.js, tells
// the sender if it was rejected, then re-broadcasts the resulting state,
// re-renders the host's UI, and checks whether a bot needs to act next.
function hostHandleAction(data,conn){
    const seat=gameState.players.findIndex(p=>p?.id===data.playerId);
    if(seat<0||gameState.players[seat].isBot)return;
    const result=data.action==='draw'?processDraw(gameState,seat,data.indices||[]):processAction(gameState,seat,data.action,data.amount);
    if(!result.ok)sendTo(conn,{type:'ACTION_ERROR',message:result.error});
    broadcastState();renderTableUI();scheduleBot();
}

// Central dispatcher for every incoming PeerJS message, run on both host
// and clients (only host-relevant branches check gameState.isHost).
// See the message-type table in the comment block above for what each
// branch does; on receiving a state snapshot (WELCOME_SYNC/STATE_UPDATE)
// a client simply overwrites its local gameState with the host's copy
// (rebuilding the fixed 8-seat players array) and re-renders.
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
// Host only: relay a packet (currently just chat messages) to every
// connected client verbatim, so a chat message from one client reaches
// all the others via the host as a hub.
function broadcastPacket(packet){Object.values(peerConnections).forEach(c=>{if(c?.open)c.send(packet);});}

// Set up this browser as the host, entirely locally (no network yet --
// see initPeerNetwork() for that): generates this player's ID and reuses
// it as both the host ID and the room ID (so the room ID doubles as the
// host's own PeerJS address, meaning clients connect directly to the
// host's peer). Seats the host in seat 0, updates the URL with a
// `?room=` query param so the invite link works, and renders the lobby.
function initHostLocally(username){
    gameState.isHost=true;gameState.myPlayerName=username;gameState.myPlayerId=generateId();gameState.hostId=gameState.myPlayerId;gameState.roomId=gameState.myPlayerId;
    gameState.players[0]={id:gameState.myPlayerId,name:username,chips:1000,currentBet:0,folded:false,isBot:false,cards:[]};
    history.pushState({},'',`${location.pathname}?room=${encodeURIComponent(gameState.roomId)}`);
    renderTableUI();
}

// Host only: open this browser up on the PeerJS signalling network under
// the room ID, so clients can connect to it. Wires up the three PeerJS
// lifecycle events:
//  - 'open'       the peer is live and reachable; update the room status badge.
//  - 'connection' a client is connecting; track the DataConnection, send
//                 them a WELCOME_SYNC snapshot once it's actually open,
//                 and route all their future messages through
//                 handleNetworkData(). On disconnect, remove them from
//                 the connection map and free their seat if the game
//                 hasn't started yet.
//  - 'error'      log any PeerJS-level failure.
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

// Set up this browser as a client joining an existing room: creates a
// new local PeerJS peer with a fresh random ID, then once it's ready,
// opens a direct connection to the host's peer ID (`roomId`) and sends a
// JOIN_REQUEST carrying this player's info. All further messages from the
// host are routed through handleNetworkData().
function joinRoomPeer(roomId,username){
    gameState.isHost=false;gameState.myPlayerName=username;gameState.myPlayerId=generateId();gameState.roomId=roomId;
    peerInstance=new Peer(gameState.myPlayerId);
    peerInstance.on('open',()=>{const conn=peerInstance.connect(roomId);peerConnections[roomId]=conn;conn.on('open',()=>{conn.send({type:'JOIN_REQUEST',player:{id:gameState.myPlayerId,name:username,chips:1000,currentBet:0,folded:false,isBot:false,cards:[]}});});conn.on('data',d=>handleNetworkData(d,conn));conn.on('close',()=>logMessage('Disconnected from host','error'));});
    peerInstance.on('error',e=>logMessage(`PeerJS: ${e.type}`,'error'));
}

// Host only: kick off a new hand. Delegates the actual setup to
// initHand() in game-logic.js, announces it in chat, then broadcasts the
// new state to all clients, re-renders locally, and checks whether a bot
// needs to act first.
function startHand(){
    if(!gameState.isHost)return;
    const r=initHand(gameState); if(!r.ok){alert(r.error);return;}
    appendChatMessage('System',`Hand #${gameState.handNumber} started. Blinds $${gameState.smallBlind}/$${gameState.bigBlind}.`,true);
    broadcastState();renderTableUI();scheduleBot();
}

// Entry point the UI calls whenever the local human player wants to take
// an action (fold/check/call/raise/draw) -- see events.js for the button
// handlers that call this. Behavior differs by role:
//  - If this browser *is* the host, it can apply the action immediately
//    by calling straight into game-logic.js, then broadcasts/renders/
//    schedules the next bot turn just like any other host-side change.
//  - If this browser is a client, it has no authority to change the
//    game state itself -- it just sends an ACTION_REQUEST to the host
//    (its first, and only, peer connection) and waits for the resulting
//    STATE_UPDATE to come back.
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

