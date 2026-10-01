/* ========================================================================
   CORE LOCALIZATION - language strings shared by every game (welcome,
   game selection, lobby, chat/logs, and generic turn-based phrases like
   "your turn"/"waiting for opponent" that any future game can reuse).
   Each game additionally ships its own js/games/<id>/locale.js, merged in
   via registerLocale() once that game is loaded (see loadGame() in
   core/game-registry.js) -- so a game's strings only cost bytes when
   that game is actually played.
   ======================================================================== */

// Currently active UI language. Toggled at runtime by the language switch
// button; read by t() below.
let currentLang = 'en';

const TRANSLATIONS = {
    en: {
        avatarHint: 'Avatar updates automatically from your name',
        backBtn: 'Back',
        botRemoved: 'was removed from the table',
        chatPlaceholder: 'Chat room connected. Send a message!',
        comingSoon: 'Coming Soon',
        confirmKick: 'Remove this player from the table?',
        connecting: 'Connecting',
        continueBtn: 'Continue',
        createTable: 'Create New Table (Host)',
        enterUsername: 'Enter Your Username',
        gameSelectionSubtitle: 'Pick the game for this room. The P2P engine is shared by every game.',
        gameSelectionTitle: 'Choose a Game',
        invalidGame: 'This game is not available in this room.',
        invite: 'Invite',
        joinBtn: 'Join',
        kickPlayer: 'Kick player',
        kickedFromTable: 'You were removed from the table.',
        lobbyWaiting: 'Lobby Waiting',
        logsHeader: 'Peer & Game Logs',
        online: 'Online',
        orJoin: 'Or Join Room',
        pasteRoomId: 'Paste Room ID...',
        playable: 'Playable',
        playerKicked: 'was removed from the table',
        players: 'players',
        removeBot: 'Remove bot',
        resetTable: 'Reset',
        confirmResetTable: 'Reset the table and return everyone to the lobby?',
        tableReset: 'Table reset. The lobby is open for new players.',
        roomFull: 'This room is full.',
        seat: 'Seat {num}',
        send: 'Send',
        spectatorMsg: 'You are spectating. You will be seated when the next round starts.',
        tableChat: 'Table Chat',
        turnOf: 'Turn: {name}',
        typeMessage: 'Type message...',
        waitingForOpponent: 'Waiting for opponent...',
        you: 'You',
        yourTurn: 'Your Turn',
        addBot: 'Add bot',
    },
    it: {
        avatarHint: 'L\'avatar si aggiorna in automatico dal nome',
        backBtn: 'Indietro',
        botRemoved: 'è stato rimosso dal tavolo',
        chatPlaceholder: 'Chat connessa. Invia un messaggio!',
        comingSoon: 'Prossimamente',
        confirmKick: 'Rimuovere questo giocatore dal tavolo?',
        connecting: 'Connessione',
        continueBtn: 'Continua',
        createTable: 'Crea Nuovo Tavolo (Host)',
        enterUsername: 'Inserisci il tuo Nome Utente',
        gameSelectionSubtitle: 'Scegli il gioco per questa stanza. Il motore P2P è condiviso da tutti i giochi.',
        gameSelectionTitle: 'Scegli un Gioco',
        invalidGame: 'Questo gioco non è disponibile in questa stanza.',
        invite: 'Invita',
        joinBtn: 'Entra',
        kickPlayer: 'Espelli giocatore',
        kickedFromTable: 'Sei stato rimosso dal tavolo.',
        lobbyWaiting: 'In Attesa Nella Lobby',
        logsHeader: 'Log P2P e di Gioco',
        online: 'Online',
        orJoin: 'Oppure Entra in una Stanza',
        pasteRoomId: 'Incolla ID Stanza...',
        playable: 'Disponibile',
        playerKicked: 'è stato rimosso dal tavolo',
        players: 'giocatori',
        removeBot: 'Rimuovi bot',
        resetTable: 'Reset',
        confirmResetTable: 'Azzerare il tavolo e riportare tutti nella lobby?',
        tableReset: 'Tavolo azzerato. La lobby è aperta ai nuovi giocatori.',
        roomFull: 'La stanza è piena.',
        seat: 'Posto {num}',
        send: 'Invia',
        spectatorMsg: 'Stai assistendo alla partita. Ti sederai al prossimo turno.',
        tableChat: 'Chat del Tavolo',
        turnOf: 'Turno di: {name}',
        typeMessage: 'Scrivi un messaggio...',
        waitingForOpponent: 'In attesa dell\'avversario...',
        you: 'Tu',
        yourTurn: 'Il Tuo Turno',
        addBot: 'Aggiungi bot',
    }
};

// Merge a game's strings into TRANSLATIONS. Call once when the game loads
// (js/games/<id>/locale.js does this at the top level). Existing core keys
// are never overwritten -- a game can only ADD keys, under its own names,
// so two games can never silently clobber each other's (or core's) text.
function registerLocale(entries){
    for(const lang in entries){
        TRANSLATIONS[lang]=TRANSLATIONS[lang]||{};
        for(const key in entries[lang]){
            if(key in TRANSLATIONS[lang])throw new Error(`Locale key collision: '${key}' already defined (lang: ${lang})`);
            TRANSLATIONS[lang][key]=entries[lang][key];
        }
    }
}

function t(key, vars = {}) {
    let text = TRANSLATIONS[currentLang]?.[key] || TRANSLATIONS['en']?.[key] || key;
    Object.keys(vars).forEach(k => {
        text = text.replace(new RegExp(`\\{${k}}`, 'g'), vars[k]);
    });
    return text;
}

// Re-render every static piece of UI text currently in the DOM for the
// active language. Elements opt in via data attributes:
//   data-i18n="key"    -> element's textContent is set to t(key)
//   data-i18n-ph="key" -> element's placeholder attribute is set to t(key)
// Safe to call again after a game's markup/locale is mounted (loadGame()
// does this), so newly-added elements and newly-registered keys pick up
// translations without a full page re-render.
function updateStaticTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
        const key = el.getAttribute('data-i18n-ph');
        el.setAttribute('placeholder', t(key));
    });
    const langBtn = document.getElementById('langToggleLabel');
    if (langBtn) langBtn.textContent = currentLang === 'en' ? 'IT' : 'EN';
}
