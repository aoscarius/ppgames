/* ========================================================================
   MONOPOLIO GAME LOGIC - match lifecycle and every rule of the game.

   Same host-authoritative pattern as games/othello and games/naval: all
   mutating functions run ONLY on the host and change gameState.monopolio
   directly; the result is broadcast verbatim.

   Everything a player can do is one "action" validated by monoValidate()
   and applied by processMonopolioAction(); the UI uses monoValidate() too,
   to decide which buttons are enabled.

   State (gameState.monopolio):
     pl[]        seats in turn order: {id,name,isBot,color,pos,cash,jail,
                 jailTurns,cards:[{deck,id}],bankrupt}
     turn        index into pl of the player whose turn it is
     step        'roll' | 'buy' | 'end' | 'debt'
                   roll  the player has to (or may, after doubles) roll
                   buy   standing on an unowned title they can afford
                   end    nothing left to do but manage / end the turn
                   debt  owes more than their cash: raise money or go bankrupt
     owner[40]   index into pl, or null          houses[40]  0..4 houses, 5 = hotel
     mortgaged[40]
     buy / debt / pendingMove   data for the steps above
     decks       SECRET, shuffled card order (stripped by publicState)
     events[]    machine-readable log, rendered by the UI in the local language

   Not implemented (deliberately, to keep a match playable in one sitting):
   auctions for declined titles and player-to-player trading.
   ======================================================================== */

function defaultMonopolioState(){
    return {
        phase:'waiting',         // 'waiting' | 'in-progress' | 'ended'
        pl:[],turn:0,step:'roll',
        dice:[0,0],doublesCount:0,rolledDouble:false,
        owner:Array(40).fill(null),
        houses:Array(40).fill(0),
        mortgaged:Array(40).fill(false),
        buy:null,debt:null,pendingMove:0,
        trade:null,tradeSeq:0,tradeCount:0,   // one pending offer at a time; tradeCount = offers made this turn
        decks:null,events:[],lastCard:null,winner:null
    };
}

function monoMatchPlayers(state=gameState){
    return state.players.filter(p=>p&&!p.spectator).slice(0,6);
}
function monoIndexOf(state,playerId){
    return playerId&&state.monopolio?state.monopolio.pl.findIndex(p=>p.id===playerId):-1;
}
function monoShuffle(arr){
    const a=[...arr];
    for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
    return a;
}
function monoEvent(state,ev){
    const evs=state.monopolio.events;
    evs.push(ev);
    if(evs.length>40)evs.shift();
}

/* ------------------------------ bank supply ------------------------------ */
function monoSupply(ms){
    let houses=0,hotels=0;
    for(const h of ms.houses){if(h===5)hotels++;else houses+=h;}
    return {houses:MONO_MAX_HOUSES-houses,hotels:MONO_MAX_HOTELS-hotels};
}
function monoOwnsSet(ms,idx,group){
    return MONO_GROUPS[group].every(sq=>ms.owner[sq]===idx);
}
function monoOwnedCount(ms,idx,group){
    return MONO_GROUPS[group].filter(sq=>ms.owner[sq]===idx).length;
}

/* ---------------------------------- rent --------------------------------- */
function monoRentFor(state,sq,diceSum,opts={}){
    const ms=state.monopolio,sd=MONO_BOARD[sq],owner=ms.owner[sq];
    if(owner===null||ms.mortgaged[sq])return 0;
    if(sd.type==='station'){
        const r=25*Math.pow(2,monoOwnedCount(ms,owner,'station')-1);
        return opts.double?r*2:r;
    }
    if(sd.type==='util'){
        const mult=opts.util10?10:(monoOwnedCount(ms,owner,'util')>=2?10:4);
        return mult*diceSum;
    }
    const h=ms.houses[sq];
    let rent=sd.rent[h];
    if(h===0&&monoOwnsSet(ms,owner,sd.group))rent*=2;
    return rent;
}

