/* ========================================================================
   POKER LOCALIZATION - strings used only by the poker module. Merged into
   the shared dictionary by registerLocale() (core/localization.js) when
   this game is loaded; nobody pays for these bytes until poker is picked.
   ======================================================================== */
registerLocale({
    en: {
        allIn: 'All-in',
        bigBlindLabel: 'Big blind',
        blindsError: 'Big blind must be at least the small blind.',
        call: 'Call',
        check: 'Check',
        currency: 'Currency',
        currentBet: 'Current Bet',
        dealHand: 'Hand',
        dealHint: 'Only the host can deal',
        draw: 'Draw',
        drawDiscardPrompt: 'Select cards to discard, then click Draw.',
        eur: 'EUR (€)',
        fold: 'Fold',
        folded: 'Folded',
        handTypes: { HIGH_CARD: 'High Card', ONE_PAIR: 'One Pair', TWO_PAIR: 'Two Pair', THREE_OF_A_KIND: 'Three of a Kind', STRAIGHT: 'Straight', FLUSH: 'Flush', FULL_HOUSE: 'Full House', FOUR_OF_A_KIND: 'Four of a Kind', STRAIGHT_FLUSH: 'Straight Flush', ROYAL_FLUSH: 'Royal Flush' },
        hostOnly: 'Only the host can deal',
        hostReady: 'Host controls the deal',
        maxSeats: 'Maximum seats',
        minMaxSeats: 'Seats must be between 2 and 8.',
        noCommunityCards: 'No community cards',
        pokerOnlyHostConfig: 'Only the host can change table configuration.',
        pokerReady: 'Poker room ready',
        pokerRoom: 'Poker Room',
        pot: 'Pot',
        raise: 'Raise',
        roomSettings: 'Room Settings',
        smallBlindLabel: 'Small blind',
        stackError: 'Starting value must be greater than zero.',
        startingValue: 'Starting value / player',
        tableConfiguration: 'Table Configuration',
        tableConfigurationHint: 'Set the starting stack and limits for this poker room.',
        usd: 'USD ($)',
        variant: 'Variant:',
        waitingDealer: 'Waiting for dealer...',
        waitingForAction: 'Waiting for action...',
        winnerFoldedLabel: 'Winner: {name} (All folded)',
        winnerLabel: 'Winner: {name} ({hand})',
        winnersLabel: 'Winners: {names} ({hand})',
        sidePotWon: 'Side pot {amount}: {names} ({hand})',
        uncalledReturned: '{name} gets back {amount} (uncalled)',
        runoutDealing: 'All-in: dealing the board...',
        drawStood: '{name} kept all cards',
        drawChangedOne: '{name} changed 1 card',
        drawChangedMany: '{name} changed {n} cards',
    },
    it: {
        allIn: 'All-in',
        bigBlindLabel: 'Big blind',
        blindsError: 'Il big blind deve essere almeno lo small blind.',
        call: 'Chiama',
        check: 'Check',
        currency: 'Valuta',
        currentBet: 'Puntata Attuale',
        dealHand: 'Mano',
        dealHint: 'Solo l\'host può distribuire',
        draw: 'Cambia',
        drawDiscardPrompt: 'Seleziona le carte da scartare e premi Cambia.',
        eur: 'EUR (€)',
        fold: 'Passa',
        folded: 'Ritirato',
        handTypes: { HIGH_CARD: 'Carta Alta', ONE_PAIR: 'Coppia', TWO_PAIR: 'Doppia Coppia', THREE_OF_A_KIND: 'Tris', STRAIGHT: 'Scala', FLUSH: 'Colore', FULL_HOUSE: 'Full', FOUR_OF_A_KIND: 'Poker', STRAIGHT_FLUSH: 'Scala Colore', ROYAL_FLUSH: 'Scala Reale' },
        hostOnly: 'Solo l\'host può distribuire',
        hostReady: 'L\'host controlla la distribuzione',
        maxSeats: 'Posti massimi',
        minMaxSeats: 'I posti devono essere tra 2 e 8.',
        noCommunityCards: 'Nessuna carta comune',
        pokerOnlyHostConfig: 'Solo l\'host può modificare la configurazione del tavolo.',
        pokerReady: 'Stanza poker pronta',
        pokerRoom: 'Stanza Poker',
        pot: 'Piatto',
        raise: 'Rilancia',
        roomSettings: 'Impostazioni Stanza',
        smallBlindLabel: 'Small blind',
        stackError: 'Il valore iniziale deve essere maggiore di zero.',
        startingValue: 'Valore iniziale / giocatore',
        tableConfiguration: 'Configurazione Tavolo',
        tableConfigurationHint: 'Imposta il valore iniziale e i limiti della stanza poker.',
        usd: 'USD ($)',
        variant: 'Variante:',
        waitingDealer: 'In attesa del mazziere...',
        waitingForAction: 'In attesa di un\'azione...',
        winnerFoldedLabel: 'Vincitore: {name} (Tutti ritirati)',
        winnerLabel: 'Vincitore: {name} ({hand})',
        winnersLabel: 'Vincitori: {names} ({hand})',
        sidePotWon: 'Piatto secondario {amount}: {names} ({hand})',
        uncalledReturned: '{name} riprende {amount} (non chiamati)',
        runoutDealing: 'All-in: distribuzione delle carte...',
        drawStood: '{name} non ha cambiato carte',
        drawChangedOne: '{name} ha cambiato 1 carta',
        drawChangedMany: '{name} ha cambiato {n} carte',
    }
});

// Translate a hand-ranking name produced by the hand evaluator
// (e.g. "Full House", as returned by evaluate() in evaluator.js) into the
// current UI language. Falls back to the original English name if no
// translation is found.
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
