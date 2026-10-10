/* ========================================================================
   OTHELLO UI - board rendering and tap-to-place interaction. Mirrors
   chess-ui.js's pattern: one render function rebuilds the board from
   gameState every time it changes.
   ======================================================================== */

let othelloHint=null;   // {r,c,key} suggested move (local only, valid while the position is unchanged)
const othelloBoardKey=os=>os.board.map(row=>row.map(c=>c||'.').join('')).join('')+os.turn;

function othelloLocalColor(){ return othelloColorOf(gameState,gameState.myPlayerId); }

function ensureOthelloSquares(){
    const board=document.getElementById('othelloBoard');
    if(!board||board.dataset.built==='1')return;
    board.dataset.built='1';
    board.innerHTML='';
    for(let r=0;r<8;r++)for(let c=0;c<8;c++){
        const sq=document.createElement('button');
        sq.type='button';
        sq.className='othello-square';
        sq.dataset.r=String(r);sq.dataset.c=String(c);
        const disc=document.createElement('span');
        disc.className='othello-disc';
        sq.appendChild(disc);
        board.appendChild(sq);
    }
}

function renderOthelloUI(){
    try{
        ensureOthelloSquares();
        const os=gameState.othello||defaultOthelloState();
        const lobby=gameState.status!=='in-progress'&&os.status!=='in-progress';
        const localColor=othelloLocalColor();

        const seated=othelloMatchPlayers(gameState);
        const black=seated.find(p=>p.id===os.blackPlayerId)||null;
        const white=seated.find(p=>p.id===os.whitePlayerId)||null;
        const topPlayer=os.status==='waiting'?seated[1]:white;
        const bottomPlayer=os.status==='waiting'?seated[0]:black;
        const topSeatIndex=seated.indexOf(topPlayer)>=0?gameState.players.indexOf(topPlayer):1;
        const bottomSeatIndex=seated.indexOf(bottomPlayer)>=0?gameState.players.indexOf(bottomPlayer):0;

        renderOthelloBar('othelloTop',topPlayer,topSeatIndex,lobby,'w');
        renderOthelloBar('othelloBottom',bottomPlayer,bottomSeatIndex,lobby,'b');

        const counts=othelloCounts(os.board);
        document.getElementById('othelloTopCount').textContent=os.status!=='waiting'?counts.w:'';
        document.getElementById('othelloBottomCount').textContent=os.status!=='waiting'?counts.b:'';

        const running=os.status==='in-progress';
        document.getElementById('othelloTopClockDot').className='w-2.5 h-2.5 rounded-full shrink-0 '+(running&&os.turn==='w'?'bg-emerald-400 pulse-turn':'bg-slate-700');
        document.getElementById('othelloBottomClockDot').className='w-2.5 h-2.5 rounded-full shrink-0 '+(running&&os.turn==='b'?'bg-emerald-400 pulse-turn':'bg-slate-700');

        const legalTargets=running&&localColor===os.turn?othelloLegalMoves(os.board,os.turn):[];
        document.querySelectorAll('#othelloBoard .othello-square').forEach(el=>{
            const r=Number(el.dataset.r),c=Number(el.dataset.c);
            const cell=os.board[r][c];
            el.classList.toggle('othello-hint',!!(othelloHint&&othelloHint.key===othelloBoardKey(os)&&othelloHint.r===r&&othelloHint.c===c));
            el.classList.toggle('othello-last-move',!!(os.lastMove&&os.lastMove.r===r&&os.lastMove.c===c));
            el.classList.toggle('othello-legal-hint',legalTargets.some(m=>m.r===r&&m.c===c));
            const disc=el.querySelector('.othello-disc');
            disc.className='othello-disc'+(cell?` othello-disc-${cell==='b'?'black':'white'}`:'');
        });

        const phaseEl=document.getElementById('othelloPhaseText');
        const summaryEl=document.getElementById('othelloStatusSummary');
        if(os.status==='waiting'){
            phaseEl.textContent=t('lobbyWaiting');
            summaryEl.textContent=seated.length<2?t('waitingForOpponent'):t('readyToStart');
        }else if(os.status==='in-progress'){
            phaseEl.textContent=t('inProgress');
            const mine=localColor&&localColor===os.turn;
            summaryEl.textContent=mine?t('yourTurn'):t('turnOf',{name:(os.turn==='b'?black:white)?.name||''});
        }else{
            phaseEl.textContent=t('matchOver');
            summaryEl.textContent=othelloResultSummary(gameState);
        }

        const startBtn=document.getElementById('startOthelloBtn');
        if(startBtn){
            const canStart=gameState.isHost&&os.status!=='in-progress'&&othelloMatchPlayers(gameState).length>=2;
            startBtn.disabled=!canStart;
            startBtn.querySelector('span').textContent=os.status==='ended'?t('rematch'):t('startMatch');
        }
        // Bot level + "suggest a move": only in a 1-vs-1 game against a bot (hint: Easy level only).
        const levelWrap=document.getElementById('othelloBotLevelWrap');
        if(levelWrap){
            levelWrap.classList.toggle('hidden',!(gameState.isHost&&othelloSoloVsBot(gameState)));
            const sel=document.getElementById('othelloBotLevel');
            if(sel&&sel.value!==othelloBotLevel(gameState))sel.value=othelloBotLevel(gameState);
        }
        const hintBtn=document.getElementById('othelloHintBtn');
        if(hintBtn){
            const show=othelloSoloVsBot(gameState)&&othelloBotLevel(gameState)==='easy'&&gameState.players.some(p=>p?.id===gameState.myPlayerId);
            hintBtn.classList.toggle('hidden',!show);
            hintBtn.disabled=!(show&&running&&os.turn===localColor);
        }
        const resignBtn=document.getElementById('othelloResignBtn');
        if(resignBtn)resignBtn.disabled=!(os.status==='in-progress'&&!!localColor);

        const mySeatIndex=gameState.players.findIndex(p=>p?.id===gameState.myPlayerId);
        const iAmSeated=mySeatIndex>=0&&!gameState.players[mySeatIndex].spectator;
        document.getElementById('spectatorBanner').classList.toggle('hidden',!(!iAmSeated&&os.status==='in-progress'));

        renderRoomHistory();
    }catch(e){logMessage(`Othello render error: ${e.message}`,'error');}
}