/* ---------------------------- match lifecycle ---------------------------- */
function startMonopolioMatch(state=gameState){
    const players=monoMatchPlayers(state);
    if(players.length<2)return {ok:false,error:t('monNeedTwo')};
    const order=monoShuffle(players);
    const ms=state.monopolio=defaultMonopolioState();
    ms.pl=order.map((p,i)=>({
        id:p.id,name:p.name,isBot:!!p.isBot,color:MONO_TOKEN_COLORS[i],
        pos:0,cash:MONO_START_CASH,jail:false,jailTurns:0,cards:[],bankrupt:false
    }));
    ms.decks={
        chance:monoShuffle(MONO_CARDS.chance.map((_,i)=>i)),
        chest:monoShuffle(MONO_CARDS.chest.map((_,i)=>i))
    };
    ms.phase='in-progress';ms.turn=0;ms.step='roll';
    state.status='in-progress';
    return {ok:true};
}

function monoCheckWinner(state){
    const ms=state.monopolio;
    const alive=ms.pl.map((p,i)=>p.bankrupt?-1:i).filter(i=>i>=0);
    if(alive.length>1)return false;
    ms.phase='ended';ms.winner=alive.length?alive[0]:null;
    ms.step='end';ms.debt=null;ms.buy=null;
    state.status='lobby';
    appendChatMessage('System',monoResultSummary(state),true);
    return true;
}
function monoResultSummary(state){
    const ms=state.monopolio;
    if(ms.winner===null)return '';
    return t('monWins',{name:ms.pl[ms.winner].name});
}

function monoNextTurn(state){
    const ms=state.monopolio,n=ms.pl.length;
    ms.doublesCount=0;ms.rolledDouble=false;ms.debt=null;ms.buy=null;
    ms.trade=null;ms.tradeCount=0;
    for(let k=1;k<=n;k++){
        const j=(ms.turn+k)%n;
        if(!ms.pl[j].bankrupt){ms.turn=j;break;}
    }
    ms.step='roll';
}

// After a square has been fully resolved: roll again after doubles, else wrap up.
function monoFinish(state){
    const ms=state.monopolio,pl=ms.pl[ms.turn];
    ms.step=(ms.rolledDouble&&!pl.jail&&!pl.bankrupt)?'roll':'end';
}

/* --------------------------------- moving -------------------------------- */
function monoMove(state,idx,newPos,collect){
    const ms=state.monopolio,pl=ms.pl[idx];
    if(collect&&newPos<pl.pos){
        pl.cash+=MONO_GO_SALARY;
        monoEvent(state,{k:'go',p:idx,amt:MONO_GO_SALARY});
    }
    pl.pos=newPos;
}
function monoSendToJail(state,idx){
    const ms=state.monopolio,pl=ms.pl[idx];
    pl.pos=MONO_JAIL_POS;pl.jail=true;pl.jailTurns=0;
    ms.rolledDouble=false;ms.doublesCount=0;
    monoEvent(state,{k:'jail',p:idx});
}

// Pay `amount` to the bank (to===null) or to player `to`. If the player can't
// cover it the game enters the 'debt' step instead of paying.
function monoCharge(state,idx,amount,to,cont){
    const ms=state.monopolio,pl=ms.pl[idx];
    if(amount<=0)return true;
    if(pl.cash>=amount){
        pl.cash-=amount;
        if(to!==null&&to!==undefined)ms.pl[to].cash+=amount;
        return true;
    }
    ms.debt={to:to===undefined?null:to,amount,cont:cont||'land'};
    ms.step='debt';
    return false;
}

