/* ========================================================================
   MONOPOLIO UI - the 11x11 board, player strip, action buttons, square
   details with build/mortgage controls, and the trade panel. Same pattern as
   the other games: one render function repaints everything from gameState
   each time it changes; nothing is kept between renders except what is
   purely local to this browser (monoUI: which square is selected, the trade
   being drafted).

   Player names come from other browsers, so every one that goes into
   innerHTML is escaped with monoEsc().
   ======================================================================== */

const monoUI={sel:null,tradeOpen:false,draft:null,tradeSig:'',autoBuy:null};
const monoEsc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const monoMoney=n=>'€'+n;
const MONO_DIE='⚀⚁⚂⚃⚄⚅';
const MONO_ICONS={go:'🏁',jail:'⛓️',free:'🅿️',gotojail:'🚔',chance:'❓',chest:'📦',tax:'💸',station:'🚂'};
const $m=id=>document.getElementById(id);

function monoMyIdx(){ return monoIndexOf(gameState,gameState.myPlayerId); }
function monoCur(){ return gameState.monopolio||defaultMonopolioState(); }

// square index -> [row, column] on the 11x11 grid (Start bottom-right, clockwise)
function monoSqPos(i){
    if(i<=10)return [11,11-i];
    if(i<=20)return [11-(i-10),1];
    if(i<=30)return [1,1+(i-20)];
    return [1+(i-30),11];
}
function monoSqIcon(i){
    const s=MONO_BOARD[i];
    if(s.type==='util')return i===12?'💡':'🚰';
    return MONO_ICONS[s.type]||'';
}

/* --------------------------------- board --------------------------------- */
function ensureMonoBoard(){
    const board=$m('monoBoard');
    if(!board||board.dataset.built==='1')return;
    board.dataset.built='1';
    const center=$m('monoCenter');
    for(let i=0;i<40;i++){
        const s=MONO_BOARD[i],[r,c]=monoSqPos(i);
        const el=document.createElement('div');
        el.className='mono-sq mono-t-'+s.type;
        el.dataset.sq=String(i);
        el.style.gridRow=String(r);el.style.gridColumn=String(c);
        const band=s.type==='prop'?`<div class="mono-band" style="background:${MONO_COLORS[s.group]}"></div>`:'';
        const showPrice=monoIsOwnable(i)?`<div class="mono-price">${s.price}</div>`:(s.type==='tax'?`<div class="mono-price">${s.amount}</div>`:'');
        el.innerHTML=`${band}<div class="mono-ico">${monoSqIcon(i)}</div><div class="mono-name"></div>${showPrice}<div class="mono-houses"></div><div class="mono-owner"></div><div class="mono-tokens"></div>`;
        board.insertBefore(el,center);
    }
}

function renderMonoBoard(ms){
    const cur=ms.phase==='in-progress'?ms.turn:-1;
    document.querySelectorAll('#monoBoard .mono-sq').forEach(el=>{
        const i=Number(el.dataset.sq),s=MONO_BOARD[i];
        el.querySelector('.mono-name').textContent=monoSqName(i);
        const owner=ms.owner[i];
        el.querySelector('.mono-owner').style.background=owner!==null&&ms.pl[owner]?ms.pl[owner].color:'transparent';
        const h=ms.houses[i];
        el.querySelector('.mono-houses').innerHTML=h===5?'<i class="mono-hotel"></i>':'<i class="mono-house"></i>'.repeat(h);
        el.classList.toggle('mono-mortgaged',!!ms.mortgaged[i]);
        el.classList.toggle('mono-selected',monoUI.sel===i);
        el.querySelector('.mono-tokens').innerHTML=ms.pl
            .map((p,pi)=>({p,pi})).filter(x=>!x.p.bankrupt&&x.p.pos===i)
            .map(x=>`<i class="mono-token${x.pi===cur?' mono-token-turn':''}" style="background:${x.p.color}" title="${monoEsc(x.p.name)}"></i>`).join('');
    });
}

