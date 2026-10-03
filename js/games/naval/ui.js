/* ========================================================================
   NAVAL BATTLE UI - grid rendering, fleet deployment and tap-to-fire.
   Same pattern as games/othello/ui.js: one render function rebuilds the
   board from gameState every time it changes.

   The ships a player is still arranging (before pressing "Ready") are LOCAL
   to this browser (navalDraft) and never part of gameState: nothing about a
   fleet leaves the browser until it is submitted to the host.
   ======================================================================== */

const navalDraft={ships:[],selected:NAVAL_FLEET[0].id,horiz:true,hover:null};

function navalResetDraft(){
    navalDraft.ships=[];navalDraft.selected=NAVAL_FLEET[0].id;navalDraft.hover=null;
}
function navalMyIdx(){ return navalIndexOf(gameState,gameState.myPlayerId); }
function navalPlayerAt(i){
    const ns=gameState.naval;
    return gameState.players.find(p=>p?.id===ns.ids[i])||null;
}
function navalEditing(){
    const ns=gameState.naval,my=navalMyIdx();
    return !!ns&&ns.phase==='placing'&&my>=0&&!ns.ready[my];
}

/* ---------------------------- deployment draft --------------------------- */

function navalDraftShip(id){ return navalDraft.ships.find(s=>s.id===id)||null; }
function navalNextUnplaced(){ return NAVAL_FLEET.find(d=>!navalDraftShip(d.id))?.id||null; }

// The ship that would be placed if the player tapped (r,c) now, nudged back
// inside the grid when it would stick out over the edge. null if none is selected.
function navalPreviewShip(r,c){
    const def=NAVAL_FLEET.find(d=>d.id===navalDraft.selected);
    if(!def||navalDraftShip(def.id))return null;
    const h=navalDraft.horiz;
    return {id:def.id,len:def.len,h,
        r:h?r:Math.min(r,NAVAL_SIZE-def.len),
        c:h?Math.min(c,NAVAL_SIZE-def.len):c};
}

function handleNavalOwnClick(r,c){
    if(!navalEditing())return;
    const ship=navalPreviewShip(r,c);
    if(ship&&!navalOverlaps(ship,navalDraft.ships)){
        navalDraft.ships.push(ship);
        navalDraft.selected=navalNextUnplaced();
    }else{
        // Tapping an already placed ship picks it up so it can be moved.
        const placed=navalShipAt(navalDraft.ships,r,c);
        if(placed){
            navalDraft.ships=navalDraft.ships.filter(s=>s.id!==placed.id);
            navalDraft.selected=placed.id;navalDraft.horiz=placed.h;
        }
    }
    renderNavalUI();
}

/* -------------------------------- rendering ------------------------------ */

function ensureNavalGrids(){
    for(const id of ['navalEnemyGrid','navalOwnGrid']){
        const grid=document.getElementById(id);
        if(!grid||grid.dataset.built==='1')continue;
        grid.dataset.built='1';grid.innerHTML='';
        for(let r=0;r<NAVAL_SIZE;r++)for(let c=0;c<NAVAL_SIZE;c++){
            const cell=document.createElement('button');
            cell.type='button';cell.className='naval-cell';
            cell.dataset.r=String(r);cell.dataset.c=String(c);
            cell.title=navalCellLabel(r,c);
            if(c===0)cell.innerHTML +=`<span class="naval-coord naval-coord-number">${cell.title.match(/\d+/)[0]}</span>`;
            if(r===9)cell.innerHTML +=`<span class="naval-coord naval-coord-letter">${cell.title.charAt(0)}</span>`;
            grid.appendChild(cell);
        }
    }
}

const navalKey=(r,c)=>r*NAVAL_SIZE+c;

function navalSetCells(gridId,classesFor){
    document.querySelectorAll(`#${gridId} .naval-cell`).forEach(el=>{
        el.className='naval-cell'+classesFor(Number(el.dataset.r),Number(el.dataset.c));
    });
}

