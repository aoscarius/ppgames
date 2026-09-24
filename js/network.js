/* ========================================================================
   P2P NETWORK - authoritative host, client snapshots, failover
   ======================================================================== */

function getPeerOptions(){
    const ice = Array.isArray(window.P2P_ICE_SERVERS) && window.P2P_ICE_SERVERS.length
        ? window.P2P_ICE_SERVERS
        : [
            {urls:'stun:stun.l.google.com:19302'},
            {urls:'stun:stun1.l.google.com:19302'}
        ];
    return {debug:1, config:{iceServers:ice, sdpSemantics:'unified-plan'}};
}

function publicStateFor(peerId){
    const copy=JSON.parse(JSON.stringify(gameState));
    copy.deck=[];
    copy.isHost=false;
    copy.myPlayerId=null;
    copy.myPlayerName='';
    copy.hostId=gameState.hostId;
    copy.network={hostId:gameState.hostId,roomId:gameState.roomId,connectedPlayerIds:getConnectedPlayerIds()};
    const revealAll=copy.phase==='SHOWDOWN';
    copy.players.forEach(p=>{
        if(!p?.cards)return;
        const mine=p.id===peerId;
        const shown=revealAll&&!p.folded;
        if(!mine&&!shown)p.cards=p.cards.map(()=>null);
    });
    return copy;
}

function fullHostStateFor(){
    const copy=JSON.parse(JSON.stringify(gameState));
    copy.network={hostId:gameState.hostId,roomId:gameState.roomId,connectedPlayerIds:getConnectedPlayerIds()};
    copy.isHost=true;
    copy.myPlayerId=gameState.myPlayerId;
    copy.deck=gameState.deck;
    return copy;
}

function getConnectedPlayerIds(){
    return Object.values(peerConnections).filter(c=>c?.open).map(c=>c.peer);
}

function sendTo(conn,payload){if(conn?.open){try{conn.send(payload);}catch(e){logMessage(`Send error: ${e.message}`,'error');}}}
function broadcastPacket(packet){Object.values(peerConnections).forEach(c=>sendTo(c,packet));}

function broadcastState(){
    if(!gameState.isHost)return;
    Object.values(peerConnections).forEach(c=>{
        if(c?.open)sendTo(c,{type:'STATE_UPDATE',roomId:gameState.roomId,state:publicStateFor(c.peer)});
    });
    syncBackupHost();
}

function chooseBackupPlayer(){
    const connected=new Set(getConnectedPlayerIds());
    return gameState.players
        .map((p,i)=>({p,i}))
        .filter(x=>x.p&&!x.p.isBot&&x.p.id!==gameState.myPlayerId&&connected.has(x.p.id))
        .sort((a,b)=>a.i-b.i)[0]?.p||null;
}

function syncBackupHost(){
    if(!gameState.isHost)return;
    const backup=chooseBackupPlayer();
    gameState.backupHostId=backup?.id||null;
    const conn=backup?peerConnections[backup.id]:null;
    if(conn?.open)sendTo(conn,{type:'BACKUP_STATE',roomId:gameState.roomId,state:fullHostStateFor(),backupHostId:backup.id});
}

function setRoomConnectionStatus(online=false,textKey=null){
    const badge=document.getElementById('roomStatusBadge');
    if(!badge)return;
    badge.classList.toggle('text-emerald-400',online);
    badge.classList.toggle('text-rose-400',!online);
    badge.classList.toggle('text-amber-400',!online);
    badge.textContent=textKey?t(textKey):(online?t('online'):t('connecting'));
}

function clearJoinHandshakeTimer(){
    if(joinHandshakeTimer){clearTimeout(joinHandshakeTimer);joinHandshakeTimer=null;}
}