/* --------------------------------- players ------------------------------- */
function renderMonoPlayers(ms,lobby){
    const box=$m('monoPlayers');
    if(!lobby){
        box.innerHTML=ms.pl.map((p,i)=>{
            const props=ms.owner.filter(o=>o===i).length;
            const cls='mono-player'+(i===ms.turn?' mono-player-turn':'')+(p.bankrupt?' mono-player-out':'');
            const you=p.id===gameState.myPlayerId?` (${t('you')})`:'';
            return `<div class="${cls}"><i class="mono-dot" style="background:${p.color}"></i>
                <span class="mono-pname">${monoEsc(p.name)}${you}${p.isBot?' 🤖':''}</span>
                <span class="mono-pcash">${p.bankrupt?'✖':monoMoney(p.cash)}</span>
                <span class="mono-pmeta">${p.jail?'⛓️ ':''}${p.cards.length?'🎫'+p.cards.length+' ':''}🏠${props}</span></div>`;
        }).join('');
        return;
    }
    // lobby: the seats, with the usual add-bot / remove-bot / kick controls
    const cells=[];
    for(let seat=0;seat<gameState.maxSeats;seat++){
        const p=gameState.players[seat];
        const dot=`<i class="mono-dot" style="background:${MONO_TOKEN_COLORS[seat%6]}"></i>`;
        if(!p){
            const body=gameState.isHost&&gameState.status==='lobby'
                ?`<button data-add-bot="${seat}" class="text-amber-400 hover:text-amber-300 font-bold text-[11px]"><i class="fa-solid fa-plus"></i> ${t('addBot')}</button>`
                :`<span class="text-slate-500">${t('waitingForOpponent')}</span>`;
            cells.push(`<div class="mono-player mono-player-empty">${dot}<span class="mono-pname">${body}</span></div>`);
            continue;
        }
        const you=p.id===gameState.myPlayerId?` (${t('you')})`:'';
        let ctl='';
        if(gameState.isHost&&gameState.status==='lobby'){
            if(p.id!==gameState.myPlayerId)ctl=`<button data-kick-player="${monoEsc(p.id)}" class="ml-1 text-rose-400 hover:text-rose-300"><i class="fa-solid fa-xmark"></i></button>`;
            else if(p.isBot)ctl=`<button data-remove-bot="${seat}" class="ml-1 text-slate-400 hover:text-slate-200"><i class="fa-solid fa-minus"></i></button>`;
            if(p.isBot)ctl=`<button data-remove-bot="${seat}" class="ml-1 text-slate-400 hover:text-slate-200"><i class="fa-solid fa-minus"></i></button>`;
        }
        cells.push(`<div class="mono-player">${dot}<span class="mono-pname">${monoEsc(p.name)}${you}${p.isBot?' 🤖':''}</span>${ctl}</div>`);
    }
    box.innerHTML=cells.join('');
}

