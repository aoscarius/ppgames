/* ========================================================================
   NAVAL BATTLE GAME LOGIC - match lifecycle, fleet validation, shot
   resolution, bot AI.

   Same host-authoritative pattern as games/othello/logic.js and
   games/chess/logic.js: every function here that mutates state runs ONLY
   on the host and changes gameState.naval directly; the result is then
   broadcast to every peer through broadcastState().

   Unlike chess/othello this is a game of HIDDEN information. The shape of
   gameState.naval is therefore split into a secret part and a public part:

     fleets[i]   SECRET  ship positions of player i. The host holds both;
                         publicState() (see game.js) strips fleets[j] from
                         the copy sent to every peer j != i, until the
                         match is over.
     ready[i]    public  player i has finished deploying
     shots[i]    public  every shot fired AT player i's waters: {r,c,hit}
     sunk[i]     public  ships of player i that are already sunk (their
                         positions become known to everybody, as in the
                         real game)
   ======================================================================== */

const NAVAL_SIZE=10;
const NAVAL_FLEET=[
    {id:'carrier',    len:5},
    {id:'battleship', len:4},
    {id:'cruiser',    len:3},
    {id:'submarine',  len:3},
    {id:'destroyer',  len:2}
];

function defaultNavalState(){
    return {
        phase:'waiting',        // 'waiting' | 'placing' | 'in-progress' | 'ended'
        ids:[null,null],        // player ids; ids[0] fires first
        fleets:[null,null],     // SECRET: [{id,len,r,c,h}] per player (h = horizontal)
        ready:[false,false],
        shots:[[],[]],
        sunk:[[],[]],
        turn:0,                 // index (0|1) of the player who fires next
        winner:null,            // 0 | 1 | null
        resultReason:null,      // 'victory' | 'resignation'
        lastShot:null           // {by,target,r,c,hit,sunk:shipId|null}
    };
}

function navalMatchPlayers(state=gameState){
    return state.players.filter(p=>p&&!p.spectator).slice(0,2);
}

function navalIndexOf(state,playerId){
    return playerId&&state.naval?state.naval.ids.indexOf(playerId):-1;
}

function navalName(state,idx){
    return state.players.find(p=>p?.id===state.naval.ids[idx])?.name||'?';
}

function navalCellLabel(r,c){ return String.fromCharCode(65+c)+(r+1); }

function navalShipCells(ship){
    const cells=[];
    for(let i=0;i<ship.len;i++)cells.push({r:ship.r+(ship.h?0:i),c:ship.c+(ship.h?i:0)});
    return cells;
}

function navalInBounds(r,c){ return r>=0&&c>=0&&r<NAVAL_SIZE&&c<NAVAL_SIZE; }

// True when `ship` overlaps any ship in `others` (a ship never overlaps itself).
function navalOverlaps(ship,others){
    const occ=new Set();
    for(const o of others){
        if(o.id===ship.id)continue;
        for(const {r,c} of navalShipCells(o))occ.add(r*NAVAL_SIZE+c);
    }
    return navalShipCells(ship).some(({r,c})=>occ.has(r*NAVAL_SIZE+c));
}

// Host-side check of a fleet sent by a client: exactly the standard ships,
// inside the grid, no overlaps. Returns a sanitized copy, or null if invalid.
function navalValidateFleet(ships){
    if(!Array.isArray(ships)||ships.length!==NAVAL_FLEET.length)return null;
    const out=[];
    for(const def of NAVAL_FLEET){
        const s=ships.find(x=>x&&x.id===def.id);
        if(!s||!Number.isInteger(s.r)||!Number.isInteger(s.c)||typeof s.h!=='boolean')return null;
        const ship={id:def.id,len:def.len,r:s.r,c:s.c,h:s.h};
        if(navalShipCells(ship).some(({r,c})=>!navalInBounds(r,c)))return null;
        if(navalOverlaps(ship,out))return null;
        out.push(ship);
    }
    return out;
}

