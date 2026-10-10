/* ========================================================================
   CHESS MODULE ENTRY - registers chess with the core (see the module
   contract in core/game-registry.js) and owns every chess DOM listener.
   All chess state lives under gameState.chess. Loaded last.
   ======================================================================== */
registerGame({
    id:'chess',

    // Strength of the bot (see CHESS_BOT_LEVELS in bot.js); chosen by the host, synced to everyone.
    stateDefaults(){ return {chessBotLevel:'medium'}; },

    resetRoom(){ gameState.chess=defaultChessState(); },
    onTableReset(){ gameState.chess=defaultChessState(); },
    createPlayer(base){ return {id:base.id,name:base.name,isBot:!!base.isBot,disconnected:false}; },

    render:renderChessUI,
    // Chess is perfect-information: nothing to hide, so no publicState() hook.

    onMessage(data,conn){
        switch(data.type){
            case 'CHESS_MOVE_REQUEST':hostHandleChessMove(data,conn);return true;
            case 'CHESS_RESIGN_REQUEST':hostHandleChessResign(data,conn);return true;
            case 'CHESS_DRAW_OFFER_REQUEST':hostHandleChessDrawOffer(data,conn);return true;
            case 'CHESS_DRAW_RESPONSE_REQUEST':hostHandleChessDrawResponse(data,conn);return true;
        }
        return false;
    },
    startRequested:hostStartChessMatch,
    scheduleBots:scheduleChessBot,

    // No mid-match bot removal (the control is only rendered in the lobby).
    removeBot(seat){
        if(gameState.status==='lobby'&&gameState.players[seat]?.isBot){
            gameState.players[seat]=null;broadcastState();renderTableUI();
        }
    },
    // A dropped chess player is only marked (core default); the match simply
    // waits and resumes when they reconnect, so no onPlayerDisconnected /
    // onHostPromoted hooks are needed.

    bind(){
        const $=id=>document.getElementById(id);
        $('chessBotLevel').onchange=e=>{
            if(!gameState.isHost)return;
            if(CHESS_BOT_LEVELS[e.target.value])gameState.chessBotLevel=e.target.value;
            broadcastState();
            renderTableUI();
        };
        $('chessHintBtn').onclick=()=>showChessHint();
        $('startChessBtn').onclick=()=>{if(gameState.isHost)hostStartChessMatch();};
        $('resignBtn').onclick=()=>{
            showModal(t('titleResign'),t('confirmResign'),[
                {text:'OK',bg:'bg-blue-600 hover:bg-blue-500',onClick:async()=>{requestChessResignAction();}},
                {text:'Cancel',bg:'bg-purple-600 hover:bg-purple-500',close:true}
            ]);
        };
        $('offerDrawBtn').onclick=()=>requestChessDrawOfferAction();
        $('flipBoardBtn').onclick=()=>{gameState.chessManualFlip=!chessBoardIsFlipped();renderTableUI();};
        $('chessBoard').addEventListener('click',e=>{
            const sq=e.target.closest('.chess-square');
            if(sq?.dataset.square)handleChessSquareClick(sq.dataset.square);
        });
    }
});