/* ---------------------------------- events -------------------------------- */
function monoEventText(ev){
    const ms=monoCur();
    const nm=i=>monoEsc(ms.pl[i]?.name??'?');
    const sq=i=>monoEsc(monoSqName(i));
    switch(ev.k){
        case 'roll':return t('monEv_roll',{name:nm(ev.p),a:ev.a,b:ev.b});
        case 'go':return t('monEv_go',{name:nm(ev.p),amt:monoMoney(ev.amt)});
        case 'buy':return t('monEv_buy',{name:nm(ev.p),sq:sq(ev.sq),amt:monoMoney(ev.amt)});
        case 'rent':return t('monEv_rent',{name:nm(ev.p),to:nm(ev.to),amt:monoMoney(ev.amt),sq:sq(ev.sq)});
        case 'tax':return t('monEv_tax',{name:nm(ev.p),amt:monoMoney(ev.amt)});
        case 'card':return t('monEv_card',{name:nm(ev.p),deck:t(ev.deck==='chance'?'monSq_chance':'monSq_chest'),text:monoEsc(monoCardText(ev.deck,ev.id))});
        case 'jail':return t('monEv_jail',{name:nm(ev.p)});
        case 'jailout':return t('monEv_jailout',{name:nm(ev.p)});
        case 'jailfine':return t('monEv_jailfine',{name:nm(ev.p),amt:monoMoney(MONO_JAIL_FINE)});
        case 'jailstay':return t('monEv_jailstay',{name:nm(ev.p)});
        case 'jailcard':return t('monEv_jailcard',{name:nm(ev.p)});
        case 'build':return t(ev.n===5?'monEv_hotel':'monEv_house',{name:nm(ev.p),sq:sq(ev.sq)});
        case 'sell':return t('monEv_sell',{name:nm(ev.p),sq:sq(ev.sq)});
        case 'mortgage':return t('monEv_mortgage',{name:nm(ev.p),sq:sq(ev.sq)});
        case 'unmortgage':return t('monEv_unmortgage',{name:nm(ev.p),sq:sq(ev.sq)});
        case 'bankrupt':return t(ev.to===null||ev.to===undefined?'monEv_bankruptBank':'monEv_bankrupt',{name:nm(ev.p),to:nm(ev.to)});
        case 'resign':return t('monEv_resign',{name:nm(ev.p)});
        case 'tradeoffer':return t('monEv_tradeoffer',{name:nm(ev.p),to:nm(ev.to)});
        case 'trade':return t('monEv_trade',{name:nm(ev.p),to:nm(ev.to)});
        case 'tradeno':return t('monEv_tradeno',{name:nm(ev.p),to:nm(ev.to)});
        case 'tradecancel':return t('monEv_tradecancel',{name:nm(ev.p)});
    }
    return '';
}
function renderMonoEvents(ms){
    const box=$m('monoEvents');
    box.innerHTML=ms.events.slice(-7).reverse().map(ev=>`<div>${monoEventText(ev)}</div>`).join('');
}

/* ---------------------------------- centre -------------------------------- */
function renderMonoCenter(ms,my,seated){
    const phase=ms.phase,cur=ms.pl[ms.turn];
    const mine=phase==='in-progress'&&my===ms.turn;
    $m('monoDie1').textContent=ms.dice[0]?MONO_DIE[ms.dice[0]-1]:'';
    $m('monoDie2').textContent=ms.dice[1]?MONO_DIE[ms.dice[1]-1]:'';

    let title='',status='';
    if(phase==='waiting'){
        title=t('lobbyWaiting');
        status=seated.length<2?t('waitingForOpponent'):t('monReadyToStart');
    }else if(phase==='ended'){
        title=t('monMatchOver');
        status=monoResultSummary(gameState);
    }else if(ms.trade){
        title=t('monTrade');
        const me=ms.trade.to===my,mineOffer=ms.trade.from===my;
        status=me?t('monTradeForYou',{name:monoEsc(ms.pl[ms.trade.from].name)})
            :(mineOffer?t('monTradeWaiting',{name:monoEsc(ms.pl[ms.trade.to].name)})
                :t('monTradeBetween',{a:monoEsc(ms.pl[ms.trade.from].name),b:monoEsc(ms.pl[ms.trade.to].name)}));
    }else{
        title=mine?t('yourTurn'):t('turnOf',{name:monoEsc(cur.name)});
        const nm=monoEsc(cur.name);
        switch(ms.step){
            case 'roll':status=mine?(cur.jail?t('monInJail'):(ms.rolledDouble?t('monRollAgain'):t('monYourRoll'))):t('monWaitsRoll',{name:nm});break;
            case 'buy':status=mine?t('monBuyPrompt',{sq:monoEsc(monoSqName(ms.buy)),price:monoMoney(MONO_BOARD[ms.buy].price)}):t('monConsidering',{name:nm,sq:monoEsc(monoSqName(ms.buy))});break;
            case 'end':status=mine?t('monYourEnd'):t('monWaitsEnd',{name:nm});break;
            case 'debt':{
                const to=ms.debt.to===null?t('monTheBank'):monoEsc(ms.pl[ms.debt.to].name);
                status=mine?t('monYouOwe',{amt:monoMoney(ms.debt.amount),to}):t('monOwes',{name:nm,amt:monoMoney(ms.debt.amount),to});
                break;
            }
        }
    }
    $m('monoCenterTitle').textContent=title;
    $m('monoStatus').innerHTML=status;

    // the card just drawn stays on screen for a moment
    const recent=ms.events.slice(-3).reverse().find(e=>e.k==='card');
    const cardEl=$m('monoCardText');
    if(recent&&phase==='in-progress'){
        cardEl.classList.remove('hidden');
        cardEl.innerHTML=`<b>${t(recent.deck==='chance'?'monSq_chance':'monSq_chest')}</b><br>${monoEsc(monoCardText(recent.deck,recent.id))}`;
    }else cardEl.classList.add('hidden');

    // action buttons: only mine, only when they apply
    const show=(id,on,enabled=true)=>{const b=$m(id);b.classList.toggle('hidden',!on);b.disabled=!enabled;};
    const canAct=mine&&!ms.trade;
    const myPl=my>=0?ms.pl[my]:null;
    show('monoRollBtn',canAct&&ms.step==='roll');
    show('monoJailPayBtn',canAct&&ms.step==='roll'&&myPl.jail,myPl?.cash>=MONO_JAIL_FINE);
    show('monoJailCardBtn',canAct&&ms.step==='roll'&&myPl.jail&&myPl.cards.length>0);
    show('monoBuyBtn',canAct&&ms.step==='buy');
    show('monoPassBtn',canAct&&ms.step==='buy');
    show('monoEndBtn',canAct&&ms.step==='end');
    show('monoPayDebtBtn',canAct&&ms.step==='debt',!!(myPl&&ms.debt&&myPl.cash>=ms.debt.amount));
    show('monoBankruptBtn',canAct&&ms.step==='debt');
    show('monoTradeBtn',canAct&&(ms.step==='roll'||ms.step==='end')&&ms.tradeCount<3&&ms.pl.filter(p=>!p.bankrupt).length>1);
    if(canAct&&ms.step==='buy')$m('monoBuyBtn').textContent=`${t('monBuy')} ${monoMoney(MONO_BOARD[ms.buy].price)}`;
}