/* -------------------------------- landing -------------------------------- */
function monoLandOn(state,idx,opts={}){
    const ms=state.monopolio,pl=ms.pl[idx],sq=pl.pos,sd=MONO_BOARD[sq];
    switch(sd.type){
        case 'gotojail':monoSendToJail(state,idx);return;
        case 'tax':
            monoEvent(state,{k:'tax',p:idx,amt:sd.amount,sq});
            monoCharge(state,idx,sd.amount,null);
            return;
        case 'chance':case 'chest':monoDrawCard(state,idx,sd.type);return;
        case 'prop':case 'station':case 'util':{
            const owner=ms.owner[sq];
            if(owner===null){
                if(pl.cash>=sd.price){ms.buy=sq;ms.step='buy';}
                return;
            }
            if(owner===idx||ms.mortgaged[sq])return;
            const rent=monoRentFor(state,sq,ms.dice[0]+ms.dice[1],opts);
            monoEvent(state,{k:'rent',p:idx,to:owner,amt:rent,sq});
            monoCharge(state,idx,rent,owner);
            return;
        }
    }
}
function monoResolve(state,idx,opts){
    const ms=state.monopolio;
    monoLandOn(state,idx,opts);
    if(ms.step!=='buy'&&ms.step!=='debt')monoFinish(state);
}
function monoStepMove(state,idx,sum){
    const pl=state.monopolio.pl[idx];
    monoMove(state,idx,(pl.pos+sum)%40,true);
    monoResolve(state,idx);
}

function monoDrawCard(state,idx,deck){
    const ms=state.monopolio,pl=ms.pl[idx];
    const order=ms.decks[deck];
    const id=order.shift();
    const card=MONO_CARDS[deck][id];
    ms.lastCard={deck,id,by:idx};
    monoEvent(state,{k:'card',p:idx,deck,id});
    let keep=false;
    switch(card.t){
        case 'money':
            if(card.amt>=0)pl.cash+=card.amt;
            else monoCharge(state,idx,-card.amt,null);
            break;
        case 'move':
            monoMove(state,idx,card.to,true);
            monoLandOn(state,idx);
            break;
        case 'rel':
            pl.pos=(pl.pos+card.n+40)%40;
            monoLandOn(state,idx);
            break;
        case 'nearest':{
            let to=pl.pos;
            do{to=(to+1)%40;}while(MONO_BOARD[to].type!==card.kind);
            monoMove(state,idx,to,true);
            monoLandOn(state,idx,{double:card.kind==='station',util10:card.kind==='util'});
            break;
        }
        case 'jail':monoSendToJail(state,idx);break;
        case 'jailcard':pl.cards.push({deck,id});keep=true;break;
        case 'repairs':{
            let h=0,H=0;
            ms.owner.forEach((o,sq)=>{if(o===idx){if(ms.houses[sq]===5)H++;else h+=ms.houses[sq];}});
            monoCharge(state,idx,h*card.h+H*card.H,null);
            break;
        }
    }
    if(!keep)order.push(id);
}

/* ---------------------------------- rolling ------------------------------ */
function monoApplyRoll(state,idx){
    const ms=state.monopolio,pl=ms.pl[idx];
    const d1=1+Math.floor(Math.random()*6),d2=1+Math.floor(Math.random()*6);
    ms.dice=[d1,d2];
    monoEvent(state,{k:'roll',p:idx,a:d1,b:d2});
    const dbl=d1===d2;

    if(pl.jail){
        if(dbl){
            pl.jail=false;pl.jailTurns=0;ms.rolledDouble=false;
            monoEvent(state,{k:'jailout',p:idx});
            monoStepMove(state,idx,d1+d2);
            return;
        }
        pl.jailTurns++;
        ms.rolledDouble=false;
        if(pl.jailTurns>=3){
            // third failed attempt: the fine is compulsory, then move
            if(pl.cash>=MONO_JAIL_FINE){
                pl.cash-=MONO_JAIL_FINE;pl.jail=false;pl.jailTurns=0;
                monoEvent(state,{k:'jailfine',p:idx});
                monoStepMove(state,idx,d1+d2);
            }else{
                ms.pendingMove=d1+d2;
                monoCharge(state,idx,MONO_JAIL_FINE,null,'jailmove');
            }
            return;
        }
        monoEvent(state,{k:'jailstay',p:idx});
        ms.step='end';
        return;
    }

    if(dbl){
        ms.doublesCount++;
        if(ms.doublesCount>=3){monoSendToJail(state,idx);ms.step='end';return;}
        ms.rolledDouble=true;
    }else{
        ms.doublesCount=0;ms.rolledDouble=false;
    }
    monoStepMove(state,idx,d1+d2);
}

