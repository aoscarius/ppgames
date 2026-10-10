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
        othelloBotLevel: 'Bot level',
        othelloLevel_easy: 'Easy',
        othelloLevel_medium: 'Medium',
        othelloLevel_hard: 'Hard',
        othelloLevel_expert: 'Expert',
        othelloHint: 'Hint',
        othelloMatchStarted: 'The match has started.',
        othelloPassed: '{name} had no legal move and passed.',
        othelloWinResult: '{name} wins {winner}-{loser}.',
        othelloWinResignation: '{name} wins by resignation.',
        othelloDrawResult: "It's a draw, {count}-{count}.",
        titleResign: 'Resign Match',
        confirmResign: 'Are you sure you want to resign this match?',
        rematch: 'Rematch',
        resign: 'Resign',
        startMatch: 'Start Match',
        illegalMove: 'That move is not legal.',
        needTwoPlayers: 'Need two seated players to start.'
    },
    it: {
        othelloRoom: 'Stanza Othello',
        othelloBotLevel: 'Livello bot',
        othelloLevel_easy: 'Facile',
        othelloLevel_medium: 'Medio',
        othelloLevel_hard: 'Difficile',
        othelloLevel_expert: 'Esperto',
        othelloHint: 'Suggerisci',
        othelloMatchStarted: 'La partita è iniziata.',
        othelloPassed: '{name} non aveva mosse legali ed è passato.',
        othelloWinResult: '{name} vince {winner}-{loser}.',
        othelloWinResignation: '{name} vince per abbandono.',
        othelloDrawResult: 'Pareggio, {count}-{count}.',
        titleResign: 'Abbandona Partita',
        confirmResign: 'Sei sicuro di voler abbandonare questa partita?',
        rematch: 'Rivincita',
        resign: 'Abbandona',
        startMatch: 'Inizia Partita',
        illegalMove: 'Mossa non legale.',
        needTwoPlayers: 'Servono due giocatori seduti per iniziare.'
    }
});