/* ------------------------- selected square + my titles -------------------- */
function renderMonoDetail(ms,my){
    const box=$m('monoDetail');
    const i=monoUI.sel;
    if(i===null){box.innerHTML=`<div class="text-slate-500 text-[11px]">${t('monTapSquare')}</div>`;return;}
    const s=MONO_BOARD[i],owner=ms.owner[i];
    const chip=s.group&&MONO_COLORS[s.group]?`<i class="mono-chip" style="background:${MONO_COLORS[s.group]}"></i>`:'';
    let html=`<div class="flex items-center gap-2 font-extrabold text-sm text-white">${chip}${monoEsc(monoSqName(i))}</div>`;
    if(monoIsOwnable(i)){
        const ownerTxt=owner===null?t('monUnowned'):`${t('monOwner')}: <b style="color:${ms.pl[owner].color}">${monoEsc(ms.pl[owner].name)}</b>`;
        let rows='';
        if(s.type==='prop'){
            const labels=[t('monRentBase'),'1 🏠','2 🏠','3 🏠','4 🏠','🏨'];
            rows=s.rent.map((r,k)=>`<tr><td>${labels[k]}</td><td class="text-right">${monoMoney(r)}</td></tr>`).join('')
                +`<tr><td>${t('monHouseCost')}</td><td class="text-right">${monoMoney(s.house)}</td></tr>`;
        }else if(s.type==='station'){
            rows=[25,50,100,200].map((r,k)=>`<tr><td>${k+1} 🚂</td><td class="text-right">${monoMoney(r)}</td></tr>`).join('');
        }else rows=`<tr><td colspan="2">${t('monUtilRent')}</td></tr>`;
        html+=`<div class="text-[11px] text-slate-300 mt-1">${monoMoney(s.price)} · ${ownerTxt}`
            +`${ms.mortgaged[i]?` · <span class="text-amber-400">${t('monMortgaged')}</span>`:''}</div>`
            +`<table class="mono-rents">${rows}<tr><td>${t('monMortgageValue')}</td><td class="text-right">${monoMoney(monoMortgageValue(i))}</td></tr></table>`;
        if(owner!==null&&my>=0&&owner===my&&ms.phase==='in-progress'){
            const myId=gameState.myPlayerId;
            const btn=(act,label)=>{
                const err=monoValidate(gameState,myId,act,i);
                return `<button data-mono-act="${act}" ${err?'disabled':''} title="${err?monoEsc(err):''}" class="mono-mini-btn">${label}</button>`;
            };
            html+=`<div class="flex flex-wrap gap-1.5 mt-2">`
                +(s.type==='prop'?btn('BUILD',`${t('monBuildBtn')} ${monoMoney(s.house)}`)+btn('SELL',t('monSellBtn')):'')
                +btn('MORTGAGE',`${t('monMortgageBtn')} +${monoMoney(monoMortgageValue(i))}`)
                +btn('UNMORTGAGE',`${t('monUnmortgageBtn')} −${monoMoney(monoUnmortgageCost(i))}`)+`</div>`;
        }
    }else{
        if(s.type==='tax')html+=`<div class="text-[11px] text-slate-300 mt-1">${t('monPayBank',{amt:monoMoney(s.amount)})}</div>`;
        else if(s.type==='go')html+=`<div class="text-[11px] text-slate-300 mt-1">${t('monGoInfo',{amt:monoMoney(MONO_GO_SALARY)})}</div>`;
        else if(s.type==='jail')html+=`<div class="text-[11px] text-slate-300 mt-1">${t('monJailInfo',{amt:monoMoney(MONO_JAIL_FINE)})}</div>`;
    }
    box.innerHTML=html;
}