/* ------------------------------- bankruptcy ------------------------------ */
// creditor: index of the player owed the money, or null for the bank.
function monoBankrupt(state,idx,creditor){
    const ms=state.monopolio,pl=ms.pl[idx];
    for(let sq=0;sq<40;sq++){
        if(ms.owner[sq]!==idx)continue;
        if(creditor!==null){
            // houses go back to the bank for half their price; the titles
            // (mortgaged ones stay mortgaged) pass to the creditor
            if(ms.houses[sq]>0){pl.cash+=Math.floor(MONO_BOARD[sq].house/2)*ms.houses[sq];ms.houses[sq]=0;}
            ms.owner[sq]=creditor;
        }else{
            ms.owner[sq]=null;ms.houses[sq]=0;ms.mortgaged[sq]=false;
        }
    }
    if(creditor!==null){
        ms.pl[creditor].cash+=pl.cash;
        ms.pl[creditor].cards.push(...pl.cards);
    }else{
        pl.cards.forEach(c=>ms.decks[c.deck].push(c.id));
    }
    pl.cash=0;pl.cards=[];pl.bankrupt=true;pl.jail=false;
    monoEvent(state,{k:'bankrupt',p:idx,to:creditor});
    appendChatMessage('System',t('monBankruptMsg',{name:pl.name}),true);

    const wasTurn=ms.turn===idx;
    if(ms.trade&&(ms.trade.from===idx||ms.trade.to===idx))ms.trade=null;   // an offer involving them dies with them
    if(ms.debt&&ms.debt.to===idx)ms.debt.to=null;   // someone else's debt owed to the bankrupt player
    if(wasTurn){ms.debt=null;ms.buy=null;}
    if(!monoCheckWinner(state)&&wasTurn)monoNextTurn(state);
}

/* ----------------------------- validation/apply -------------------------- */
function monoValidateMgmt(state,idx,action,sq){
    const ms=state.monopolio,pl=ms.pl[idx];
    if(ms.step!=='roll'&&ms.step!=='end'&&ms.step!=='debt')return t('monErrStep');
    if(!Number.isInteger(sq)||sq<0||sq>=40||!monoIsOwnable(sq)||ms.owner[sq]!==idx)return t('monErrNotOwner');
    const sd=MONO_BOARD[sq],group=MONO_GROUPS[sd.group];
    const inDebt=ms.step==='debt';
    switch(action){
        case 'BUILD':{
            if(inDebt)return t('monErrStep');
            if(sd.type!=='prop')return t('monErrNoHouses');
            if(!monoOwnsSet(ms,idx,sd.group))return t('monErrNeedSet');
            if(group.some(g=>ms.mortgaged[g]))return t('monErrGroupMortgaged');
            const h=ms.houses[sq];
            if(h>=5)return t('monErrMaxBuilt');
            if(h>Math.min(...group.map(g=>ms.houses[g])))return t('monErrEven');
            if(pl.cash<sd.house)return t('monErrCash');
            const sup=monoSupply(ms);
            if(h<4&&sup.houses<1)return t('monErrNoHouseSupply');
            if(h===4&&sup.hotels<1)return t('monErrNoHotelSupply');
            return null;
        }
        case 'SELL':{
            if(sd.type!=='prop'||ms.houses[sq]<1)return t('monErrNothingToSell');
            if(ms.houses[sq]<Math.max(...group.map(g=>ms.houses[g])))return t('monErrEven');
            if(ms.houses[sq]===5&&monoSupply(ms).houses<4)return t('monErrNoHouseSupply');
            return null;
        }
        case 'MORTGAGE':
            if(ms.mortgaged[sq])return t('monErrAlreadyMortgaged');
            if(group.some(g=>ms.houses[g]>0))return t('monErrSellHousesFirst');
            return null;
        case 'UNMORTGAGE':
            if(inDebt)return t('monErrStep');
            if(!ms.mortgaged[sq])return t('monErrNotMortgaged');
            if(pl.cash<monoUnmortgageCost(sq))return t('monErrCash');
            return null;
    }
    return t('monErrAction');
}

