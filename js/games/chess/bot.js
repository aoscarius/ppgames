/* ========================================================================
   CHESS BOT ENGINE - a small, fast, self-contained chess searcher used only
   for the bot opponent. Rules for the real match (legality, check, draws)
   stay in the vendored chess.js (engine.js); this file only has to FIND a
   good move quickly, and chess.js re-validates whatever it returns.

   Why a second engine? chess.js is written for correctness, not speed
   (it allocates move objects and replays history for everything), which
   limited the old bot to ~3 plies. This one works on a 0x88 board with
   integer-encoded moves and incremental Zobrist hashing, and searches with:
     - iterative deepening under a time budget
     - alpha-beta in principal-variation form, transposition table
     - null-move pruning, late-move reductions, check extensions
     - killer + history move ordering, MVV-LVA, quiescence search
   Strength is selected with a difficulty level (see CHESS_BOT_LEVELS).
   ======================================================================== */
const CHESS_BOT_LEVELS={
    //            max depth, time budget (ms), randomness margin (centipawns)
    easy:  {depth:2,  time:250,  margin:120},
    medium:{depth:4,  time:600,  margin:25},
    hard:  {depth:16, time:1500, margin:6},
    expert:{depth:32, time:4000, margin:0}
};

const ChessBot=(function(){
    'use strict';
    const P=1,N=2,B=3,R=4,Q=5,K=6,BL=8;
    const VAL=[0,100,320,330,500,900,0];
    const MATE=30000,INF=32000;
    const KNIGHT=[33,31,18,14,-33,-31,-18,-14];
    const KING=[1,-1,16,-16,17,15,-17,-15];
    const BDIR=[17,15,-17,-15];
    const RDIR=[1,-1,16,-16];
    const CMASK=new Int8Array(128).fill(15);
    CMASK[0]=13;CMASK[7]=14;CMASK[4]=12;CMASK[112]=7;CMASK[119]=11;CMASK[116]=3;

    // ---- piece-square tables (White's view, rank 8 first) ----
    const PST={
        1:[[0,0,0,0,0,0,0,0],[50,50,50,50,50,50,50,50],[10,10,20,30,30,20,10,10],[5,5,10,25,25,10,5,5],[0,0,0,20,20,0,0,0],[5,-5,-10,0,0,-10,-5,5],[5,10,10,-20,-20,10,10,5],[0,0,0,0,0,0,0,0]],
        2:[[-50,-40,-30,-30,-30,-30,-40,-50],[-40,-20,0,0,0,0,-20,-40],[-30,0,10,15,15,10,0,-30],[-30,5,15,20,20,15,5,-30],[-30,0,15,20,20,15,0,-30],[-30,5,10,15,15,10,5,-30],[-40,-20,0,5,5,0,-20,-40],[-50,-40,-30,-30,-30,-30,-40,-50]],
        3:[[-20,-10,-10,-10,-10,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,5,10,10,5,0,-10],[-10,5,5,10,10,5,5,-10],[-10,0,10,10,10,10,0,-10],[-10,10,10,10,10,10,10,-10],[-10,5,0,0,0,0,5,-10],[-20,-10,-10,-10,-10,-10,-10,-20]],
        4:[[0,0,0,0,0,0,0,0],[5,10,10,10,10,10,10,5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[0,0,0,5,5,0,0,0]],
        5:[[-20,-10,-10,-5,-5,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,5,5,5,5,0,-10],[-5,0,5,5,5,5,0,-5],[0,0,5,5,5,5,0,-5],[-10,5,5,5,5,5,0,-10],[-10,0,5,0,0,0,0,-10],[-20,-10,-10,-5,-5,-10,-10,-20]],
        6:[[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-20,-30,-30,-40,-40,-30,-30,-20],[-10,-20,-20,-20,-20,-20,-20,-10],[20,20,0,0,0,0,20,20],[20,30,10,0,0,10,30,20]]
    };
    const KEND=[[-50,-40,-30,-20,-20,-30,-40,-50],[-30,-20,-10,0,0,-10,-20,-30],[-30,-10,20,30,30,20,-10,-30],[-30,-10,30,40,40,30,-10,-30],[-30,-10,30,40,40,30,-10,-30],[-30,-10,20,30,30,20,-10,-30],[-30,-30,0,0,0,0,-30,-30],[-50,-30,-30,-30,-30,-30,-30,-50]];
    // flat per-square tables for fast lookup: PSTW[type][sq0x88] (white) and PSTB (black)
    const PSTW=[],PSTB=[],KENDW=new Int16Array(128),KENDB=new Int16Array(128);
    for(let t=1;t<=6;t++){
        PSTW[t]=new Int16Array(128);PSTB[t]=new Int16Array(128);
        for(let r=0;r<8;r++)for(let f=0;f<8;f++){
            const s=r*16+f;
            PSTW[t][s]=PST[t][7-r][f];
            PSTB[t][s]=PST[t][r][f];
        }
    }
    for(let r=0;r<8;r++)for(let f=0;f<8;f++){const s=r*16+f;KENDW[s]=KEND[7-r][f];KENDB[s]=KEND[r][f];}

    // ---- Zobrist keys (deterministic PRNG) ----
    let seed=0x9e3779b9;
    const rnd=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed|0;};
    const ZP1=[],ZP2=[];
    for(let p=0;p<16;p++){ZP1[p]=new Int32Array(128);ZP2[p]=new Int32Array(128);for(let s=0;s<128;s++){ZP1[p][s]=rnd();ZP2[p][s]=rnd();}}
    const ZC1=new Int32Array(16),ZC2=new Int32Array(16),ZE1=new Int32Array(128),ZE2=new Int32Array(128);
    for(let i=0;i<16;i++){ZC1[i]=rnd();ZC2[i]=rnd();}
    for(let i=0;i<128;i++){ZE1[i]=rnd();ZE2[i]=rnd();}
    const ZS1=rnd(),ZS2=rnd();

    const sqName=s=>'abcdefgh'[s&7]+((s>>4)+1);
    const sqFrom=n=>(n.charCodeAt(1)-49)*16+(n.charCodeAt(0)-97);

    // ---- position ----
    function Pos(fen){
        this.b=new Int8Array(128);
        this.side=0;this.castle=0;this.ep=-1;this.half=0;
        this.ksq=[0,0];
        this.h1=0;this.h2=0;
        // undo stack
        this.uc=new Int32Array(1024*8);this.sp=0;
        this.hs=new Int32Array(1024+512);this.hn=0;    // hash history (h1) for repetition
        this.load(fen);
    }
    Pos.prototype.load=function(fen){
        const parts=fen.trim().split(/\s+/);
        this.b.fill(0);
        const rows=parts[0].split('/');
        const map={p:P,n:N,b:B,r:R,q:Q,k:K};
        for(let i=0;i<8;i++){
            let f=0;
            for(const ch of rows[i]){
                if(ch>='1'&&ch<='8'){f+=Number(ch);continue;}
                const lower=ch.toLowerCase();
                const piece=map[lower]|(ch===lower?BL:0);
                const sq=(7-i)*16+f;
                this.b[sq]=piece;
                if((piece&7)===K)this.ksq[piece&BL?1:0]=sq;
                f++;
            }
        }
        this.side=parts[1]==='b'?1:0;
        this.castle=0;
        const c=parts[2]||'-';
        if(c.includes('K'))this.castle|=1;if(c.includes('Q'))this.castle|=2;
        if(c.includes('k'))this.castle|=4;if(c.includes('q'))this.castle|=8;
        this.ep=parts[3]&&parts[3]!=='-'?sqFrom(parts[3]):-1;
        this.half=Number(parts[4])||0;
        this.sp=0;this.hn=0;
        this.computeHash();
        this.hs[this.hn++]=this.h1;
    };
    Pos.prototype.computeHash=function(){
        let h1=0,h2=0;
        for(let s=0;s<128;s++){if(s&0x88){s+=7;continue;}const p=this.b[s];if(p){h1^=ZP1[p][s];h2^=ZP2[p][s];}}
        h1^=ZC1[this.castle];h2^=ZC2[this.castle];
        if(this.ep>=0){h1^=ZE1[this.ep];h2^=ZE2[this.ep];}
        if(this.side){h1^=ZS1;h2^=ZS2;}
        this.h1=h1;this.h2=h2;
    };

    Pos.prototype.attacked=function(sq,by){            // is `sq` attacked by colour `by` (0 white, 1 black)?
        const b=this.b,off=by?BL:0;
        // pawns
        if(by===0){
            let s=sq-15;if(!(s&0x88)&&b[s]===P)return true;
            s=sq-17;if(!(s&0x88)&&b[s]===P)return true;
        }else{
            let s=sq+15;if(!(s&0x88)&&b[s]===(P|BL))return true;
            s=sq+17;if(!(s&0x88)&&b[s]===(P|BL))return true;
        }
        for(let i=0;i<8;i++){let s=sq+KNIGHT[i];if(!(s&0x88)&&b[s]===(N|off))return true;}
        for(let i=0;i<8;i++){let s=sq+KING[i];if(!(s&0x88)&&b[s]===(K|off))return true;}
        for(let i=0;i<4;i++){
            const d=BDIR[i];let s=sq+d;
            while(!(s&0x88)){const p=b[s];if(p){if(p===(B|off)||p===(Q|off))return true;break;}s+=d;}
        }
        for(let i=0;i<4;i++){
            const d=RDIR[i];let s=sq+d;
            while(!(s&0x88)){const p=b[s];if(p){if(p===(R|off)||p===(Q|off))return true;break;}s+=d;}
        }
        return false;
    };
    Pos.prototype.inCheck=function(){return this.attacked(this.ksq[this.side],this.side^1);};

    // move = from | to<<7 | promo<<14 | flag<<17     flag: 1 ep, 2 castle, 3 double push
    const mk=(f,t,pr,fl)=>f|(t<<7)|(pr<<14)|(fl<<17);

    // Pseudo-legal generation. caps=true: captures and promotions only.
    Pos.prototype.gen=function(out,caps){
        const b=this.b,side=this.side,off=side?BL:0,enemy=side?0:BL;
        let n=0;
        for(let from=0;from<128;from++){
            if(from&0x88){from+=7;continue;}
            const p=b[from];
            if(!p||(p&BL)!==off)continue;
            const type=p&7;
            if(type===P){
                const dir=side?-16:16,startRank=side?6:1,promoRank=side?1:6;
                const one=from+dir;
                if(!(one&0x88)&&!b[one]){
                    if((from>>4)===promoRank){
                        out[n++]=mk(from,one,Q,0);
                        if(!caps){out[n++]=mk(from,one,R,0);out[n++]=mk(from,one,B,0);out[n++]=mk(from,one,N,0);}
                    }else if(!caps){
                        out[n++]=mk(from,one,0,0);
                        const two=one+dir;
                        if((from>>4)===startRank&&!b[two])out[n++]=mk(from,two,0,3);
                    }
                }
                for(let k=0;k<2;k++){
                    const to=from+dir+(k?1:-1);
                    if(to&0x88)continue;
                    const t=b[to];
                    if(t&&(t&BL)===enemy&&t){
                        if((from>>4)===promoRank){
                            out[n++]=mk(from,to,Q,0);
                            if(!caps){out[n++]=mk(from,to,R,0);out[n++]=mk(from,to,B,0);out[n++]=mk(from,to,N,0);}
                        }else out[n++]=mk(from,to,0,0);
                    }else if(to===this.ep&&!t)out[n++]=mk(from,to,0,1);
                }
            }else if(type===N||type===K){
                const dirs=type===N?KNIGHT:KING;
                for(let i=0;i<8;i++){
                    const to=from+dirs[i];
                    if(to&0x88)continue;
                    const t=b[to];
                    if(!t){if(!caps)out[n++]=mk(from,to,0,0);}
                    else if((t&BL)===enemy)out[n++]=mk(from,to,0,0);
                }
                if(type===K&&!caps){
                    const base=side?112:0,rights=side?(this.castle>>2):this.castle;
                    if(from===base+4&&!this.attacked(from,side^1)){
                        if((rights&1)&&!b[base+5]&&!b[base+6]&&b[base+7]===(R|off)&&!this.attacked(base+5,side^1)&&!this.attacked(base+6,side^1))
                            out[n++]=mk(from,base+6,0,2);
                        if((rights&2)&&!b[base+3]&&!b[base+2]&&!b[base+1]&&b[base]===(R|off)&&!this.attacked(base+3,side^1)&&!this.attacked(base+2,side^1))
                            out[n++]=mk(from,base+2,0,2);
                    }
                }
            }else{
                const diag=type===B||type===Q,orth=type===R||type===Q;
                if(diag)for(let i=0;i<4;i++){
                    const d=BDIR[i];let to=from+d;
                    while(!(to&0x88)){
                        const t=b[to];
                        if(!t){if(!caps)out[n++]=mk(from,to,0,0);}
                        else{if((t&BL)===enemy)out[n++]=mk(from,to,0,0);break;}
                        to+=d;
                    }
                }
                if(orth)for(let i=0;i<4;i++){
                    const d=RDIR[i];let to=from+d;
                    while(!(to&0x88)){
                        const t=b[to];
                        if(!t){if(!caps)out[n++]=mk(from,to,0,0);}
                        else{if((t&BL)===enemy)out[n++]=mk(from,to,0,0);break;}
                        to+=d;
                    }
                }
            }
        }
        return n;
    };

    // Make a move. Returns false (and leaves the position unchanged) if it leaves the mover's king in check.
    Pos.prototype.make=function(m){
        const b=this.b,from=m&127,to=(m>>7)&127,promo=(m>>14)&7,flag=m>>17;
        const piece=b[from],side=this.side,color=piece&BL;
        let cap=b[to],capSq=to;
        const u=this.uc,o=this.sp*8;
        u[o]=cap;u[o+1]=this.castle;u[o+2]=this.ep;u[o+3]=this.half;u[o+4]=this.h1;u[o+5]=this.h2;u[o+6]=m;u[o+7]=0;
        let h1=this.h1,h2=this.h2;
        if(this.ep>=0){h1^=ZE1[this.ep];h2^=ZE2[this.ep];}
        h1^=ZC1[this.castle];h2^=ZC2[this.castle];
        // lift mover
        h1^=ZP1[piece][from];h2^=ZP2[piece][from];
        b[from]=0;
        if(flag===1){
            capSq=to+(side?16:-16);cap=b[capSq];u[o]=cap;
            h1^=ZP1[cap][capSq];h2^=ZP2[cap][capSq];b[capSq]=0;
        }else if(cap){h1^=ZP1[cap][to];h2^=ZP2[cap][to];}
        const placed=promo?(promo|color):piece;
        b[to]=placed;
        h1^=ZP1[placed][to];h2^=ZP2[placed][to];
        if(flag===2){
            const rf=to>from?from+3:from-4,rt=to>from?from+1:from-1,rook=b[rf];
            b[rf]=0;b[rt]=rook;
            h1^=ZP1[rook][rf]^ZP1[rook][rt];h2^=ZP2[rook][rf]^ZP2[rook][rt];
        }
        if((piece&7)===K)this.ksq[side]=to;
        this.castle&=CMASK[from]&CMASK[to];
        this.ep=flag===3?(from+to)>>1:-1;
        this.half=((piece&7)===P||cap)?0:this.half+1;
        h1^=ZC1[this.castle];h2^=ZC2[this.castle];
        if(this.ep>=0){h1^=ZE1[this.ep];h2^=ZE2[this.ep];}
        h1^=ZS1;h2^=ZS2;
        this.h1=h1;this.h2=h2;
        this.side=side^1;
        this.sp++;
        this.hs[this.hn++]=h1;
        if(this.attacked(this.ksq[side],side^1)){this.unmake();return false;}
        return true;
    };
    Pos.prototype.unmake=function(){
        this.sp--;this.hn--;
        const b=this.b,u=this.uc,o=this.sp*8,m=u[o+6];
        const from=m&127,to=(m>>7)&127,promo=(m>>14)&7,flag=m>>17;
        const side=this.side^1;
        this.side=side;
        const moved=b[to],piece=promo?(P|(side?BL:0)):moved;
        const cap=u[o];
        b[from]=piece;b[to]=0;
        if(flag===1){b[to+(side?16:-16)]=cap;}
        else if(cap)b[to]=cap;
        if(flag===2){
            const rf=to>from?from+3:from-4,rt=to>from?from+1:from-1;
            b[rf]=b[rt];b[rt]=0;
        }
        if((piece&7)===K)this.ksq[side]=from;
        this.castle=u[o+1];this.ep=u[o+2];this.half=u[o+3];this.h1=u[o+4];this.h2=u[o+5];
    };
    Pos.prototype.makeNull=function(){
        const u=this.uc,o=this.sp*8;
        u[o+2]=this.ep;u[o+4]=this.h1;u[o+5]=this.h2;u[o+3]=this.half;
        if(this.ep>=0){this.h1^=ZE1[this.ep];this.h2^=ZE2[this.ep];this.ep=-1;}
        this.h1^=ZS1;this.h2^=ZS2;this.side^=1;this.half++;
        this.sp++;this.hs[this.hn++]=this.h1;
    };
    Pos.prototype.unmakeNull=function(){
        this.sp--;this.hn--;
        const u=this.uc,o=this.sp*8;
        this.ep=u[o+2];this.h1=u[o+4];this.h2=u[o+5];this.half=u[o+3];this.side^=1;
    };

    // ---- evaluation (centipawns, from the side to move's point of view) ----
    const PAW=new Int8Array(8),PAB=new Int8Array(8);
    Pos.prototype.evaluate=function(){
        const b=this.b;
        let score=0,nonPawn=0,bw=0,bb=0;
        const pawnsW=PAW,pawnsB=PAB;pawnsW.fill(0);pawnsB.fill(0);
        for(let s=0;s<128;s++){
            if(s&0x88){s+=7;continue;}
            const p=b[s];if(!p)continue;
            const t=p&7;
            if(t!==P&&t!==K)nonPawn+=VAL[t];
            if(p&BL){if(t===P)pawnsB[s&7]++;else if(t===B)bb++;}
            else{if(t===P)pawnsW[s&7]++;else if(t===B)bw++;}
        }
        const endgame=nonPawn<=2400;
        for(let s=0;s<128;s++){
            if(s&0x88){s+=7;continue;}
            const p=b[s];if(!p)continue;
            const t=p&7;
            if(p&BL){
                score-=VAL[t]+(t===K&&endgame?KENDB[s]:PSTB[t][s]);
                if(t===R){const f=s&7;if(!pawnsB[f])score-=pawnsW[f]?8:15;}
            }else{
                score+=VAL[t]+(t===K&&endgame?KENDW[s]:PSTW[t][s]);
                if(t===R){const f=s&7;if(!pawnsW[f])score+=pawnsB[f]?8:15;}
            }
        }
        if(bw>=2)score+=30;
        if(bb>=2)score-=30;
        for(let f=0;f<8;f++){
            if(pawnsW[f]>1)score-=12*(pawnsW[f]-1);
            if(pawnsB[f]>1)score+=12*(pawnsB[f]-1);
            const lw=f>0?pawnsW[f-1]:0,rw=f<7?pawnsW[f+1]:0,lb=f>0?pawnsB[f-1]:0,rb=f<7?pawnsB[f+1]:0;
            if(pawnsW[f]&&!lw&&!rw)score-=10;          // isolated pawns
            if(pawnsB[f]&&!lb&&!rb)score+=10;
        }
        return this.side?-score:score;
    };

    // Draw by lack of material: K vs K, K+minor vs K.
    Pos.prototype.insufficient=function(){
        let minors=0;
        for(let s=0;s<128;s++){
            if(s&0x88){s+=7;continue;}
            const t=this.b[s]&7;
            if(t===P||t===R||t===Q)return false;
            if(t===N||t===B)minors++;
        }
        return minors<=1;
    };
    Pos.prototype.repeated=function(){
        const h=this.hs,end=this.hn-1,h1=h[end];
        const lim=Math.max(0,end-this.half);
        for(let i=end-2;i>=lim;i-=2)if(h[i]===h1)return true;
        return false;
    };

    // ---- search ----
    const TIMEOUT={};
    let tt=new Map();
    let deadline=0,nodes=0,stopped=false;
    const killers=[];for(let i=0;i<128;i++)killers.push([0,0]);
    let history=new Int32Array(128*128);
    const moveBuf=[],scoreBuf=[];
    for(let i=0;i<128;i++){moveBuf.push(new Int32Array(256));scoreBuf.push(new Int32Array(256));}

    function scoreMoves(pos,moves,n,scores,ply,ttMove){
        const b=pos.b;
        for(let i=0;i<n;i++){
            const m=moves[i],from=m&127,to=(m>>7)&127,cap=b[to];
            let s=0;
            if(m===ttMove)s=2000000;
            else if(cap||(m>>17)===1){s=1000000+10*VAL[(cap&7)||P]-VAL[b[from]&7]/10;}
            else if((m>>14)&7)s=900000+VAL[(m>>14)&7];
            else if(m===killers[ply][0])s=800000;
            else if(m===killers[ply][1])s=790000;
            else s=history[from*128+to];
            scores[i]=s;
        }
    }
    function pick(moves,scores,n,i){
        let best=i;
        for(let j=i+1;j<n;j++)if(scores[j]>scores[best])best=j;
        if(best!==i){const m=moves[i];moves[i]=moves[best];moves[best]=m;const s=scores[i];scores[i]=scores[best];scores[best]=s;}
        return moves[i];
    }
    function hasPieces(pos,side){
        const off=side?BL:0;
        for(let s=0;s<128;s++){
            if(s&0x88){s+=7;continue;}
            const p=pos.b[s];
            if(p&&(p&BL)===off){const t=p&7;if(t!==P&&t!==K)return true;}
        }
        return false;
    }

    function qsearch(pos,alpha,beta,ply){
        if((++nodes&2047)===0&&Date.now()>deadline)throw TIMEOUT;
        const stand=pos.evaluate();
        if(stand>=beta)return stand;
        if(stand>alpha)alpha=stand;
        if(ply>=60)return stand;
        const moves=moveBuf[ply],scores=scoreBuf[ply];
        const n=pos.gen(moves,true);
        scoreMoves(pos,moves,n,scores,ply,0);
        for(let i=0;i<n;i++){
            const m=pick(moves,scores,n,i);
            const victim=pos.b[(m>>7)&127]&7;
            if(stand+VAL[victim]+200<alpha&&!((m>>14)&7))continue;      // delta pruning
            if(!pos.make(m))continue;
            const v=-qsearch(pos,-beta,-alpha,ply+1);
            pos.unmake();
            if(v>=beta)return v;
            if(v>alpha)alpha=v;
        }
        return alpha;
    }

    function search(pos,depth,alpha,beta,ply,allowNull){
        if((++nodes&2047)===0&&Date.now()>deadline)throw TIMEOUT;
        if(ply>0){
            if(pos.half>=100||pos.repeated()||pos.insufficient())return 0;
            // mate-distance pruning
            const lo=-MATE+ply,hi=MATE-ply-1;
            if(alpha<lo)alpha=lo;if(beta>hi)beta=hi;
            if(alpha>=beta)return alpha;
        }
        const inCheck=pos.inCheck();
        if(inCheck)depth++;
        if(depth<=0)return qsearch(pos,alpha,beta,ply);
        if(ply>=100)return pos.evaluate();

        const key=pos.h1+pos.h2*4294967296;       // h2 is 32-bit signed; fine as a numeric key
        const entry=tt.get(key);
        let ttMove=0;
        if(entry){
            ttMove=entry.m;
            if(entry.d>=depth&&ply>0){
                let s=entry.s;
                if(s>MATE-200)s-=ply;else if(s<-MATE+200)s+=ply;
                if(entry.f===0)return s;
                if(entry.f===1&&s>=beta)return s;
                if(entry.f===2&&s<=alpha)return s;
            }
        }
        const pv=beta-alpha>1;
        // null-move pruning
        if(allowNull&&!pv&&!inCheck&&depth>=3&&hasPieces(pos,pos.side)){
            const stat=pos.evaluate();
            if(stat>=beta){
                pos.makeNull();
                const v=-search(pos,depth-3,-beta,-beta+1,ply+1,false);
                pos.unmakeNull();
                if(v>=beta)return v>=MATE-200?beta:v;
            }
        }
        const moves=moveBuf[ply],scores=scoreBuf[ply];
        const n=pos.gen(moves,false);
        scoreMoves(pos,moves,n,scores,ply,ttMove);
        let best=-INF,bestMove=0,legal=0,flag=2;       // 2 = upper bound (fail low) until proven otherwise
        const origAlpha=alpha;
        for(let i=0;i<n;i++){
            const m=pick(moves,scores,n,i);
            const isCap=pos.b[(m>>7)&127]||(m>>17)===1,isPromo=(m>>14)&7;
            if(!pos.make(m))continue;
            legal++;
            let v;
            const gives=pos.inCheck();
            if(legal===1){
                v=-search(pos,depth-1,-beta,-alpha,ply+1,true);
            }else{
                let red=0;
                if(depth>=3&&legal>4&&!isCap&&!isPromo&&!inCheck&&!gives)red=legal>8?2:1;
                v=-search(pos,depth-1-red,-alpha-1,-alpha,ply+1,true);
                if(v>alpha&&red)v=-search(pos,depth-1,-alpha-1,-alpha,ply+1,true);
                if(v>alpha&&v<beta)v=-search(pos,depth-1,-beta,-alpha,ply+1,true);
            }
            pos.unmake();
            if(v>best){best=v;bestMove=m;}
            if(v>alpha){
                alpha=v;flag=0;
                if(alpha>=beta){
                    flag=1;
                    if(!isCap&&!isPromo){
                        if(killers[ply][0]!==m){killers[ply][1]=killers[ply][0];killers[ply][0]=m;}
                        history[(m&127)*128+((m>>7)&127)]+=depth*depth;
                    }
                    break;
                }
            }
        }
        if(!legal)return inCheck?-MATE+ply:0;
        let store=best;
        if(store>MATE-200)store+=ply;else if(store<-MATE+200)store-=ply;
        if(tt.size>400000)tt.clear();
        tt.set(key,{d:depth,s:store,f:flag,m:bestMove});
        return best;
    }

    const PROMO_CHAR={2:'n',3:'b',4:'r',5:'q'};

    // Choose a move for the side to move in `fen`.
    // level: 'easy' | 'medium' | 'hard' | 'expert' | {depth,time,margin}
    // Returns {from,to,promotion?,score,depth} or null when there is no legal move.
    function chooseMove(fen,level,opts){
        const cfg=typeof level==='object'&&level?level:(CHESS_BOT_LEVELS[level]||CHESS_BOT_LEVELS.medium);
        const rng=(opts&&opts.random)||Math.random;
        const pos=new Pos(fen);
        const buf=new Int32Array(256);
        const n=pos.gen(buf,false);
        let root=[];
        for(let i=0;i<n;i++){if(pos.make(buf[i])){pos.unmake();root.push(buf[i]);}}
        if(!root.length)return null;
        const out=m=>{const o={from:sqName(m&127),to:sqName((m>>7)&127)};const pr=(m>>14)&7;if(pr)o.promotion=PROMO_CHAR[pr];return o;};
        if(root.length===1)return Object.assign(out(root[0]),{score:0,depth:0});

        tt=new Map();history=new Int32Array(128*128);
        for(const k of killers){k[0]=0;k[1]=0;}
        nodes=0;deadline=Date.now()+cfg.time;
        let result={m:root[0],score:0,depth:0,cands:[root[0]]};
        const margin=cfg.margin;
        try{
            for(let depth=1;depth<=cfg.depth;depth++){
                let best=-INF;
                const scored=[];
                for(let i=0;i<root.length;i++){
                    const m=root[i];
                    pos.make(m);
                    const alphaRoot=i===0?-INF:best-margin;
                    let v,exact=true;
                    if(i===0||margin>0){
                        v=-search(pos,depth-1,-INF,-alphaRoot,1,true);
                        exact=i===0||v>alphaRoot;                    // otherwise v is only an upper bound
                    }else{
                        v=-search(pos,depth-1,-best-1,-best,1,true);
                        exact=v>best;
                        if(exact)v=-search(pos,depth-1,-INF,-best,1,true);
                    }
                    pos.unmake();
                    scored.push({m,v,exact});
                    if(v>best)best=v;
                }
                // depth completed: order root for the next iteration and remember the candidates
                scored.sort((a,b)=>(b.exact-a.exact)||(b.v-a.v));
                root=scored.map(e=>e.m);
                const cands=scored.filter(e=>e.exact&&e.v>=best-margin).map(e=>e.m);
                result={m:scored[0].m,score:best,depth,cands:cands.length?cands:[scored[0].m]};
                if(Math.abs(best)>=MATE-100)break;                  // forced mate found
                if(Date.now()>deadline)break;
            }
        }catch(e){
            if(e!==TIMEOUT)throw e;
        }
        // Randomness: among candidates within `margin` of the best, any of them may be played.
        // Mate scores are never diluted.
        let pickM=result.m;
        if(result.cands.length>1&&Math.abs(result.score)<MATE-1000)
            pickM=result.cands[Math.floor(rng()*result.cands.length)];
        return Object.assign(out(pickM),{score:result.score,depth:result.depth,nodes});
    }

    function perft(fen,depth){
        const pos=new Pos(fen);
        const bufs=[];for(let i=0;i<=depth;i++)bufs.push(new Int32Array(256));
        const rec=(d)=>{
            if(d===0)return 1;
            const buf=bufs[d],n=pos.gen(buf,false);
            let total=0;
            for(let i=0;i<n;i++){
                if(!pos.make(buf[i]))continue;
                total+=rec(d-1);
                pos.unmake();
            }
            return total;
        };
        return rec(depth);
    }
    // Test hook: verify the incrementally updated hash equals a from-scratch one along a random walk.
    function selfCheck(fen,plies){
        const pos=new Pos(fen);const buf=new Int32Array(256);
        for(let i=0;i<plies;i++){
            const n=pos.gen(buf,false);const legal=[];
            for(let j=0;j<n;j++){if(pos.make(buf[j])){const a=pos.h1,c=pos.h2;pos.computeHash();if(a!==pos.h1||c!==pos.h2)return 'hash mismatch after '+i;pos.unmake();legal.push(buf[j]);}}
            if(!legal.length)break;
            pos.make(legal[Math.floor(Math.random()*legal.length)]);
        }
        return 'ok';
    }
    return {chooseMove,perft,selfCheck};
})();