function renderMonoMine(ms,my){
    const box=$m('monoMine');
    if(my<0||ms.phase==='waiting'){box.innerHTML='';return;}
    const sqs=ms.owner.map((o,i)=>o===my?i:-1).filter(i=>i>=0);
    box.innerHTML=sqs.map(i=>{
        const s=MONO_BOARD[i],bg=MONO_COLORS[s.group]||'#64748b';
        const h=ms.houses[i];
        return `<button data-sq-chip="${i}" class="mono-title${ms.mortgaged[i]?' mono-title-m':''}${monoUI.sel===i?' mono-title-sel':''}" style="border-color:${bg}"><i class="mono-chip" style="background:${bg}"></i>${monoEsc(monoSqName(i))}${h?` <small>${h===5?'🏨':'🏠'+h}</small>`:''}</button>`;
    }).join('')||`<span class="text-slate-500 text-[11px]">${t('monNoTitles')}</span>`;
}

/* ---------------------------------- trading ------------------------------- */
function monoTradeSideHtml(cash,sqs){
    const parts=[];
    if(cash)parts.push(`<b>${monoMoney(cash)}</b>`);
    sqs.forEach(sq=>{
        const g=MONO_BOARD[sq].group;
        parts.push(`<span class="mono-title" style="border-color:${MONO_COLORS[g]||'#64748b'}"><i class="mono-chip" style="background:${MONO_COLORS[g]||'#64748b'}"></i>${monoEsc(monoSqName(sq))}</span>`);
    });
    return parts.join(' ')||'—';
}
function monoDraftOffer(){
    const d=monoUI.draft;
    return {to:d.to,giveCash:d.giveCash,wantCash:d.wantCash,giveSqs:d.giveSqs,wantSqs:d.wantSqs};
}

