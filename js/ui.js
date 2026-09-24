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

function getWinningPlayerIds(){
    if(gameState.phase !== 'SHOWDOWN') return new Set();

    const players = gameState.players.filter(Boolean).filter(p => p.evalResult);
    if(!players.length) return new Set();

    const bestScore = Math.max(...players.map(p => p.evalResult.score ?? -Infinity));
    return new Set(
        players
            .filter(p => (p.evalResult.score ?? -Infinity) === bestScore)
            .map(p => p.id)
    );
}

function renderSeat(i){
    const el=document.getElementById(`seat-${i}`); if(!el)return;
    const p=gameState.players[i];
    const winningPlayerIds = getWinningPlayerIds();
    const isWinner = !!p && winningPlayerIds.has(p.id);

    el.classList.toggle('hidden', i >= gameState.maxSeats);
    el.classList.toggle('active-player', !!p && gameState.activeTurnSeat === i && gameState.status !== 'lobby');

    if(i >= gameState.maxSeats)return;
    if(!p){
        const botControls=gameState.isHost?`<div class="seat-empty-actions"><button data-add-bot="${i}" title="${t('addBot')}" class="seat-mini-btn seat-add"><i class="fa-solid fa-plus"></i></button></div>`:'';
        el.innerHTML=`<div class="empty-seat"><span>${t('seat',{num:i+1})}</span>${botControls}</div>`;
        return;
    }

    const turn=gameState.status==='in-progress' && gameState.activeTurnSeat===i;
    const local=p.id===gameState.myPlayerId;
    const isHost=p.id===gameState.hostPlayerId;
    const canKick=gameState.isHost&&p.id!==gameState.myPlayerId;
    let cards='';

    if(p.cards?.length){
        const winningHand = gameState.phase === 'SHOWDOWN' && isWinner ? (p.evalResult?.bestCards || []) : [];
        const visible = !(!local && gameState.phase !== 'SHOWDOWN');

        cards = `<div class="seat-cards">${p.cards.map((c,j)=>{
            const winnerCard = visible && isWinningCard(c, winningHand) ? 'winner-card' : '';
            const drawCard = local && gameState.stage === 'draw' ? `draw-card-${j}` : '';
            return cardHTML(c, !visible, `${drawCard} ${winnerCard}`.trim());
        }).join('')}</div>`;
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
        document.getElementById('variantLabel').textContent=gameState.variant==='holdem'?"Texas Hold'em":"5-Card Draw";
        const cfg=document.getElementById('tableConfigLabel');if(cfg)cfg.textContent=`${currencySymbol(gameState)}${gameState.startingStack} · ${gameState.maxSeats} ${t('players')} · ${money(gameState,gameState.smallBlind)}/${money(gameState,gameState.bigBlind)}`;
        const cc=document.getElementById('communityCards');
        // A community card can be part of several tied winners' hands. Build
        // one shared set so the board highlights any community card used by
        // at least one winning combination.
        // IMPORTANT: every player who reaches showdown gets an `evalResult`
        // (winners AND losers -- see resolveShowdown() in game-logic.js,
        // which scores everyone before picking the best score). Looping
        // over gameState.players here without filtering to winners would
        // union in every *loser's* best-5 combo too, each of which can
        // legitimately use a different subset of the community cards --
        // so the board would end up highlighting cards that were never
        // part of the actual winning hand at all, looking like "more than
        // 5 cards" were used to win. Restrict to winningPlayerIds so only
        // the real winner(s)' combination(s) are ever highlighted.
        const winningCommunityCards=new Set();
        if(gameState.phase==='SHOWDOWN'){
            const winningPlayerIds=getWinningPlayerIds();
            gameState.players.forEach(p=>{
                if(!p?.evalResult?.bestCards)return;
                if(!winningPlayerIds.has(p.id))return;
                p.evalResult.bestCards.forEach(c=>winningCommunityCards.add(cardKey(c)));
            });
        }
        cc.innerHTML=gameState.communityCards.length
            ?gameState.communityCards.map(c=>cardHTML(c,false,winningCommunityCards.has(cardKey(c))?'winner-card':'')).join('')
            :`<span class="text-slate-400 text-[11px] sm:text-xs italic">${gameState.status==='in-progress'?t('noCommunityCards'):t('waitingDealer')}</span>`;
        for(let i=0;i<8;i++)renderSeat(i);

        const mySeat=gameState.players.findIndex(p=>p?.id===gameState.myPlayerId),mine=gameState.players[mySeat];
        const handRunning=gameState.status==='in-progress';
        const myTurn=mySeat>=0&&gameState.activeTurnSeat===mySeat&&handRunning;
        const drawPhase=myTurn&&gameState.stage==='draw';
        const foldBtn=document.getElementById('foldBtn');
        if(foldBtn){
            foldBtn.disabled=!myTurn||drawPhase;
            // The Fold action belongs only to the Texas Hold'em variant.
            foldBtn.classList.toggle('hidden',!handRunning || gameState.variant==='draw');
        }
        document.getElementById('checkCallBtn').disabled=!myTurn||drawPhase;
        document.getElementById('raiseBtn').disabled=!myTurn||drawPhase;
        const allInBtn=document.getElementById('allInBtn');
        if(allInBtn){allInBtn.disabled=!myTurn||drawPhase||!mine||mine.chips<=0;}
        const check=document.getElementById('checkCallBtn');if(check)check.textContent=myTurn&&mine&&gameState.currentHighBet>mine.currentBet?t('call'):t('check');
        const raiseInput=document.getElementById('raiseInput');
        if(raiseInput){
            const minimumRaiseTo=gameState.currentHighBet+gameState.minRaise;
            raiseInput.min=String(minimumRaiseTo);
            raiseInput.step='1';
            // Keep the visible raise amount in sync whenever the minimum raise
            // changes, including after another player's raise.
            if(Number(raiseInput.value)<minimumRaiseTo || raiseInput.dataset.lastMinRaise!==String(minimumRaiseTo)){
                raiseInput.value=String(minimumRaiseTo);
                raiseInput.dataset.lastMinRaise=String(minimumRaiseTo);
            }
        }

        const startBtn=document.getElementById('startGameBtn');
        if(startBtn){
            const canDeal=gameState.status!=='in-progress';
            // Deal Hand is a host-only control and lives beside the action area.
            startBtn.disabled=!gameState.isHost||!canDeal;
            startBtn.title=t('dealHand');
        }
        document.getElementById('spectatorBanner').classList.toggle('hidden',!(mySeat<0&&gameState.status==='in-progress'));

        const sum=document.getElementById('playerHandSummary');
        if(gameState.status==='in-progress'){
            const activeP=gameState.players[gameState.activeTurnSeat],activeName=activeP?.name||'';
            sum.textContent=drawPhase?t('drawDiscardPrompt'):myTurn?t('yourTurn'):activeName?t('turnOf',{name:activeName}):t('waitingForAction');
        } else sum.textContent='';

        let phaseDisplay = gameState.phase;
        if (gameState.phase === 'LOBBY WAITING') phaseDisplay = t('lobbyWaiting');
        else if (gameState.phase === 'SHOWDOWN' && gameState.showdownSummary) phaseDisplay = gameState.showdownSummary;
        document.getElementById('gamePhaseText').textContent = phaseDisplay;

        let drawBtn=document.getElementById('drawBtn');
        if(drawBtn){
            drawBtn.disabled=!myTurn||!drawPhase;
            // The Draw action belongs only to the 5-Card Draw variant.
            drawBtn.classList.toggle('hidden',!handRunning || gameState.variant!=='draw');
        }
        renderRoomHistory();
    }catch(e){logMessage(`Render error: ${e.message}`,'error');}
}

