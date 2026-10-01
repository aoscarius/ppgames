/* ========================================================================
   CORE UTILITIES - game-agnostic helpers shared by every game:
   id generation, per-room history storage, log + chat rendering.
   Anything about cards, chips, blinds or seats-with-chips lives in
   js/games/poker/cards.js instead.
   ======================================================================== */

// Short random identifier used for room IDs and bot player IDs.
// Not cryptographically secure -- just needs to be unique enough locally.
// Room/player ids embed the game id (e.g. "ppgpoker-abc1234") so an invite
// link is self-describing: a joiner can go straight into the right game
// (see joinRoomDirect() in core/events.js) without a separate query param.
function generateId(game) { return 'ppg' + game + '-' + Math.random().toString(36).slice(2,9); }

function roomStorageKey(kind, roomId=gameState.roomId){
    return `p2p-game:${kind}:${roomId || 'local'}`;
}
function loadRoomHistory(){
    try{
        gameState.chatHistory = JSON.parse(sessionStorage.getItem(roomStorageKey('chat')) || '[]');
        gameState.logHistory = JSON.parse(sessionStorage.getItem(roomStorageKey('logs')) || '[]');
    }catch{
        gameState.chatHistory=[]; gameState.logHistory=[];
    }
}
function saveRoomHistory(){
    try{
        sessionStorage.setItem(roomStorageKey('chat'), JSON.stringify(gameState.chatHistory.slice(-200)));
        sessionStorage.setItem(roomStorageKey('logs'), JSON.stringify(gameState.logHistory.slice(-300)));
    }catch{}
}

// Append a timestamped line to the "Peer & Game Logs" drawer, color-coded
// by severity, and bump the unread-logs badge if that drawer is currently
// closed. Used throughout the core and every game module to trace what's
// happening (hand dealt, action taken, connection events, errors, etc).
function logMessage(msg, type='info'){
    const line = {time:new Date().toLocaleTimeString(), msg:String(msg), type};
    gameState.logHistory.push(line); saveRoomHistory();
    const box = document.getElementById('logMessages'); if (!box) return;
    const e=document.createElement('div');
    const color=type==='error'?'text-rose-400':type==='success'?'text-emerald-400':'text-slate-400';
    e.className=color+' leading-snug';
    e.textContent=`[${line.time}] ${line.msg}`;
    box.appendChild(e); box.scrollTop=box.scrollHeight;
    if(document.getElementById('logsDrawer')?.classList.contains('translate-x-full')){
        gameState.unreadLogs++;
        const b=document.getElementById('logsBadge'); b.textContent=gameState.unreadLogs; b.classList.remove('hidden');
    }
}
function appendChatMessage(sender,text,isSystem=false){
    const message={sender:String(sender),text:String(text),isSystem:!!isSystem,time:Date.now(),roomId:gameState.roomId};
    gameState.chatHistory.push(message); saveRoomHistory();
    const box=document.getElementById('chatMessages'); if(!box)return;
    const e=document.createElement('div');
    if(isSystem){
        e.className='text-[11px] text-amber-400 bg-amber-950/40 p-1.5 rounded border border-amber-800/40 font-medium';
        e.textContent=text;
    }else{
        e.className='bg-slate-800 p-2 rounded-xl border border-slate-700/60';
        const n=document.createElement('div'); n.className='font-extrabold text-emerald-400 text-[10px]'; n.textContent=sender;
        const tt=document.createElement('div'); tt.className='text-slate-200 mt-0.5 text-xs'; tt.textContent=text;
        e.append(n,tt);
    }
    box.appendChild(e); box.scrollTop=box.scrollHeight;
    if(document.getElementById('chatDrawer')?.classList.contains('translate-x-full')){
        gameState.unreadChat++;
        const b=document.getElementById('chatBadge'); b.textContent=gameState.unreadChat; b.classList.remove('hidden');
    }
}
function renderRoomHistory(){
    const chat=document.getElementById('chatMessages'), logs=document.getElementById('logMessages');
    if(chat){
        chat.innerHTML='';
        gameState.chatHistory.filter(m=>m.roomId===gameState.roomId).forEach(m=>{
            const e=document.createElement('div');
            if(m.isSystem){
                e.className='text-[11px] text-amber-400 bg-amber-950/40 p-1.5 rounded border border-amber-800/40 font-medium'; e.textContent=m.text;
            }else{
                e.className='bg-slate-800 p-2 rounded-xl border border-slate-700/60';
                const n=document.createElement('div'); n.className='font-extrabold text-emerald-400 text-[10px]'; n.textContent=m.sender;
                const tt=document.createElement('div'); tt.className='text-slate-200 mt-0.5 text-xs'; tt.textContent=m.text; e.append(n,tt);
            }
            chat.appendChild(e);
        });
        chat.scrollTop=chat.scrollHeight;
    }
    if(logs){
        logs.innerHTML='';
        gameState.logHistory.forEach(line=>{
            const e=document.createElement('div');
            const color=line.type==='error'?'text-rose-400':line.type==='success'?'text-emerald-400':'text-slate-400';
            e.className=color+' leading-snug'; e.textContent=`[${line.time}] ${line.msg}`; logs.appendChild(e);
        });
        logs.scrollTop=logs.scrollHeight;
    }
}