/* --------------------------------- trading ------------------------------- */
// An offer: the proposer (`from`) gives giveSqs + giveCash and wants
// wantSqs + wantCash from player `to`. Only one offer can be open at a time and
// the whole table waits for the answer (or for the proposer to cancel).
function monoSanitizeTrade(x){
    if(!x||typeof x!=='object')return null;
    const list=a=>Array.isArray(a)?[...new Set(a)].filter(Number.isInteger):null;
    const giveSqs=list(x.giveSqs),wantSqs=list(x.wantSqs);
    if(!giveSqs||!wantSqs)return null;
    if(![x.to,x.giveCash,x.wantCash].every(Number.isInteger))return null;
    return {to:x.to,giveCash:x.giveCash,wantCash:x.wantCash,giveSqs,wantSqs};
}

// Terms must hold both when the offer is made and when it is accepted.
function monoCheckTradeTerms(state,from,to,tr){
    const ms=state.monopolio;
    if(!Number.isInteger(to)||to<0||to>=ms.pl.length||to===from||ms.pl[to].bankrupt)return t('monErrTrade');
    if(tr.giveCash<0||tr.wantCash<0)return t('monErrTrade');
    if(tr.giveCash+tr.wantCash+tr.giveSqs.length+tr.wantSqs.length===0)return t('monErrTradeEmpty');
    if(tr.giveCash>ms.pl[from].cash||tr.wantCash>ms.pl[to].cash)return t('monErrCash');
    const okSq=(sq,owner)=>Number.isInteger(sq)&&sq>=0&&sq<40&&monoIsOwnable(sq)&&ms.owner[sq]===owner;
    if(!tr.giveSqs.every(sq=>okSq(sq,from))||!tr.wantSqs.every(sq=>okSq(sq,to)))return t('monErrNotOwner');
    // a street can't change hands while its colour group carries houses
    const built=[...tr.giveSqs,...tr.wantSqs].some(sq=>MONO_GROUPS[MONO_BOARD[sq].group].some(g=>ms.houses[g]>0));
    if(built)return t('monErrTradeBuilt');
    return null;
}

function monoExecuteTrade(state,tr){
    const ms=state.monopolio,A=ms.pl[tr.from],B=ms.pl[tr.to];
    A.cash+=tr.wantCash-tr.giveCash;
    B.cash+=tr.giveCash-tr.wantCash;
    tr.giveSqs.forEach(sq=>{ms.owner[sq]=tr.to;});
    tr.wantSqs.forEach(sq=>{ms.owner[sq]=tr.from;});
}

// Returns null when `action` is legal for `playerId` right now, else an error string.
// `extra` carries the offer for TRADE_OFFER.
function monoValidate(state,playerId,action,sq,extra){
    const ms=state.monopolio;
    if(!ms||ms.phase!=='in-progress')return t('monNoMatch');
    const idx=monoIndexOf(state,playerId);
    if(idx<0||ms.pl[idx].bankrupt)return t('monNotPlayer');
    if(action==='RESIGN')return null;
    if(action==='TRADE_ACCEPT'||action==='TRADE_DECLINE'){
        if(!ms.trade||ms.trade.to!==idx)return t('monErrNoTrade');
        return action==='TRADE_ACCEPT'?monoCheckTradeTerms(state,ms.trade.from,ms.trade.to,ms.trade):null;
    }
    if(ms.trade)return action==='TRADE_CANCEL'&&ms.trade.from===idx?null:t('monErrTradePending');
    if(ms.turn!==idx)return t('monNotYourTurn');
    const pl=ms.pl[idx];
    switch(action){
        case 'TRADE_CANCEL':return t('monErrNoTrade');
        case 'TRADE_OFFER':{
            if(ms.step!=='roll'&&ms.step!=='end')return t('monErrStep');
            if(ms.tradeCount>=3)return t('monErrTradeLimit');
            const tr=monoSanitizeTrade(extra);
            if(!tr)return t('monErrTrade');
            return monoCheckTradeTerms(state,idx,tr.to,tr);
        }
        case 'ROLL':return ms.step==='roll'?null:t('monErrStep');
        case 'BUY':
            if(ms.step!=='buy')return t('monErrStep');
            return pl.cash>=MONO_BOARD[ms.buy].price?null:t('monErrCash');
        case 'PASS':return ms.step==='buy'?null:t('monErrStep');
        case 'END_TURN':return ms.step==='end'?null:t('monErrStep');
        case 'JAIL_PAY':
            if(ms.step!=='roll'||!pl.jail)return t('monErrStep');
            return pl.cash>=MONO_JAIL_FINE?null:t('monErrCash');
        case 'JAIL_CARD':
            return ms.step==='roll'&&pl.jail&&pl.cards.length?null:t('monErrStep');
        case 'PAY_DEBT':
            if(ms.step!=='debt')return t('monErrStep');
            return pl.cash>=ms.debt.amount?null:t('monErrCash');
        case 'BANKRUPT':return ms.step==='debt'?null:t('monErrStep');
        case 'BUILD':case 'SELL':case 'MORTGAGE':case 'UNMORTGAGE':
            return monoValidateMgmt(state,idx,action,sq);
    }
    return t('monErrAction');
}