/* Unified Custom Modal Controller */
const appModal = document.getElementById('appModal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const modalFooter = document.getElementById('modalFooter');

function showModal(title, htmlContent, buttonsConfig) {
  modalTitle.textContent = title;
  modalBody.innerHTML = htmlContent;
  modalFooter.innerHTML = '';
  
  buttonsConfig.forEach(cfg => {
    const btn = document.createElement('button');
    btn.textContent = cfg.text;
    
    // let baseClasses = "px-4 py-2 rounded-md font-medium text-sm transition-all duration-200 cursor-pointer text-white";
    let baseClasses = "px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow transition shrink-0";
    
    if (cfg.bg && cfg.bg.startsWith('#')) {
      btn.className = baseClasses;
      btn.style.backgroundColor = cfg.bg;
    } else {
      const customBg = cfg.bg || 'bg-slate-700 hover:bg-slate-600';
      btn.className = `${baseClasses} ${customBg}`;
    }
    
    btn.onclick = async () => {
      const allButtons = modalFooter.querySelectorAll('button');
      allButtons.forEach(b => {
        b.disabled = true;
        b.classList.add('opacity-40', 'cursor-not-allowed');
      });
      
      if (cfg.onClick) await cfg.onClick();
      if (cfg.close !== false) closeModal();
    };
    modalFooter.appendChild(btn);
  });
  
  appModal.classList.remove('hidden');
  appModal.classList.add('flex');
}

function closeModal() {
  appModal.classList.remove('flex');
  appModal.classList.add('hidden');
}

function showAlert(title, message) {
  showModal(title, message, [{ text: 'OK', bg: 'bg-blue-600 hover:bg-blue-500' }]);
}