function renderNavalUI(){
    try{
        ensureNavalGrids();
        const ns=gameState.naval||defaultNavalState();
        const my=navalMyIdx();
        const phase=ns.phase;
        if(phase!=='placing')navalResetDraft();

        const seated=navalMatchPlayers(gameState);
        const active=phase!=='waiting';
        const lobby=gameState.status!=='in-progress'&&phase!=='placing'&&phase!=='in-progress';

        // Who sits where: the local player is always at the bottom.
        let bottomIdx=0,topIdx=1,bottomPlayer,topPlayer;
        if(active){
            bottomIdx=my>=0?my:0;topIdx=1-bottomIdx;
            bottomPlayer=navalPlayerAt(bottomIdx);topPlayer=navalPlayerAt(topIdx);
        }else{
            bottomPlayer=seated.find(p=>p.id===gameState.myPlayerId)||seated[0]||null;
            topPlayer=seated.find(p=>p!==bottomPlayer)||null;
        }
        const emptySeat=gameState.players.findIndex((p,i)=>!p&&i<2);
        const seatOf=(p,fallback)=>p?gameState.players.indexOf(p):(emptySeat>=0?emptySeat:fallback);
        renderNavalBar('navalTop',topPlayer,seatOf(topPlayer,1),lobby);
        renderNavalBar('navalBottom',bottomPlayer,seatOf(bottomPlayer,0),lobby);

        const running=phase==='in-progress';
        const afloat=i=>NAVAL_FLEET.length-ns.sunk[i].length;
        document.getElementById('navalTopCount').textContent=active?afloat(topIdx):'';
        document.getElementById('navalBottomCount').textContent=active?afloat(bottomIdx):'';
        const dot=(id,on)=>document.getElementById(id).className='w-2.5 h-2.5 rounded-full shrink-0 '+(on?'bg-emerald-400 pulse-turn':'bg-slate-700');
        dot('navalTopClockDot',running&&ns.turn===topIdx);
        dot('navalBottomClockDot',running&&ns.turn===bottomIdx);

        // ---- panels visibility ----
        const editing=navalEditing();
        document.getElementById('navalGrids').classList.toggle('hidden',!active);
        document.getElementById('navalEnemyWrap').classList.toggle('hidden',phase==='placing');
        document.getElementById('navalPlacePanel').classList.toggle('hidden',!editing);

        // ---- enemy waters (the board of `topIdx`) ----
        const fireable=running&&my>=0&&ns.turn===my;
        const eShots=new Map(ns.shots[topIdx].map(s=>[navalKey(s.r,s.c),s.hit]));
        const eSunk=new Set();ns.sunk[topIdx].forEach(sh=>navalShipCells(sh).forEach(({r,c})=>eSunk.add(navalKey(r,c))));
        const eReveal=new Set();
        if(phase==='ended'&&ns.fleets[topIdx])ns.fleets[topIdx].forEach(sh=>navalShipCells(sh).forEach(({r,c})=>eReveal.add(navalKey(r,c))));
        const last=ns.lastShot;
        navalSetCells('navalEnemyGrid',(r,c)=>{
            const k=navalKey(r,c);let cls='';
            if(eReveal.has(k))cls+=' naval-ship-reveal';
            if(eSunk.has(k))cls+=' naval-sunk';
            if(eShots.has(k))cls+=eShots.get(k)?' naval-hit':' naval-miss';
            else if(fireable)cls+=' naval-target';
            if(last&&last.target===topIdx&&last.r===r&&last.c===c)cls+=' naval-last';
            return cls;
        });

        // ---- own fleet (the board of `bottomIdx`) ----
        const ownShips=editing?navalDraft.ships:(ns.fleets[bottomIdx]||[]);
        const oOcc=new Set();ownShips.forEach(sh=>navalShipCells(sh).forEach(({r,c})=>oOcc.add(navalKey(r,c))));
        const oShots=new Map(ns.shots[bottomIdx].map(s=>[navalKey(s.r,s.c),s.hit]));
        const oSunk=new Set();ns.sunk[bottomIdx].forEach(sh=>navalShipCells(sh).forEach(({r,c})=>oSunk.add(navalKey(r,c))));
        let preview=null,previewOk=false;
        if(editing&&navalDraft.hover){
            const p=navalPreviewShip(navalDraft.hover.r,navalDraft.hover.c);
            if(p){preview=new Set(navalShipCells(p).map(({r,c})=>navalKey(r,c)));previewOk=!navalOverlaps(p,navalDraft.ships);}
        }
        navalSetCells('navalOwnGrid',(r,c)=>{
            const k=navalKey(r,c);let cls='';
            if(oOcc.has(k))cls+=' naval-ship';
            if(oSunk.has(k))cls+=' naval-sunk';
            if(oShots.has(k))cls+=oShots.get(k)?' naval-hit':' naval-miss';
            if(editing)cls+=' naval-place';
            if(preview?.has(k))cls+=previewOk?' naval-preview-ok':' naval-preview-bad';
            if(last&&last.target===bottomIdx&&last.r===r&&last.c===c)cls+=' naval-last';
            return cls;
        });

        // ---- deployment tray ----
        if(editing){
            document.getElementById('navalShipTray').innerHTML=NAVAL_FLEET.map(def=>{
                const placed=!!navalDraftShip(def.id);
                const cls='naval-tray-ship'+(navalDraft.selected===def.id?' is-selected':'')+(placed?' is-placed':'');
                return `<button type="button" data-ship="${def.id}" class="${cls}"><span>${'<i class="naval-pip"></i>'.repeat(def.len)}</span><span>${t('navalShip_'+def.id)}</span>${placed?'<i class="fa-solid fa-check text-emerald-400"></i>':''}</button>`;
            }).join('');
            document.getElementById('navalOrientLabel').textContent=`(${navalDraft.horiz?t('navalHorizontal'):t('navalVertical')})`;
            document.getElementById('navalReadyBtn').disabled=navalDraft.ships.length!==NAVAL_FLEET.length;
        }

        // ---- texts ----
        const phaseEl=document.getElementById('navalPhaseText');
        const summaryEl=document.getElementById('navalStatusSummary');
        if(phase==='waiting'){
            phaseEl.textContent=t('lobbyWaiting');
            summaryEl.textContent=seated.length<2?t('waitingForOpponent'):t('navalReadyToStart');
        }else if(phase==='placing'){
            phaseEl.textContent=t('navalPhasePlacing');
            summaryEl.textContent=my<0?t('navalSpectating'):(ns.ready[my]?t('navalWaitDeploy'):t('navalPlaceHint'));
        }else if(phase==='in-progress'){
            phaseEl.textContent=t('navalPhaseBattle');
            summaryEl.textContent=fireable?t('yourTurn'):t('turnOf',{name:navalPlayerAt(ns.turn)?.name||''});
        }else{
            phaseEl.textContent=t('navalPhaseOver');
            summaryEl.textContent=navalResultSummary(gameState);
        }
        const lastEl=document.getElementById('navalLastShotText');
        if(last&&(phase==='in-progress'||phase==='ended')){
            const result=last.sunk?t('navalResSunk',{ship:t('navalShip_'+last.sunk)}):(last.hit?t('navalResHit'):t('navalResMiss'));
            lastEl.textContent=t('navalLastShot',{name:navalPlayerAt(last.by)?.name||'?',cell:navalCellLabel(last.r,last.c),result});
        }else lastEl.textContent='';

        // ---- buttons ----
        const startBtn=document.getElementById('startNavalBtn');
        if(startBtn){
            const canStart=gameState.isHost&&(phase==='waiting'||phase==='ended')&&seated.length>=2;
            startBtn.disabled=!canStart;
            startBtn.querySelector('span').textContent=phase==='ended'?t('navalRematch'):t('navalStart');
        }
        const resignBtn=document.getElementById('navalResignBtn');
        if(resignBtn)resignBtn.disabled=!((phase==='placing'||phase==='in-progress')&&my>=0);

        const mySeat=gameState.players.findIndex(p=>p?.id===gameState.myPlayerId);
        const iAmSeated=mySeat>=0&&!gameState.players[mySeat].spectator;
        document.getElementById('spectatorBanner').classList.toggle('hidden',!(!iAmSeated&&(phase==='in-progress'||phase==='placing')));

        renderRoomHistory();
    }catch(e){logMessage(`Naval render error: ${e.message}`,'error');}
}

