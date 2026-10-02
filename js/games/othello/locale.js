/* ========================================================================
   OTHELLO LOCALIZATION - strings used only by the othello module. Merged
   into the shared dictionary by registerLocale() (core/localization.js)
   when this game is loaded. (othelloGame/othelloDescription themselves
   live in core, not here -- see the comment above GAME_REGISTRY in
   core/game-registry.js for why.)
   ======================================================================== */
registerLocale({
    en: {
        othelloRoom: 'Othello Room',
        othelloMatchStarted: 'The match has started.',
        othelloPassed: '{name} had no legal move and passed.',
        othelloWinResult: '{name} wins {winner}-{loser}.',
        othelloWinResignation: '{name} wins by resignation.',
        othelloDrawResult: "It's a draw, {count}-{count}.",
        titleResign: 'Resign Match',
        confirmResign: 'Are you sure you want to resign this match?',
        rematch: 'Rematch',
        resign: 'Resign',
        startMatch: 'Start Match'
    },
    it: {
        othelloRoom: 'Stanza Othello',
        othelloMatchStarted: 'La partita è iniziata.',
        othelloPassed: '{name} non aveva mosse legali ed è passato.',
        othelloWinResult: '{name} vince {winner}-{loser}.',
        othelloWinResignation: '{name} vince per abbandono.',
        othelloDrawResult: 'Pareggio, {count}-{count}.',
        titleResign: 'Abbandona Partita',
        confirmResign: 'Sei sicuro di voler abbandonare questa partita?',
        rematch: 'Rivincita',
        resign: 'Abbandona',
        startMatch: 'Inizia Partita'
    }
});