function applySyncedState(incoming){
    if(!incoming)return;
    const keepId=gameState.myPlayerId;
    const keepName=gameState.myPlayerName;
    const keepRoom=gameState.roomId||incoming.roomId;
    const keepHost=gameState.isHost;
    Object.assign(gameState,incoming);
    gameState.roomId=keepRoom;
    gameState.myPlayerId=keepId;
    gameState.myPlayerName=keepName;
    gameState.isHost=keepHost;
    gameState.players=new Array(8).fill(null).map((_,i)=>incoming.players?.[i]||null);
    if(!gameState.chatHistory)gameState.chatHistory=[];
    if(!gameState.logHistory)gameState.logHistory=[];
    renderTableUI();
    renderRoomHistory();
    scheduleBot();
}

function hostHandleAction(data,conn){
    if(!gameState.isHost||data.roomId!==gameState.roomId)return;
    const seat=gameState.players.findIndex(p=>p?.id===data.playerId);
    if(seat<0||gameState.players[seat].isBot)return;
    const result=data.action==='draw'
        ?processDraw(gameState,seat,data.indices||[])
        :processAction(gameState,seat,data.action,data.amount);
    if(!result.ok)sendTo(conn,{type:'ACTION_ERROR',message:result.error});
    broadcastState();renderTableUI();scheduleBot();
}

function handleJoin(data,conn){
    if(!gameState.isHost)return;
    if(data.roomId!==gameState.roomId||data.gameId!==gameState.gameId){sendTo(conn,{type:'JOIN_ERROR',message:t('invalidGame')});return;}
    if(!data.player?.id||!data.player?.name){sendTo(conn,{type:'JOIN_ERROR',message:t('invalidGame')});return;}
    if(data.player.id!==conn.peer){sendTo(conn,{type:'JOIN_ERROR',message:t('invalidGame')});return;}
    if(gameState.kickedPeerIds?.includes(data.player.id)){sendTo(conn,{type:'JOIN_ERROR',message:t('kickedFromTable')});try{conn.close();}catch{};return;}

    let seat=gameState.players.findIndex(p=>p?.id===data.player.id);
    if(seat<0){
        const empty=gameState.players.findIndex((p,i)=>!p&&i<gameState.maxSeats);
        if(gameState.status==='lobby'&&empty>=0){
            seat=empty;
            gameState.players[seat]={...data.player,chips:gameState.startingStack,currentBet:0,folded:false,isBot:false,cards:[]};
            appendChatMessage('System',`${data.player.name} joined Seat ${seat+1}.`,true);
        }else if(gameState.status==='lobby'&&gameState.players.filter(Boolean).length>=gameState.maxSeats){
            sendTo(conn,{type:'JOIN_ERROR',message:t('roomFull')});try{conn.close();}catch{};return;
        }else{
            const spectator=gameState.spectators.findIndex(p=>p?.id===data.player.id);
            if(spectator<0)gameState.spectators.push(data.player);
            seat=-1;
        }
    }else{
        // Reconnection: keep the authoritative seat/stack/cards, but refresh the display name.
        gameState.players[seat].name=data.player.name;
        gameState.players[seat].disconnected=false;
    }

    peerConnections[conn.peer]=conn;
    roomJoinConfirmed=true;
    sendTo(conn,{
        type:'JOIN_ACCEPTED',
        roomId:gameState.roomId,
        playerId:data.player.id,
        seat,
        state:publicStateFor(data.player.id)
    });
    broadcastState();
    renderTableUI();
    syncBackupHost();
}