function renderNavalBar(prefix,player,seatIndex,lobby){
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

/* -------------------------------- interaction ---------------------------- */

function handleNavalEnemyClick(r,c){
    const ns=gameState.naval;
    if(!ns||ns.phase!=='in-progress')return;
    const my=navalMyIdx();
    if(my<0||ns.turn!==my)return;
    if(ns.shots[1-my].some(s=>s.r===r&&s.c===c))return;
    requestNavalFire(r,c);
}

function bindNavalUI(){
    const $=id=>document.getElementById(id);
    const cellOf=e=>{
        const el=e.target.closest('.naval-cell');
        return el?{r:Number(el.dataset.r),c:Number(el.dataset.c)}:null;
    };

    $('startNavalBtn').onclick=()=>{if(gameState.isHost)hostStartNavalMatch();};
    $('navalResignBtn').onclick=()=>{
        showModal(t('navalResignTitle'),t('navalResignConfirm'),[
            {text:'OK',bg:'bg-blue-600 hover:bg-blue-500',onClick:async()=>{requestNavalResignAction();}},
            {text:'Cancel',bg:'bg-purple-600 hover:bg-purple-500',close:true}
        ]);
    };

    $('navalEnemyGrid').addEventListener('click',e=>{const p=cellOf(e);if(p)handleNavalEnemyClick(p.r,p.c);});

    const own=$('navalOwnGrid');
    own.addEventListener('click',e=>{const p=cellOf(e);if(p)handleNavalOwnClick(p.r,p.c);});
    own.addEventListener('mouseover',e=>{
        if(!navalEditing())return;
        const p=cellOf(e);if(!p)return;
        const h=navalDraft.hover;
        if(h&&h.r===p.r&&h.c===p.c)return;
        navalDraft.hover=p;renderNavalUI();
    });
    own.addEventListener('mouseleave',()=>{
        if(navalDraft.hover){navalDraft.hover=null;renderNavalUI();}
    });

    $('navalShipTray').addEventListener('click',e=>{
        const btn=e.target.closest('[data-ship]');
        if(!btn||!navalEditing())return;
        const id=btn.dataset.ship;
        const placed=navalDraftShip(id);
        if(placed){navalDraft.ships=navalDraft.ships.filter(s=>s.id!==id);navalDraft.horiz=placed.h;}
        navalDraft.selected=id;
        renderNavalUI();
    });
    $('navalRotateBtn').onclick=()=>{navalDraft.horiz=!navalDraft.horiz;renderNavalUI();};
    $('navalRandomBtn').onclick=()=>{
        if(!navalEditing())return;
        const fleet=navalRandomFleet();
        if(fleet){navalDraft.ships=fleet;navalDraft.selected=null;renderNavalUI();}
    };
    $('navalClearBtn').onclick=()=>{
        if(!navalEditing())return;
        navalDraft.ships=[];navalDraft.selected=NAVAL_FLEET[0].id;renderNavalUI();
    };
    $('navalReadyBtn').onclick=()=>{
        if(!navalEditing()||navalDraft.ships.length!==NAVAL_FLEET.length)return;
        requestNavalFleet(navalDraft.ships.map(s=>({id:s.id,len:s.len,r:s.r,c:s.c,h:s.h})));
    };
}
