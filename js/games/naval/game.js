/* ========================================================================
   NAVAL BATTLE MODULE ENTRY - registers naval with the core (see the module
   contract in core/game-registry.js). All naval state lives under
   gameState.naval. Loaded last.
   ======================================================================== */
registerGame({
    id:'naval',

    resetRoom(){ gameState.naval=defaultNavalState(); },
    onTableReset(){
        if(botTimer){clearTimeout(botTimer);botTimer=null;}
        gameState.naval=defaultNavalState();
    },
    createPlayer(base){ return {id:base.id,name:base.name,isBot:!!base.isBot,disconnected:false}; },

    render:renderNavalUI,

    // Hidden information: each peer only ever receives its OWN ship positions.
    // The opponent's fleet is revealed only ship-by-ship as it is sunk (that
    // list, naval.sunk, is public) and in full once the match has ended.
    publicState(copy,peerId){
        const ns=copy.naval;
        if(!ns||ns.phase==='ended')return;
        ns.fleets=ns.fleets.map((fleet,i)=>ns.ids[i]===peerId?fleet:null);
    },

    onMessage(data,conn){
        switch(data.type){
            case 'NAVAL_FLEET_REQUEST':hostHandleNavalFleet(data,conn);return true;
            case 'NAVAL_FIRE_REQUEST':hostHandleNavalFire(data,conn);return true;
            case 'NAVAL_RESIGN_REQUEST':hostHandleNavalResign(data,conn);return true;
        }
        return false;
    },
    startRequested:hostStartNavalMatch,
    scheduleBots:scheduleNavalBot,

    // No mid-match bot removal (the control is only rendered in the lobby).
    removeBot(seat){
        if(gameState.status==='lobby'&&gameState.players[seat]?.isBot){
            gameState.players[seat]=null;broadcastState();renderTableUI();
        }
    },
    // A dropped naval player is only marked (core default); the match simply
    // waits and resumes when they reconnect.

    bind:bindNavalUI
});