function handleNetworkData(data,conn){
    if(!data)return;
    if(data.type==='JOIN_REQUEST'){handleJoin(data,conn);return;}
    if(data.roomId&&data.roomId!==gameState.roomId)return;

    if(data.type==='ACTION_REQUEST'&&gameState.isHost)hostHandleAction(data,conn);
    else if(data.type==='START_REQUEST'&&gameState.isHost)startHand();
    else if(data.type==='TABLE_CONFIG'&&gameState.isHost&&gameState.status==='lobby'){
        const r=applyTableConfig(data.config);if(r.ok){broadcastState();renderTableUI();}
    }
    else if(data.type==='CHAT'){
        if(gameState.isHost){
            if(conn.peer!==data.senderId)return;
            const sender=gameState.players.find(p=>p?.id===data.senderId);
            if(!sender)return;
            appendChatMessage(sender.name,data.text,false);
            broadcastPacket({type:'CHAT',roomId:gameState.roomId,senderId:sender.id,sender:sender.name,text:data.text});
        }else if(data.senderId!==gameState.myPlayerId){
            appendChatMessage(data.sender,data.text,false);
        }
    }
    else if(data.type==='KICK'&&!gameState.isHost){
        if(data.playerId===gameState.myPlayerId){
            clearHostRecovery();
            gameState.kicked=true;
            disconnectNetwork();
            appendChatMessage('System',t('kickedFromTable'),true);
            setTimeout(()=>showScreen('welcomeScreen'),350);
        }else{
            const i=gameState.players.findIndex(p=>p?.id===data.playerId);
            if(i>=0)gameState.players[i]=null;
            appendChatMessage('System',data.message||t('playerKicked'),true);
            renderTableUI();
        }
    }
    else if(data.type==='JOIN_ACCEPTED'){
        if(gameState.isHost||data.roomId!==gameState.roomId||data.playerId!==gameState.myPlayerId)return;
        clearJoinHandshakeTimer();
        roomJoinConfirmed=true;
        gameState.kicked=false;
        gameState.hostId=gameState.roomId;
        applySyncedState(data.state);
        setRoomConnectionStatus(true);
        renderTableUI();
    }
    else if(data.type==='WELCOME_SYNC'||data.type==='STATE_UPDATE'){
        if(data.roomId!==gameState.roomId)return;
        applySyncedState(data.state);
        if(!gameState.isHost)ensureHostConnection();
    }
    else if(data.type==='BACKUP_STATE'){
        if(data.roomId===gameState.roomId)gameState.backupState=data.state;
    }
    else if(data.type==='HOST_ANNOUNCE'){
        if(data.roomId===gameState.roomId&&!gameState.isHost){gameState.hostId=data.hostId;scheduleHostRecovery(250);}
    }
    else if(data.type==='JOIN_ERROR'){
        clearJoinHandshakeTimer();
        roomJoinConfirmed=false;
        alert(data.message);
        disconnectNetwork();
        showScreen('welcomeScreen');
    }
    else if(data.type==='ACTION_ERROR')alert(data.message);
}

function applyTableConfig(config={}){
    const currency=config.currency==='EUR'?'EUR':'USD';
    const startingStack=Number(config.startingStack);
    const maxSeats=Math.max(2,Math.min(8,Math.floor(Number(config.maxSeats))));
    const smallBlind=Number(config.smallBlind), bigBlind=Number(config.bigBlind);
    const variant=config.variant==='5card'?'5card':'holdem';
    if(!Number.isFinite(startingStack)||startingStack<=0)return {ok:false,error:t('stackError')};
    if(!Number.isFinite(maxSeats)||maxSeats<2||maxSeats>8)return {ok:false,error:t('minMaxSeats')};
    if(!Number.isFinite(smallBlind)||smallBlind<=0||!Number.isFinite(bigBlind)||bigBlind<smallBlind)return {ok:false,error:t('blindsError')};
    gameState.currency=currency;gameState.startingStack=startingStack;gameState.maxSeats=maxSeats;
    gameState.smallBlind=smallBlind;gameState.bigBlind=bigBlind;gameState.minRaise=bigBlind;gameState.variant=variant;
    gameState.players.forEach(p=>{if(p&&gameState.status==='lobby')p.chips=startingStack;});
    return {ok:true};
}