function renderOthelloBar(prefix,player,seatIndex,lobby,color){
    const nameEl=document.getElementById(prefix+'Name');
    const avatarEl=document.getElementById(prefix+'Avatar');
    if(!player){
        if(lobby&&gameState.isHost){
            nameEl.innerHTML=`<button data-add-bot="${seatIndex}" class="text-amber-400 hover:text-amber-300 font-bold text-[11px]"><i class="fa-solid fa-plus"></i> ${t('addBot')}</button>`;
        }else{
            nameEl.textContent=t('waitingForOpponent');
        }
        avatarEl.src='https://api.dicebear.com/7.x/avataaars/svg?seed=empty';
        return;
    }
    avatarEl.src=`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(player.name)}`;
    const you=player.id===gameState.myPlayerId?` (${t('you')})`:'';
    const botTag=player.isBot?' 🤖':'';
    const kick=gameState.isHost&&lobby&&player.id!==gameState.myPlayerId
        ?`<button data-kick-player="${player.id}" class="ml-1.5 text-rose-400 hover:text-rose-300"><i class="fa-solid fa-xmark"></i></button>`
        :(gameState.isHost&&lobby&&player.isBot
            ?`<button data-remove-bot="${seatIndex}" class="ml-1.5 text-slate-400 hover:text-slate-200"><i class="fa-solid fa-minus"></i></button>`
            :'');
    nameEl.innerHTML=`<span>${player.name}${you}${botTag}</span>${kick}`;
}

function handleOthelloSquareClick(r,c){
    const os=gameState.othello;
    if(!os||os.status!=='in-progress')return;
    const localColor=othelloLocalColor();
    if(!localColor||os.turn!==localColor)return;
    requestOthelloMove(r,c);
}

// Ask the engine for the strongest move and highlight that square.
function showOthelloHint(){
    const os=gameState.othello;
    if(!os||os.status!=='in-progress'||!othelloSoloVsBot(gameState))return;
    const color=othelloLocalColor();
    if(!color||os.turn!==color)return;
    const btn=document.getElementById('othelloHintBtn');
    if(btn)btn.disabled=true;
    setTimeout(()=>{
        try{
            const mv=OthelloBot.chooseMove(os.board,color,'expert');
            othelloHint=mv?{r:mv.r,c:mv.c,key:othelloBoardKey(os)}:null;
        }catch(e){othelloHint=null;}
        renderTableUI();
    },30);
}