function navalRandomFleet(){
    for(let attempt=0;attempt<100;attempt++){
        const ships=[];let ok=true;
        for(const def of NAVAL_FLEET){
            let placed=false;
            for(let tries=0;tries<200&&!placed;tries++){
                const h=Math.random()<0.5;
                const r=Math.floor(Math.random()*(h?NAVAL_SIZE:NAVAL_SIZE-def.len+1));
                const c=Math.floor(Math.random()*(h?NAVAL_SIZE-def.len+1:NAVAL_SIZE));
                const ship={id:def.id,len:def.len,r,c,h};
                if(navalOverlaps(ship,ships))continue;
                ships.push(ship);placed=true;
            }
            if(!placed){ok=false;break;}
        }
        if(ok)return ships;
    }
    return null;   // practically unreachable on a 10x10 grid
}

function navalShipAt(fleet,r,c){
    if(!fleet)return null;
    return fleet.find(s=>navalShipCells(s).some(cell=>cell.r===r&&cell.c===c))||null;
}

function navalShipIsSunk(ship,shots){
    return navalShipCells(ship).every(({r,c})=>shots.some(s=>s.hit&&s.r===r&&s.c===c));
}

/* ---------------------------- match lifecycle --------------------------- */

function startNavalMatch(state=gameState){
    const players=navalMatchPlayers(state);
    if(players.length<2)return {ok:false,error:t('navalNeedTwo')};
    const prev=state.naval?.ids||[null,null];
    let a,b;
    if(prev[0]&&players.some(p=>p.id===prev[0])&&players.some(p=>p.id===prev[1])){
        // Rematch: the player who fired second last time fires first now.
        a=players.find(p=>p.id===prev[1]);b=players.find(p=>p.id===prev[0]);
    }else{
        const order=Math.random()<0.5?players:[...players].reverse();
        a=order[0];b=order[1];
    }
    const ns=state.naval=defaultNavalState();
    ns.ids=[a.id,b.id];
    ns.phase='placing';
    // Bots deploy immediately; humans deploy from their own browser.
    [a,b].forEach((p,i)=>{
        if(p.isBot){ns.fleets[i]=navalRandomFleet();ns.ready[i]=true;}
    });
    state.status='in-progress';
    navalMaybeBegin(state);
    return {ok:true};
}

function navalMaybeBegin(state){
    const ns=state.naval;
    if(ns.phase==='placing'&&ns.ready[0]&&ns.ready[1]){
        ns.phase='in-progress';ns.turn=0;
        appendChatMessage('System',t('navalBattleBegins'),true);
    }
}

function processNavalFleet(state,playerId,ships){
    const ns=state.naval;
    if(!ns||ns.phase!=='placing')return {ok:false,error:t('navalNoMatch')};
    const idx=navalIndexOf(state,playerId);
    if(idx<0)return {ok:false,error:t('navalNotPlayer')};
    if(ns.ready[idx])return {ok:false,error:t('navalAlreadyReady')};
    const fleet=navalValidateFleet(ships);
    if(!fleet)return {ok:false,error:t('navalBadFleet')};
    ns.fleets[idx]=fleet;ns.ready[idx]=true;
    navalMaybeBegin(state);
    return {ok:true};
}

function navalResultSummary(state){
    const ns=state.naval;
    if(ns.winner==null)return '';
    const name=navalName(state,ns.winner);
    return ns.resultReason==='resignation'
        ? t('navalWinResign',{name})
        : t('navalWinVictory',{name});
}

