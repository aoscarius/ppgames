/* ========================================================================
   EVENT LISTENERS - DOM event wiring and app bootstrap
   ======================================================================== */

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

    if(room){
        document.getElementById('contextActionContainer').innerHTML=`<button id="joinTableBtn" class="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow transition flex items-center justify-center gap-2"><i class="fa-solid fa-right-to-bracket"></i><span>${t('joinBtn')} Table (${room})</span></button>`;
        document.getElementById('joinTableBtn').onclick=()=>enterGameSelection(false);
    } else {
        // "Create New Table (Host)": become the host (initHostLocally) and go
        // live on the P2P network (initPeerNetwork), then swap from the
        // welcome screen to the game screen.
        document.getElementById('createTableBtn').onclick=()=>enterGameSelection(true);
    }
    // "Join" with a manually-typed room ID (as opposed to the invite-link
    // shortcut above).
    document.getElementById('manualJoinBtn').onclick=()=>{
        const r=document.getElementById('joinRoomInput').value.trim();
        if(!r)return alert('Enter a Room ID');
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

    document.getElementById('startGameBtn').onclick=startHand;
    document.getElementById('variantSelect').onchange=e=>{
        if(gameState.isHost&&gameState.status==='lobby'){
            gameState.variant=e.target.value;broadcastState();renderTableUI();
        }
    };
    document.getElementById('addBotBtn').onclick=()=>{
        if (!gameState.isHost||gameState.status!=='lobby') return;
        const i=gameState.players.findIndex((p,idx)=>!p&&idx<gameState.maxSeats);
        if (i<0) return alert('Table is full');
        const names = [
            'BluffBot', 'HoldemAI', 'Stacker', 'AceBot', 'ChipMaster',
            'DeepStack', 'NeuralFold', 'AlgoReraise', 'QuantumRiver', 'ByteBluff', 'CyberDealer', 'NashBot',
            'NutFlush', 'FullHouseAI', 'PocketAces', 'RoyalBot', 'KickerAI', 'DeadMansHand',
            'SharkMind', 'CheckRaise', 'ShowdownBot', 'VPIP_Master', 'SlowPlay', 'TiltProof', 'GTO_Matrix',
            'HighRoller', 'StackOverflow', 'AllInAndroid', 'BigBlind', 'FeltStripper', 'MuckMachine'
        ];
        gameState.players[i]={id:'bot-'+generateId(),name:names[Math.floor(Math.random()*names.length)],chips:gameState.startingStack,currentBet:0,folded:false,isBot:true,cards:[]};
        broadcastState();
        renderTableUI();
    };
    document.getElementById('removeBotBtn').onclick=()=>{
        if(!gameState.isHost||gameState.status!=='lobby')return;
        const i=gameState.players.findLastIndex(p=>p?.isBot&&gameState.players.indexOf(p)<gameState.maxSeats);
        if(i>=0){
            gameState.players[i]=null;
            broadcastState();
            renderTableUI();
        }
    };

    // Player action buttons: each simply calls requestAction() (network.js),
    // which either applies the action locally (if we're the host) or asks
    // the host to apply it (if we're a client). The check/call button
    // figures out which of the two actions actually applies based on
    // whether the local player is currently facing a bet.
    document.getElementById('foldBtn').onclick=()=>requestAction('fold');
    document.getElementById('checkCallBtn').onclick=()=>{
        const s=gameState.players.findIndex(p=>p?.id===gameState.myPlayerId);
        requestAction(gameState.currentHighBet>(gameState.players[s]?.currentBet||0)?'call':'check');
    };
    document.getElementById('raiseBtn').onclick=()=>requestAction('raise',Number(document.getElementById('raiseInput').value));

    // Copy the current page URL (which contains the ?room= invite link
    // once hosting has started) to the clipboard so it can be shared;
    // falls back to showing it in an alert if clipboard access fails.
    document.getElementById('shareRoomBtn').onclick=async()=>{
        try{
            await navigator.clipboard.writeText(location.href);
            alert('Invite link copied!');
        } catch {
            alert(location.href);
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
        const packet={type:'CHAT',roomId:gameState.roomId,sender:gameState.myPlayerName,text:tt};
        appendChatMessage(gameState.myPlayerName,tt);
        if(gameState.isHost)broadcastPacket(packet);
        else{
            const host=Object.values(peerConnections)[0];
            if(host?.open)host.send(packet);
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
    const m=el.className.match(/draw-card-(\d+)/);if(!m)return;const i=Number(m[1]);if(drawSelection.has(i))drawSelection.delete(i);else drawSelection.add(i);el.classList.toggle('ring-4');el.classList.toggle('ring-purple-400');
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
