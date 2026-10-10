/* ========================================================================
   GO UI - SVG board rendering and tap-to-place interaction. One render
   function repaints everything from gameState.go each time it changes
   (same pattern as the other board games).
   ======================================================================== */
const GO_UNIT=30;           // SVG units per grid cell
let goHint=null;            // {idx|null (null = pass),key} suggested move (local only, valid while the position is unchanged)
const goHintKey=g=>`${g.moveCount}:${g.status}:${g.turn}`;

function goLocalColor(){ return goColorOf(gameState,gameState.myPlayerId); }

function goBoardSVG(g,interactive,myTurnColor){
    const n=g.size,U=GO_UNIT,m=U*0.9,W=m*2+(n-1)*U;
    const px=i=>m+i*U;
    const parts=[];
    parts.push(`<defs>
        <radialGradient id="goGradB" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#6b7280"/><stop offset="1" stop-color="#05070a"/></radialGradient>
        <radialGradient id="goGradW" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cbd5e1"/></radialGradient>
    </defs>`);
    parts.push(`<rect x="0" y="0" width="${W}" height="${W}" rx="${U*0.4}" class="go-wood"/>`);
    for(let i=0;i<n;i++){
        parts.push(`<line x1="${px(0)}" y1="${px(i)}" x2="${px(n-1)}" y2="${px(i)}" class="go-line"/>`);
        parts.push(`<line x1="${px(i)}" y1="${px(0)}" x2="${px(i)}" y2="${px(n-1)}" class="go-line"/>`);
    }
    goHoshi(n).forEach(idx=>{
        const x=idx%n,y=(idx-x)/n;
        parts.push(`<circle cx="${px(x)}" cy="${px(y)}" r="${U*0.11}" class="go-hoshi"/>`);
    });

    // scoring overlay data
    const scoring=g.status==='scoring'||g.status==='ended';
    const sc=scoring?goScore(g.board,n,g.dead,g.komi):null;
    const deadSet=new Set(scoring?g.dead:[]);

    for(let i=0;i<g.board.length;i++){
        const v=g.board[i];if(!v)continue;
        const x=i%n,y=(i-x)/n,cx=px(x),cy=px(y);
        const dead=deadSet.has(i);
        parts.push(`<circle cx="${cx}" cy="${cy}" r="${U*0.47}" fill="url(#${v===1?'goGradB':'goGradW'})" class="go-stone${dead?' go-dead':''}"/>`);
        if(dead){
            const d=U*0.2;
            parts.push(`<path d="M${cx-d} ${cy-d}L${cx+d} ${cy+d}M${cx+d} ${cy-d}L${cx-d} ${cy+d}" class="go-dead-x ${v===1?'on-black':'on-white'}"/>`);
        }
    }
    if(sc){
        for(let i=0;i<sc.owner.length;i++){
            const o=sc.owner[i];
            if(!o||(g.board[i]&&!deadSet.has(i)))continue;
            const x=i%n,y=(i-x)/n,s=U*0.26;
            parts.push(`<rect x="${px(x)-s/2}" y="${px(y)-s/2}" width="${s}" height="${s}" class="go-terr ${o===1?'terr-b':'terr-w'}"/>`);
        }
    }
    if(g.lastMove!=null&&g.lastMove>=0&&g.board[g.lastMove]){
        const x=g.lastMove%n,y=(g.lastMove-x)/n;
        parts.push(`<circle cx="${px(x)}" cy="${px(y)}" r="${U*0.2}" class="go-last ${g.board[g.lastMove]===1?'on-black':'on-white'}"/>`);
    }
    if(goHint&&goHint.key===goHintKey(g)&&goHint.idx!=null){
        const x=goHint.idx%n,y=(goHint.idx-x)/n;
        parts.push(`<circle cx="${px(x)}" cy="${px(y)}" r="${U*0.38}" class="go-hint"/>`);
    }
    if(interactive){
        for(let i=0;i<n*n;i++){
            const x=i%n,y=(i-x)/n;
            parts.push(`<circle cx="${px(x)}" cy="${px(y)}" r="${U*0.5}" class="go-hit" data-idx="${i}"/>`);
        }
    }
    const cls=`go-svg${myTurnColor?` go-turn-${myTurnColor}`:''}`;
    return `<svg viewBox="0 0 ${W} ${W}" class="${cls}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`;
}

