/* ========================================================================
   EVENT LISTENERS - DOM event wiring and app bootstrap
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

// Wire up every static DOM control on the page to its handler. Called
// once on startup (see the DOMContentLoaded listener at the bottom).
function setupEventListeners(){
    // Welcome screen: live-update the avatar preview as the user types
    // their username, so they see the avatar they're about to use.
    const input=document.getElementById('usernameInput'),avatar=document.getElementById('welcomeAvatarPreview');
    input.addEventListener('input',e=>avatar.src=`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(e.target.value.trim()||'PokerPlayer')}`);

    // If the page was opened via an invite link (?room=<id>), show a
    // one-click "Join Table" button pre-targeting that room instead of
    // making the user paste the room ID manually.
    const room=new URLSearchParams(location.search).get('room');
    const enterGameSelection=(hostMode)=>{
        gameState.isHost=hostMode;
        gameState.myPlayerName=input.value.trim()||'PokerPlayer';
        gameState.gameId='poker';
        gameState.gameName='Poker';
        showScreen('gameSelectionScreen');
    };

    const createBtn=document.getElementById('createTableBtn');
    const manualJoinContainer=document.getElementById('manualJoinContainer');
    if(room){
        // A shared room link is a join context, never a host/create context.
        // The old code replaced createTableBtn and then immediately tried to
        // access it again, throwing a TypeError and aborting all later listeners.
        document.getElementById('contextActionContainer').innerHTML=`<button id="joinTableBtn" class="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow transition flex items-center justify-center gap-2"><i class="fa-solid fa-right-to-bracket"></i><span>${t('joinBtn')} Table (${room})</span></button>`;
        document.getElementById('joinTableBtn').onclick=()=>enterGameSelection(false);
        if(manualJoinContainer)manualJoinContainer.classList.add('hidden');
    }else if(createBtn){
        // "Create New Table (Host)": become the host (initHostLocally) and go
        // live on the P2P network (initPeerNetwork), then swap from the
        // welcome screen to the game screen.
        createBtn.onclick=()=>enterGameSelection(true);
    }
    // "Join" with a manually-typed room ID (as opposed to the invite-link
    // shortcut above).
    document.getElementById('manualJoinBtn').onclick=()=>{
        const r=document.getElementById('joinRoomInput').value.trim();
        if(!r)return showAlert('Enter a Room ID', 'Empty/Invalid id entered. Paste only the part after ?room=');
        history.replaceState({},'',`${location.pathname}?room=${encodeURIComponent(r)}`);
        enterGameSelection(false);
    };

    document.querySelectorAll('.game-choice[data-game-id]').forEach(btn=>{
        btn.addEventListener('click',()=>{
            if(btn.disabled)return;
            gameState.gameId=btn.dataset.gameId;
            gameState.gameName=selectedGameLabel(gameState.gameId);
            document.querySelectorAll('.game-choice').forEach(x=>x.classList.remove('ring-2','ring-emerald-400'));
            btn.classList.add('ring-2','ring-emerald-400');
        });
    });
    document.querySelector('.game-choice[data-game-id="poker"]')?.classList.add('ring-2','ring-emerald-400');

    document.getElementById('gameSelectionBackBtn').onclick=()=>showScreen('welcomeScreen');
    document.getElementById('gameSelectionContinueBtn').onclick=()=>{
        if(gameState.gameId!=='poker')return;
        if(gameState.isHost){
            openPokerConfig();
        }else{
            const r=new URLSearchParams(location.search).get('room');
            if(!r)return showScreen('welcomeScreen');
            joinRoomPeer(r,input.value.trim()||'PokerPlayer');
            showScreen('gameScreen');
            renderTableUI();
        }
    };

    document.getElementById('pokerConfigBackBtn').onclick=()=>showScreen('gameSelectionScreen');
    document.getElementById('pokerConfigContinueBtn').onclick=()=>{
        const cfg=readPokerConfig(), err=validatePokerConfig(cfg);
        const box=document.getElementById('configError');
        if(err){box.textContent=err;box.classList.remove('hidden');return;}
        const r=applyTableConfig(cfg);
        if(!r.ok){box.textContent=r.error;box.classList.remove('hidden');return;}
        initHostLocally(input.value.trim()||'PokerPlayer');
        initPeerNetwork();
        showScreen('gameScreen');
        renderTableUI();
    };

    document.getElementById('startGameBtn').onclick=()=>{if(gameState.isHost)startHand();};

    document.addEventListener('click',e=>{
        const add=e.target.closest('[data-add-bot]');
        if(add&&gameState.isHost&&gameState.status==='lobby'){
            const seat=Number(add.dataset.addBot);
            if(!Number.isInteger(seat)||seat<0||seat>=gameState.maxSeats||gameState.players[seat])return;
            gameState.players[seat]={id:'bot-'+generateId(),name:proceduralNameGenerator().next().value + 'Bot',chips:gameState.startingStack,currentBet:0,folded:false,isBot:true,cards:[]};
            broadcastState();renderTableUI();
            return;
        }
        const remove=e.target.closest('[data-remove-bot]');
        if(remove&&gameState.isHost&&gameState.status==='lobby'){
            const seat=Number(remove.dataset.removeBot);
            if(gameState.players[seat]?.isBot){gameState.players[seat]=null;broadcastState();renderTableUI();}
            return;
        }
        const kick=e.target.closest('[data-kick-player]');
        if(kick&&gameState.isHost&&!kick.disabled){
            const id=kick.dataset.kickPlayer;
            if(id&&id!==gameState.myPlayerId&&confirm(t('confirmKick'))){kickPlayer(id);}
        }
    });

    // Player action buttons: each simply calls requestAction() (network.js),
    // which either applies the action locally (if we're the host) or asks
    // the host to apply it (if we're a client). The check/call button
    // figures out which of the two actions actually applies based on
    // whether the local player is currently facing a bet.
    document.getElementById('drawBtn').onclick=()=>{requestAction('draw',0,[...drawSelection]);drawSelection.clear();};
    document.getElementById('foldBtn').onclick=()=>requestAction('fold');
    document.getElementById('checkCallBtn').onclick=()=>{
        const s=gameState.players.findIndex(p=>p?.id===gameState.myPlayerId);
        requestAction(gameState.currentHighBet>(gameState.players[s]?.currentBet||0)?'call':'check');
    };
    document.getElementById('raiseBtn').onclick=()=>requestAction('raise',Number(document.getElementById('raiseInput').value));
    document.getElementById('allInBtn').onclick=()=>requestAction('allin');

    // Copy the current page URL (which contains the ?room= invite link
    // once hosting has started) to the clipboard so it can be shared;
    // falls back to showing it in an showAlert if clipboard access fails.
    document.getElementById('shareRoomBtn').onclick=async()=>{
        try{
            await navigator.clipboard.writeText(location.href);
            showAlert('Invite link copied!', location.href);
        } catch {
            showAlert('Copy and share link:', location.href);
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


// Global delegated click handler for selecting/deselecting hole cards to
// discard during the 5-card draw variant's draw phase. Cards are marked
// with a `draw-card-N` class by renderTableUI() (ui.js) only for the
// local player's own cards while it's their draw turn; clicking one
// toggles its index in/out of the shared `drawSelection` set (state.js)
// and toggles a highlight ring so the selection is visible. The actual
// discard happens later when the Draw button is clicked (see ui.js).
document.addEventListener('click',e=>{
    const el=e.target.closest('[class*="draw-card-"]'); if(!el||gameState.stage!=='draw')return;
    const m=el.className.match(/draw-card-(\d+)/);if(!m)return;const i=Number(m[1]);if(drawSelection.has(i))drawSelection.delete(i);else drawSelection.add(i);el.classList.toggle('ring-6');el.classList.toggle('ring-blue-600');
});

// App bootstrap: once the DOM is ready, wire up all event listeners,
// apply the initial language translations, do the first render of the
// (empty/lobby) table, and log that startup completed.
window.addEventListener('DOMContentLoaded',()=>{
    setupEventListeners();
    updateStaticTranslations();
    showScreen('welcomeScreen');
    logMessage('P2P Game Engine with IT/EN localization initialized.','success');
});
