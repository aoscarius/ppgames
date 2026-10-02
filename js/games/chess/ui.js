/* ========================================================================
   CHESS UI - board rendering, tap-to-move interaction, promotion/draw
   modals. Mirrors ui.js's renderTableUI()/renderSeat() pattern for poker:
   a single render function reads gameState and rebuilds the DOM from
   scratch, called every time gameState changes (see renderTableUI() in
   ui.js, which now dispatches here when gameState.gameId==='chess').
   ======================================================================== */

// Chess-only UI runtime state (client-side selection, never synced).
let chessSelectedSquare = null;   // e.g. 'e2' -- the square the local player tapped to move from, or null
let chessLegalTargets = [];       // legal destination squares for chessSelectedSquare, for move hints
let chessPendingPromotion = null; // {from,to} awaiting a promotion-piece choice, or null

const CHESS_PIECE_GLYPHS = {
    w:{p:'♙',n:'♘',b:'♗',r:'♖',q:'♕',k:'♔'},
    b:{p:'♟',n:'♞',b:'♝',r:'♜',q:'♛',k:'♚'}
};
const CHESS_FILES=['a','b','c','d','e','f','g','h'];

function chessLocalColor(){
    return chessColorOf(gameState,gameState.myPlayerId);
}

// Board orientation: always show the local player's own pieces at the
// bottom, like every normal chess UI. Falls back to White-at-bottom for
// spectators, with a manual flip button (flipBoardBtn, wired in events.js)
// for anyone who wants the other view.
function chessBoardIsFlipped(){
    if(gameState.chessManualFlip!=null)return gameState.chessManualFlip;
    return chessLocalColor()==='b';
}

function chessSquareToRC(square){
    const file=CHESS_FILES.indexOf(square[0]);
    const rank=Number(square[1]);
    return {file,rank};
}

// Build (or rebuild) the 8x8 grid of square elements. Only runs the DOM
// structure once; renderChessUI() just repaints piece contents/highlights
// on top of it, exactly like how poker's seat-0..7 divs are static markup
// that renderSeat() repaints (ui.js) rather than being recreated each time.
function ensureChessSquares(){
    const board=document.getElementById('chessBoard');
    if(!board||board.dataset.built==='1')return;
    board.dataset.built='1';
    board.innerHTML='';
    for(let r=0;r<8;r++)for(let f=0;f<8;f++){
        const sq=document.createElement('button');
        sq.type='button';
        sq.className='chess-square';
        sq.dataset.rowIndex=String(r);
        sq.dataset.colIndex=String(f);
        board.appendChild(sq);
    }
}

function chessSquareAt(rowIndex,colIndex,flipped){
    // rowIndex/colIndex are 0..7 top-left to bottom-right as laid out in
    // the DOM grid; translate to an algebraic square given orientation.
    const file = flipped ? 7-colIndex : colIndex;
    const rank = flipped ? rowIndex+1 : 8-rowIndex;
    return CHESS_FILES[file]+rank;
}

