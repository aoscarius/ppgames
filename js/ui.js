function showScreen(id){
    ['welcomeScreen','gameSelectionScreen','pokerConfigScreen','gameScreen'].forEach(x=>document.getElementById(x)?.classList.add('hidden'));
    document.getElementById(id)?.classList.remove('hidden');
}
function selectedGameLabel(id){return id==='poker'?t('pokerGame'):id==='chess'?t('chessGame'):id==='othello'?t('othelloGame'):t('navalGame');}
function readPokerConfig(){
    return {
        currency:document.getElementById('currencySelect').value,
        startingStack:Number(document.getElementById('startingStackInput').value),
        maxSeats:Number(document.getElementById('maxSeatsSelect').value),
        variant:document.getElementById('variantConfigSelect').value,
        smallBlind:Number(document.getElementById('smallBlindInput').value),
        bigBlind:Number(document.getElementById('bigBlindInput').value)
    };
}
function validatePokerConfig(c){
    if(!Number.isFinite(c.startingStack)||c.startingStack<=0)return t('stackError');
    if(!Number.isInteger(c.maxSeats)||c.maxSeats<2||c.maxSeats>8)return t('minMaxSeats');
    if(!Number.isFinite(c.smallBlind)||c.smallBlind<=0||!Number.isFinite(c.bigBlind)||c.bigBlind<c.smallBlind)return t('blindsError');
    return '';
}
function openPokerConfig(){
    document.getElementById('currencySelect').value=gameState.currency;
    document.getElementById('startingStackInput').value=gameState.startingStack;
    document.getElementById('maxSeatsSelect').value=gameState.maxSeats;
    document.getElementById('variantConfigSelect').value=gameState.variant;
    document.getElementById('smallBlindInput').value=gameState.smallBlind;
    document.getElementById('bigBlindInput').value=gameState.bigBlind;
    document.getElementById('configError').classList.add('hidden');
    showScreen('pokerConfigScreen');
}

function getRadialSeatPosition(seatIndex,seatCount){
    const angle=(Math.PI/2)-(seatIndex*(Math.PI*2/seatCount));
    const rx=44,ry=40;
    return {left:`${50+Math.cos(angle)*rx}%`,top:`${50+Math.sin(angle)*ry}%`};
}
function positionPokerSeats(){
    const seatCount=Math.max(2,Math.min(8,gameState.maxSeats||8));
    for(let i=0;i<8;i++){
        const el=document.getElementById(`seat-${i}`);if(!el)continue;
        el.classList.toggle('hidden',i>=seatCount);
        if(i<seatCount){const pos=getRadialSeatPosition(i,seatCount);el.style.left=pos.left;el.style.top=pos.top;}
    }
}

function renderSeat(i){
    const el=document.getElementById(`seat-${i}`);if(!el)return;
    const p=gameState.players[i];
    el.classList.toggle('hidden',i>=gameState.maxSeats);
    el.classList.toggle('active-player',!!p&&gameState.activeTurnSeat===i&&gameState.status!=='lobby');
    if(i>=gameState.maxSeats)return;
    if(!p){
        const botControls=gameState.isHost?`<div class="seat-empty-actions"><button data-add-bot="${i}" title="${t('addBot')}" class="seat-mini-btn seat-add"><i class="fa-solid fa-plus"></i></button></div>`:'';
        el.innerHTML=`<div class="empty-seat"><span>${t('seat',{num:i+1})}</span>${botControls}</div>`;
        return;
    }
    const turn=gameState.status==='in-progress'&&gameState.activeTurnSeat===i;
    const local=p.id===gameState.myPlayerId;
    const isHost=p.id===gameState.hostId;
    const canKick=gameState.isHost&&p.id!==gameState.myPlayerId;
    let cards='';
    if(p.cards?.length){
        cards=`<div class="seat-cards">${p.cards.map((c,j)=>cardHTML(c,!local&&gameState.phase!=='SHOWDOWN',local&&gameState.stage==='draw'?`draw-card-${j}`:'')).join('')}</div>`;
    }
    const hostBadge=isHost?`<span class="host-badge" title="Host"><i class="fa-solid fa-crown"></i></span>`:'';
    const kick=gameState.isHost?`<button data-kick-player="${p.id}" ${canKick?'':'disabled'} title="${canKick?t('kickPlayer'):t('you')}" class="seat-kick ${canKick?'':'opacity-30 cursor-not-allowed'}"><i class="fa-solid fa-xmark"></i></button>`:'';
    const botRemove=gameState.isHost&&p.isBot?`<button data-remove-bot="${i}" title="${t('removeBot')}" class="seat-kick seat-bot-remove"><i class="fa-solid fa-minus"></i></button>`:'';
    el.innerHTML=`<div class="seat-player ${turn?'seat-turn':''}">\n        <div class="seat-card">\n            ${hostBadge}${kick}${botRemove}\n            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(p.name)}" class="seat-avatar" alt="${p.name}">\n            <div class="seat-name">${p.name}</div>\n            <div class="seat-stack">${money(gameState,p.chips)}</div>\n            ${cards}\n            ${p.folded?`<span class="seat-status seat-folded">${t('folded')}</span>`:''}\n            ${p.allIn?`<span class="seat-status seat-allin">${t('allIn')}</span>`:''}\n            ${p.evalResult&&gameState.phase==='SHOWDOWN'?`<span class="seat-hand">${localizedHandType(p.evalResult.typeName)}</span>`:''}\n        </div>\n    </div>`;
}

