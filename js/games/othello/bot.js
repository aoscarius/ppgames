/* ========================================================================
   OTHELLO BOT ENGINE - difficulty levels and a fast alpha-beta searcher.

   Levels (see OTHELLO_BOT_LEVELS):
     easy    mostly random moves, sometimes the move that flips the most discs
     medium  the original positional-weight heuristic (corners good, squares
             next to an empty corner bad), no look-ahead (lives in logic.js)
     hard    alpha-beta search, ~5 plies, weights + mobility evaluation
     expert  iterative deepening under a time budget; the last ~12 empty
             squares are searched to the end of the game (exact disc count)

   The searcher works on a flat Int8Array(64) (0 empty, 1 black, 2 white)
   with precomputed rays, undoing moves in place, so it is far faster than
   the 2-D array helpers used by the game rules in logic.js. It is only used
   to CHOOSE a move: the host re-validates it with the normal rules.
   ======================================================================== */
const OTHELLO_BOT_LEVELS={
    easy:  {kind:'random'},
    medium:{kind:'heuristic'},
    hard:  {kind:'search',depth:5,time:600,solve:8},
    expert:{kind:'search',depth:14,time:2000,solve:12}
};

const OthelloBot=(function(){
    'use strict';
    // rays[sq] = list of 8 arrays of squares going outwards
    const DIRS=[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    const RAYS=[];
    for(let sq=0;sq<64;sq++){
        const r=sq>>3,c=sq&7,rays=[];
        for(const [dr,dc] of DIRS){
            const ray=[];let rr=r+dr,cc=c+dc;
            while(rr>=0&&rr<8&&cc>=0&&cc<8){ray.push(rr*8+cc);rr+=dr;cc+=dc;}
            if(ray.length>=2)rays.push(ray);          // a flank needs at least 2 squares
        }
        RAYS.push(rays);
    }
    const W=[
        100,-20,10, 5, 5,10,-20,100,
        -20,-50,-2,-2,-2,-2,-50,-20,
         10, -2,-1,-1,-1,-1, -2, 10,
          5, -2,-1,-1,-1,-1, -2,  5,
          5, -2,-1,-1,-1,-1, -2,  5,
         10, -2,-1,-1,-1,-1, -2, 10,
        -20,-50,-2,-2,-2,-2,-50,-20,
        100,-20,10, 5, 5,10,-20,100];
    const CORNERS=[[0,1,8,9],[7,6,15,14],[56,57,48,49],[63,62,55,54]];
    const TIMEOUT={};
    let deadline=0,nodes=0;

    // Flip discs for `me` playing sq; records flipped squares into `out`, returns their count (0 = illegal).
    function flipsFor(b,sq,me,out){
        if(b[sq])return 0;
        const opp=3-me;let n=0;
        const rays=RAYS[sq];
        for(let i=0;i<rays.length;i++){
            const ray=rays[i];let k=0;
            while(k<ray.length&&b[ray[k]]===opp)k++;
            if(k>0&&k<ray.length&&b[ray[k]]===me){for(let j=0;j<k;j++)out[n++]=ray[j];}
        }
        return n;
    }
    function moves(b,me){
        const list=[],tmp=new Int8Array(20);
        for(let sq=0;sq<64;sq++)if(!b[sq]&&flipsFor(b,sq,me,tmp)>0)list.push(sq);
        return list;
    }
    function mobility(b,me){
        const tmp=new Int8Array(20);let n=0;
        for(let sq=0;sq<64;sq++)if(!b[sq]&&flipsFor(b,sq,me,tmp)>0)n++;
        return n;
    }
    function evaluate(b,me){
        const opp=3-me;
        let pos=0,mine=0,theirs=0;
        for(let sq=0;sq<64;sq++){
            const v=b[sq];if(!v)continue;
            let w=W[sq];
            if(v===me){pos+=w;mine++;}else{pos-=w;theirs++;}
        }
        // squares next to a corner are only bad while that corner is still empty
        for(const [c,a,bb,x] of CORNERS){
            if(b[c]){
                for(const s of [a,bb,x]){
                    if(b[s]===me)pos+=-W[s]+3;else if(b[s]===opp)pos-=-W[s]+3;
                }
            }
        }
        const mm=mobility(b,me),om=mobility(b,opp);
        const mob=(mm+om)?100*(mm-om)/(mm+om):0;
        const empties=64-mine-theirs;
        const discs=empties<20?(mine-theirs)*2:0;
        return pos+mob*0.9+discs;
    }

    function search(b,me,depth,alpha,beta,passed,exactEmpties){
        if((++nodes&1023)===0&&Date.now()>deadline)throw TIMEOUT;
        const flips=new Int8Array(20);
        const list=[];
        for(let sq=0;sq<64;sq++){
            if(b[sq])continue;
            const n=flipsFor(b,sq,me,flips);
            if(n>0)list.push({sq,n,w:W[sq]});
        }
        if(!list.length){
            if(passed){                                   // both sides stuck: game over, exact result
                let d=0;for(let i=0;i<64;i++){if(b[i]===me)d++;else if(b[i]===3-me)d--;}
                return d*1000;
            }
            return -search(b,3-me,depth,-beta,-alpha,true,exactEmpties);
        }
        let empties=0;if(exactEmpties){for(let i=0;i<64;i++)if(!b[i])empties++;}
        const exact=exactEmpties&&empties<=exactEmpties;
        if(depth<=0&&!exact)return evaluate(b,me);
        list.sort((x,y)=>y.w-x.w);
        let best=-Infinity;
        for(const m of list){
            const f=new Int8Array(20);
            const n=flipsFor(b,m.sq,me,f);
            b[m.sq]=me;for(let i=0;i<n;i++)b[f[i]]=me;
            const v=-search(b,3-me,depth-1,-beta,-alpha,false,exactEmpties);
            b[m.sq]=0;for(let i=0;i<n;i++)b[f[i]]=3-me;
            if(v>best)best=v;
            if(best>alpha)alpha=best;
            if(alpha>=beta)break;
        }
        return best;
    }

    function toFlat(board2d){
        const b=new Int8Array(64);
        for(let r=0;r<8;r++)for(let c=0;c<8;c++){const v=board2d[r][c];b[r*8+c]=v==='b'?1:v==='w'?2:0;}
        return b;
    }

    // board2d: 8x8 of 'b'|'w'|null.  color: 'b'|'w'.  level: key of OTHELLO_BOT_LEVELS or a config.
    // Returns {r,c} or null if the side has no legal move.
    function chooseMove(board2d,color,level,opts){
        const cfg=typeof level==='object'&&level?level:(OTHELLO_BOT_LEVELS[level]||OTHELLO_BOT_LEVELS.medium);
        const rng=(opts&&opts.random)||Math.random;
        const b=toFlat(board2d),me=color==='b'?1:2;
        const legal=moves(b,me);
        if(!legal.length)return null;
        const out=sq=>({r:sq>>3,c:sq&7});
        const flipsCount=sq=>flipsFor(b,sq,me,new Int8Array(20));

        if(cfg.kind==='random'){
            // 65%: any legal move; otherwise the greedy one (a beginner who sometimes grabs discs)
            if(rng()<0.65)return out(legal[Math.floor(rng()*legal.length)]);
            let best=legal[0],bn=-1;
            for(const sq of legal){const n=flipsCount(sq);if(n>bn){bn=n;best=sq;}}
            return out(best);
        }
        if(legal.length===1)return out(legal[0]);

        // alpha-beta with iterative deepening
        deadline=Date.now()+cfg.time;nodes=0;
        let empties=0;for(let i=0;i<64;i++)if(!b[i])empties++;
        let order=legal.slice().sort((x,y)=>W[y]-W[x]);
        let best=order[0];
        const solveNow=empties<=cfg.solve;
        const maxDepth=solveNow?empties:cfg.depth;
        try{
            for(let depth=1;depth<=maxDepth;depth++){
                let alpha=-Infinity,bestHere=order[0];const scored=[];
                for(const sq of order){
                    const f=new Int8Array(20),n=flipsFor(b,sq,me,f);
                    b[sq]=me;for(let i=0;i<n;i++)b[f[i]]=me;
                    const v=-search(b,3-me,depth-1,-Infinity,-alpha,false,solveNow?cfg.solve:0);
                    b[sq]=0;for(let i=0;i<n;i++)b[f[i]]=3-me;
                    scored.push({sq,v});
                    if(v>alpha){alpha=v;bestHere=sq;}
                }
                scored.sort((x,y)=>y.v-x.v);
                order=scored.map(e=>e.sq);best=bestHere;
                if(Date.now()>deadline)break;
            }
        }catch(e){
            if(e!==TIMEOUT)throw e;
            // the interrupted iteration is discarded: `best` is from the last completed depth
        }
        return out(best);
    }
    return {chooseMove};
})();