// The deck order is hidden from clients (publicState), so a browser promoted to
// host without a full backup snapshot has none: rebuild it, leaving out the
// jail cards players are holding.
function monoEnsureDecks(ms){
    if(ms.decks)return;
    ms.decks={};
    for(const deck of ['chance','chest']){
        const held=new Set();
        ms.pl.forEach(p=>p.cards.forEach(c=>{if(c.deck===deck)held.add(c.id);}));
        ms.decks[deck]=monoShuffle(MONO_CARDS[deck].map((_,i)=>i).filter(i=>!held.has(i)));
    }
}

function processMonopolioAction(state,playerId,action,sq,extra){
    const err=monoValidate(state,playerId,action,sq,extra);
    if(err)return {ok:false,error:err};
    monoEnsureDecks(state.monopolio);
    const ms=state.monopolio,idx=monoIndexOf(state,playerId),pl=ms.pl[idx];
    switch(action){
        case 'TRADE_OFFER':{
            const tr=monoSanitizeTrade(extra);
            ms.trade={from:idx,...tr};ms.tradeSeq++;ms.tradeCount++;
            monoEvent(state,{k:'tradeoffer',p:idx,to:tr.to});
            break;
        }
        case 'TRADE_ACCEPT':{
            const tr=ms.trade;
            monoExecuteTrade(state,tr);ms.trade=null;
            monoEvent(state,{k:'trade',p:tr.from,to:tr.to});
            break;
        }
        case 'TRADE_DECLINE':{
            const tr=ms.trade;ms.trade=null;
            monoEvent(state,{k:'tradeno',p:tr.to,to:tr.from});
            break;
        }
        case 'TRADE_CANCEL':ms.trade=null;monoEvent(state,{k:'tradecancel',p:idx});break;
        case 'ROLL':monoApplyRoll(state,idx);break;
        case 'BUY':{
            const price=MONO_BOARD[ms.buy].price;
            pl.cash-=price;ms.owner[ms.buy]=idx;
            monoEvent(state,{k:'buy',p:idx,sq:ms.buy,amt:price});
            ms.buy=null;monoFinish(state);
            break;
        }
        case 'PASS':ms.buy=null;monoFinish(state);break;
        case 'END_TURN':monoNextTurn(state);break;
        case 'JAIL_PAY':
            pl.cash-=MONO_JAIL_FINE;pl.jail=false;pl.jailTurns=0;
            monoEvent(state,{k:'jailfine',p:idx});
            break;
        case 'JAIL_CARD':{
            const c=pl.cards.pop();
            ms.decks[c.deck].push(c.id);
            pl.jail=false;pl.jailTurns=0;
            monoEvent(state,{k:'jailcard',p:idx});
            break;
        }
        case 'PAY_DEBT':{
            const d=ms.debt;
            pl.cash-=d.amount;
            if(d.to!==null)ms.pl[d.to].cash+=d.amount;
            ms.debt=null;
            ms.step='end';   // leave 'debt' before resolving anything that follows, or monoResolve() would think we still owe
            if(d.cont==='jailmove'){
                pl.jail=false;pl.jailTurns=0;
                monoEvent(state,{k:'jailfine',p:idx});
                monoStepMove(state,idx,ms.pendingMove);
            }else monoFinish(state);
            break;
        }
        case 'BANKRUPT':monoBankrupt(state,idx,ms.debt.to);break;
        case 'RESIGN':
            monoEvent(state,{k:'resign',p:idx});
            monoBankrupt(state,idx,null);
            break;
        case 'BUILD':
            pl.cash-=MONO_BOARD[sq].house;ms.houses[sq]++;
            monoEvent(state,{k:'build',p:idx,sq,n:ms.houses[sq]});
            break;
        case 'SELL':
            pl.cash+=Math.floor(MONO_BOARD[sq].house/2);ms.houses[sq]--;
            monoEvent(state,{k:'sell',p:idx,sq,n:ms.houses[sq]});
            break;
        case 'MORTGAGE':
            pl.cash+=monoMortgageValue(sq);ms.mortgaged[sq]=true;
            monoEvent(state,{k:'mortgage',p:idx,sq});
            break;
        case 'UNMORTGAGE':
            pl.cash-=monoUnmortgageCost(sq);ms.mortgaged[sq]=false;
            monoEvent(state,{k:'unmortgage',p:idx,sq});
            break;
    }
    return {ok:true};
}

