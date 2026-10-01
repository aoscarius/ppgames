# P2P Games Engine

A browser-based, peer-to-peer multiplayer table-games engine. No server,
no build step, no accounts: one browser becomes the **host** (the
authoritative source of truth for the game state), every other browser
connects to it directly over WebRTC via [PeerJS](https://peerjs.com/), and
the whole thing runs from plain static files.

Currently playable: **Poker** (Texas Hold'em and 5-Card Draw) and **Chess**. 
Othello and Naval Battle are stubbed in the game picker as "coming soon."

## Running it

This is a static site — any static file server works. It does **not** work
opened directly as a `file://` URL, because games are downloaded on demand
with `fetch()` (see [Architecture](#architecture) below), which browsers
block on `file://`.

```bash
# any static server works, for example:
npx http-server .
# or
python3 -m http.server 8080
```

Then open the printed URL, enter a name, and either **Create Table** (you
become the host) or open an invite link someone else shared with you.

## Architecture

The project is split into a small, game-agnostic **core** and a set of
**game modules** that are fetched only when actually needed:

```
index.html              the shell: welcome/lobby screens, shared header,
                         chat & logs drawers, modal dialog -- identical
                         for every game
network-config.js       optional TURN/ICE override (see below)

js/core/
  state.js               gameState (the single synced source of truth) +
                         P2P runtime variables
  utils.js               id generation, chat/log rendering, room-history storage
  localization.js        EN/IT strings shared by every game + registerLocale()
  game-registry.js       GAME_REGISTRY, the lazy loader (loadGame()), and
                         the game-module contract
  network.js             PeerJS wiring, host-authority state sync, chat,
                         reconnection/heartbeat/watchdog, kick, reset table
  ui.js                  screens, shared header, modal dialogs, render dispatch
  events.js              DOM wiring for the welcome/lobby/header chrome

js/games/<id>/
  board.html             this game's markup, as <template data-slot="..."> blocks
  locale.js              this game's strings -> registerLocale({...})
  game.js                registerGame({...}) -- the module's entry point
  ...                    everything else the game needs (rules, bot AI,
                         board rendering, its own network message handlers)

css/
  base.css               shared chrome only
  games/<id>.css          this game's own styles
```

**Why the split:** opening the app only ever downloads `core/*` plus
whichever game you picked — not every game's rules engine, board UI and
strings up front. Picking Poker, for instance, fetches `js/games/poker/*`
(including the ~70 KB vendored poker rules engine) and `css/games/poker.css`
for the first time at that moment; Poker's files are never touched unless
you pick Poker.

### Adding a new game

1. Create `js/games/<id>/` and `css/games/<id>.css`.
2. Write `board.html` with whatever markup the game needs, inside
   `<template data-slot="board">...</template>` (and `<template
   data-slot="overlay">...</template>` for an extra full-screen step before
   the board, the way Poker's stakes/seats configuration works).
3. Write `locale.js`: call `registerLocale({ en: {...}, it: {...} })` with
   the game's own strings. Genuinely generic phrases ("your turn", "waiting
   for opponent") already live in core — reuse them with `t('key')` instead
   of redefining them.
4. Write `game.js`, ending with `registerGame({ id: '<id>', ... })`. The
   full hook contract (`resetRoom`, `createPlayer`, `render`, `onMessage`,
   `startRequested`, `onTableReset`, etc.) is documented at the top of
   `js/core/game-registry.js`.
5. Add one entry to `GAME_REGISTRY` in `js/core/game-registry.js`, with
   `implemented: true`.

Nothing in `js/core/` needs to change. The header, Reset Table button,
lobby seat controls (add/remove bot, kick), chat, and reconnection all work
for a new game automatically because they talk to the module contract, not
to Poker by name.

## Networking

- **Host authority.** The host holds the real `gameState` and is the only
  browser that mutates it directly; every other peer just renders whatever
  state it's sent and asks the host to apply actions on its behalf.
- **Self-describing room links.** A room id looks like `ppgpoker-ab12cd3`
  — it embeds the game id, so an invite link (`?room=<id>`) is enough for a
  joiner to skip the game-selection screen and land straight in the right
  game, with that game's module fetched automatically.
- **Reconnection.** If the host disappears, a deterministic backup peer
  (the first connected, non-bot seated player) is promoted and takes over
  the room id with the last known state; everyone else reconnects to it
  automatically.
- **Heartbeat / watchdog.** The host periodically broadcasts a heartbeat
  and each client periodically pings back, so a dead connection is noticed
  (and handled exactly like a normal disconnect) even on the rare occasion
  WebRTC itself never fires a close/error event.
- **Per-player privacy.** A game can declare a `publicState()` hook to
  redact information that should stay private to one player (Poker hides
  hole cards from everyone except their owner until showdown).

### Cross-network WebRTC (TURN)

PeerJS signalling does not guarantee that every pair of browsers can
establish a direct WebRTC data path — peers behind restrictive/symmetric
NATs will fail to connect on STUN alone. To fix that, copy
`network-config.example.js` to `network-config.js` and fill in a real TURN
server's credentials.

Do not commit real TURN credentials to a public repository. For
production, generate short-lived credentials server-side when possible
(most TURN providers support this).

## Localization

English and Italian are built in, toggled from the header. Strings are
split the same way the code is: `js/core/localization.js` holds what's
shared by every game, and each game's own `locale.js` adds its own via
`registerLocale()` once that game loads. `registerLocale()` throws if a
game tries to redefine an existing key, so two games (or a game and core)
can never silently clobber each other's text.

## Manual test checklist

A quick end-to-end sanity check after making changes:

1. Open the host on browser A, create a table (try Poker).
2. Copy the invite link (**Invite** button in the header).
3. Open the link on browser B, ideally on a different network (e.g. a
   phone on mobile data) to actually exercise NAT traversal.
4. Verify:
   - B lands directly in the right game, not the game-selection screen.
   - B appears as a peer, not a host.
   - For Poker: B sees only B's own hole cards.
   - Chat messages flow both ways.
   - The host can kick B; B is returned to the welcome screen.
5. Join with a third browser C, then close the host's browser/tab.
   - The deterministic backup peer should become host.
   - The remaining peer(s) should reconnect to the new host automatically.
6. As host, click **Reset Table**: confirm everyone stays seated and the
   game/hand resets cleanly, ready to start again.

## License

GPL-3.0 — see `LICENSE`.