function renderMonoTrade(ms,my){
    const box=$m('monoTrade');
    if(ms.phase!=='in-progress'||my<0){box.classList.add('hidden');return;}
    const tr=ms.trade;
    if(tr){
        monoUI.tradeOpen=false;monoUI.tradeSig='';
        box.classList.remove('hidden');
        const from=ms.pl[tr.from],to=ms.pl[tr.to];
        let html=`<div class="text-xs font-extrabold text-white mb-1.5">${t('monTradeOffer')}</div>
            <div class="text-[11px] text-slate-300 space-y-1">
              <div><b style="color:${from.color}">${monoEsc(from.name)}</b> ${t('monGives')}: ${monoTradeSideHtml(tr.giveCash,tr.giveSqs)}</div>
              <div><b style="color:${to.color}">${monoEsc(to.name)}</b> ${t('monGives')}: ${monoTradeSideHtml(tr.wantCash,tr.wantSqs)}</div>
            </div>`;
        if(tr.to===my){
            const err=monoValidate(gameState,gameState.myPlayerId,'TRADE_ACCEPT');
            html+=`<div class="flex gap-2 mt-2"><button data-trade="TRADE_ACCEPT" ${err?'disabled':''} title="${err?monoEsc(err):''}" class="mono-mini-btn mono-ok">${t('monAccept')}</button>
                <button data-trade="TRADE_DECLINE" class="mono-mini-btn mono-no">${t('monDecline')}</button></div>`;
        }else if(tr.from===my){
            html+=`<div class="flex gap-2 mt-2"><button data-trade="TRADE_CANCEL" class="mono-mini-btn mono-no">${t('monCancelOffer')}</button></div>`;
        }
        box.innerHTML=html;
        return;
    }
    if(!monoUI.tradeOpen||ms.turn!==my||(ms.step!=='roll'&&ms.step!=='end')){
        monoUI.tradeOpen=false;monoUI.tradeSig='';
        box.classList.add('hidden');return;
    }

    // ---- offer builder (only repainted when something it shows changed, so typing isn't interrupted)
    box.classList.remove('hidden');
    if(!monoUI.draft)monoUI.draft={to:null,giveSqs:[],wantSqs:[],giveCash:0,wantCash:0};
    const d=monoUI.draft;
    if(d.to!==null&&(ms.pl[d.to]?.bankrupt))d.to=null;
    const sig=JSON.stringify([d.to,d.giveSqs,d.wantSqs,ms.owner,ms.houses,ms.pl.map(p=>p.cash),ms.pl.map(p=>p.bankrupt)]);
    if(sig===monoUI.tradeSig&&box.dataset.built==='1')return;
    monoUI.tradeSig=sig;box.dataset.built='1';

    const tradable=sq=>!MONO_GROUPS[MONO_BOARD[sq].group].some(g=>ms.houses[g]>0);
    const titles=(owner,sel,kind)=>ms.owner.map((o,i)=>o===owner?i:-1).filter(i=>i>=0).map(i=>{
        const g=MONO_BOARD[i].group,ok=tradable(i);
        return `<button data-trade-sq="${i}" data-kind="${kind}" ${ok?'':'disabled'} class="mono-title${sel.includes(i)?' mono-title-sel':''}${ok?'':' mono-title-m'}" style="border-color:${MONO_COLORS[g]||'#64748b'}"><i class="mono-chip" style="background:${MONO_COLORS[g]||'#64748b'}"></i>${monoEsc(monoSqName(i))}</button>`;
    }).join('')||'<span class="text-slate-500 text-[11px]">—</span>';

    const others=ms.pl.map((p,i)=>({p,i})).filter(x=>x.i!==my&&!x.p.bankrupt);
    let html=`<div class="text-xs font-extrabold text-white mb-1.5">${t('monTrade')}</div>
        <div class="flex flex-wrap gap-1.5 mb-2">${others.map(x=>`<button data-trade-to="${x.i}" class="mono-title${d.to===x.i?' mono-title-sel':''}" style="border-color:${x.p.color}"><i class="mono-dot" style="background:${x.p.color}"></i>${monoEsc(x.p.name)}</button>`).join('')}</div>`;
    if(d.to!==null){
        html+=`<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div><div class="text-[10px] uppercase tracking-wider text-slate-400 mb-1">${t('monYouGive')}</div>
                <div class="flex flex-wrap gap-1 mb-1.5">${titles(my,d.giveSqs,'give')}</div>
                <label class="text-[11px] text-slate-400">€ <input id="monoGiveCash" type="number" min="0" value="${d.giveCash}" class="mono-num"></label></div>
            <div><div class="text-[10px] uppercase tracking-wider text-slate-400 mb-1">${t('monYouGet')} (${monoEsc(ms.pl[d.to].name)})</div>
                <div class="flex flex-wrap gap-1 mb-1.5">${titles(d.to,d.wantSqs,'want')}</div>
                <label class="text-[11px] text-slate-400">€ <input id="monoWantCash" type="number" min="0" value="${d.wantCash}" class="mono-num"></label></div>
        </div>`;
        const err=monoValidate(gameState,gameState.myPlayerId,'TRADE_OFFER',null,monoDraftOffer());
        const empty=!d.giveCash&&!d.wantCash&&!d.giveSqs.length&&!d.wantSqs.length;
        html+=`<div id="monoTradeErr" class="text-[11px] text-rose-300 mt-1.5 min-h-[1em]">${empty?'':(err?monoEsc(err):'')}</div>
            <div class="flex gap-2 mt-1.5"><button id="monoTradeSend" ${err?'disabled':''} class="mono-mini-btn mono-ok">${t('monSendOffer')}</button>
            <button id="monoTradeClose" class="mono-mini-btn">${t('monClose')}</button></div>`;
    }else{
        html+=`<div class="text-[11px] text-slate-500">${t('monPickPlayer')}</div>
            <div class="mt-1.5"><button id="monoTradeClose" class="mono-mini-btn">${t('monClose')}</button></div>`;
    }
    box.innerHTML=html;
}

