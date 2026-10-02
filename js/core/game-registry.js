/* ========================================================================
   GAME REGISTRY + LAZY LOADER

   The core (network, lobby, chat, modal, screens) is game-agnostic. A game
   is a self-contained folder that is downloaded ONLY when somebody picks it:

     js/games/<id>/board.html   markup (slots: overlay | board)
     js/games/<id>/locale.js    strings   -> registerLocale({...})
     js/games/<id>/*.js         rules, network handlers, ui, game.js (registerGame)
     css/games/<id>.css         styles

   To add a game: (1) create that folder, (2) add one entry to GAME_REGISTRY
   below, (3) call registerGame({...}) from its game.js. Nothing else in the
   core changes.

   The header itself (name, icon, Reset Table) is shared chrome, not
   per-game markup: every game gets the exact same header controls, with
   only the name/icon and (via configSummary()) one summary line changing.
   A game that needs its own extra full-screen step before the board (like
   poker's stakes/seats configuration) uses the `overlay` slot for that.

   GAME MODULE CONTRACT (all hooks run in the browser that owns the state):
     id                       must match the registry key
     stateDefaults()          optional; root-level fields merged into gameState
     resetRoom()              a NEW room is being created/joined (players
                              array is still empty): reset game state
     createPlayer(base)       seat record for a new human/bot  (base: id,name,isBot)
     bind()                   once, after the markup is mounted: attach listeners
     render()                 repaint the board from gameState
     subtitle()               optional header sub-title       (default: game name)
     configSummary()          optional small header line
     hostFlow()               optional; how the host starts a room (poker opens
                              its configuration screen). Default: create now.
     publicState(copy,peerId) optional; strip hidden info from a copy of the state
     onMessage(data,conn)     host: handle game packets, return true if handled
     startRequested()         host: "start" pressed (deal a hand / start a match)
     removeBot(seat)          host: remove a bot (default: clear seat in lobby)
     onPlayerDisconnected(i)  optional, host: a seated player dropped mid-game
     onHostPromoted(oldSeat)  optional: this browser just became host
     onTableReset()           host: the shared "Reset Table" header button was
                              confirmed (see resetTable() in core/network.js).
                              Seats are already pruned/preserved for you --
                              reset this game's own state, players stay seated.
   ======================================================================== */

// IMPORTANT: nameKey/descKey must resolve to real strings in
// js/core/game-registry.js, NOT in the game's own lazy-loaded locale.js.
// renderGameChoices() (below) renders nameKey/descKey on the game-selection
// screen, before anyone has picked a game -- so before that game's module,
// and therefore its locale.js, has ever been fetched (see loadGame()). A
// key that only exists in the game's own locale.js would show up as the
// raw key string ("pokerGame") instead of real text until that game
// happens to load. roomKey, by contrast, is only read later inside the
// game screen itself (after the module has already loaded), so it's fine
// to keep defined in the game's own locale.js, same as everything else
// game-specific.
const GAME_REGISTRY = {
    poker: {
        id:'poker', nameKey:'pokerGame', descKey:'pokerDescription', roomKey:'pokerRoom',
        icon:'♠', accentBg:'bg-emerald-600', implemented:true, minPlayers:2, maxPlayers:8,
        cardClass:'border-emerald-500/60 bg-emerald-950/30 hover:bg-emerald-950/50',
        badgeClass:'text-emerald-400',
        scripts:['js/games/poker/constants.js','js/games/poker/evaluator.js','js/games/poker/cards.js',
                 'js/games/poker/logic.js','js/games/poker/net.js','js/games/poker/ui.js','js/games/poker/game.js'],
        styles:['css/games/poker.css'],
        markup:'js/games/poker/board.html',
        locale:'js/games/poker/locale.js'
    },
    chess: {
        id:'chess', nameKey:'chessGame', descKey:'chessDescription', roomKey:'chessRoom',
        icon:'♟', accentBg:'bg-amber-600', implemented:true, minPlayers:2, maxPlayers:2,
        cardClass:'border-amber-500/60 bg-amber-950/20 hover:bg-amber-950/40',
        badgeClass:'text-amber-400',
        scripts:['js/games/chess/engine.js','js/games/chess/logic.js','js/games/chess/net.js',
                 'js/games/chess/ui.js','js/games/chess/game.js'],
        styles:['css/games/chess.css'],
        markup:'js/games/chess/board.html',
        locale:'js/games/chess/locale.js'
    },
    othello: {
        id:'othello', nameKey:'othelloGame', descKey:'othelloDescription', roomKey:'othelloRoom',
        icon:'⚫', accentBg:'bg-teal-600', implemented:true, minPlayers:2, maxPlayers:2,
        cardClass:'border-teal-500/60 bg-teal-950/20 hover:bg-teal-950/40',
        badgeClass:'text-teal-400',
        scripts:['js/games/othello/logic.js','js/games/othello/net.js','js/games/othello/ui.js','js/games/othello/game.js'],
        styles:['css/games/othello.css'],
        markup:'js/games/othello/board.html',
        locale:'js/games/othello/locale.js'
    },
    naval:  { id:'naval',   nameKey:'navalGame',   descKey:'navalDescription',   icon:'⚓', implemented:false, minPlayers:2, maxPlayers:2 }
};
function getGameDefinition(id){ return GAME_REGISTRY[id] || GAME_REGISTRY.poker; }