function renderChessUI(){
    try{
        ensureChessSquares();
        const cs=gameState.chess||defaultChessState();
        const lobby=gameState.status!=='in-progress' && cs.status!=='in-progress';
        const engine=new ChessJS.Chess(cs.fen||ChessJS.DEFAULT_POSITION);
        const flipped=chessBoardIsFlipped();

        // Seats: the first two non-spectator players, in seat order.
        const seated=chessMatchPlayers(gameState);
        const white=seated.find(p=>p.id===cs.whitePlayerId)||null;
        const black=seated.find(p=>p.id===cs.blackPlayerId)||null;
        const localColor=chessLocalColor();

        // In lobby (no match assigned yet) just show seat 1 / seat 2 as
        // generic slots so players can be added/kicked/bot-filled before
        // the host starts the match, mirroring poker's empty-seat cards.
        const bottomIsWhite=!flipped;
        const topPlayer = cs.status==='in-progress'||cs.status==='ended' ? (bottomIsWhite?black:white) : (bottomIsWhite?seated[1]:seated[0]);
        const bottomPlayer = cs.status==='in-progress'||cs.status==='ended' ? (bottomIsWhite?white:black) : (bottomIsWhite?seated[0]:seated[1]);
        const topSeatIndex = seated.indexOf(topPlayer)>=0 ? gameState.players.indexOf(topPlayer) : (bottomIsWhite?1:0);
        const bottomSeatIndex = seated.indexOf(bottomPlayer)>=0 ? gameState.players.indexOf(bottomPlayer) : (bottomIsWhite?0:1);

        renderChessBar('chessTop',topPlayer,topSeatIndex,lobby);
        renderChessBar('chessBottom',bottomPlayer,bottomSeatIndex,lobby);

        // Captured-piece trays (only meaningful once a match exists).
        document.getElementById('chessTopCaptured').innerHTML = topPlayer && cs.status!=='waiting'
            ? (bottomIsWhite?cs.capturedByBlack:cs.capturedByWhite).map(p=>CHESS_PIECE_GLYPHS[bottomIsWhite?'w':'b'][p]).join('')
            : '';
        document.getElementById('chessBottomCaptured').innerHTML = bottomPlayer && cs.status!=='waiting'
            ? (bottomIsWhite?cs.capturedByWhite:cs.capturedByBlack).map(p=>CHESS_PIECE_GLYPHS[bottomIsWhite?'b':'w'][p]).join('')
            : '';

        // Turn indicator dots
        const turnColor=engine.turn();
        const running=cs.status==='in-progress';
        document.getElementById('chessTopClockDot').className='w-2.5 h-2.5 rounded-full shrink-0 '+(running&&((bottomIsWhite&&turnColor==='b')||(!bottomIsWhite&&turnColor==='w'))?'bg-emerald-400 pulse-turn':'bg-slate-700');
        document.getElementById('chessBottomClockDot').className='w-2.5 h-2.5 rounded-full shrink-0 '+(running&&((bottomIsWhite&&turnColor==='w')||(!bottomIsWhite&&turnColor==='b'))?'bg-emerald-400 pulse-turn':'bg-slate-700');

        // Squares: pieces, last-move highlight, selection, legal-move dots, check.
        const board=engine.board();
        const lastMove=cs.moveHistory[cs.moveHistory.length-1];
        const kingInCheckSquare=(()=>{
            if(!engine.isCheck())return null;
            for(let r=0;r<8;r++)for(let f=0;f<8;f++){
                const sq=board[r][f];
                if(sq&&sq.type==='k'&&sq.color===turnColor)return CHESS_FILES[f]+(8-r);
            }
            return null;
        })();
        document.querySelectorAll('#chessBoard .chess-square').forEach(el=>{
            const r=Number(el.dataset.rowIndex),c=Number(el.dataset.colIndex);
            const square=chessSquareAt(r,c,flipped);
            const {file,rank}=chessSquareToRC(square);
            const piece=board[8-rank][file];
            const light=(file+rank)%2===0;
            el.dataset.square=square;
            el.className='chess-square '+(light?'chess-square-light':'chess-square-dark');
            if(lastMove&&(lastMove.from===square||lastMove.to===square))el.classList.add('chess-square-lastmove');
            if(chessSelectedSquare===square)el.classList.add('chess-square-selected');
            if(kingInCheckSquare===square)el.classList.add('chess-square-check');
            let inner='';
            if(piece)inner+=`<span class="chess-piece ${piece.color==='w'?'chess-piece-white':'chess-piece-black'}">${CHESS_PIECE_GLYPHS[piece.color][piece.type]}</span>`;
            if(chessLegalTargets.includes(square))inner+=`<span class="chess-move-dot ${piece?'chess-move-dot-capture':''}"></span>`;
            if(c===0)inner+=`<span class="chess-coord chess-coord-number">${square.charAt(1)}</span>`;
            if(r===7)inner+=`<span class="chess-coord chess-coord-letter">${square.charAt(0)}</span>`;
            el.innerHTML=inner;
        });

        // Move list
        const moveListWrap=document.getElementById('chessMoveListWrap');
        const moveList=document.getElementById('chessMoveList');
        if(cs.moveHistory.length){
            moveListWrap.classList.remove('hidden');
            let html='';
            for(let i=0;i<cs.moveHistory.length;i+=2){
                const num=i/2+1;
                html+=`<span class="text-slate-600">${num}.</span> ${cs.moveHistory[i].san} `;
                if(cs.moveHistory[i+1])html+=`${cs.moveHistory[i+1].san} `;
            }
            moveList.innerHTML=html;
            moveList.scrollTop=moveList.scrollHeight;
        }else moveListWrap.classList.add('hidden');

        // Status text
        const phaseEl=document.getElementById('chessPhaseText');
        const summaryEl=document.getElementById('chessStatusSummary');
        if(cs.status==='waiting'){
            phaseEl.textContent=t('lobbyWaiting');
            summaryEl.textContent = seated.length<2 ? t('waitingForOpponent') : t('readyToStart');
        }else if(cs.status==='in-progress'){
            const mine=localColor && localColor===turnColor;
            phaseEl.textContent = engine.isCheck() ? t('inCheck') : t('inProgress');
            summaryEl.textContent = mine ? t('yourTurn') : t('turnOf',{name:(turnColor==='w'?white:black)?.name||''});
        }else{
            phaseEl.textContent=t('matchOver');
            summaryEl.textContent=chessResultSummary(gameState);
        }

        // Controls
        const mySeatIndex=gameState.players.findIndex(p=>p?.id===gameState.myPlayerId);
        const iAmSeated=mySeatIndex>=0 && !gameState.players[mySeatIndex].spectator;
        const startBtn=document.getElementById('startChessBtn');
        if(startBtn){
            const canStart=gameState.isHost && cs.status!=='in-progress' && chessMatchPlayers(gameState).length>=2;
            startBtn.disabled=!canStart;
            startBtn.querySelector('span').textContent = cs.status==='ended' ? t('rematch') : t('startMatch');
        }
        const resignBtn=document.getElementById('resignBtn');
        if(resignBtn)resignBtn.disabled = !(cs.status==='in-progress' && !!localColor);
        const offerDrawBtn=document.getElementById('offerDrawBtn');
        if(offerDrawBtn)offerDrawBtn.disabled = !(cs.status==='in-progress' && !!localColor && !cs.drawOfferBy);

        document.getElementById('spectatorBanner').classList.toggle('hidden', !(!iAmSeated && cs.status==='in-progress'));

        // Incoming draw offer, shown to the *other* player via the shared modal.
        if(cs.drawOfferBy && cs.drawOfferBy!==gameState.myPlayerId && localColor && !appModal.dataset.chessDrawShownFor){
            appModal.dataset.chessDrawShownFor=cs.drawOfferBy+':'+cs.moveHistory.length;
            const offerer=gameState.players.find(p=>p?.id===cs.drawOfferBy);
            showModal(t('drawOfferedTitle'), t('drawOfferedBy',{name:offerer?.name||'?'}), [
                {text:t('accept'),bg:'bg-emerald-600 hover:bg-emerald-500',onClick:()=>requestChessDrawResponseAction(true)},
                {text:t('decline'),bg:'bg-slate-700 hover:bg-slate-600',onClick:()=>requestChessDrawResponseAction(false)}
            ]);
        }
        if(!cs.drawOfferBy)delete appModal.dataset.chessDrawShownFor;

        renderRoomHistory();
    }catch(e){logMessage(`Chess render error: ${e.message}`,'error');}
}

