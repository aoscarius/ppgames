/* ========================================================================
   GO BOT ENGINE (Hard / Expert levels) - Monte-Carlo search.

   For the strong levels the heuristic bot in logic.js only proposes a short
   list of sensible candidate moves (no self-atari, no first-line moves, no
   own-eye filling...). Each candidate -- plus "pass" -- is then judged by
   playing many fast random games to the end ("playouts") from the position
   after that move and counting how often the bot wins by area score. The
   candidates share the time budget through the UCB1 bandit rule, so the
   promising ones get more playouts. Playing games out to the end also lets
   the bot see which stones are really dead, which is what decides when it
   is safe to pass.

   The playout board is a flat Int8Array (0 empty, 1 black, 2 white) with
   flood-fill liberty counting; a simple-ko check is enough inside playouts
   (the real game, in logic.js, enforces positional superko).
   ======================================================================== */
const GoBot=(function(){
    'use strict';
    const nbCache={};
    function neighborTable(size){
        if(!nbCache[size]){
            const t=[];
            for(let i=0;i<size*size;i++)t.push(Int16Array.from(goNeighbors(size,i)));
            nbCache[size]=t;
        }
        return nbCache[size];
    }

    function makeSim(size,komi){
        const n=size*size,N=neighborTable(size);
        const mark=new Int32Array(n),stack=new Int16Array(n),grp=new Int16Array(n);
        let stamp=0,glen=0,simKo=-1;

        // liberties of the group containing i; fills grp[0..glen)
        function libs(b,i){
            stamp++;
            const col=b[i];let sp=0,lc=0;glen=0;
            stack[sp++]=i;mark[i]=stamp;
            while(sp){
                const p=stack[--sp];grp[glen++]=p;
                const nb=N[p];
                for(let k=0;k<nb.length;k++){
                    const q=nb[k],v=b[q];
                    if(mark[q]===stamp)continue;
                    if(v===0){mark[q]=stamp;lc++;}
                    else if(v===col){mark[q]=stamp;stack[sp++]=q;}
                }
            }
            return lc;
        }
        // Play `color` at idx. Returns false (board unchanged) on suicide. Sets simKo.
        function play(b,idx,color){
            b[idx]=color;
            const opp=3-color,nb=N[idx];
            let captured=0,capPos=-1;
            for(let k=0;k<nb.length;k++){
                const q=nb[k];
                if(b[q]!==opp)continue;
                if(libs(b,q)===0){
                    if(glen===1)capPos=q;
                    captured+=glen;
                    for(let j=0;j<glen;j++)b[grp[j]]=0;
                }
            }
            const own=libs(b,idx);
            if(own===0){b[idx]=0;return false;}      // suicide (captured is 0 here)
            simKo=(captured===1&&glen===1&&own===1)?capPos:-1;
            return true;
        }
        function isOwnEye(b,i,color){
            const nb=N[i];
            for(let k=0;k<nb.length;k++)if(b[nb[k]]!==color)return false;
            const x=i%size,y=(i-x)/size;
            let hostile=0,off=0;
            for(let k=0;k<4;k++){
                const nx=x+(k&1?1:-1),ny=y+(k&2?1:-1);
                if(nx<0||ny<0||nx>=size||ny>=size){off++;continue;}
                const v=b[ny*size+nx];
                if(v!==0&&v!==color)hostile++;
            }
            return off>0?hostile===0:hostile<=1;
        }
        // black area minus (white area + komi)
        function score(b){
            let bs=0,ws=0;
            stamp++;
            for(let i=0;i<n;i++){
                const v=b[i];
                if(v===1)bs++;else if(v===2)ws++;
            }
            for(let i=0;i<n;i++){
                if(b[i]!==0||mark[i]===stamp)continue;
                let sp=0,cnt=0,tb=false,tw=false;
                stack[sp++]=i;mark[i]=stamp;
                while(sp){
                    const p=stack[--sp];cnt++;
                    const nb=N[p];
                    for(let k=0;k<nb.length;k++){
                        const q=nb[k],v=b[q];
                        if(v===1)tb=true;else if(v===2)tw=true;
                        else if(mark[q]!==stamp){mark[q]=stamp;stack[sp++]=q;}
                    }
                }
                if(tb&&!tw)bs+=cnt;else if(tw&&!tb)ws+=cnt;
            }
            return bs-(ws+komi);
        }
        // Random game to the end. `toMove` plays first. Returns score() of the final board.
        function playout(b,toMove,ko0,maxSteps){
            let color=toMove,passes=0,steps=0;simKo=ko0;
            while(passes<2&&steps<maxSteps){
                steps++;
                const ko=simKo;simKo=-1;
                const start=(Math.random()*n)|0;
                let played=false;
                for(let t=0;t<n;t++){
                    let idx=start+t;if(idx>=n)idx-=n;
                    if(b[idx]!==0||idx===ko||isOwnEye(b,idx,color))continue;
                    if(play(b,idx,color)){played=true;break;}
                }
                passes=played?0:passes+1;
                color=3-color;
            }
            return score(b);
        }
        return {play,playout,score,get ko(){return simKo;}};
    }

    // g: state.go. candidates: [{idx}] (already legal). Returns {pass:true}|{idx}.
    function chooseMove(g,color,candidates,timeMs,passAllowed){
        const size=g.size,n=size*size;
        const sim=makeSim(size,g.komi);
        const base=Int8Array.from(g.board);
        const work=new Int8Array(n);
        const maxSteps=Math.round(n*1.6);
        const arms=[];
        for(const c of candidates)arms.push({idx:c.idx,wins:0,visits:0});
        if(passAllowed)arms.push({idx:-1,wins:0,visits:0});
        if(!arms.length)return {pass:true};

        const iWin=s=>color===1?s>0:s<0;
        const pull=arm=>{
            work.set(base);
            let res;
            if(arm.idx>=0){
                if(!sim.play(work,arm.idx,color)){arm.visits+=1;return;}   // should not happen (pre-validated)
                res=sim.playout(work,3-color,sim.ko,maxSteps);
            }else{
                res=sim.playout(work,3-color,-1,maxSteps);                   // we pass, opponent moves
            }
            arm.visits++;
            if(iWin(res))arm.wins++;
        };

        const deadline=Date.now()+timeMs;
        for(const a of arms)pull(a);                  // one playout each
        let total=arms.length,rounds=0;
        while(true){
            if((++rounds&7)===0&&Date.now()>deadline)break;
            let best=null,bv=-Infinity;
            const lt=Math.log(total);
            for(const a of arms){
                const v=a.wins/a.visits+0.45*Math.sqrt(lt/a.visits);
                if(v>bv){bv=v;best=a;}
            }
            pull(best);total++;
        }
        // most-visited arm (robust choice); ties broken by win rate
        arms.sort((a,b)=>(b.visits-a.visits)||(b.wins/b.visits-a.wins/a.visits));
        const top=arms[0];
        return top.idx<0?{pass:true,rate:top.wins/top.visits,playouts:total}:{idx:top.idx,rate:top.wins/top.visits,playouts:total};
    }
    return {chooseMove};
})();
