/* ========================================================================
   GO MODULE ENTRY - registers go with the core (see the module contract in
   core/game-registry.js). All go state lives under gameState.go; the board
   size chosen in the lobby lives at gameState.goSize. Loaded last.
   ======================================================================== */
registerGame({
    id:'go',

    stateDefaults(){ return {goSize:9,goBotLevel:'medium'}; },
    resetRoom(){ gameState.go=defaultGoState(GO_SIZES.includes(gameState.goSize)?gameState.goSize:9); },
    onTableReset(){ gameState.go=defaultGoState(GO_SIZES.includes(gameState.goSize)?gameState.goSize:9); },
    createPlayer(base){ return {id:base.id,name:base.name,isBot:!!base.isBot,disconnected:false}; },

    render:renderGoUI,
    subtitle:()=>{const g=gameState.go;return g?`${g.size}×${g.size}`:'Go';},
    // Perfect information: nothing to hide, so no publicState() hook.

    onMessage(data,conn){
        switch(data.type){
            case 'GO_MOVE_REQUEST':hostGoAction(data,conn,(s,id)=>processGoMove(s,id,data.idx));return true;
            case 'GO_PASS_REQUEST':hostGoAction(data,conn,processGoPass);return true;
            case 'GO_RESIGN_REQUEST':hostGoAction(data,conn,resignGo);return true;
            case 'GO_DEAD_REQUEST':hostGoAction(data,conn,(s,id)=>processGoToggleDead(s,id,data.idx));return true;
            case 'GO_ACCEPT_REQUEST':hostGoAction(data,conn,processGoAccept);return true;
            case 'GO_RESUME_REQUEST':hostGoAction(data,conn,processGoResume);return true;
        }
        return false;
    },
    startRequested:hostStartGoMatch,
    scheduleBots:scheduleGoBot,

    // No mid-match bot removal (the control is only rendered in the lobby).
    removeBot(seat){
        if(gameState.status==='lobby'&&gameState.players[seat]?.isBot){
            gameState.players[seat]=null;broadcastState();renderTableUI();
        }
    },
    // A dropped go player is only marked (core default); the match waits and resumes when they reconnect.

    bind(){
        const $=id=>document.getElementById(id);
        $('startGoBtn').onclick=()=>{if(gameState.isHost)hostStartGoMatch();};
        $('goPassBtn').onclick=()=>requestGoPass();
        $('goAcceptBtn').onclick=()=>requestGoAccept();
        $('goResumeBtn').onclick=()=>requestGoResume();
        $('goResignBtn').onclick=()=>{
            showModal(t('goTitleResign'),t('goConfirmResign'),[
                {text:'OK',bg:'bg-blue-600 hover:bg-blue-500',onClick:async()=>{requestGoResign();}},
                {text:'Cancel',bg:'bg-purple-600 hover:bg-purple-500',close:true}
            ]);
        };
        $('goBotLevel').onchange=e=>{
            if(!gameState.isHost)return;
            if(GO_BOT_LEVELS[e.target.value])gameState.goBotLevel=e.target.value;
            broadcastState();renderTableUI();
        };
        $('goHintBtn').onclick=()=>showGoHint();
        $('goSizeSelect').onchange=e=>{
            if(!gameState.isHost)return;
            const size=Number(e.target.value);
            if(!GO_SIZES.includes(size)||gameState.go?.status==='in-progress'||gameState.go?.status==='scoring')return;
            gameState.goSize=size;
            // Show the new empty board right away (players stay seated).
            const g=gameState.go;
            gameState.go={...defaultGoState(size),blackPlayerId:g?.blackPlayerId||null,whitePlayerId:g?.whitePlayerId||null};
            broadcastState();renderTableUI();
        };
        $('goBoard').addEventListener('click',e=>{
            const el=e.target.closest('[data-idx]');
            if(el)handleGoPointClick(Number(el.dataset.idx));
        });
    }
});
