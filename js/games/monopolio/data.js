/* ========================================================================
   MONOPOLIO DATA - the static tables: board, colour groups, token colours
   and the two card decks. Nothing here changes during a match.

   The street names are original (an invented Italian town), not those of
   any commercial edition. The numbers follow the classic property-trading
   economy: 1500 starting cash, 200 for passing Go, 28 titles, 32 houses and
   12 hotels in the bank.

   Square types:
     go | jail | free | gotojail      corners
     chance | chest                   card squares
     tax                              pays `amount` to the bank
     prop                             coloured street (group, price, house, rent[0..5])
     station | util                   railway stations / utilities
   rent[0] is the bare rent, rent[1..4] one to four houses, rent[5] a hotel.
   ======================================================================== */

const MONO_START_CASH=1500;
const MONO_GO_SALARY=200;
const MONO_JAIL_FINE=50;
const MONO_JAIL_POS=10;
const MONO_MAX_HOUSES=32;
const MONO_MAX_HOTELS=12;

const MONO_COLORS={
    brown:'#92400e', lblue:'#38bdf8', pink:'#ec4899', orange:'#f97316',
    red:'#ef4444', yellow:'#facc15', green:'#22c55e', dblue:'#2563eb'
};
const MONO_TOKEN_COLORS=['#ef4444','#3b82f6','#22c55e','#f59e0b','#a855f7','#14b8a6'];

const _mp=(name,group,price,house,rent)=>({type:'prop',name,group,price,house,rent});
const _ms=(name)=>({type:'station',name,group:'station',price:200});
const _mu=(name)=>({type:'util',name,group:'util',price:150});

const MONO_BOARD=[
    /* 0*/ {type:'go',key:'go'},
    /* 1*/ _mp('Borgo Antico','brown',60,50,[2,10,30,90,160,250]),
    /* 2*/ {type:'chest',key:'chest'},
    /* 3*/ _mp('Vicolo del Mulino','brown',60,50,[4,20,60,180,320,450]),
    /* 4*/ {type:'tax',key:'tax1',amount:200},
    /* 5*/ _ms('Stazione Nord'),
    /* 6*/ _mp('Via dei Pini','lblue',100,50,[6,30,90,270,400,550]),
    /* 7*/ {type:'chance',key:'chance'},
    /* 8*/ _mp('Via del Faro','lblue',100,50,[6,30,90,270,400,550]),
    /* 9*/ _mp('Via della Vela','lblue',120,50,[8,40,100,300,450,600]),
    /*10*/ {type:'jail',key:'jail'},
    /*11*/ _mp('Viale dei Tigli','pink',140,100,[10,50,150,450,625,750]),
    /*12*/ _mu('Società Elettrica'),
    /*13*/ _mp('Via Fontana','pink',140,100,[10,50,150,450,625,750]),
    /*14*/ _mp('Via delle Rose','pink',160,100,[12,60,180,500,700,900]),
    /*15*/ _ms('Stazione Est'),
    /*16*/ _mp('Via dei Mercanti','orange',180,100,[14,70,200,550,750,950]),
    /*17*/ {type:'chest',key:'chest'},
    /*18*/ _mp('Via Lunga','orange',180,100,[14,70,200,550,750,950]),
    /*19*/ _mp('Via del Teatro','orange',200,100,[16,80,220,600,800,1000]),
    /*20*/ {type:'free',key:'free'},
    /*21*/ _mp('Piazza del Duomo','red',220,150,[18,90,250,700,875,1050]),
    /*22*/ {type:'chance',key:'chance'},
    /*23*/ _mp('Piazza Maggiore','red',220,150,[18,90,250,700,875,1050]),
    /*24*/ _mp('Piazza Vecchia','red',240,150,[20,100,300,750,925,1100]),
    /*25*/ _ms('Stazione Sud'),
    /*26*/ _mp('Lungomare Sud','yellow',260,150,[22,110,330,800,975,1150]),
    /*27*/ _mp('Lungomare Nord','yellow',260,150,[22,110,330,800,975,1150]),
    /*28*/ _mu('Società Acquedotto'),
    /*29*/ _mp('Viale dei Giardini','yellow',280,150,[24,120,360,850,1025,1200]),
    /*30*/ {type:'gotojail',key:'gotojail'},
    /*31*/ _mp('Corso Italia','green',300,200,[26,130,390,900,1100,1275]),
    /*32*/ _mp('Corso Europa','green',300,200,[26,130,390,900,1100,1275]),
    /*33*/ {type:'chest',key:'chest'},
    /*34*/ _mp('Corso Roma','green',320,200,[28,150,450,1000,1200,1400]),
    /*35*/ _ms('Stazione Ovest'),
    /*36*/ {type:'chance',key:'chance'},
    /*37*/ _mp('Via dei Principi','dblue',350,200,[35,175,500,1100,1300,1500]),
    /*38*/ {type:'tax',key:'tax2',amount:100},
    /*39*/ _mp('Piazza dei Re','dblue',400,200,[50,200,600,1400,1700,2000])
];