function renderGoUI(){
    try{
        const g=gameState.go||defaultGoState(gameState.goSize||9);
        const lobby=gameState.status!=='in-progress'&&g.status!=='in-progress'&&g.status!=='scoring';
        const localColor=goLocalColor();
        const myTurn=g.status==='in-progress'&&!!localColor&&g.turn===localColor;

        const seated=goMatchPlayers(gameState);
        const black=seated.find(p=>p.id===g.blackPlayerId)||(g.status==='waiting'?seated[0]:null)||null;
        const white=seated.find(p=>p.id===g.whitePlayerId)||(g.status==='waiting'?seated[1]:null)||null;
        const seatOf=(p,fallback)=>p?gameState.players.indexOf(p):fallback;
        renderGoBar('goTop',white,seatOf(white,1),lobby);
        renderGoBar('goBottom',black,seatOf(black,0),lobby);

        const running=g.status==='in-progress';
        document.getElementById('goTopClockDot').className='w-2.5 h-2.5 rounded-full shrink-0 '+(running&&g.turn==='w'?'bg-lime-400 pulse-turn':'bg-slate-700');
        document.getElementById('goBottomClockDot').className='w-2.5 h-2.5 rounded-full shrink-0 '+(running&&g.turn==='b'?'bg-lime-400 pulse-turn':'bg-slate-700');
        const started=g.status!=='waiting';
        document.getElementById('goTopInfo').textContent=started?`${g.captures.w} ${t('goCaptured')}`:'';
        document.getElementById('goBottomInfo').textContent=started?`${g.captures.b} ${t('goCaptured')}`:'';

        // board (interactive while playing and while marking dead stones)
        const interactive=(running&&!!localColor)||(g.status==='scoring'&&!!localColor);
        document.getElementById('goBoard').innerHTML=goBoardSVG(g,interactive,myTurn?localColor:null);

        const phaseEl=document.getElementById('goPhaseText'),summaryEl=document.getElementById('goStatusSummary');
        if(g.status==='waiting'){
            phaseEl.textContent=t('lobbyWaiting');
            summaryEl.textContent=seated.length<2?t('waitingForOpponent'):t('goReadyToStart');
        }else if(g.status==='in-progress'){
            phaseEl.textContent=`${t('goInProgress')} · ${t('goKomi',{komi:g.komi})}`;
            const cur=g.turn==='b'?black:white;
            summaryEl.textContent=myTurn?t('yourTurn'):t('goTurnOf',{name:cur?.name||'',color:t(g.turn==='b'?'goBlack':'goWhite')});
            if(myTurn&&goHint&&goHint.key===goHintKey(g)&&goHint.idx==null)summaryEl.textContent=t('goHintPass');
        }else if(g.status==='scoring'){
            phaseEl.textContent=t('goScoring');
            const sc=goScore(g.board,g.size,g.dead,g.komi);
            const waiting=localColor&&g.accepted.includes(gameState.myPlayerId);
            summaryEl.textContent=waiting?t('goWaitingAccept'):t('goScoringHint',{black:sc.black,white:sc.white});
        }else{
            phaseEl.textContent=t('goMatchOver');
            summaryEl.textContent=goResultSummary(gameState);
        }

        // controls
        const startBtn=document.getElementById('startGoBtn');
        if(startBtn){
            startBtn.disabled=!(gameState.isHost&&g.status!=='in-progress'&&g.status!=='scoring'&&goMatchPlayers(gameState).length>=2);
            startBtn.querySelector('span').textContent=g.status==='ended'?t('goRematch'):t('goStartMatch');
        }
        const passBtn=document.getElementById('goPassBtn'),acc=document.getElementById('goAcceptBtn'),res=document.getElementById('goResumeBtn');
        const scoring=g.status==='scoring';
        passBtn.classList.toggle('hidden',scoring);
        acc.classList.toggle('hidden',!scoring);res.classList.toggle('hidden',!scoring);
        passBtn.disabled=!myTurn;
        acc.disabled=!(scoring&&localColor&&!g.accepted.includes(gameState.myPlayerId));
        res.disabled=!(scoring&&localColor);
        document.getElementById('goResignBtn').disabled=!((running||scoring)&&!!localColor);

        // Bot level + "suggest a move": only in a 1-vs-1 game against a bot (hint: Easy level only).
        const levelWrap=document.getElementById('goBotLevelWrap');
        if(levelWrap){
            levelWrap.classList.toggle('hidden',!(gameState.isHost&&goSoloVsBot(gameState)));
            const sel=document.getElementById('goBotLevel');
            if(sel&&sel.value!==goBotLevel(gameState))sel.value=goBotLevel(gameState);
        }
        const hintBtn=document.getElementById('goHintBtn');
        if(hintBtn){
            const show=goSoloVsBot(gameState)&&goBotLevel(gameState)==='easy'&&gameState.players.some(p=>p?.id===gameState.myPlayerId);
            hintBtn.classList.toggle('hidden',!show);
            hintBtn.disabled=!(show&&myTurn);
        }

        const sizeWrap=document.getElementById('goSizeWrap');
        if(sizeWrap){
            sizeWrap.classList.toggle('hidden',!(gameState.isHost&&g.status!=='in-progress'&&g.status!=='scoring'));
            const sel=document.getElementById('goSizeSelect');
            if(sel&&sel.value!==String(g.size))sel.value=String(g.size);
        }

        const mySeat=gameState.players.findIndex(p=>p?.id===gameState.myPlayerId);
        const iAmSeated=mySeat>=0&&!gameState.players[mySeat].spectator;
        document.getElementById('spectatorBanner').classList.toggle('hidden',!(!iAmSeated&&(running||scoring)));
        renderRoomHistory();
    }catch(e){logMessage(`Go render error: ${e.message}`,'error');}
}