/* ---------------------------------- render -------------------------------- */
function renderMonopolioUI(){
    try{
        ensureMonoBoard();
        const ms=monoCur();
        const my=monoMyIdx();
        const seated=monoMatchPlayers(gameState);
        const lobby=ms.phase!=='in-progress';

        // on my turn, a title I may buy is the interesting square
        if(ms.phase==='in-progress'&&ms.step==='buy'&&ms.turn===my&&monoUI.autoBuy!==ms.buy){monoUI.sel=ms.buy;monoUI.autoBuy=ms.buy;}
        if(ms.step!=='buy')monoUI.autoBuy=null;

        renderMonoPlayers(ms,lobby);
        renderMonoBoard(ms);
        renderMonoCenter(ms,my,seated);
        renderMonoDetail(ms,my);
        renderMonoMine(ms,my);
        renderMonoTrade(ms,my);
        renderMonoEvents(ms);

        const startBtn=$m('startMonopolioBtn');
        if(startBtn){
            startBtn.disabled=!(gameState.isHost&&ms.phase!=='in-progress'&&seated.length>=2);
            startBtn.querySelector('span').textContent=ms.phase==='ended'?t('monRematch'):t('monStart');
        }
        const resignBtn=$m('monoResignBtn');
        if(resignBtn)resignBtn.disabled=!(ms.phase==='in-progress'&&my>=0&&!ms.pl[my].bankrupt);

        const mySeat=gameState.players.findIndex(p=>p?.id===gameState.myPlayerId);
        const iAmSeated=mySeat>=0&&!gameState.players[mySeat].spectator;
        $m('spectatorBanner').classList.toggle('hidden',!(!iAmSeated&&ms.phase==='in-progress'));

        renderRoomHistory();
    }catch(e){logMessage(`Monopolioo render error: ${e.message}`,'error');}
}