function renderTableUI(){
    try{
        positionPokerSeats();
        document.getElementById('potDisplay').textContent=money(gameState,gameState.pot);
        document.getElementById('currentBetDisplay').textContent=money(gameState,gameState.currentHighBet||gameState.currentBet||0);
        let phase=gameState.phase;
        if(phase==='LOBBY WAITING')phase=t('lobbyWaiting');
        else if(phase==='SHOWDOWN'&&gameState.showdownSummary)phase=gameState.showdownSummary;
        document.getElementById('gamePhaseText').textContent=phase;
        document.getElementById('variantLabel').textContent=gameState.variant==='holdem'?"Texas Hold'em":"5-Card Draw";
        const cfg=document.getElementById('tableConfigLabel');if(cfg)cfg.textContent=`${currencySymbol(gameState)}${gameState.startingStack} · ${gameState.maxSeats} ${t('players')} · ${money(gameState,gameState.smallBlind)}/${money(gameState,gameState.bigBlind)}`;
        const cc=document.getElementById('communityCards');
        cc.innerHTML=gameState.communityCards.length?gameState.communityCards.map(c=>cardHTML(c)).join(''):`<span class="text-slate-400 text-[11px] sm:text-xs italic">${gameState.status==='in-progress'?t('noCommunityCards'):t('waitingDealer')}</span>`;
        for(let i=0;i<8;i++)renderSeat(i);

        const mySeat=gameState.players.findIndex(p=>p?.id===gameState.myPlayerId),mine=gameState.players[mySeat];
        const myTurn=mySeat>=0&&gameState.activeTurnSeat===mySeat&&gameState.status==='in-progress';
        const drawPhase=myTurn&&gameState.stage==='draw';
        document.getElementById('foldBtn').disabled=!myTurn||drawPhase;
        document.getElementById('checkCallBtn').disabled=!myTurn||drawPhase;
        document.getElementById('raiseBtn').disabled=!myTurn||drawPhase;
        const check=document.getElementById('checkCallBtn');if(check)check.textContent=myTurn&&mine&&gameState.currentHighBet>mine.currentBet?t('call'):t('check');

        const startBtn=document.getElementById('startGameBtn');
        if(startBtn){startBtn.disabled=!gameState.isHost||gameState.status==='in-progress';startBtn.title=gameState.isHost?t('dealHand'):t('hostOnly');}
        const dealHint=document.getElementById('dealHint');if(dealHint)dealHint.textContent=gameState.isHost?t('hostReady'):t('hostOnly');
        document.getElementById('spectatorBanner').classList.toggle('hidden',!(mySeat<0&&gameState.status==='in-progress'));

        const sum=document.getElementById('playerHandSummary');
        if(gameState.status==='in-progress'){
            const activeP=gameState.players[gameState.activeTurnSeat],activeName=activeP?.name||'';
            sum.textContent=drawPhase?t('drawDiscardPrompt'):myTurn?t('yourTurn'):activeName?t('turnOf',{name:activeName}):t('waitingForAction');
        }else if(gameState.phase==='SHOWDOWN'&&gameState.showdownSummary)sum.textContent=gameState.showdownSummary;else sum.textContent='';

        let drawBtn=document.getElementById('drawBtn');
        if(!drawBtn){
            drawBtn=document.createElement('button');drawBtn.id='drawBtn';drawBtn.className='px-3 sm:px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-30 text-white text-xs font-extrabold transition';
            document.getElementById('actionControls').prepend(drawBtn);
            drawBtn.addEventListener('click',()=>{requestAction('draw',0,[...drawSelection]);drawSelection.clear();});
        }
        drawBtn.textContent=t('draw');drawBtn.disabled=!drawPhase;
        renderRoomHistory();
    }catch(e){logMessage(`Render error: ${e.message}`,'error');}
}