/* --------------------------------------------------------------------
   Bot. A deliberately simple but sensible player: buys most things, always
   buys what completes a set, keeps a cash buffer, builds evenly once it
   owns a set, pays its way out of jail early on, and when it owes more than
   it holds it sells houses then mortgages before it gives up. Uses only the
   information every player can see.
   -------------------------------------------------------------------- */
function monoWouldComplete(ms,idx,sq){
    const g=MONO_BOARD[sq].group;
    return MONO_GROUPS[g].every(s=>s===sq||ms.owner[s]===idx);
}

function monoBotSellable(state,idx){
    const ms=state.monopolio;
    let best=null;
    // 1) sell houses, most developed first
    for(let sq=0;sq<40;sq++){
        if(ms.owner[sq]!==idx||ms.houses[sq]<1)continue;
        if(monoValidate(state,ms.pl[idx].id,'SELL',sq))continue;
        if(!best||ms.houses[sq]>ms.houses[best])best=sq;
    }
    if(best!==null)return {action:'SELL',sq:best};
    // 2) mortgage the most valuable unmortgaged title
    for(let sq=0;sq<40;sq++){
        if(ms.owner[sq]!==idx||ms.mortgaged[sq])continue;
        if(monoValidate(state,ms.pl[idx].id,'MORTGAGE',sq))continue;
        if(best===null||MONO_BOARD[sq].price>MONO_BOARD[best].price)best=sq;
    }
    return best!==null?{action:'MORTGAGE',sq:best}:null;
}

function monoBotManage(state,idx){
    const ms=state.monopolio,pl=ms.pl[idx];
    // lift mortgages when comfortably rich
    for(let sq=0;sq<40;sq++){
        if(ms.owner[sq]!==idx||!ms.mortgaged[sq])continue;
        if(pl.cash-monoUnmortgageCost(sq)>=400&&!monoValidate(state,pl.id,'UNMORTGAGE',sq))return {action:'UNMORTGAGE',sq};
    }
    // build the cheapest, least developed house available
    let best=null;
    for(let sq=0;sq<40;sq++){
        if(ms.owner[sq]!==idx||MONO_BOARD[sq].type!=='prop')continue;
        if(pl.cash-MONO_BOARD[sq].house<250)continue;
        if(monoValidate(state,pl.id,'BUILD',sq))continue;
        if(best===null||ms.houses[sq]<ms.houses[best]||(ms.houses[sq]===ms.houses[best]&&MONO_BOARD[sq].house<MONO_BOARD[best].house))best=sq;
    }
    return best!==null?{action:'BUILD',sq:best}:null;
}