/* -------------------------------- interaction ----------------------------- */
function bindMonopolioUI(){
    const act=(id,action)=>{$m(id).onclick=()=>requestMonopolioAction(action);};
    act('monoRollBtn','ROLL');act('monoBuyBtn','BUY');act('monoPassBtn','PASS');act('monoEndBtn','END_TURN');
    act('monoJailPayBtn','JAIL_PAY');act('monoJailCardBtn','JAIL_CARD');act('monoPayDebtBtn','PAY_DEBT');
    $m('monoBankruptBtn').onclick=()=>{
        showModal(t('monBankruptTitle'),t('monBankruptConfirm'),[
            {text:'OK',bg:'bg-blue-600 hover:bg-blue-500',onClick:async()=>{requestMonopolioAction('BANKRUPT');}},
            {text:'Cancel',bg:'bg-purple-600 hover:bg-purple-500',close:true}
        ]);
    };
    $m('monoTradeBtn').onclick=()=>{
        monoUI.tradeOpen=true;monoUI.draft={to:null,giveSqs:[],wantSqs:[],giveCash:0,wantCash:0};
        $m('monoTrade').dataset.built='0';monoUI.tradeSig='';
        renderMonopolioUI();
    };
    $m('startMonopolioBtn').onclick=()=>{if(gameState.isHost)hostStartMonopolioMatch();};
    $m('monoResignBtn').onclick=()=>{
        showModal(t('monResignTitle'),t('monResignConfirm'),[
            {text:'OK',bg:'bg-blue-600 hover:bg-blue-500',onClick:async()=>{requestMonopolioAction('RESIGN');}},
            {text:'Cancel',bg:'bg-purple-600 hover:bg-purple-500',close:true}
        ]);
    };

    // selecting squares / titles
    $m('monoBoard').addEventListener('click',e=>{
        const sq=e.target.closest('.mono-sq');
        if(sq){monoUI.sel=Number(sq.dataset.sq);renderMonopolioUI();}
    });
    $m('monoMine').addEventListener('click',e=>{
        const chip=e.target.closest('[data-sq-chip]');
        if(chip){monoUI.sel=Number(chip.dataset.sqChip);renderMonopolioUI();}
    });
    // build / sell / mortgage / unmortgage on the selected title
    $m('monoDetail').addEventListener('click',e=>{
        const b=e.target.closest('[data-mono-act]');
        if(b&&!b.disabled&&monoUI.sel!==null)requestMonopolioAction(b.dataset.monoAct,monoUI.sel);
    });

    // trade panel (offer builder + answering an offer)
    const box=$m('monoTrade');
    box.addEventListener('click',e=>{
        const d=monoUI.draft;
        const resp=e.target.closest('[data-trade]');
        if(resp&&!resp.disabled){requestMonopolioAction(resp.dataset.trade);return;}
        if(!d)return;
        const to=e.target.closest('[data-trade-to]');
        if(to){d.to=Number(to.dataset.tradeTo);d.wantSqs=[];d.wantCash=0;renderMonopolioUI();return;}
        const sq=e.target.closest('[data-trade-sq]');
        if(sq&&!sq.disabled){
            const list=sq.dataset.kind==='give'?d.giveSqs:d.wantSqs,n=Number(sq.dataset.tradeSq);
            const k=list.indexOf(n);if(k>=0)list.splice(k,1);else list.push(n);
            renderMonopolioUI();return;
        }
        if(e.target.closest('#monoTradeClose')){monoUI.tradeOpen=false;renderMonopolioUI();return;}
        if(e.target.closest('#monoTradeSend')){
            const s=e.target.closest('#monoTradeSend');
            if(!s.disabled){const offer=monoDraftOffer();monoUI.tradeOpen=false;requestMonopolioAction('TRADE_OFFER',null,offer);}
        }
    });
    box.addEventListener('input',e=>{
        const d=monoUI.draft;if(!d)return;
        const n=Math.max(0,Math.floor(Number(e.target.value))||0);
        if(e.target.id==='monoGiveCash')d.giveCash=n;
        else if(e.target.id==='monoWantCash')d.wantCash=n;
        else return;
        // refresh just the validation line and send button, leaving the focused input alone
        const err=monoValidate(gameState,gameState.myPlayerId,'TRADE_OFFER',null,monoDraftOffer());
        const empty=!d.giveCash&&!d.wantCash&&!d.giveSqs.length&&!d.wantSqs.length;
        const errEl=$m('monoTradeErr'),send=$m('monoTradeSend');
        if(errEl)errEl.textContent=empty?'':(err||'');
        if(send)send.disabled=!!err;
        const ms=monoCur();
        monoUI.tradeSig=JSON.stringify([d.to,d.giveSqs,d.wantSqs,ms.owner,ms.houses,ms.pl.map(p=>p.cash),ms.pl.map(p=>p.bankrupt)]);
    });
}
