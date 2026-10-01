/* ========================================================================
   CORE EVENTS - welcome / game-selection / lobby wiring, chat, drawers and
   app bootstrap. Game-specific listeners live in each game's game.js bind().
   ======================================================================== */

// Infinite procedural name generator.
// Generates natural-sounding generic names without category constraints.
function* proceduralNameGenerator() {
    const prefixes = ["Aethel", "Brim", "Cael", "Dread", "Elder", "Frost", "Gloom", "Grim", "Iron", "Kael", "Mith", "Nova", "Odin", "Shadow", "Storm", "Thorn", "Val", "Vance", "Void", "Zephyr"];
    const cores = ["arc", "ax", "bar", "cor", "dan", "dor", "fen", "fin", "gar", "hor", "karn", "lum", "mor", "pel", "ra", "rin", "stone", "thor", "tor", "vane"];
    const suffixes = ["born", "breaker", "crest", "fall", "fang", "fist", "forge", "glen", "heart", "hold", "keeper", "loom", "mantle", "more", "path", "ridge", "shaper", "spire", "vale", "weaver"];

    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

    while (true) {
        // Randomly choose between a 2-part name (Prefix+Suffix) or a 3-part name (Prefix+Core+Suffix)
        const name = Math.random() > 0.4 
            ? pick(prefixes) + pick(suffixes) 
            : pick(prefixes) + pick(cores) + pick(suffixes);

        yield name;
    }
}

// Create the room as host for the game that is currently selected, then
// enter the game screen. Called by the core (games without a setup step)
// or by a game's own setup screen once the host confirmed (poker config).
function createRoomNow(){
    const name=document.getElementById('usernameInput').value.trim()||'Player';
    initHostLocally(name);
    initPeerNetwork();
    showScreen('gameScreen');
    renderTableUI();
}

// Join a room as a client: download that game's module (if not already
// loaded), then connect. Shared by every entry point that joins a room --
// a direct invite link, pasting a room id, and the game-selection screen.
async function joinAsClient(roomId,gameId,username){
    await loadGame(gameId);
    joinRoomPeer(roomId,gameId,username);
    showScreen('gameScreen');
    renderTableUI();
}

// Download the selected game (once), then start hosting or joining it.
async function continueToGame(){
    const def=getGameDefinition(gameState.gameId);
    if(!def?.implemented)return;
    const btn=document.getElementById('gameSelectionContinueBtn');
    if(btn)btn.disabled=true;
    try{
        if(!gameState.isHost){
            const r=new URLSearchParams(location.search).get('room');
            if(!r)return showScreen('welcomeScreen');
            await joinAsClient(r,gameState.gameId,document.getElementById('usernameInput').value.trim()||'Player');
            return;
        }
        const game=await loadGame(gameState.gameId);
        gameState.maxSeats=def.maxPlayers;
        if(game.hostFlow)game.hostFlow();else createRoomNow();
    }catch(e){
        logMessage(`Could not load ${def.id}: ${e.message}`,'error');
        showAlert('Loading failed','Could not load the game files. Check your connection and try again.');
    }finally{
        if(btn)btn.disabled=false;
    }
}