// Host-authoritative shot. Turns alternate after every shot (classic rules).
function processNavalShot(state,playerId,r,c){
    const ns=state.naval;
    if(!ns||ns.phase!=='in-progress')return {ok:false,error:t('navalNoMatch')};
    const idx=navalIndexOf(state,playerId);
    if(idx<0)return {ok:false,error:t('navalNotPlayer')};
    if(ns.turn!==idx)return {ok:false,error:t('navalNotYourTurn')};
    if(!Number.isInteger(r)||!Number.isInteger(c)||!navalInBounds(r,c))return {ok:false,error:t('navalBadCell')};
    const target=1-idx;
    if(ns.shots[target].some(s=>s.r===r&&s.c===c))return {ok:false,error:t('navalAlreadyFired')};

    const ship=navalShipAt(ns.fleets[target],r,c);
    const hit=!!ship;
    ns.shots[target].push({r,c,hit});
    ns.lastShot={by:idx,target,r,c,hit,sunk:null};

    if(ship&&navalShipIsSunk(ship,ns.shots[target])){
        ns.sunk[target].push(ship);
        ns.lastShot.sunk=ship.id;
        appendChatMessage('System',t('navalSunkMsg',{name:navalName(state,idx),ship:t('navalShip_'+ship.id)}),true);
    }

    if(ns.sunk[target].length===NAVAL_FLEET.length){
        ns.phase='ended';ns.winner=idx;ns.resultReason='victory';
        state.status='lobby';
        appendChatMessage('System',navalResultSummary(state),true);
    }else{
        ns.turn=target;
    }
    return {ok:true};
}

function requestNavalResign(state,playerId){
    const ns=state.naval;
    if(!ns||(ns.phase!=='placing'&&ns.phase!=='in-progress'))return {ok:false,error:t('navalNoMatch')};
    const idx=navalIndexOf(state,playerId);
    if(idx<0)return {ok:false,error:t('navalNotPlayer')};
    ns.phase='ended';ns.winner=1-idx;ns.resultReason='resignation';
    state.status='lobby';
    appendChatMessage('System',navalResultSummary(state),true);
    return {ok:true};
}

/* --------------------------------------------------------------------
   Bot: probability-density hunting. For every ship still afloat it counts
   every placement that is consistent with what the bot has seen (no miss,
   no already-sunk cell inside it) and adds that placement's weight to each
   unshot cell it covers. Placements that pass through a live (unsunk) hit
   weigh far more, so the bot naturally switches from hunting to finishing
   a ship it has found, and extends along the line of two adjacent hits.
   It uses only public information (shots/sunk), never the real fleet.
   -------------------------------------------------------------------- */
function chooseNavalBotShot(state,botIdx){
    const ns=state.naval,target=1-botIdx,N=NAVAL_SIZE;
    const grid=Array.from({length:N},()=>Array(N).fill(0));   // 0 unknown, 1 miss, 2 live hit, 3 sunk
    for(const s of ns.shots[target])grid[s.r][s.c]=s.hit?2:1;
    for(const ship of ns.sunk[target])for(const {r,c} of navalShipCells(ship))grid[r][c]=3;
    const sunkIds=new Set(ns.sunk[target].map(s=>s.id));
    const weight=Array.from({length:N},()=>Array(N).fill(0));

    for(const def of NAVAL_FLEET){
        if(sunkIds.has(def.id))continue;
        for(const h of [true,false]){
            for(let r=0;r<N;r++)for(let c=0;c<N;c++){
                if(h?c+def.len>N:r+def.len>N)continue;
                const cells=navalShipCells({len:def.len,r,c,h});
                let hits=0,blocked=false;
                for(const cell of cells){
                    const v=grid[cell.r][cell.c];
                    if(v===1||v===3){blocked=true;break;}
                    if(v===2)hits++;
                }
                if(blocked)continue;
                const w=hits?1+hits*hits*40:1;
                for(const cell of cells)if(grid[cell.r][cell.c]===0)weight[cell.r][cell.c]+=w;
            }
        }
    }

    let best=[],bestW=-1;
    for(let r=0;r<N;r++)for(let c=0;c<N;c++){
        if(grid[r][c]!==0)continue;
        if(weight[r][c]>bestW){bestW=weight[r][c];best=[{r,c}];}
        else if(weight[r][c]===bestW)best.push({r,c});
    }
    return best.length?best[Math.floor(Math.random()*best.length)]:null;
}