function initHostLocally(username){
    gameState.isHost=true;gameState.myPlayerName=username;gameState.myPlayerId=generateId();
    gameState.hostId=gameState.myPlayerId;gameState.roomId=gameState.myPlayerId;gameState.gameId='poker';gameState.gameName='Poker';
    gameState.kickedPeerIds=[];gameState.kicked=false;gameState.backupHostId=null;gameState.spectators=[];
    loadRoomHistory();
    gameState.players=new Array(8).fill(null);
    gameState.players[0]={id:gameState.myPlayerId,name:username,chips:gameState.startingStack,currentBet:0,folded:false,isBot:false,cards:[]};
    history.pushState({},'',`${location.pathname}?room=${encodeURIComponent(gameState.roomId)}`);
    renderTableUI();
}

function removeDisconnectedPlayer(peerId){
    const i=gameState.players.findIndex(p=>p?.id===peerId);
    if(i<0)return;
    const name=gameState.players[i]?.name||'Player';
    if(gameState.status==='lobby')gameState.players[i]=null;
    else {
        const p=gameState.players[i];
        if(p&&!p.folded&&!p.out){
            p.disconnected=true;p.folded=true;p.actedThisRound=true;p.lastAction='Disconnected';
            if(gameState.activeTurnSeat===i)advanceAfterAction(gameState);
        }
    }
    appendChatMessage('System',`${name} disconnected.`,true);
}

function onHostConnectionClosed(peerId){
    delete peerConnections[peerId];
    if(!gameState.isHost)return;
    removeDisconnectedPlayer(peerId);
    broadcastState();renderTableUI();syncBackupHost();
}

function attachHostConnection(conn){
    peerConnections[conn.peer]=conn;
    conn.on('open',()=>{
        if(!gameState.isHost){conn.close();return;}
        logMessage(`Incoming peer connection: ${conn.peer}`,'success');
        // Do not sync an empty/pre-join snapshot here. The JOIN_REQUEST is the
        // authoritative handshake and handleJoin() sends JOIN_ACCEPTED + state.
    });
    conn.on('data',d=>handleNetworkData(d,conn));
    conn.on('close',()=>onHostConnectionClosed(conn.peer));
    conn.on('error',e=>logMessage(`Peer connection: ${e.type}`,'error'));
}

function initPeerNetwork(){
    if(peerInstance)try{peerInstance.destroy();}catch{}
    peerInstance=new Peer(gameState.roomId,getPeerOptions());
    peerInstance.on('open',id=>{gameState.hostId=id;document.getElementById('roomStatusBadge')?.classList.remove('text-rose-400');document.getElementById('roomStatusBadge')?.classList.add('text-emerald-400');document.getElementById('roomStatusBadge').textContent=t('online');logMessage(`Room online: ${id}`,'success');});
    peerInstance.on('connection',attachHostConnection);
    peerInstance.on('error',e=>logMessage(`PeerJS: ${e.type}`,'error'));
    peerInstance.on('disconnected',()=>{if(gameState.isHost)peerInstance.reconnect();});
}

function connectToHost(roomId){
    if(!peerInstance||peerInstance.destroyed)return;
    const old=peerConnections[roomId];if(old)try{old.close();}catch{}
    const conn=peerInstance.connect(roomId,{reliable:true,serialization:'json'});
    peerConnections[roomId]=conn;
    conn.on('open',()=>{
        clearHostRecovery();
        setRoomConnectionStatus(false,'connecting');
        sendTo(conn,{type:'JOIN_REQUEST',roomId,gameId:'poker',player:{id:gameState.myPlayerId,name:gameState.myPlayerName,chips:gameState.startingStack,currentBet:0,folded:false,isBot:false,cards:[]}});
    });
    conn.on('data',d=>handleNetworkData(d,conn));
    conn.on('close',()=>{delete peerConnections[roomId];if(!gameState.isHost&&!gameState.kicked)scheduleHostRecovery();});
    conn.on('error',e=>logMessage(`Host connection: ${e.type}`,'error'));
}