// Wire up every static DOM control of the shell. Called once on startup.
function setupEventListeners(){
    // Welcome screen: live-update the avatar preview as the user types.
    const input=document.getElementById('usernameInput'),avatar=document.getElementById('welcomeAvatarPreview');
    input.addEventListener('input',e=>avatar.src=`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(e.target.value.trim()||'Player')}`);

    // Room ids are self-describing (see generateId() in core/utils.js:
    // "ppg<gameId>-xxxxx"), so an invite link (?room=<id>) already carries
    // which game it's for -- no separate query param needed. This lets a
    // joiner skip the game-selection screen entirely and land straight in
    // the right game/room.
    const room=new URLSearchParams(location.search).get('room');
    const linkedGame=room?.match(/^ppg(.*?)-/)?.[1] ?? null;

    const joinRoomDirect=(roomId,gameId)=>{
        if(!roomId||!GAME_REGISTRY[gameId]?.implemented)return false;
        gameState.gameId=gameId;
        gameState.gameName=selectedGameLabel(gameId);
        joinAsClient(roomId,gameId,input.value.trim()||'Player').catch(e=>{
            logMessage(`Could not join: ${e.message}`,'error');
            showAlert('Loading failed','Could not load the game files. Check your connection and try again.');
        });
        return true;
    };

    const enterGameSelection=(hostMode,gameId=null,roomId=room)=>{
        gameState.isHost=hostMode;
        gameState.myPlayerName=input.value.trim()||'Player';
        gameState.gameId=gameId||'poker';
        gameState.gameName=selectedGameLabel(gameState.gameId);

        if(!hostMode&&joinRoomDirect(roomId,gameId))return;
        document.querySelectorAll('.game-choice').forEach(x=>x.classList.remove('ring-2','ring-emerald-400'));
        document.querySelector(`.game-choice[data-game-id="${gameState.gameId}"]`)?.classList.add('ring-2','ring-emerald-400');
        showScreen('gameSelectionScreen');
    };

    const createBtn=document.getElementById('createTableBtn');
    const manualJoinContainer=document.getElementById('manualJoinContainer');
    if(room){
        // A shared room link is a join context, never a host/create context.
        document.getElementById('contextActionContainer').innerHTML=`<button id="joinTableBtn" class="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow transition flex items-center justify-center gap-2"><i class="fa-solid fa-right-to-bracket"></i><span>${t('joinBtn')} Table (${room})</span></button>`;
        document.getElementById('joinTableBtn').onclick=()=>enterGameSelection(false,linkedGame);
        if(manualJoinContainer)manualJoinContainer.classList.add('hidden');
    }else if(createBtn){
        createBtn.onclick=()=>enterGameSelection(true);
    }
    document.getElementById('manualJoinBtn').onclick=()=>{
        const r=document.getElementById('joinRoomInput').value.trim();
        const m=r.match(/^ppg(.*?)-/);
        if(!r||!m)return showAlert('Room ID Error','Empty/Invalid id entered. Paste only the part after ?room=');
        history.replaceState({},'',`${location.pathname}?room=${encodeURIComponent(r)}`);
        enterGameSelection(false,m[1],r);
    };

    // Game selection: cards come from the registry. Selecting a card starts
    // downloading that game in the background so "Continue" feels instant.
    renderGameChoices();
    document.getElementById('gameCards').addEventListener('click',e=>{
        const btn=e.target.closest('.game-choice[data-game-id]');
        if(!btn||btn.disabled)return;
        gameState.gameId=btn.dataset.gameId;
        gameState.gameName=selectedGameLabel(gameState.gameId);
        document.querySelectorAll('.game-choice').forEach(x=>x.classList.remove('ring-2','ring-emerald-400'));
        btn.classList.add('ring-2','ring-emerald-400');
        // loadGame(gameState.gameId).catch(()=>{});
    });
    document.querySelector('.game-choice[data-game-id="poker"]')?.classList.add('ring-2','ring-emerald-400');
    document.getElementById('gameSelectionBackBtn').onclick=()=>showScreen('welcomeScreen');
    document.getElementById('gameSelectionContinueBtn').onclick=continueToGame;

    // Reset Table: same button, same behavior, for every game (see
    // resetTable() in core/network.js). Visibility is toggled in
    // renderTableUI() (core/ui.js) whenever gameState.isHost changes.
    document.getElementById('resetTableBtn').onclick=()=>{
        if(!gameState.isHost)return;
        showModal(t('resetTable'),t('confirmResetTable'),[
            {text:'OK',bg:'bg-blue-600 hover:bg-blue-500',onClick:async()=>{resetTable();}},
            {text:'Cancel',bg:'bg-purple-600 hover:bg-purple-500',close:true}
        ]);
    };

    // Return to home button
    document.getElementById('headerGameIcon').onclick=()=>{
        window.location.href = window.location.origin + window.location.pathname;
    };

    // Lobby controls rendered by the games: add bot / remove bot / kick.
    document.addEventListener('click',e=>{
        const game=currentGame();
        const add=e.target.closest('[data-add-bot]');
        if(add&&game&&gameState.isHost&&gameState.status==='lobby'){
            const seat=Number(add.dataset.addBot);
            if(!Number.isInteger(seat)||seat<0||seat>=gameState.maxSeats||gameState.players[seat])return;
            gameState.players[seat]=game.createPlayer({id:'bot-'+generateId(gameState.gameId),name:proceduralNameGenerator().next().value+'Bot',isBot:true});
            broadcastState();renderTableUI();
            return;
        }
        const remove=e.target.closest('[data-remove-bot]');
        if(remove&&game&&gameState.isHost){
            const seat=Number(remove.dataset.removeBot);
            if(!Number.isInteger(seat))return;
            if(game.removeBot)game.removeBot(seat);
            else if(gameState.status==='lobby'&&gameState.players[seat]?.isBot){gameState.players[seat]=null;broadcastState();renderTableUI();}
            return;
        }
        const kick=e.target.closest('[data-kick-player]');
        if(kick&&gameState.isHost&&!kick.disabled){
            const id=kick.dataset.kickPlayer;
            if(id&&id!==gameState.myPlayerId){
                showModal(t('kickPlayer'),t('confirmKick'),[
                    {text:'OK',bg:'bg-blue-600 hover:bg-blue-500',onClick:async()=>{kickPlayer(id);}},
                    {text:'Cancel',bg:'bg-purple-600 hover:bg-purple-500',close:true}
                ]);
            }
        }
    });

    // Copy an invite link (?room=<id>, which self-describes the game -- see
    // generateId() in core/utils.js) to the clipboard so it can be shared;
    // falls back to showing it in a showAlert if clipboard access fails.
    // Built explicitly from gameState.roomId rather than trusting
    // location.href as-is, so it's correct even if the URL's own ?room=
    // is stale or missing.
    document.getElementById('shareRoomBtn').onclick=async()=>{
        const url=new URL(location.href);
        const roomId=gameState.roomId||url.searchParams.get('room');
        url.searchParams.set('room',roomId);
        try{
            await navigator.clipboard.writeText(url.href);
            showAlert('Invite link copied!', url.href);
        } catch {
            showAlert('Copy and share link:', url.href);
        }
    };

    // Language Toggle Switch Handler
    // Flip between English/Italian, refresh every static translated
    // string, then re-render the table so dynamic text picks it up too.
    document.getElementById('langToggleBtn').onclick = () => {
        currentLang = currentLang === 'en' ? 'it' : 'en';
        updateStaticTranslations();
        renderTableUI();
    };

    // Chat/logs side drawers: toggle visibility and clear their unread
    // badge counters when opened.
    const chat=document.getElementById('chatDrawer'),logs=document.getElementById('logsDrawer');
    document.getElementById('toggleChatBtn').onclick=()=>{chat.classList.toggle('translate-x-full');gameState.unreadChat=0;document.getElementById('chatBadge').classList.add('hidden');};
    document.getElementById('closeChatBtn').onclick=()=>chat.classList.add('translate-x-full');
    document.getElementById('toggleLogsBtn').onclick=()=>{logs.classList.toggle('translate-x-full');gameState.unreadLogs=0;document.getElementById('logsBadge').classList.add('hidden');};
    document.getElementById('closeLogsBtn').onclick=()=>logs.classList.add('translate-x-full');

    // Sending a chat message: show it locally right away, then relay it
    // over the network (broadcastPacket if we're the host so every client
    // gets it; if we're a client this reaches the host, which itself
    // relays CHAT packets on to everyone else -- see handleNetworkData()
    // in network.js).
    document.getElementById('chatForm').onsubmit=e=>{
        e.preventDefault();
        const x=document.getElementById('chatInput'),tt=x.value.trim();if(!tt)return;
        const packet={type:'CHAT',roomId:gameState.roomId,senderId:gameState.myPlayerId,sender:gameState.myPlayerName,text:tt};
        appendChatMessage(gameState.myPlayerName,tt);
        if(gameState.isHost)broadcastPacket(packet);
        else{
            const host=peerConnections[gameState.hostId||gameState.roomId];
            if(host?.open)sendTo(host,packet);
            else scheduleHostRecovery();
        }
        x.value='';
    };
}

// App bootstrap: once the DOM is ready, wire up the shell, apply the initial
// translations and show the welcome screen. No game code is loaded yet.
window.addEventListener('DOMContentLoaded',()=>{
    setupEventListeners();
    updateStaticTranslations();
    showScreen('welcomeScreen');
    logMessage('P2P Game Engine initialized.','success');
});
