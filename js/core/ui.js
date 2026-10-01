/* ========================================================================
   CORE UI - screens, shared header, modal dialogs and the render dispatcher.
   Everything game-specific is rendered by the active game module's
   `render()` hook (js/games/<id>/game.js).
   ======================================================================== */

// Show exactly one full-screen view. Any element marked `data-screen`
// (welcome, game selection, and per-game screens injected by a game's
// board.html) is a screen, so games can add their own without touching
// this file.
function showScreen(id){
    document.querySelectorAll('[data-screen]').forEach(el=>el.classList.add('hidden'));
    document.getElementById(id)?.classList.remove('hidden');
}

// Localised display name of a game, from its registry entry.
function selectedGameLabel(id){
    const def=GAME_REGISTRY[id];
    return def?t(def.nameKey):id;
}

// Repaint the whole game view from gameState. The shell chrome is shared;
// the board itself is delegated to the active game's render() hook.
function renderTableUI(){
    // Header chrome is identical for every game -- only the name/icon and
    // (via game.render() below) the board itself change.
    // Reset Table is always visible (same chrome for every game/every
    // player), just disabled for non-hosts, rather than popping in and out.
    const resetBtn=document.getElementById('resetTableBtn');
    if(resetBtn){resetBtn.disabled=!gameState.isHost;resetBtn.title=t('resetTable');}

    const game=currentGame();
    document.querySelectorAll('[data-game-board]').forEach(el=>el.classList.toggle('hidden',el.dataset.gameBoard!==gameState.gameId));
    if(!game)return;   // module not loaded yet (see loadGame()); nothing game-specific to draw
    const def=GAME_REGISTRY[game.id];
    document.getElementById('roomStatusText').textContent=t(def.roomKey);
    const icon=document.getElementById('headerGameIcon');
    if(icon){icon.textContent=def.icon;icon.className=icon.className.replace(/\bbg-\w+-600\b/g,'')+' '+def.accentBg;}
    const label=document.getElementById('variantLabel');if(label)label.textContent=game.subtitle?game.subtitle():t(def.nameKey);
    const cfg=document.getElementById('tableConfigLabel');if(cfg)cfg.textContent=game.configSummary?game.configSummary():'';
    game.render();
}

const appModal = document.getElementById('appModal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const modalFooter = document.getElementById('modalFooter');

function showModal(title, htmlContent, buttonsConfig) {
  modalTitle.textContent = title;
  modalBody.innerHTML = htmlContent;
  modalFooter.innerHTML = '';
  
  buttonsConfig.forEach(cfg => {
    const btn = document.createElement('button');
    btn.textContent = cfg.text;
    
    // let baseClasses = "px-4 py-2 rounded-md font-medium text-sm transition-all duration-200 cursor-pointer text-white";
    let baseClasses = "px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow transition shrink-0";
    
    if (cfg.bg && cfg.bg.startsWith('#')) {
      btn.className = baseClasses;
      btn.style.backgroundColor = cfg.bg;
    } else {
      const customBg = cfg.bg || 'bg-slate-700 hover:bg-slate-600';
      btn.className = `${baseClasses} ${customBg}`;
    }
    
    btn.onclick = async () => {
      const allButtons = modalFooter.querySelectorAll('button');
      allButtons.forEach(b => {
        b.disabled = true;
        b.classList.add('opacity-40', 'cursor-not-allowed');
      });
      
      if (cfg.onClick) await cfg.onClick();
      if (cfg.close !== false) closeModal();
    };
    modalFooter.appendChild(btn);
  });
  
  appModal.classList.remove('hidden');
  appModal.classList.add('flex');
}

function closeModal() {
  appModal.classList.remove('flex');
  appModal.classList.add('hidden');
}

function showAlert(title, message) {
  showModal(title, message, [{ text: 'OK', bg: 'bg-blue-600 hover:bg-blue-500' }]);
}