function joinRoomPeer(roomId,username){
    disconnectNetwork();
    clearJoinHandshakeTimer();
    roomJoinConfirmed=false;
    gameState.isHost=false;
    gameState.myPlayerName=username;
    gameState.myPlayerId=generateId();
    gameState.roomId=roomId;
    gameState.hostId=roomId;
    gameState.gameId='poker';
    gameState.kicked=false;
    gameState.status='lobby';
    gameState.phase='LOBBY WAITING';
    gameState.stage='lobby';
    gameState.players=new Array(8).fill(null);
    gameState.communityCards=[];
    gameState.pot=0;
    gameState.currentBet=0;
    gameState.currentHighBet=0;
    loadRoomHistory();
    setRoomConnectionStatus(false,'connecting');
    renderTableUI();
    peerInstance=new Peer(gameState.myPlayerId,getPeerOptions());
    peerInstance.on('open',()=>{
        logMessage(`Peer online: ${gameState.myPlayerId}`,'success');
        connectToHost(roomId);
    });
    peerInstance.on('connection',conn=>{if(gameState.isHost)attachHostConnection(conn);});
    peerInstance.on('error',e=>{
        logMessage(`PeerJS: ${e.type}`,'error');
        if(e.type==='network'||e.type==='disconnected')scheduleHostRecovery();
    });
    joinHandshakeTimer=setTimeout(()=>{
        joinHandshakeTimer=null;
        if(!roomJoinConfirmed&&!gameState.kicked){
            logMessage('Room handshake timed out. Retrying host connection.','error');
            connectToHost(roomId);
        }
    },7000);
}

function disconnectNetwork(){
    clearJoinHandshakeTimer();
    roomJoinConfirmed=false;
    Object.values(peerConnections).forEach(c=>{try{c.close();}catch{}});
    peerConnections={};
    if(peerInstance){try{peerInstance.destroy();}catch{}peerInstance=null;}
}

function clearHostRecovery(){
    if(hostRecoveryTimer){clearTimeout(hostRecoveryTimer);hostRecoveryTimer=null;}
    hostRecoveryInProgress=false;
}

function isPromotionCandidate(){
    if(gameState.isHost||!gameState.players.length)return false;
    const oldHostId=gameState.hostId||gameState.roomId;
    const first=gameState.players.map((p,i)=>({p,i})).filter(x=>x.p&&!x.p.isBot&&x.p.id!==oldHostId).sort((a,b)=>a.i-b.i)[0];
    return !!first && first.p.id===gameState.myPlayerId;
}

function scheduleHostRecovery(delay=700){
    if(gameState.isHost||gameState.kicked||hostRecoveryInProgress)return;
    if(hostRecoveryTimer)clearTimeout(hostRecoveryTimer);
    hostRecoveryTimer=setTimeout(startHostRecovery,delay);
}

function startHostRecovery(){
    hostRecoveryTimer=null;
    if(gameState.isHost||gameState.kicked)return;
    hostRecoveryInProgress=true;
    if(isPromotionCandidate())promoteToHost();
    else reconnectToPromotedHost(0);
}

function reconnectToPromotedHost(attempt=0){
    if(gameState.isHost||gameState.kicked)return;
    const max=12;
    if(attempt>=max){hostRecoveryInProgress=false;logMessage('Unable to reconnect to the table host.','error');return;}
    setTimeout(()=>{
        if(gameState.isHost||gameState.kicked)return;
        connectToHost(gameState.roomId);
        setTimeout(()=>{if(!gameState.isHost&&Object.values(peerConnections).every(c=>!c?.open))reconnectToPromotedHost(attempt+1);},900);
    },attempt*450);
}

