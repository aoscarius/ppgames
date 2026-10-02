/* ========================================================================
   OTHELLO MODULE ENTRY - registers othello with the core (see the module
   contract in core/game-registry.js). All othello state lives under
   gameState.othello. Loaded last.
   ======================================================================== */
registerGame({
    id:'othello',

    resetRoom(){ gameState.othello=defaultOthelloState(); },
    onTableReset(){ gameState.othello=defaultOthelloState(); },
    createPlayer(base){ return {id:base.id,name:base.name,isBot:!!base.isBot,disconnected:false}; },

    render:renderOthelloUI,
    // Othello is perfect-information: nothing to hide, so no publicState() hook.

    onMessage(data,conn){
        switch(data.type){
            case 'OTHELLO_MOVE_REQUEST':hostHandleOthelloMove(data,conn);return true;
            case 'OTHELLO_RESIGN_REQUEST':hostHandleOthelloResign(data,conn);return true;
        }
        return false;
    },
    startRequested:hostStartOthelloMatch,
    scheduleBots:scheduleOthelloBot,

    // No mid-match bot removal (the control is only rendered in the lobby).
    removeBot(seat){
        if(gameState.status==='lobby'&&gameState.players[seat]?.isBot){
            gameState.players[seat]=null;broadcastState();renderTableUI();
        }
    },
    // A dropped othello player is only marked (core default); the match
    // simply waits and resumes when they reconnect.

    bind(){
        const $=id=>document.getElementById(id);
        $('startOthelloBtn').onclick=()=>{if(gameState.isHost)hostStartOthelloMatch();};
        $('othelloResignBtn').onclick=()=>{
            showModal(t('titleResign'),t('confirmResign'),[
                {text:'OK',bg:'bg-blue-600 hover:bg-blue-500',onClick:async()=>{requestOthelloResignAction();}},
                {text:'Cancel',bg:'bg-purple-600 hover:bg-purple-500',close:true}
            ]);
        };
        $('othelloBoard').addEventListener('click',e=>{
            const sq=e.target.closest('.othello-square');
            if(sq)handleOthelloSquareClick(Number(sq.dataset.r),Number(sq.dataset.c));
        });
    }
});