function renderGoBar(prefix,player,seatIndex,lobby){
    const nameEl=document.getElementById(prefix+'Name');
    const avatarEl=document.getElementById(prefix+'Avatar');
    if(!player){
        if(lobby&&gameState.isHost){
            nameEl.innerHTML=`<button data-add-bot="${seatIndex}" class="text-amber-400 hover:text-amber-300 font-bold text-[11px]"><i class="fa-solid fa-plus"></i> ${t('addBot')}</button>`;
        }else nameEl.textContent=t('waitingForOpponent');
        avatarEl.src='https://api.dicebear.com/7.x/avataaars/svg?seed=empty';
        return;
    }
    avatarEl.src=`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(player.name)}`;
    const you=player.id===gameState.myPlayerId?` (${t('you')})`:'';
    const botTag=player.isBot?' 🤖':'';
    const kick=gameState.isHost&&lobby&&player.id!==gameState.myPlayerId
        ?`<button data-kick-player="${player.id}" class="ml-1.5 text-rose-400 hover:text-rose-300"><i class="fa-solid fa-xmark"></i></button>`
        :(gameState.isHost&&lobby&&player.isBot
            ?`<button data-remove-bot="${seatIndex}" class="ml-1.5 text-slate-400 hover:text-slate-200"><i class="fa-solid fa-minus"></i></button>`:'');
    nameEl.innerHTML=`<span>${player.name}${you}${botTag}</span>${kick}`;
}

function handleGoPointClick(idx){
    const g=gameState.go;
    if(!g||!Number.isInteger(idx))return;
    const color=goLocalColor();
    if(!color)return;
    if(g.status==='in-progress'){
        if(g.turn!==color)return;
        requestGoMove(idx);
    }else if(g.status==='scoring'){
        if(g.board[idx])requestGoToggleDead(idx);
    }
}


// Ask the strongest bot level for the best move and mark it on the board (or say "pass").
function showGoHint(){
    const g=gameState.go;
    if(!g||g.status!=='in-progress'||!goSoloVsBot(gameState))return;
    const color=goLocalColor();
    if(!color||g.turn!==color)return;
    const btn=document.getElementById('goHintBtn');
    if(btn)btn.disabled=true;
    setTimeout(()=>{
        try{
            const mv=chooseGoBotMove(gameState,'expert',{time:1800});
            goHint={idx:mv.pass?null:mv.idx,key:goHintKey(g)};
        }catch(e){goHint=null;}
        renderTableUI();
    },30);
}