function renderChessBar(prefix,player,seatIndex,lobby){
    const nameEl=document.getElementById(prefix+'Name');
    const avatarEl=document.getElementById(prefix+'Avatar');
    if(!player){
        if(lobby && gameState.isHost){
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
    const kick = gameState.isHost && lobby && player.id!==gameState.myPlayerId
        ? `<button data-kick-player="${player.id}" class="ml-1.5 text-rose-400 hover:text-rose-300"><i class="fa-solid fa-xmark"></i></button>`
        : (gameState.isHost && lobby && player.isBot
            ? `<button data-remove-bot="${seatIndex}" class="ml-1.5 text-slate-400 hover:text-slate-200"><i class="fa-solid fa-minus"></i></button>`
            : '');
    nameEl.innerHTML=`<span>${player.name}${you}${botTag}</span>${kick}`;
}

/* --------------------------------------------------------------------
   Interaction: tap a square to select it (if it holds a piece the local
   player can move), tap a highlighted destination to move there. Wired
   from events.js via a single delegated click listener on #chessBoard.
   -------------------------------------------------------------------- */
function handleChessSquareClick(square){
    const cs=gameState.chess;
    if(!cs||cs.status!=='in-progress')return;
    const localColor=chessLocalColor();
    if(!localColor)return; // spectators can't move
    const engine=new ChessJS.Chess(cs.fen);
    if(engine.turn()!==localColor)return;

    if(chessSelectedSquare && chessLegalTargets.includes(square)){
        const moves=engine.moves({square:chessSelectedSquare,verbose:true});
        const mv=moves.find(m=>m.to===square);
        const isPromotion=mv && mv.promotion;
        const from=chessSelectedSquare;
        chessSelectedSquare=null;chessLegalTargets=[];
        if(isPromotion){
            chessPendingPromotion={from,to:square};
            renderChessUI();
            showChessPromotionModal(localColor);
        }else{
            requestChessMove(from,square);
        }
        return;
    }

    const piece=engine.get(square);
    if(piece && piece.color===localColor){
        chessSelectedSquare=square;
        chessLegalTargets=engine.moves({square,verbose:true}).map(m=>m.to);
    }else{
        chessSelectedSquare=null;chessLegalTargets=[];
    }
    renderChessUI();
}

function showChessPromotionModal(color){
    const pending=chessPendingPromotion;
    if(!pending)return;
    const pieces=['q','r','b','n'];
    const html=`<div class="grid grid-cols-4 gap-2">${pieces.map(p=>
        `<button data-promote-piece="${p}" class="chess-promo-btn text-3xl bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl py-3">${CHESS_PIECE_GLYPHS[color][p]}</button>`
    ).join('')}</div>`;
    showModal(t('choosePromotion'), html, []);
    modalFooter.innerHTML='';
    modalBody.querySelectorAll('[data-promote-piece]').forEach(btn=>{
        btn.onclick=()=>{
            const promotion=btn.dataset.promotePiece;
            closeModal();
            if(pending)requestChessMove(pending.from,pending.to,promotion);
            chessPendingPromotion=null;
        };
    });
}