// group name -> [square indexes]
const MONO_GROUPS=(()=>{
    const g={};
    MONO_BOARD.forEach((s,i)=>{if(s.group)(g[s.group]=g[s.group]||[]).push(i);});
    return g;
})();

const monoIsOwnable=sq=>{const t=MONO_BOARD[sq]?.type;return t==='prop'||t==='station'||t==='util';};
const monoMortgageValue=sq=>MONO_BOARD[sq].price/2;
const monoUnmortgageCost=sq=>Math.ceil(MONO_BOARD[sq].price/2*1.1);
function monoSqName(sq){ const s=MONO_BOARD[sq];return s.name||t('monSq_'+s.key); }

/* ---------------------------------------------------------------------
   Cards. t: money (amt, negative = pay) | move (to, collects Go if it
   passes it) | rel (n squares, may be negative) | nearest (kind) |
   jail | jailcard | repairs (h per house, H per hotel).
   --------------------------------------------------------------------- */
const MONO_CARDS={
    chance:[
        {t:'move',to:0,en:'Advance to Start. Collect 200.',it:'Avanza fino al Via. Ritira 200.'},
        {t:'move',to:34,en:'Advance to Corso Roma.',it:'Avanza fino a Corso Roma.'},
        {t:'move',to:23,en:'Advance to Piazza Maggiore.',it:'Avanza fino a Piazza Maggiore.'},
        {t:'move',to:15,en:'Take a trip to Stazione Est. If you pass Start, collect 200.',it:'Fai un viaggio fino a Stazione Est. Se passi dal Via, ritira 200.'},
        {t:'nearest',kind:'station',en:'Advance to the nearest station. Pay the owner double rent.',it:'Avanza fino alla stazione più vicina. Paga al proprietario il doppio dell\'affitto.'},
        {t:'nearest',kind:'station',en:'Advance to the nearest station. Pay the owner double rent.',it:'Avanza fino alla stazione più vicina. Paga al proprietario il doppio dell\'affitto.'},
        {t:'nearest',kind:'util',en:'Advance to the nearest utility. Pay the owner ten times the dice.',it:'Avanza fino alla società più vicina. Paga al proprietario dieci volte i dadi.'},
        {t:'money',amt:50,en:'The bank pays you a dividend of 50.',it:'La banca ti paga un dividendo di 50.'},
        {t:'rel',n:-3,en:'Go back three squares.',it:'Torna indietro di tre caselle.'},
        {t:'jail',en:'Go directly to jail. Do not pass Start.',it:'Vai direttamente in prigione. Non passare dal Via.'},
        {t:'jailcard',en:'Get out of jail free. Keep this card until needed.',it:'Esci gratis di prigione. Conserva questa carta finché serve.'},
        {t:'repairs',h:25,H:100,en:'Property repairs: pay 25 per house and 100 per hotel.',it:'Riparazioni: paga 25 per casa e 100 per albergo.'},
        {t:'money',amt:-15,en:'Speeding fine. Pay 15.',it:'Multa per eccesso di velocità. Paga 15.'}
    ],
    chest:[
        {t:'move',to:0,en:'Advance to Start. Collect 200.',it:'Avanza fino al Via. Ritira 200.'},
        {t:'money',amt:200,en:'Bank error in your favour. Collect 200.',it:'Errore della banca a tuo favore. Ritira 200.'},
        {t:'money',amt:-50,en:'Doctor\'s fee. Pay 50.',it:'Parcella del medico. Paga 50.'},
        {t:'money',amt:50,en:'You sell some shares. Collect 50.',it:'Vendi delle azioni. Ritira 50.'},
        {t:'jailcard',en:'Get out of jail free. Keep this card until needed.',it:'Esci gratis di prigione. Conserva questa carta finché serve.'},
        {t:'jail',en:'Go directly to jail. Do not pass Start.',it:'Vai direttamente in prigione. Non passare dal Via.'},
        {t:'money',amt:20,en:'Tax refund. Collect 20.',it:'Rimborso fiscale. Ritira 20.'},
        {t:'money',amt:100,en:'Your life insurance matures. Collect 100.',it:'Scade la tua assicurazione sulla vita. Ritira 100.'},
        {t:'money',amt:-100,en:'Hospital fees. Pay 100.',it:'Spese ospedaliere. Paga 100.'},
        {t:'money',amt:-50,en:'School fees. Pay 50.',it:'Tasse scolastiche. Paga 50.'},
        {t:'money',amt:25,en:'Consultancy fee. Collect 25.',it:'Compenso per una consulenza. Ritira 25.'},
        {t:'repairs',h:40,H:115,en:'Street repairs: pay 40 per house and 115 per hotel.',it:'Lavori stradali: paga 40 per casa e 115 per albergo.'},
        {t:'money',amt:10,en:'You win second prize in a beauty contest. Collect 10.',it:'Vinci il secondo premio a un concorso di bellezza. Ritira 10.'},
        {t:'money',amt:100,en:'You inherit 100.',it:'Erediti 100.'}
    ]
};
function monoCardText(deck,id){ const c=MONO_CARDS[deck][id];return c[currentLang]||c.en; }