function promoteToHost(){
    const snapshot=gameState.backupState||gameState;
    const oldHostId=gameState.hostId||gameState.roomId;
    const preservedId=gameState.myPlayerId,preservedName=gameState.myPlayerName,roomId=gameState.roomId;
    if(peerInstance)try{peerInstance.destroy();}catch{}
    peerInstance=null;peerConnections={};
    Object.assign(gameState,JSON.parse(JSON.stringify(snapshot)));
    gameState.roomId=roomId;gameState.myPlayerId=preservedId;gameState.myPlayerName=preservedName;
    gameState.isHost=true;gameState.hostId=roomId;gameState.kicked=false;gameState.backupState=null;
    const oldHostSeat=gameState.players.findIndex(p=>p?.id===oldHostId);
    if(oldHostSeat>=0 && oldHostId!==preservedId){
        if(gameState.status==='lobby')gameState.players[oldHostSeat]=null;
        else {
            gameState.players[oldHostSeat].disconnected=true;gameState.players[oldHostSeat].folded=true;gameState.players[oldHostSeat].actedThisRound=true;gameState.players[oldHostSeat].lastAction='Host disconnected';
            if(gameState.activeTurnSeat===oldHostSeat)advanceAfterAction(gameState);
        }
    }
    const openHost=()=>{
        peerInstance=new Peer(roomId,getPeerOptions());
        peerInstance.on('open',()=>{hostRecoveryInProgress=false;gameState.hostId=roomId;logMessage('Host promoted after previous host disconnected.','success');broadcastPacket({type:'HOST_ANNOUNCE',roomId,hostId:roomId});broadcastState();renderTableUI();scheduleBot();});
        peerInstance.on('connection',attachHostConnection);
        peerInstance.on('error',e=>{
            if(e.type==='unavailable-id'){try{peerInstance.destroy();}catch{}setTimeout(openHost,800);return;}
            logMessage(`Promoted host PeerJS: ${e.type}`,'error');
        });
        peerInstance.on('disconnected',()=>peerInstance.reconnect());
    };
    openHost();
}

function ensureHostConnection(){
    if(gameState.isHost||gameState.kicked)return;
    const hostConn=peerConnections[gameState.hostId||gameState.roomId];
    if(!hostConn?.open)connectToHost(gameState.hostId||gameState.roomId);
}

function kickPlayer(playerId){
    if(!gameState.isHost||!playerId||playerId===gameState.myPlayerId)return;
    const p=gameState.players.find(x=>x?.id===playerId);
    if(!p)return;
    gameState.kickedPeerIds=Array.isArray(gameState.kickedPeerIds)?gameState.kickedPeerIds:[];
    if(!gameState.kickedPeerIds.includes(playerId))gameState.kickedPeerIds.push(playerId);
    sendTo(peerConnections[playerId],{type:'KICK',roomId:gameState.roomId,playerId,message:t('playerKicked')});
    try{peerConnections[playerId]?.close();}catch{}
    const i=gameState.players.findIndex(x=>x?.id===playerId);if(i>=0)gameState.players[i]=null;
    appendChatMessage('System',`${p.name} ${t('playerKicked')}.`,true);
    broadcastState();renderTableUI();
}

function startHand(){
    if(!gameState.isHost)return;
    const r=initHand(gameState);if(!r.ok){alert(r.error);return;}
    appendChatMessage('System',`Hand #${gameState.handNumber} started. Blinds ${money(gameState,gameState.smallBlind)}/${money(gameState,gameState.bigBlind)}.`,true);
    broadcastState();renderTableUI();scheduleBot();
}

function requestAction(action,amount=0,indices=[]){
    if(gameState.isHost){
        const seat=gameState.players.findIndex(p=>p?.id===gameState.myPlayerId);
        const r=action==='draw'?processDraw(gameState,seat,indices):processAction(gameState,seat,action,amount);
        if(!r.ok){alert(r.error);return;}
        broadcastState();renderTableUI();scheduleBot();
    }else{
        const host=peerConnections[gameState.hostId||gameState.roomId];
        if(host?.open)sendTo(host,{type:'ACTION_REQUEST',roomId:gameState.roomId,playerId:gameState.myPlayerId,action,amount,indices});
        else scheduleHostRecovery();
    }
}
