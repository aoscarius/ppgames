/* ========================================================================
   LOCALIZATION - Language strings (EN/IT) and translation helpers
   ======================================================================== */

// Currently active UI language. Toggled at runtime by the language switch
// button (see events.js) and read by t()/localizedHandType() below.
let currentLang = 'en';

// All user-facing strings, keyed first by language code ('en' | 'it'),
// then by string key. Placeholders like {name} inside a value are filled
// in by t() at render time. The nested `handTypes` map translates the
// poker hand-ranking names produced by the hand evaluator (hand-evaluator.js).
const TRANSLATIONS = {
    en: {
        you: "You",
        avatarHint: "Avatar updates automatically from your name",
        enterUsername: "Enter Your Username",
        createTable: "Create New Table (Host)",
        orJoin: "Or Join Room",
        joinBtn: "Join",
        pasteRoomId: "Paste Room ID...",
        pokerRoom: "Poker Room",
        connecting: "Connecting",
        online: "Online",
        invite: "Invite",
        spectatorMsg: "You are spectating this hand. You will be seated when the next round starts.",
        pot: "Pot",
        currentBet: "Current Bet",
        waitingDealer: "Waiting for dealer...",
        noCommunityCards: "No community cards",
        hostPanel: "Host Panel",
        variant: "Variant:",
        dealHand: "Deal Hand",
        fold: "Fold",
        check: "Check",
        call: "Call",
        raise: "Raise",
        draw: "Draw",
        tableChat: "Table Chat",
        chatPlaceholder: "Chat room connected. Send a message!",
        typeMessage: "Type message...",
        send: "Send",
        logsHeader: "Peer & Game Logs",
        lobbyWaiting: "Lobby Waiting",
        yourTurn: "Your Turn",
        turnOf: "Turn: {name}",
        drawDiscardPrompt: "Select cards to discard, then click Draw.",
        waitingForAction: "Waiting for action...",
        winnerLabel: "Winner: {name} ({hand})",
        winnersLabel: "Winners: {names} ({hand})",
        winnerFoldedLabel: "Winner: {name} (All folded)",
        folded: "Folded",
        allIn: "All-in",
        seat: "Seat {num}",
        handTypes: {
            HIGH_CARD: 'High Card', ONE_PAIR: 'One Pair', TWO_PAIR: 'Two Pair',
            THREE_OF_A_KIND: 'Three of a Kind', STRAIGHT: 'Straight', FLUSH: 'Flush',
            FULL_HOUSE: 'Full House', FOUR_OF_A_KIND: 'Four of a Kind',
            STRAIGHT_FLUSH: 'Straight Flush', ROYAL_FLUSH: 'Royal Flush'
        }
    },
    it: {
        you: "Tu",
        avatarHint: "L'avatar si aggiorna in automatico dal nome",
        enterUsername: "Inserisci il tuo Nome Utente",
        createTable: "Crea Nuovo Tavolo (Host)",
        orJoin: "Oppure Entra in una Stanza",
        joinBtn: "Entra",
        pasteRoomId: "Incolla ID Stanza...",
        pokerRoom: "Stanza Poker",
        connecting: "Connessione",
        online: "Online",
        invite: "Invita",
        spectatorMsg: "Stai assistendo a questa mano. Ti sederai alla prossima partita.",
        pot: "Piatto",
        currentBet: "Puntata Attuale",
        waitingDealer: "In attesa del mazziere...",
        noCommunityCards: "Nessuna carta comune",
        hostPanel: "Pannello Host",
        variant: "Variante:",
        dealHand: "Distribuisci",
        fold: "Passa",
        check: "Check",
        call: "Chiama",
        raise: "Rilancia",
        draw: "Cambia",
        tableChat: "Chat del Tavolo",
        chatPlaceholder: "Chat connessa. Invia un messaggio!",
        typeMessage: "Scrivi un messaggio...",
        send: "Invia",
        logsHeader: "Log P2P e di Gioco",
        lobbyWaiting: "In Attesa Nella Lobby",
        yourTurn: "Il Tuo Turno",
        turnOf: "Turno di: {name}",
        drawDiscardPrompt: "Seleziona le carte da scartare e premi Cambia.",
        waitingForAction: "In attesa di un'azione...",
        winnerLabel: "Vincitore: {name} ({hand})",
        winnersLabel: "Vincitori: {names} ({hand})",
        winnerFoldedLabel: "Vincitore: {name} (Tutti ritirati)",
        folded: "Ritirato",
        allIn: "All-in",
        seat: "Posto {num}",
        handTypes: {
            HIGH_CARD: 'Carta Alta', ONE_PAIR: 'Coppia', TWO_PAIR: 'Doppia Coppia',
            THREE_OF_A_KIND: 'Tris', STRAIGHT: 'Scala', FLUSH: 'Colore',
            FULL_HOUSE: 'Full', FOUR_OF_A_KIND: 'Poker',
            STRAIGHT_FLUSH: 'Scala Colore', ROYAL_FLUSH: 'Scala Reale'
        }
    }
};

// Look up `key` in the current language's string table (falling back to
// English, then to the raw key itself if nothing matches), then substitute
// any {placeholder} tokens with the values passed in `vars`.
// e.g. t('turnOf', {name: 'Alice'}) -> "Turn: Alice"
function t(key, vars = {}) {
    let text = TRANSLATIONS[currentLang]?.[key] || TRANSLATIONS['en']?.[key] || key;
    Object.keys(vars).forEach(k => {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), vars[k]);
    });
    return text;
}

// Translate a hand-ranking name produced by the hand evaluator
// (e.g. "Full House", as returned by evaluate() in hand-evaluator.js)
// into the current UI language. Falls back to the original English name
// if no translation is found.
function localizedHandType(typeName) {
    if (!typeName) return '';
    const map = {
        'High Card': 'HIGH_CARD', 'One Pair': 'ONE_PAIR', 'Two Pair': 'TWO_PAIR',
        'Three of a Kind': 'THREE_OF_A_KIND', 'Straight': 'STRAIGHT', 'Flush': 'FLUSH',
        'Full House': 'FULL_HOUSE', 'Four of a Kind': 'FOUR_OF_A_KIND',
        'Straight Flush': 'STRAIGHT_FLUSH', 'Royal Flush': 'ROYAL_FLUSH'
    };
    const key = map[typeName];
    if (key && TRANSLATIONS[currentLang]?.handTypes?.[key]) {
        return TRANSLATIONS[currentLang].handTypes[key];
    }
    return typeName;
}

// Re-render every static piece of UI text on the page for the current
// language. Elements opt in via data attributes in index.html:
//   data-i18n="key"    -> element's textContent is set to t(key)
//   data-i18n-ph="key" -> element's placeholder attribute is set to t(key)
// Also flips the language-toggle button's label to show the *other*
// language (the one you'd switch to next). Called on load and whenever
// currentLang changes.
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
