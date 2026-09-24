# P2P Poker Engine

## What changed
- Fixed shared-room URL bootstrap: when `?room=` is present, the Create Table control is not wired; the Join Table control is used instead. This prevents the previous null-element exception that stopped the remaining event listeners from being registered.
- Added an explicit `JOIN_ACCEPTED` handshake. The host sends the authoritative table snapshot only after validating the peer connection/player ID, and the peer marks the room connected only after acceptance.
- The peer table now renders immediately in a waiting/connecting state and the Deal Hand button starts disabled; it stays disabled unless the local browser is the authoritative host.

- Poker variant is selected during table setup (`Texas Hold'em` / `5-Card Draw`), not in a host panel.
- Removed the host admin bar completely.
- Host controls are now contextual on the table:
  - `+` on an empty seat adds a bot to that exact seat.
  - `−` on a bot seat removes that bot.
  - `×` on occupied seats lets the host kick connected players.
  - A crown badge identifies the current host directly on their avatar.
- Hole cards are rendered below the avatar/name/stack on each seat.
- Redesigned center board with pot, current bet, community cards, phase and Deal Hand control.
- Reworked P2P state flow so a client never inherits `isHost` or `myPlayerId` from a host snapshot.
- Per-player card redaction is preserved: each peer receives its own cards, while opponent cards remain hidden until showdown.
- Host-authoritative actions and chat now use the explicit host connection instead of relying on the first connection in an object.
- Room-scoped chat packets include `roomId` and `senderId`.
- Peer disconnects are detected; lobby seats are released and active players are folded/disconnected without leaving the turn stuck.
- A deterministic backup peer receives the full authoritative state. If the host disappears, the first seated non-bot peer takes over the room ID and restores the full state.
- Other peers reconnect to the promoted host automatically.
- Added optional ICE/TURN configuration via `network-config.js`.

## Cross-network WebRTC
PeerJS signalling does not guarantee that every pair of browsers can establish a direct WebRTC data path. For peers behind restrictive/symmetric NATs, configure a real TURN server in `network-config.js` using the template in `network-config.example.js`.

Do not commit real TURN credentials to a public repository. For production, generate short-lived credentials server-side when possible.

## Basic test
1. Open the host on browser A and create a table.
2. Copy the invite URL.
3. Open the URL on browser B using a different network (for example mobile hotspot).
4. Join the room and verify:
   - B appears as a peer, not a host.
   - B sees only B's hole cards.
   - Chat messages are exchanged both ways.
   - Host can kick B and B is returned to the welcome screen.
5. Join with browser C, then close the host browser.
6. The deterministic backup peer should become host and the other peer should reconnect.
