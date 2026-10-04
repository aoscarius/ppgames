/* ========================================================================
   MONOPOLIO MODULE ENTRY - registers monopolio with the core (see the module
   contract in core/game-registry.js). All state lives under
   gameState.monopolio. Loaded last.
   ======================================================================== */
registerGame({
    id:'monopolio',

    resetRoom(){ gameState.monopolio=defaultMonopolioState(); },
    onTableReset(){
        if(botTimer){clearTimeout(botTimer);botTimer=null;}
        gameState.monopolio=defaultMonopolioState();
    },
    createPlayer(base){ return {id:base.id,name:base.name,isBot:!!base.isBot,disconnected:false}; },

    render:renderMonopolioUI,

    // The shuffled card order is the only hidden information; the rest of the
    // game is public. (The backup host receives the full state separately.)
    publicState(copy){
        if(copy.monopolio)copy.monopolio.decks=null;
    },

    onMessage(data,conn){
        if(data.type==='MONOPOLIO_ACTION'){hostHandleMonopolioAction(data,conn);return true;}
        return false;
    },
    startRequested:hostStartMonopolioMatch,
    scheduleBots:scheduleMonopolioBot,

    // Bots can only be added/removed in the lobby (the controls are rendered there only).
    removeBot(seat){
        if(gameState.status==='lobby'&&gameState.players[seat]?.isBot){
            gameState.players[seat]=null;broadcastState();renderTableUI();
        }
    },
    // A dropped player is only marked (core default); the match waits for
    // them to reconnect. They can also be kicked or resign.

    bind:bindMonopolioUI
});