/* ------ games selection locale ------ */
registerLocale({
    en: {
        pokerGame: 'Poker', pokerDescription: 'Texas Hold\'em & 5-Card Draw',
        chessGame: 'Chess', chessDescription: 'Two-player chess',
        othelloGame: 'Othello', othelloDescription: 'Classic reversi',
        navalGame: 'Naval Battle', navalDescription: 'Fleet strategy',
    },
    it: {
        pokerGame: 'Poker', pokerDescription: 'Texas Hold\'em e 5-Card Draw',
        chessGame: 'Scacchi', chessDescription: 'Scacchi per due',
        othelloGame: 'Othello', othelloDescription: 'Reversi classico',
        navalGame: 'Battaglia Navale', navalDescription: 'Strategia navale',
    }
});

/* ---------- module registry ---------- */
const GAME_MODULES = {};
function registerGame(mod){
    GAME_MODULES[mod.id]=mod;
    if(typeof mod.stateDefaults==='function')Object.assign(gameState,mod.stateDefaults());
}
function currentGame(){ return GAME_MODULES[gameState.gameId]||null; }

/* ---------- lazy loading ---------- */
const _gameLoads={};

// Download + run everything a game needs, exactly once per page. Resolves
// with the registered module. Files are fetched in parallel but executed
// strictly in order (they share the global scope like normal <script>s).
function loadGame(id){
    const def=GAME_REGISTRY[id];
    if(!def?.implemented)return Promise.reject(new Error('Game not available: '+id));
    if(_gameLoads[id])return _gameLoads[id];
    const text=url=>fetch(url).then(r=>{if(!r.ok)throw new Error(`${r.status} ${url}`);return r.text();});
    _gameLoads[id]=(async()=>{
        (def.styles||[]).forEach(href=>{
            const l=document.createElement('link');l.rel='stylesheet';l.href=href;document.head.appendChild(l);
        });
        const files=[def.locale,...def.scripts];
        const [markup,...codes]=await Promise.all([text(def.markup),...files.map(text)]);
        mountGameMarkup(markup);
        codes.forEach((code,i)=>{
            const s=document.createElement('script');
            s.textContent=code+`\n//# sourceURL=${files[i]}`;
            document.head.appendChild(s);s.remove();
        });
        const mod=GAME_MODULES[id];
        if(!mod)throw new Error(`Game module '${id}' did not call registerGame()`);
        if(mod.bind)mod.bind();
        updateStaticTranslations();
        return mod;
    })().catch(e=>{delete _gameLoads[id];throw e;});
    return _gameLoads[id];
}

// board.html contains <template data-slot="x"> blocks; move each block's
// content into the shell element marked data-mount="x".
function mountGameMarkup(html){
    const tpl=document.createElement('template');tpl.innerHTML=html;
    tpl.content.querySelectorAll('template[data-slot]').forEach(slot=>{
        const mount=document.querySelector(`[data-mount="${slot.dataset.slot}"]`);
        if(mount)mount.appendChild(slot.content.cloneNode(true));
    });
}

/* ---------- game selection screen ---------- */
// The cards are generated from the registry, so a new game shows up here
// automatically (as "Coming soon" until `implemented` is true).
function renderGameChoices(){
    const box=document.getElementById('gameCards');if(!box)return;
    box.innerHTML=Object.values(GAME_REGISTRY).map(def=>{
        const ok=def.implemented;
        const cls=ok?def.cardClass:'border-slate-700 bg-slate-950/40 opacity-60 cursor-not-allowed';
        const badge=ok?def.badgeClass:'text-slate-500';
        return `<button data-game-id="${def.id}" ${ok?'':'disabled'} class="game-choice text-left p-4 rounded-2xl border ${cls} transition">
            <div class="flex items-start justify-between gap-3"><span class="text-3xl">${def.icon}</span><span class="text-[9px] uppercase tracking-widest font-black ${badge}" data-i18n="${ok?'playable':'comingSoon'}"></span></div>
            <h3 class="mt-3 text-base font-black text-white" data-i18n="${def.nameKey}"></h3>
            <p class="text-xs text-slate-400 mt-1" data-i18n="${def.descKey}"></p>
        </button>`;
    }).join('');
}