// What a title is worth TO player idx: its price, plus a premium when it
// would complete their colour group (when acquiring) or a heavy penalty
// when giving it away would break a group they already hold (when giving).
function monoPropValueFor(ms,idx,sq,acquiring){
    const sd=MONO_BOARD[sq],g=MONO_GROUPS[sd.group];
    const ownedOther=g.filter(s=>s!==sq&&ms.owner[s]===idx).length;
    const completes=ownedOther===g.length-1;
    if(acquiring)return sd.price+(completes?sd.price+250:20*ownedOther);
    return sd.price+(completes?600:30*ownedOther);
}

// The bot is the target of ms.trade: accept when it comes out clearly ahead.
function monoBotRespond(state,idx){
    const ms=state.monopolio,tr=ms.trade,pl=ms.pl[idx];
    let recv=tr.giveCash,give=tr.wantCash;
    tr.giveSqs.forEach(sq=>{recv+=monoPropValueFor(ms,idx,sq,true);});
    tr.wantSqs.forEach(sq=>{give+=monoPropValueFor(ms,idx,sq,false);});
    const cashAfter=pl.cash+tr.giveCash-tr.wantCash;
    const ok=recv>=give*1.1&&cashAfter>=50&&!monoValidate(state,pl.id,'TRADE_ACCEPT');
    return {action:ok?'TRADE_ACCEPT':'TRADE_DECLINE'};
}

// Offer cash for the one missing title of a colour group the bot nearly holds.
function monoBotTradeOffer(state,idx){
    const ms=state.monopolio,pl=ms.pl[idx];
    if(ms.tradeCount>0||Math.random()>0.6)return null;
    for(const g of Object.keys(MONO_GROUPS)){
        const sqs=MONO_GROUPS[g];
        const mine=sqs.filter(s=>ms.owner[s]===idx),missing=sqs.filter(s=>ms.owner[s]!==idx);
        if(!mine.length||missing.length!==1)continue;
        const sq=missing[0],o=ms.owner[sq];
        if(o===null||ms.pl[o].bankrupt)continue;
        const price=MONO_BOARD[sq].price;
        const cash=Math.min(pl.cash-150,Math.round(price*2.2/10)*10);
        if(cash<price*1.3)continue;
        const offer={to:o,giveCash:cash,wantCash:0,giveSqs:[],wantSqs:[sq]};
        if(!monoValidate(state,pl.id,'TRADE_OFFER',null,offer))return offer;
    }
    return null;
}

// Who (if anyone) is a bot that has to act right now?
//   respond  a bot has been offered a trade
//   timeout  a bot made an offer to a human who hasn't answered: withdraw it eventually
//   turn     it's a bot's turn
function monoWhoActs(ms){
    if(ms.trade){
        if(ms.pl[ms.trade.to].isBot)return {idx:ms.trade.to,kind:'respond'};
        if(ms.pl[ms.trade.from].isBot)return {idx:ms.trade.from,kind:'timeout'};
        return null;
    }
    return ms.pl[ms.turn]?.isBot?{idx:ms.turn,kind:'turn'}:null;
}

function monoBotChoose(state,idx){
    const ms=state.monopolio,pl=ms.pl[idx];
    switch(ms.step){
        case 'buy':{
            const sd=MONO_BOARD[ms.buy];
            const good=monoWouldComplete(ms,idx,ms.buy)||pl.cash-sd.price>=150;
            return {action:good?'BUY':'PASS'};
        }
        case 'debt':
            if(pl.cash>=ms.debt.amount)return {action:'PAY_DEBT'};
            return monoBotSellable(state,idx)||{action:'BANKRUPT'};
        case 'roll':
            if(pl.jail){
                if(pl.cards.length)return {action:'JAIL_CARD'};
                if(pl.cash>=500)return {action:'JAIL_PAY'};
            }
            // falls through to management, then rolling
        case 'end':{
            const m=monoBotManage(state,idx);
            if(m)return m;
            const offer=monoBotTradeOffer(state,idx);
            if(offer)return {action:'TRADE_OFFER',extra:offer};
            return {action:ms.step==='roll'?'ROLL':'END_TURN'};
        }
    }
    return null;
}
