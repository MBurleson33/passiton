// ============================================================
// Pass It On — UI Layer (Rules v1.1)
// The only file that touches the page for the game itself. Game
// rules live in engine.js; this file renders state and turns taps
// into engine calls. Online games reuse all of it through a small
// adapter installed by online.js.
// ============================================================

let GAME = null;
const SAVE_KEY = "passiton-save-v2"; // v2: 150-card deck + Grace Deck

// ---- Online adapter --------------------------------------------
// With ONLINE === null this is local pass-and-play. Online, a
// handful of places (whose hand is shown, how a finished move is
// saved, choices another player makes on their own phone) defer to
// the adapter from online.js.
let ONLINE = null;
function setOnlineAdapter(adapter) { ONLINE = adapter; }
function getGame() { return GAME; }
function setGame(state) { GAME = state; }

// The player whose hand is shown on this device.
function viewerPlayer() {
  if (ONLINE) return GAME.players[ONLINE.myIndex()];
  return currentPlayer(GAME);
}
function viewerCanAct() {
  return !ONLINE || ONLINE.canAct();
}
function startMoveOnline(kind) {
  if (ONLINE) ONLINE.beginMove(kind);
}

const el = sel => document.querySelector(sel);
const els = sel => Array.from(document.querySelectorAll(sel));

function escapeText(s) {
  return String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

// ---- Screens ------------------------------------------------
function showScreen(id) {
  hideCardTooltip();
  els(".screen").forEach(s => s.classList.remove("active"));
  el(`#${id}`).classList.add("active");
}

// ---- Setup screen ---------------------------------------------
function getSelectedPlayerCount() {
  const active = document.querySelector("#player-count-row .count-btn.active");
  return active ? parseInt(active.dataset.count, 10) : 4;
}

function initSetupScreen() {
  const list = el("#player-name-list");
  list.innerHTML = "";
  const count = getSelectedPlayerCount();
  for (let i = 0; i < count; i++) {
    const row = document.createElement("div");
    row.className = "player-name-row";
    row.innerHTML = `<label>Player ${i + 1}</label><input type="text" maxlength="16" placeholder="Player ${i + 1}" value="" />`;
    list.appendChild(row);
  }
}

els("#player-count-row .count-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    els("#player-count-row .count-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    initSetupScreen();
  });
});

el("#start-game-btn").addEventListener("click", () => {
  const inputs = els("#player-name-list input");
  const names = inputs.map((inp, i) => inp.value.trim() || `Player ${i + 1}`);
  GAME = createGameState(names);
  persist();
  renderPassScreen();
});

el("#resume-game-btn").addEventListener("click", () => {
  const saved = loadSave();
  if (saved) {
    GAME = saved;
    renderPassScreen();
  }
});

// ---- Persistence ---------------------------------------------------
function persist() {
  if (ONLINE) return; // online games are saved to Firestore
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(GAME));
  } catch (e) {
    console.warn("Could not save game:", e);
  }
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
}

// ---- Home screen ------------------------------------------------
function initHomeScreen() {
  const saved = loadSave();
  el("#resume-game-btn").style.display = saved && saved.status === "playing" ? "block" : "none";
  let room = null;
  try { room = localStorage.getItem("passiton-online-room"); } catch (e) {}
  el("#rejoin-online-btn").style.display = room ? "block" : "none";
  if (room) el("#rejoin-online-btn").textContent = `Rejoin Online Game · ${room}`;
}

el("#new-game-btn").addEventListener("click", () => {
  showScreen("setup-screen");
  initSetupScreen();
});

el("#home-btn-results").addEventListener("click", () => {
  if (ONLINE) { ONLINE.leave(true); return; }
  clearSave();
  showScreen("home-screen");
  initHomeScreen();
});

el("#play-again-btn").addEventListener("click", () => {
  if (ONLINE) { ONLINE.rematch(); return; }
  showScreen("setup-screen");
  initSetupScreen();
});

// ---- Turn-finished render ----------------------------------------
// Every flow ends here. Online, this is the one place a finished
// move is saved (the adapter commits and re-renders).
function renderPassScreen() {
  pendingAfter = [];
  if (ONLINE) { ONLINE.settle(); return; }
  showGameOrResults();
}

function showGameOrResults() {
  closeModal();
  if (GAME.status === "finished") {
    renderResultsScreen();
    showScreen("results-screen");
    return;
  }
  showScreen("game-screen");
  renderGameScreen();
  // After a Miracle, the next player picks the suit before anything else.
  const me = viewerPlayer();
  if (GAME.suitChooserId === me.id && viewerCanAct()) modalNextPlayerSuit();
}

// ---- Icons -----------------------------------------------------------
const ICON_SPARK = `<svg class="mini-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z"/></svg>`;
const ICON_CARDS = `<svg class="mini-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="4" y="5" width="12" height="16" rx="2"/><rect x="10" y="3" width="12" height="16" rx="2" fill="var(--surface)"/></svg>`;
const ICON_GIFT = `<svg class="mini-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="5" rx="1"/><path d="M5 13v7h14v-7M12 8v12M12 8S10.5 3 8 3.8 8.5 8 12 8zM12 8s1.5-5 4-4.2S15.5 8 12 8z"/></svg>`;

// ---- Main game screen ------------------------------------------
function renderGameScreen() {
  hideCardTooltip();
  const current = currentPlayer(GAME);
  const p = viewerPlayer();
  const isMyTurn = p.id === current.id;
  const blocked = !viewerCanAct();
  const prompts = GAME.prompts || [];

  el("#current-player-name").textContent = ONLINE && isMyTurn ? `${current.name} (you)` : current.name;
  el("#room-code-tag").style.display = ONLINE ? "inline-flex" : "none";
  if (ONLINE) el("#room-code-tag").textContent = ONLINE.roomId;
  el("#turn-count").textContent = GAME.turnCount;
  el("#draw-pile-count").textContent = GAME.drawPile.length;

  el("#active-suit-badge").textContent = GAME.activeSuit || "Choosing…";
  el("#active-suit-badge").style.background = GAME.activeSuit ? SUIT_COLORS[GAME.activeSuit] : "#555";
  const numBadge = el("#active-number-badge");
  numBadge.style.display = GAME.activeNumber != null ? "inline-block" : "none";
  numBadge.textContent = GAME.activeNumber != null ? GAME.activeNumber : "";
  const symBadge = el("#active-symbol-badge");
  const symDef = GAME.activeSymbol ? ACTION_CARDS.find(a => a.story === GAME.activeSymbol) : null;
  symBadge.style.display = symDef ? "inline-block" : "none";
  if (symDef) symBadge.textContent = symDef.name;

  el("#action-lock-badge").style.display = GAME.actionLock.active ? "inline-block" : "none";
  if (GAME.actionLock.active) {
    const owner = findPlayer(GAME, GAME.actionLock.ownerPlayerId);
    el("#action-lock-badge").innerHTML = `<svg class="badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><line x1="5.5" y1="18.5" x2="18.5" y2="5.5"/></svg> Peace: no Action or Miracle cards until ${escapeText(owner.name)}'s next turn`;
  }
  const chooser = GAME.suitChooserId ? findPlayer(GAME, GAME.suitChooserId) : null;
  el("#free-play-badge").style.display = chooser ? "inline-block" : "none";
  if (chooser) el("#free-play-badge").innerHTML = `${ICON_SPARK} ${chooser.id === p.id ? "You choose" : escapeText(chooser.name) + " chooses"} the active suit`;

  const top = GAME.discardPile[GAME.discardPile.length - 1];
  el("#discard-pile").innerHTML = "";
  el("#discard-pile").appendChild(renderCard(top, { size: "hero" }));

  // Opponents, seated in turn order starting with whoever plays after you.
  const seats = el("#opponent-seats");
  seats.innerHTML = "";
  const myIdx = GAME.players.findIndex(pl => pl.id === p.id);
  const opponentList = [];
  for (let k = 1; k < GAME.players.length; k++) opponentList.push(GAME.players[(myIdx + k) % GAME.players.length]);
  const seatCount = opponentList.length;
  const halfWidthByCount = { 1: 0, 2: 55, 3: 85, 4: 112, 5: 140 };
  const halfWidth = halfWidthByCount[seatCount] ?? 140;
  opponentList.forEach((op, seatIndex) => {
    const origIndex = GAME.players.findIndex(pl => pl.id === op.id);
    const angleDeg = seatCount === 1 ? 0 : -halfWidth + seatIndex * ((2 * halfWidth) / (seatCount - 1));
    const angleRad = (angleDeg * Math.PI) / 180;
    const x = 50 + 44 * Math.sin(angleRad);
    const y = 50 - 42 * Math.cos(angleRad);
    const badge = document.createElement("div");
    badge.className = "opponent-badge" + (origIndex === GAME.currentPlayerIndex ? " current" : "");
    badge.style.left = `${x}%`;
    badge.style.top = `${y}%`;
    const initial = op.name.trim().charAt(0).toUpperCase() || "?";
    const giftCount = (op.gifts || []).length;
    badge.innerHTML = `<div class="opp-avatar">${escapeText(initial)}</div>
      <div class="opp-info">
        <div class="opp-name">${escapeText(op.name)}</div>
        <div class="opp-meta"><span class="opp-hand">${ICON_CARDS}${op.hand.length}</span><span class="opp-blessings">${ICON_SPARK}${op.blessings}</span>${giftCount ? `<span class="opp-gifts">${ICON_GIFT}${giftCount}</span>` : ""}</div>
      </div>`;
    if (giftCount) badge.addEventListener("click", () => openGraceMarket());
    seats.appendChild(badge);
    // Keep side seats fully on screen on narrow phones.
    const r = badge.getBoundingClientRect();
    const overflowLeft = 6 - r.left, overflowRight = r.right - (window.innerWidth - 6);
    if (overflowLeft > 0) badge.style.marginLeft = `${overflowLeft}px`;
    else if (overflowRight > 0) badge.style.marginLeft = `${-overflowRight}px`;
  });

  // Your hand, fanned.
  el("#my-blessings").textContent = p.blessings;
  const handEl = el("#player-hand");
  handEl.innerHTML = "";
  const n = p.hand.length;
  const mid = (n - 1) / 2;
  const perCardDeg = mid > 0 ? Math.min(7, 22 / mid) : 0;
  p.hand.forEach((card, i) => {
    const legal = !blocked && canPlayCard(card, GAME, p.id);
    const cardEl = renderCard(card, { size: "medium", legal });
    const offset = i - mid;
    cardEl.style.setProperty("--rot", `${offset * perCardDeg}deg`);
    cardEl.style.setProperty("--arc-y", `${Math.abs(offset) * 4}px`);
    cardEl.addEventListener("click", () => onCardClick(card));
    handEl.appendChild(cardEl);
  });

  // Your Gifts of Grace
  const giftRow = el("#my-gifts");
  giftRow.innerHTML = "";
  (p.gifts || []).forEach(g => {
    const chip = document.createElement("button");
    chip.className = "gift-chip";
    chip.innerHTML = `${ICON_GIFT} ${escapeText(cardDef(g).name)}`;
    chip.addEventListener("click", () => showCardZoom(g));
    giftRow.appendChild(chip);
  });
  giftRow.style.display = (p.gifts || []).length ? "flex" : "none";

  const anyLegal = hasAnyLegalCard(GAME, p.id);
  const inPlayPhase = GAME.turnPhase === "play";
  const canDraw = isMyTurn && inPlayPhase && !anyLegal && !blocked && !GAME.suitChooserId;
  el("#draw-btn").style.display = canDraw ? "flex" : "none";
  const canEnd = isMyTurn && GAME.turnPhase === "after" && !blocked;
  el("#end-turn-btn").style.display = canEnd ? "inline-flex" : "none";
  const marketBtn = el("#grace-market-btn");
  marketBtn.classList.toggle("can-buy", isMyTurn && !blocked && canBuyAnyGrace(GAME, p.id));

  let hint;
  if (prompts.length) {
    const target = findPlayer(GAME, prompts[0].targetId);
    hint = target.id === p.id ? "Make your choice…" : `Waiting for ${target.name} to decide…`;
  } else if (blocked) {
    hint = "Saving…";
  } else if (GAME.suitChooserId) {
    hint = GAME.suitChooserId === p.id ? "Choose the active suit." : `Waiting for ${chooser.name} to choose the suit…`;
  } else if (!isMyTurn) {
    hint = `Waiting on ${current.name}…`;
    if (anyLegal) hint += " You can play Strength at any time.";
  } else if (GAME.turnPhase === "after") {
    hint = "Buy from the Grace Market, or end your turn.";
  } else {
    hint = anyLegal ? "Tap a highlighted card to play it." : "No legal plays — draw a card.";
  }
  el("#hint-text").textContent = hint;
  el("#hand-label").textContent = ONLINE ? "Your hand" : `${p.name}'s hand`;
}

// ---- Card rendering ---------------------------------------------------
// Art that failed to load once is remembered, so placeholders for
// not-yet-uploaded files don't re-request them on every render.
const MISSING_ART = new Set();

function artImg(src, alt, onError) {
  const img = document.createElement("img");
  img.className = "card-art-img";
  img.src = src;
  img.alt = alt;
  img.draggable = false;
  img.addEventListener("error", () => {
    MISSING_ART.add(src);
    img.remove();
    if (onError) onError();
  });
  return img;
}

function cardKindLabel(def) {
  if (def.type === "number") return def.suit;
  if (def.type === "action") return `${def.suit} · Action`;
  if (def.type === "miracle") return "Miracle";
  return def.kind === "gift" ? "Gift of Grace" : "Act of Grace";
}

function cardAccent(def) {
  if (def.suit) return SUIT_COLORS[def.suit];
  if (def.type === "grace") return def.kind === "gift" ? "#b8901f" : "#3f8a4f";
  return "#c99a3c";
}

// A designed stand-in for cards whose artwork isn't uploaded yet
// (Grace cards, second-suit Action cards).
function placeholderFace(def) {
  const face = document.createElement("div");
  face.className = `card-placeholder ${def.type === "grace" ? "grace-" + def.kind : "type-" + def.type}`;
  face.style.setProperty("--accent-card", cardAccent(def));
  const body = def.type === "number" ? `<div class="ph-number">${def.number}</div>`
    : `<div class="ph-text">${escapeText(def.text || def.playText || "")}</div>`;
  face.innerHTML = `<div class="ph-kind">${escapeText(cardKindLabel(def))}</div>
    <div class="ph-name">${escapeText(def.name)}</div>
    ${body}
    ${def.type === "grace" ? `<div class="ph-cost">${ICON_SPARK}${def.cost}</div>` : ""}`;
  return face;
}

function renderCard(card, opts = {}) {
  const def = cardDef(card);
  const wrap = document.createElement("div");
  wrap.className = `card card-${opts.size || "medium"} suit-${(def.suit || "none").toLowerCase()}`;
  wrap.dataset.card = def.id;
  if (def.type === "grace") wrap.classList.add(`grace-card-${def.kind}`);
  if (opts.legal) wrap.classList.add("legal");
  if (opts.faceDown) {
    wrap.classList.add("face-down", "has-art");
    wrap.appendChild(artImg("cards/Pass It On - Back.jpg", "", () => wrap.classList.remove("has-art")));
    attachHoldToZoom(wrap, card, opts);
    return wrap;
  }
  const showPlaceholder = () => {
    wrap.classList.remove("has-art");
    wrap.appendChild(placeholderFace(def));
  };
  if (def.artwork && !MISSING_ART.has(def.artwork)) {
    wrap.classList.add("has-art");
    wrap.appendChild(artImg(def.artwork, def.name, showPlaceholder));
  } else {
    showPlaceholder();
  }
  wrap.title = def.name;
  attachHoldToZoom(wrap, card, opts);
  return wrap;
}

// ---- Hold-to-zoom ---------------------------------------------
const LONG_PRESS_MS = 420;
const MOVE_CANCEL_PX = 12;
const DESKTOP_HOVER = !!(window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches);

function attachHoldToZoom(wrap, card, opts) {
  if (opts.noZoom) return;
  let timer = null;
  let startX = 0, startY = 0;
  let longPressed = false;
  const clearTimer = () => { if (timer) { clearTimeout(timer); timer = null; } };

  wrap.addEventListener("pointerdown", e => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    startX = e.clientX; startY = e.clientY;
    longPressed = false;
    wrap.classList.add("pressing");
    clearTimer();
    timer = setTimeout(() => {
      longPressed = true;
      wrap.classList.remove("pressing");
      hideCardTooltip();
      showCardZoom(card, opts);
    }, LONG_PRESS_MS);
  });
  const cancelPress = () => { clearTimer(); wrap.classList.remove("pressing"); };
  wrap.addEventListener("pointermove", e => {
    if (!timer) return;
    if (Math.abs(e.clientX - startX) > MOVE_CANCEL_PX || Math.abs(e.clientY - startY) > MOVE_CANCEL_PX) cancelPress();
  });
  wrap.addEventListener("pointerup", cancelPress);
  wrap.addEventListener("pointercancel", cancelPress);
  wrap.addEventListener("pointerleave", cancelPress);
  wrap.addEventListener("contextmenu", e => e.preventDefault());
  wrap.addEventListener("click", e => {
    if (longPressed) {
      e.stopImmediatePropagation();
      e.preventDefault();
      longPressed = false;
    }
  }, true);

  if (DESKTOP_HOVER && !opts.faceDown) {
    const def = cardDef(card);
    if (def.type !== "number") {
      wrap.addEventListener("mouseenter", () => showCardTooltip(def, wrap));
      wrap.addEventListener("mouseleave", hideCardTooltip);
    }
  }
}

function abilityBlocks(def, cls) {
  let html = "";
  if (def.type === "action") {
    html += `<div class="${cls}"><span class="${cls}-label">Play</span>${escapeText(def.playText)}</div>`;
    html += `<div class="${cls}"><span class="${cls}-label">Blessing (spend ${def.blessingCost})</span>${escapeText(def.blessingText)}</div>`;
  } else if (def.type === "miracle") {
    html += `<div class="${cls}"><span class="${cls}-label">Effect</span>${escapeText(def.text)}</div>`;
  } else if (def.type === "grace") {
    html += `<div class="${cls}"><span class="${cls}-label">${def.kind === "gift" ? "Ongoing" : "Once"} · cost ${def.cost} Blessing${def.cost === 1 ? "" : "s"}</span>${escapeText(def.text)}</div>`;
  }
  return html;
}

function showCardTooltip(def, anchorEl) {
  const tip = el("#card-tooltip");
  let html = `<div class="tt-name">${escapeText(def.name)}</div>`;
  html += `<div class="tt-suit">${escapeText(cardKindLabel(def))}</div>`;
  if (def.verse) html += `<div class="tt-verse">${escapeText(def.verse)}</div>`;
  html += abilityBlocks(def, "tt-ability").replace(/tt-ability-label/g, "tt-label");
  tip.innerHTML = html;
  tip.classList.add("visible");
  positionTooltip(tip, anchorEl);
}

function positionTooltip(tip, anchorEl) {
  const rect = anchorEl.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  let left = rect.left + rect.width / 2 - tipRect.width / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
  let top = rect.top - tipRect.height - 12;
  if (top < 8) top = rect.bottom + 12;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

function hideCardTooltip() {
  el("#card-tooltip").classList.remove("visible");
}

function showCardZoom(card, opts = {}) {
  const def = cardDef(card);
  const box = el("#zoom-box");
  box.innerHTML = "";
  const isBack = !!opts.faceDown;
  const artSrc = isBack ? "cards/Pass It On - Back.jpg" : def.artwork;
  const fallbackNode = () => {
    const fb = document.createElement("div");
    fb.className = "zoom-card-fallback";
    fb.appendChild(placeholderFace(def));
    return fb;
  };
  if (artSrc && !MISSING_ART.has(artSrc)) {
    const img = document.createElement("img");
    img.className = "zoom-card-img";
    img.src = artSrc;
    img.alt = isBack ? "" : def.name;
    img.addEventListener("error", () => { MISSING_ART.add(artSrc); img.replaceWith(fallbackNode()); });
    box.appendChild(img);
  } else {
    box.appendChild(fallbackNode());
  }
  if (!isBack) {
    const info = document.createElement("div");
    let html = `<div class="zoom-name">${escapeText(def.name)}</div>`;
    html += `<div class="zoom-suit-line">${escapeText(def.type === "number" ? `${def.suit} · Number ${def.number}` : cardKindLabel(def))}</div>`;
    if (def.verse) html += `<div class="zoom-verse">${escapeText(def.verse)}</div>`;
    html += abilityBlocks(def, "zoom-ability").replace(/<span class="zoom-ability-label">(.*?)<\/span>/g, `<div class="zoom-ability-label">$1</div>`);
    info.innerHTML = html;
    box.appendChild(info);
  }
  const hint = document.createElement("div");
  hint.className = "zoom-hint";
  hint.textContent = "Tap anywhere to close";
  box.appendChild(hint);
  el("#zoom-overlay").classList.add("active");
}

function closeCardZoom() {
  el("#zoom-overlay").classList.remove("active");
}
el("#zoom-overlay").addEventListener("click", closeCardZoom);

// ---- Playing a card from your hand --------------------------------
// `continuingMove` is set when the play is part of a move already in
// progress (playing the card you just drew).
function onCardClick(card, continuingMove = false) {
  const def = cardDef(card);
  const p = viewerPlayer();
  if (!canPlayCard(card, GAME, p.id)) return;

  if (ONLINE && !continuingMove) {
    if (!ONLINE.canAct()) return;
    // Strength played on someone else's turn is saved straight
    // against the latest shared state (it interrupts their turn).
    if (p.id !== currentPlayer(GAME).id) { ONLINE.react(card); return; }
    ONLINE.beginMove("play");
  }

  if (def.type === "number") {
    handleEffectResult(playNumberCard(GAME, p.id, card.uid), p.id);
    return;
  }
  if (def.type === "action") {
    if (p.blessings >= def.blessingCost && def.blessingCost > 0) {
      showActionChoiceModal(def, card);
    } else {
      handleEffectResult(playActionCard(GAME, p.id, card.uid, false), p.id);
    }
    return;
  }
  if (def.type === "miracle") {
    handleEffectResult(playMiracleCard(GAME, p.id, card.uid), p.id);
  }
}

function showActionChoiceModal(def, card) {
  const playerId = viewerPlayer().id;
  openModal(`
    <h3>${escapeText(def.name)}</h3>
    <p class="verse">${escapeText(def.verse)}</p>
    <div class="choice-row">
      <button class="btn" id="choice-play">Play<br><small>${escapeText(def.playText)}</small></button>
      <button class="btn btn-gold" id="choice-blessing">Spend ${def.blessingCost} Blessing${def.blessingCost > 1 ? "s" : ""}<br><small>${escapeText(def.blessingText)}</small></button>
    </div>
  `);
  el("#choice-play").addEventListener("click", () => {
    closeModal();
    handleEffectResult(playActionCard(GAME, playerId, card.uid, false), playerId);
  });
  el("#choice-blessing").addEventListener("click", () => {
    closeModal();
    handleEffectResult(playActionCard(GAME, playerId, card.uid, true), playerId);
  });
}

// ---- Drawing --------------------------------------------------------
el("#draw-btn").addEventListener("click", () => {
  const p = currentPlayer(GAME);
  if (viewerPlayer().id !== p.id || !viewerCanAct() || hasAnyLegalCard(GAME, p.id)) return;
  if (GAME.turnPhase !== "play" || GAME.suitChooserId) return;
  startMoveOnline("draw");
  startDraw(p.id);
});

// Discernment (look at the top 2 first), then Endurance (draw 2,
// keep 1) or a normal draw.
function startDraw(playerId) {
  if (giftReady(GAME, playerId, "discernment")) {
    if (GAME.drawPile.length < 2) reshuffleDiscardIntoDraw(GAME);
    if (GAME.drawPile.length >= 2) { modalDiscernment(playerId, () => chooseDrawKind(playerId)); return; }
  }
  chooseDrawKind(playerId);
}

function chooseDrawKind(playerId) {
  if (giftReady(GAME, playerId, "endurance")) {
    openModal(`<h3>No legal plays</h3>
      <div class="choice-row">
        <button class="btn" id="draw-normal">Draw 1<br><small>Play it if you can.</small></button>
        <button class="btn btn-gold" id="draw-endurance">Endurance<br><small>Draw 2, keep 1, return the other to the bottom. Ends your turn.</small></button>
      </div>`);
    el("#draw-normal").addEventListener("click", () => { closeModal(); normalDraw(playerId); });
    el("#draw-endurance").addEventListener("click", () => enduranceDraw(playerId));
    return;
  }
  normalDraw(playerId);
}

function normalDraw(playerId) {
  const p = findPlayer(GAME, playerId);
  const drawn = drawCard(GAME, playerId, 1);
  if (ONLINE && ONLINE.noteDrawn) ONLINE.noteDrawn(drawn);
  if (drawn.length && canPlayCard(drawn[0], GAME, playerId)) {
    openModal(`
      <h3>You drew a playable card</h3>
      <div class="reveal-row" id="drawn-card-slot"></div>
      <div class="choice-row">
        <button class="btn btn-gold" id="play-drawn">Play it</button>
        <button class="btn" id="keep-drawn">Keep it</button>
      </div>
    `);
    el("#drawn-card-slot").appendChild(renderCard(drawn[0], { size: "medium" }));
    el("#play-drawn").addEventListener("click", () => { closeModal(); onCardClick(drawn[0], true); });
    el("#keep-drawn").addEventListener("click", () => {
      log(GAME, `${p.name} drew a card.`);
      closeModal();
      concludeTurn("normal");
    });
  } else {
    log(GAME, drawn.length ? `${p.name} drew a card.` : `${p.name} couldn't draw — no cards left.`);
    concludeTurn("normal");
  }
}

function enduranceDraw(playerId) {
  const p = findPlayer(GAME, playerId);
  markUsed(GAME, playerId, "endurance");
  const two = [];
  for (let i = 0; i < 2; i++) { const c = takeFromDrawPile(GAME); if (c) two.push(c); }
  if (two.length < 2) {
    p.hand.push(...two);
    log(GAME, `${p.name} used Endurance.`);
    closeModal();
    concludeTurn("normal");
    return;
  }
  openModal(`<h3>Endurance</h3><p>Keep 1 card. The other goes to the bottom of the draw pile.</p>
    <div class="reveal-row" id="endurance-slot"></div>`);
  two.forEach(card => {
    const c = renderCard(card, { size: "medium" });
    c.classList.add("selectable");
    c.addEventListener("click", () => {
      p.hand.push(card);
      GAME.drawPile.push(two.find(t => t.uid !== card.uid));
      log(GAME, `${p.name} used Endurance — drew 2, kept 1.`);
      closeModal();
      concludeTurn("normal");
    });
    el("#endurance-slot").appendChild(c);
  });
}

function modalDiscernment(playerId, onDone) {
  const topTwo = GAME.drawPile.slice(0, 2);
  openModal(`<h3>Discernment</h3><p>The next two cards on the draw pile. Which should be on top?</p>
    <div class="reveal-row" id="disc-slot"></div>
    <p class="small-note">Tap the card you want on top.</p>`);
  topTwo.forEach((card, i) => {
    const c = renderCard(card, { size: "medium" });
    c.classList.add("selectable");
    c.addEventListener("click", () => {
      markUsed(GAME, playerId, "discernment");
      if (i === 1) { GAME.drawPile[0] = topTwo[1]; GAME.drawPile[1] = topTwo[0]; }
      log(GAME, `${findPlayer(GAME, playerId).name} used Discernment.`);
      closeModal();
      onDone();
    });
    el("#disc-slot").appendChild(c);
  });
}

// ---- Turn finishing ---------------------------------------------------
// A play can grant follow-ups ("play an additional card", Walk On
// Water's "pick who plays next", an Act bought mid-turn). Those push
// a continuation here; finishTurn() runs the most recent one instead
// of ending the turn, so each nested flow returns to its caller.
let pendingAfter = [];
function pushAfter(fn) { pendingAfter.push(fn); }

function finishTurn() {
  if (pendingAfter.length) { const fn = pendingAfter.pop(); fn(); return; }
  closeModal();
  concludeTurn("normal");
}

// A Miracle's resolution ends the turn; any pending follow-up is
// superseded, and the next player chooses the suit.
function finishMiracleTurn() {
  if (pendingAfter.length) log(GAME, "A pending choice was superseded by the Miracle.");
  pendingAfter = [];
  closeModal();
  concludeTurn("miracle");
}

// You may still buy from the Grace Market after your normal play,
// so the turn pauses in an "after" phase when a purchase is possible.
function concludeTurn(mode) {
  if (GAME.status === "finished") { renderPassScreen(); return; }
  const me = currentPlayer(GAME);
  if (canBuyAnyGrace(GAME, me.id)) {
    GAME.turnPhase = "after";
    GAME.pendingEnd = mode;
    persist();
    renderPassScreen();
    return;
  }
  endTurnNow(mode);
}

function endTurnNow(mode) {
  if (mode === "miracle") endTurnAfterMiracle(GAME);
  else advanceTurn(GAME);
  persist();
  renderPassScreen();
}

el("#end-turn-btn").addEventListener("click", () => {
  if (viewerPlayer().id !== currentPlayer(GAME).id || GAME.turnPhase !== "after" || !viewerCanAct()) return;
  startMoveOnline("end");
  endTurnNow(GAME.pendingEnd || "normal");
});

function endTurnAndClose() {
  closeModal();
  finishTurn();
}
function endMiracleTurnAndClose() {
  closeModal();
  finishMiracleTurn();
}

// Plays a card that's already out of the player's hand and resolves
// it fully, offering the Play/Blessing choice for an Action card.
function playExtraCard(playerId, card, onResult) {
  const def = cardDef(card);
  const player = findPlayer(GAME, playerId);
  if (def.type === "action" && def.blessingCost > 0 && player.blessings >= def.blessingCost) {
    openModal(`
      <h3>${escapeText(def.name)}</h3>
      <p class="verse">${escapeText(def.verse)}</p>
      <div class="choice-row">
        <button class="btn" id="choice-play">Play<br><small>${escapeText(def.playText)}</small></button>
        <button class="btn btn-gold" id="choice-blessing">Spend ${def.blessingCost} Blessing${def.blessingCost > 1 ? "s" : ""}<br><small>${escapeText(def.blessingText)}</small></button>
      </div>
    `);
    el("#choice-play").addEventListener("click", () => { closeModal(); onResult(playHandCardDirect(GAME, playerId, card, false)); });
    el("#choice-blessing").addEventListener("click", () => { closeModal(); onResult(playHandCardDirect(GAME, playerId, card, true)); });
    return;
  }
  onResult(playHandCardDirect(GAME, playerId, card, false));
}

// ---- Effect result dispatcher -------------------------------------------
function handleEffectResult(result, playerId) {
  if (!result) { renderPassScreen(); return; }
  if (result.won || GAME.status === "finished") { persist(); renderPassScreen(); return; }
  if (result.error) {
    alert(result.error);
    if (ONLINE) { ONLINE.abortMove(); return; }
    renderPassScreen();
    return;
  }
  if (result.numberPlayed) {
    runNumberFollowups(playerId, result.numberPlayed, () => finishTurn());
    return;
  }
  if (!result.needsInput) {
    if (result.miracle) finishMiracleTurn();
    else finishTurn();
    return;
  }
  routeNeedsInput(result, playerId);
}

function routeNeedsInput(result, playerId) {
  const handlers = {
    five_stones_keep: modalFiveStonesKeep,
    five_stones_play: modalFiveStonesPlay,
    living_water_discard: modalLivingWaterDiscard,
    loaves_and_fish_choose: modalLoavesAndFishChoose,
    mustard_seed_extra: (r, pid) => promptMustardSeedCard(pid, r.count),
    choose_suit_then_maybe_exchange: modalBigFish,
    big_storm_choose_target: modalBigStorm,
    empty_tomb_choose_card: modalEmptyTomb,
    good_samaritan_give: modalGoodSamaritan,
    good_shepherd_choose: modalGoodShepherdChoose,
    tree_climber_reorder: modalTreeClimber,
    two_coins_give: modalTwoCoins,
    walk_on_water_choose: modalWalkOnWater,
    choose_suit: modalChooseSuit,
    redeemed_choose_card: modalRedeemedChoose,
    overflow_discard: modalOverflow,
    // Acts of Grace
    provision: modalProvision,
    open_door: modalOpenDoor,
    abundance: modalAbundance,
    second_chance: modalSecondChance,
    guidance: modalGuidance,
    new_perspective: modalNewPerspective,
    give_freely: modalGiveFreely
  };
  const fn = handlers[result.needsInput];
  if (fn) fn(result, playerId);
  else finishTurn();
}

// ---- Modal shell --------------------------------------------------
function openModal(html) {
  hideCardTooltip();
  el("#modal-body").innerHTML = html;
  el("#modal-overlay").classList.add("active");
}
function closeModal() {
  el("#modal-overlay").classList.remove("active");
  el("#modal-body").innerHTML = "";
}

// Shared pickers ------------------------------------------------------
function pickCardModal({ title, text, cards, legalFn, onPick, skipLabel, onSkip, size = "small" }) {
  openModal(`<h3>${escapeText(title)}</h3>${text ? `<p>${escapeText(text)}</p>` : ""}
    <div class="reveal-row" id="pick-slot"></div>
    ${skipLabel ? `<button class="btn" id="pick-skip">${escapeText(skipLabel)}</button>` : ""}`);
  const slot = el("#pick-slot");
  cards.forEach(card => {
    const ok = legalFn ? legalFn(card) : true;
    const c = renderCard(card, { size, legal: !!legalFn && ok });
    if (ok) {
      c.classList.add("selectable");
      c.addEventListener("click", () => onPick(card));
    }
    slot.appendChild(c);
  });
  if (skipLabel) el("#pick-skip").addEventListener("click", onSkip);
}

function pickPlayerModal({ title, text, players, labelFn, onPick, skipLabel, onSkip }) {
  openModal(`<h3>${escapeText(title)}</h3>${text ? `<p>${escapeText(text)}</p>` : ""}
    <div class="choice-row" id="target-slot"></div>
    ${skipLabel ? `<button class="btn" id="pick-skip">${escapeText(skipLabel)}</button>` : ""}`);
  players.forEach(p => {
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = labelFn ? labelFn(p) : p.name;
    btn.addEventListener("click", () => onPick(p));
    el("#target-slot").appendChild(btn);
  });
  if (skipLabel) el("#pick-skip").addEventListener("click", onSkip);
}

function pickSuitModal(title, text, onPick) {
  openModal(`<h3>${escapeText(title)}</h3>${text ? `<p>${escapeText(text)}</p>` : ""}<div class="suit-row" id="suit-slot"></div>`);
  SUITS.forEach(suit => {
    const btn = document.createElement("button");
    btn.className = "suit-btn";
    btn.style.background = SUIT_COLORS[suit];
    btn.textContent = suit;
    btn.addEventListener("click", () => onPick(suit));
    el("#suit-slot").appendChild(btn);
  });
}

// Tap the cards in the order they should sit on top of the draw pile.
function modalReorder(title, cards, onDone) {
  if (cards.length <= 1) { onDone(cards.slice()); return; }
  openModal(`<h3>${escapeText(title)}</h3><p>Tap the cards in the order you want them on top of the draw pile (first tap = top card).</p>
    <div class="reveal-row" id="reveal-slot"></div>
    <div class="reveal-row" id="chosen-slot"><em>Order chosen:</em></div>
    <button class="btn" id="confirm-order" style="display:none">Confirm order</button>`);
  const chosen = [];
  cards.forEach(card => {
    const c = renderCard(card, { size: "small" });
    c.classList.add("selectable");
    c.addEventListener("click", () => {
      if (chosen.includes(card)) return;
      chosen.push(card);
      c.classList.add("chosen");
      el("#chosen-slot").appendChild(renderCard(card, { size: "small" }));
      if (chosen.length === cards.length) el("#confirm-order").style.display = "inline-block";
    });
    el("#reveal-slot").appendChild(c);
  });
  el("#confirm-order").addEventListener("click", () => onDone(chosen));
}

// ---- After a Miracle: the next player picks the suit ---------------
function modalNextPlayerSuit() {
  const me = viewerPlayer();
  pickSuitModal("Choose the active suit", "A Miracle was played — you choose the suit before your turn.", suit => {
    if (ONLINE) { if (!ONLINE.canAct()) return; ONLINE.beginMove("suit"); }
    chooseSuit(GAME, me.id, suit);
    persist();
    renderPassScreen();
  });
}

// ============================================================
// AFTER PLAYING A NUMBERED CARD
// Opportunity (Gift) → Pass It On (+ Fellowship / Gratitude) →
// Unity (Gift). Each is optional and offered only when possible.
// ============================================================
function runNumberFollowups(playerId, card, done) {
  if (GAME.status === "finished") { renderPassScreen(); return; }
  const player = findPlayer(GAME, playerId);
  const number = cardDef(card).number;

  const stepUnity = () => {
    if (GAME.status === "finished") { renderPassScreen(); return; }
    if (!giftReady(GAME, playerId, "unity")) { done(); return; }
    const suit = cardDef(GAME.discardPile[GAME.discardPile.length - 1]).suit;
    const options = player.hand.filter(c => {
      const d = cardDef(c);
      if (d.suit !== suit) return false;
      if (d.type === "action" && GAME.actionLock.active) return false;
      return true;
    });
    if (!options.length) { done(); return; }
    pickCardModal({
      title: "Unity",
      text: `You may play 1 additional ${suit} card.`,
      cards: options,
      legalFn: () => true,
      onPick: c => {
        markUsed(GAME, playerId, "unity");
        removeFromHand(player, c.uid);
        log(GAME, `${player.name} used Unity to play an additional ${suit} card.`);
        closeModal();
        playExtraCard(playerId, c, r => handleEffectResult(r, playerId));
      },
      skipLabel: "Skip", onSkip: () => { closeModal(); done(); }
    });
  };

  const stepPass = () => {
    if (GAME.status === "finished") { renderPassScreen(); return; }
    const options = passItOnOptions(GAME, playerId, number);
    if (!options.length) { stepUnity(); return; }
    modalPassItOn(playerId, number, options, stepUnity);
  };

  const stepOpportunity = () => {
    if (!giftReady(GAME, playerId, "opportunity")) { stepPass(); return; }
    const options = player.hand.filter(c => cardDef(c).type === "number" && cardDef(c).number === number);
    if (!options.length) { stepPass(); return; }
    pickCardModal({
      title: "Opportunity",
      text: `Play another ${number} together with it?`,
      cards: options,
      legalFn: () => true,
      onPick: c => {
        markUsed(GAME, playerId, "opportunity");
        removeFromHand(player, c.uid);
        GAME.discardPile.push(c);
        GAME.activeSuit = cardDef(c).suit;
        GAME.activeNumber = number;
        log(GAME, `${player.name} used Opportunity to also play ${cardDef(c).name}.`);
        closeModal();
        if (checkWin(GAME, playerId)) { persist(); renderPassScreen(); return; }
        stepPass();
      },
      skipLabel: "Skip", onSkip: () => { closeModal(); stepPass(); }
    });
  };

  stepOpportunity();
}

function modalPassItOn(playerId, number, options, onDone) {
  const player = findPlayer(GAME, playerId);
  const others = GAME.players.filter(p => p.id !== playerId);
  pickCardModal({
    title: "Pass It On!",
    text: `Give another player a ${number} from your hand and gain 1 Blessing.`,
    cards: options,
    legalFn: () => true,
    onPick: card => {
      pickPlayerModal({
        title: "Pass It On to…",
        players: others,
        onPick: target => {
          const res = passItOn(GAME, playerId, target.id, card);
          closeModal();
          if (checkWin(GAME, playerId)) { persist(); renderPassScreen(); return; }
          const afterGratitude = () => {
            if (res.fellowshipSwap && player.hand.length) {
              pickCardModal({
                title: "Fellowship",
                text: "Swap 1 card from your hand with the top card of the draw pile.",
                cards: player.hand.slice(),
                legalFn: () => true,
                onPick: c => {
                  exchangeWithDrawTop(GAME, playerId, c.uid);
                  log(GAME, `${player.name} swapped a card with the draw pile (Fellowship).`);
                  closeModal();
                  onDone();
                },
                skipLabel: "Keep my cards", onSkip: () => { closeModal(); onDone(); }
              });
            } else onDone();
          };
          if (res.gratitude) offerGratitude(target.id, card, playerId, afterGratitude);
          else afterGratitude();
        },
        skipLabel: "Back", onSkip: () => modalPassItOn(playerId, number, options, onDone)
      });
    },
    skipLabel: "Don't pass", onSkip: () => { closeModal(); onDone(); }
  });
}

// Gratitude is the receiver's choice. Online, it's asked on their
// own phone (play pauses until they answer); in pass-and-play, here.
function offerGratitude(targetId, card, byId, onDone) {
  if (ONLINE) {
    GAME.prompts = GAME.prompts || [];
    GAME.prompts.push({ type: "gratitude", targetId, cardUid: card.uid, byId });
    onDone();
    return;
  }
  const target = findPlayer(GAME, targetId);
  openModal(`<h3>Gratitude — ${escapeText(target.name)}</h3>
    <p>${escapeText(target.name)} may swap the card they just received for the top card of the draw pile.</p>
    <div class="reveal-row" id="grat-slot"></div>
    <div class="choice-row">
      <button class="btn btn-gold" id="grat-swap">Swap it</button>
      <button class="btn" id="grat-keep">Keep it</button>
    </div>`);
  el("#grat-slot").appendChild(renderCard(card, { size: "medium" }));
  el("#grat-swap").addEventListener("click", () => { applyGratitude(GAME, targetId, card.uid); closeModal(); onDone(); });
  el("#grat-keep").addEventListener("click", () => { closeModal(); onDone(); });
}

// ============================================================
// ACTION & MIRACLE EFFECTS
// ============================================================
function modalFiveStonesKeep(result, playerId) {
  const player = findPlayer(GAME, playerId);
  if (result.revealed.length === 0) {
    log(GAME, `${player.name} played Five Stones but the draw pile was empty.`);
    endTurnAndClose();
    return;
  }
  pickCardModal({
    title: "Five Stones", text: "Choose 1 card to keep. Then put the other 4 back in any order.",
    cards: result.revealed, size: "medium",
    onPick: card => {
      player.hand.push(card);
      log(GAME, `${player.name} kept a card from Five Stones.`);
      modalReorder("Five Stones — return the rest", result.revealed.filter(r => r.uid !== card.uid), ordered => {
        GAME.drawPile.unshift(...ordered);
        endTurnAndClose();
      });
    }
  });
}

function modalFiveStonesPlay(result, playerId) {
  const player = findPlayer(GAME, playerId);
  if (result.revealed.length === 0) {
    log(GAME, `${player.name} played Five Stones (Blessing) but the draw pile was empty.`);
    endTurnAndClose();
    return;
  }
  if (result.playable.length === 0) {
    openModal(`<h3>Five Stones (Blessing)</h3><p>None of the 5 revealed cards can be played. Add one to your hand, or return all five?</p>
      <div class="reveal-row" id="reveal-slot"></div>
      <div class="choice-row">
        <button class="btn" id="ft-keep-one">Keep 1 in hand</button>
        <button class="btn" id="ft-return-all">Return all 5</button>
      </div>`);
    result.revealed.forEach(c => el("#reveal-slot").appendChild(renderCard(c, { size: "small" })));
    el("#ft-keep-one").addEventListener("click", () => {
      player.hand.push(result.revealed[0]);
      GAME.drawPile.unshift(...shuffle(result.revealed.slice(1)));
      log(GAME, `${player.name} found nothing playable and kept a card.`);
      endTurnAndClose();
    });
    el("#ft-return-all").addEventListener("click", () => {
      GAME.drawPile.unshift(...shuffle(result.revealed));
      log(GAME, `${player.name} found nothing playable and returned all 5.`);
      endTurnAndClose();
    });
    return;
  }
  pickCardModal({
    title: "Five Stones (Blessing)", text: "Choose 1 legal card to play immediately.",
    cards: result.revealed, size: "medium",
    legalFn: c => result.playable.some(pc => pc.uid === c.uid),
    onPick: card => {
      modalReorder("Five Stones — return the rest", result.revealed.filter(r => r.uid !== card.uid), ordered => {
        GAME.drawPile.unshift(...ordered);
        closeModal();
        log(GAME, `${player.name} played a card revealed by Five Stones.`);
        playExtraCard(playerId, card, r => handleEffectResult(r, playerId));
      });
    }
  });
}

function modalLivingWaterDiscard(result, playerId) {
  const player = findPlayer(GAME, playerId);
  if (player.hand.length === 0) { endTurnAndClose(); return; }
  pickCardModal({
    title: "Living Water", text: "Choose 1 card from your hand to place on the bottom of the draw pile.",
    cards: player.hand.slice(),
    onPick: card => {
      removeFromHand(player, card.uid);
      GAME.drawPile.push(card);
      log(GAME, `${player.name} placed a card on the bottom of the draw pile.`);
      if (checkWin(GAME, playerId)) { persist(); renderPassScreen(); return; }
      if (result.extraPlay) promptOptionalPlay(playerId, () => endTurnAndClose());
      else endTurnAndClose();
    }
  });
}

function modalLoavesAndFishChoose(result, playerId) {
  const player = findPlayer(GAME, playerId);
  if (result.playable.length === 0) {
    GAME.drawPile.unshift(...shuffle(result.revealed));
    log(GAME, `${player.name}'s Loaves & Fish revealed nothing playable — returned to the draw pile.`);
    if (result.revealed.length) {
      openModal(`<h3>Loaves & Fish</h3><p>Nothing revealed can be played — it goes back on the draw pile.</p>
        <div class="reveal-row" id="reveal-slot"></div><button class="btn" id="lf-ok">Continue</button>`);
      result.revealed.forEach(c => el("#reveal-slot").appendChild(renderCard(c, { size: "small" })));
      el("#lf-ok").addEventListener("click", endTurnAndClose);
    } else endTurnAndClose();
    return;
  }
  pickCardModal({
    title: "Loaves & Fish", text: "Choose a legal card to play immediately.",
    cards: result.revealed, size: "medium",
    legalFn: c => result.playable.some(pc => pc.uid === c.uid),
    onPick: card => {
      GAME.drawPile.unshift(...shuffle(result.revealed.filter(r => r.uid !== card.uid)));
      log(GAME, `${player.name} played a card revealed by Loaves & Fish.`);
      closeModal();
      playExtraCard(playerId, card, r => handleEffectResult(r, playerId));
    }
  });
}

// Mustard Seed: play N additional cards one at a time, each fully
// resolving before the next prompt.
function promptMustardSeedCard(playerId, remaining) {
  if (remaining <= 0 || GAME.status === "finished") { endTurnAndClose(); return; }
  const player = findPlayer(GAME, playerId);
  const anyLegal = player.hand.some(card => canPlayCard(card, GAME, playerId));
  pickCardModal({
    title: "Mustard Seed",
    text: anyLegal ? `Play ${remaining > 1 ? `${remaining} additional cards` : "1 additional card"} from your hand.`
      : "No card in your hand can legally be played right now.",
    cards: player.hand.slice(),
    legalFn: c => canPlayCard(c, GAME, playerId),
    onPick: card => {
      removeFromHand(player, card.uid);
      pushAfter(() => promptMustardSeedCard(playerId, remaining - 1));
      closeModal();
      playExtraCard(playerId, card, r => handleEffectResult(r, playerId));
    },
    skipLabel: anyLegal ? "Stop here" : "Continue",
    onSkip: () => promptMustardSeedCard(playerId, 0)
  });
}

function modalBigFish(result, playerId) {
  pickSuitModal("The Big Fish", "Choose the active suit.", suit => {
    GAME.activeSuit = suit;
    log(GAME, `Active suit set to ${suit} (The Big Fish).`);
    if (result.exchange) doExchangeWithDrawPile(playerId, "The Big Fish");
    else endTurnAndClose();
  });
}

function doExchangeWithDrawPile(playerId, label) {
  const player = findPlayer(GAME, playerId);
  if (player.hand.length === 0) { endTurnAndClose(); return; }
  if (GAME.drawPile.length === 0) reshuffleDiscardIntoDraw(GAME);
  if (GAME.drawPile.length === 0) { endTurnAndClose(); return; }
  pickCardModal({
    title: "Exchange", text: "Choose 1 card from your hand to swap with the top of the draw pile.",
    cards: player.hand.slice(),
    onPick: card => {
      exchangeWithDrawTop(GAME, playerId, card.uid);
      log(GAME, `${player.name} exchanged a card with the draw pile (${label}).`);
      endTurnAndClose();
    }
  });
}

function modalBigStorm(result, playerId) {
  const others = GAME.players.filter(p => p.id !== playerId);
  pickPlayerModal({
    title: result.mode === "single" ? "The Big Storm" : "The Big Storm (Blessing)",
    text: result.mode === "single" ? "Choose another player — they may discard 1 card." : "Choose another player. You and they may each discard 1 card.",
    players: others,
    onPick: target => {
      if (result.mode === "single") promptDiscardOne(target.id, playerId, () => endTurnAndClose());
      else promptDiscardOne(playerId, playerId, () => promptDiscardOne(target.id, playerId, () => endTurnAndClose()));
    }
  });
}

function promptDiscardOne(playerId, byId, onDone) {
  const player = findPlayer(GAME, playerId);
  if (ONLINE && playerId !== viewerPlayer().id) {
    // Online, the target chooses on their own phone; play pauses
    // until they answer (see online.js).
    GAME.prompts = GAME.prompts || [];
    GAME.prompts.push({ type: "storm_discard", targetId: playerId, byId });
    log(GAME, `${player.name} may discard 1 card (The Big Storm).`);
    onDone();
    return;
  }
  if (player.hand.length === 0) { onDone(); return; }
  pickCardModal({
    title: `${player.name}, discard a card?`, text: "The Big Storm — you may discard 1 card.",
    cards: player.hand.slice(),
    onPick: card => {
      removeFromHand(player, card.uid);
      discardUnderTop(GAME, [card]);
      log(GAME, `${player.name} discarded a card (The Big Storm).`);
      if (checkWin(GAME, playerId)) { persist(); renderPassScreen(); return; }
      onDone();
    },
    skipLabel: "Keep my cards", onSkip: onDone
  });
}

function modalEmptyTomb(result, playerId) {
  const player = findPlayer(GAME, playerId);
  const belowTop = GAME.discardPile.slice(0, -1);
  if (belowTop.length === 0) { endTurnAndClose(); return; }
  pickCardModal({
    title: "The Empty Tomb",
    text: result.mode === "take" ? "Choose any 1 card from the discard pile to put into your hand." : "Choose any 1 card from the discard pile to play, regardless of suit.",
    cards: belowTop,
    onPick: card => {
      GAME.discardPile = GAME.discardPile.filter(d => d.uid !== card.uid);
      if (result.mode === "take") {
        player.hand.push(card);
        log(GAME, `${player.name} took a card from the discard pile (The Empty Tomb).`);
        endTurnAndClose();
      } else {
        log(GAME, `${player.name} played a card from the discard pile regardless of suit (The Empty Tomb).`);
        closeModal();
        playExtraCard(playerId, card, r => handleEffectResult(r, playerId));
      }
    }
  });
}

// Give-a-card effects (Good Samaritan, Two Coins, Give Freely).
function promptGiveByEffect(playerId, title, onGiven) {
  const player = findPlayer(GAME, playerId);
  const others = GAME.players.filter(p => p.id !== playerId);
  if (player.hand.length === 0) { onGiven(null); return; }
  pickPlayerModal({
    title, text: "Choose a player to give a card to.", players: others,
    onPick: target => {
      pickCardModal({
        title: `Give a card to ${target.name}`, cards: player.hand.slice(),
        onPick: card => {
          giveCard(GAME, playerId, target.id, card, "effect");
          log(GAME, `${player.name} gave a card to ${target.name} (${title}).`);
          closeModal();
          if (checkWin(GAME, playerId)) { persist(); renderPassScreen(); return; }
          onGiven(target);
        }
      });
    }
  });
}

function modalGoodSamaritan(result, playerId) {
  promptGiveByEffect(playerId, "The Good Samaritan", () => {
    if (result.mode === "normal") endTurnAndClose();
    else promptOptionalPlay(playerId, () => endTurnAndClose());
  });
}

function modalTwoCoins(result, playerId) {
  const player = findPlayer(GAME, playerId);
  promptGiveByEffect(playerId, "Two Coins", () => {
    if (result.mode === "normal") {
      player.blessings += 1;
      log(GAME, `${player.name} gained 1 Blessing (Two Coins).`);
      endTurnAndClose();
    } else {
      pickSuitModal("Two Coins", "Choose the active suit.", suit => {
        GAME.activeSuit = suit;
        log(GAME, `Active suit set to ${suit} (Two Coins).`);
        endTurnAndClose();
      });
    }
  });
}

function promptOptionalPlay(playerId, onDone) {
  const player = findPlayer(GAME, playerId);
  const legal = c => canPlayCard(c, GAME, playerId);
  if (!player.hand.some(legal)) { onDone(); return; }
  pickCardModal({
    title: `${player.name} may play 1 more card`, cards: player.hand.slice(), legalFn: legal,
    onPick: card => {
      removeFromHand(player, card.uid);
      closeModal();
      playExtraCard(playerId, card, r => handleEffectResult(r, playerId));
    },
    skipLabel: "Skip", onSkip: onDone
  });
}

function modalGoodShepherdChoose(result, playerId) {
  const player = findPlayer(GAME, playerId);
  if (result.revealed.length === 0) {
    log(GAME, `${player.name} played The Good Shepherd but there was nothing else in the discard pile.`);
    endTurnAndClose();
    return;
  }
  pickCardModal({
    title: "The Good Shepherd (Blessing)", text: "Choose 1 card to put into your hand.",
    cards: result.revealed,
    onPick: card => {
      GAME.discardPile = GAME.discardPile.filter(d => d.uid !== card.uid);
      player.hand.push(card);
      log(GAME, `${player.name} took a card from the discard pile (The Good Shepherd).`);
      endTurnAndClose();
    }
  });
}

function modalTreeClimber(result, playerId) {
  if (result.revealed.length === 0) { endTurnAndClose(); return; }
  modalReorder("Tree Climber", result.revealed, ordered => {
    GAME.drawPile.unshift(...ordered);
    log(GAME, `${findPlayer(GAME, playerId).name} reordered the top of the draw pile (Tree Climber).`);
    endTurnAndClose();
  });
}

function modalWalkOnWater(result, playerId) {
  const player = findPlayer(GAME, playerId);
  const options = player.hand.filter(c => !result.numberOnly || cardDef(c).type === "number");
  if (!options.length) {
    log(GAME, `${player.name} had no numbered card to play with Walk On Water.`);
    endTurnAndClose();
    return;
  }
  pickCardModal({
    title: "Walk On Water",
    text: result.numberOnly ? "Play any numbered card from your hand, regardless of suit or number." : "Play any 1 card from your hand, regardless of suit or number.",
    cards: options, legalFn: () => true,
    onPick: card => {
      removeFromHand(player, card.uid);
      if (result.pickNext) pushAfter(() => modalPickNextPlayer(playerId));
      closeModal();
      playExtraCard(playerId, card, r => handleEffectResult(r, playerId));
    }
  });
}

function modalPickNextPlayer(playerId) {
  pickPlayerModal({
    title: "Walk On Water (Blessing)", text: "Pick who plays next.",
    players: GAME.players,
    labelFn: p => p.id === playerId ? `${p.name} (yourself)` : p.name,
    onPick: p => {
      GAME.turnOverrideQueue.push(p.id);
      log(GAME, `${findPlayer(GAME, playerId).name} chose ${p.name} to play next (Walk On Water).`);
      endTurnAndClose();
    }
  });
}

// Wisdom: its player chooses — the next player doesn't.
function modalChooseSuit(result, playerId) {
  pickSuitModal("Wisdom", "Choose the active suit.", suit => {
    chooseSuit(GAME, playerId, suit);
    endTurnAndClose();
  });
}

function modalRedeemedChoose(result, playerId) {
  const player = findPlayer(GAME, playerId);
  const belowTop = GAME.discardPile.slice(0, -1);
  if (belowTop.length === 0) { endMiracleTurnAndClose(); return; }
  pickCardModal({
    title: "Redeemed", text: "Return 1 card from the discard pile to your hand.",
    cards: belowTop,
    onPick: card => {
      GAME.discardPile = GAME.discardPile.filter(d => d.uid !== card.uid);
      player.hand.push(card);
      log(GAME, `${player.name} returned a card from the discard pile to hand (Redeemed).`);
      endMiracleTurnAndClose();
    }
  });
}

function modalOverflow(result, playerId) {
  const player = findPlayer(GAME, playerId);
  openModal(`<h3>Overflow</h3><p>Select any number of cards to discard, then draw that many.</p>
    <div class="reveal-row" id="hand-slot"></div>
    <button class="btn" id="confirm-overflow">Confirm (0 selected)</button>`);
  const selected = new Set();
  player.hand.forEach(card => {
    const c = renderCard(card, { size: "small" });
    c.classList.add("selectable");
    c.addEventListener("click", () => {
      if (selected.has(card.uid)) { selected.delete(card.uid); c.classList.remove("chosen"); }
      else { selected.add(card.uid); c.classList.add("chosen"); }
      el("#confirm-overflow").textContent = `Confirm (${selected.size} selected)`;
    });
    el("#hand-slot").appendChild(c);
  });
  el("#confirm-overflow").addEventListener("click", () => {
    const toDiscard = player.hand.filter(c => selected.has(c.uid));
    player.hand = player.hand.filter(c => !selected.has(c.uid));
    discardUnderTop(GAME, toDiscard);
    drawCard(GAME, playerId, toDiscard.length);
    log(GAME, `${player.name} discarded ${toDiscard.length} card(s) and drew ${toDiscard.length} (Overflow).`);
    endMiracleTurnAndClose();
  });
}

// ============================================================
// THE GRACE MARKET
// ============================================================
el("#grace-market-btn").addEventListener("click", () => openGraceMarket());

function openGraceMarket() {
  const me = viewerPlayer();
  const isMyTurn = me.id === currentPlayer(GAME).id;
  const canAct = viewerCanAct() && isMyTurn && !GAME.suitChooserId;
  const t = GAME.turn || {};
  let status;
  if (!isMyTurn) status = "You can buy on your own turn.";
  else if (GAME.suitChooserId) status = "Choose the active suit first.";
  else if ((t.purchases || 0) >= 1 && t.extraPurchaseDiscount == null) status = "You've already bought a Grace card this turn.";
  else if ((t.purchases || 0) === 1) status = `Favor: 1 more purchase for ${t.extraPurchaseDiscount} fewer Blessings.`;
  else status = "1 purchase per turn — before or after your play.";

  openModal(`<h3>Grace Market</h3>
    <p class="market-status">${escapeText(status)} You have <b>${me.blessings}</b> Blessing${me.blessings === 1 ? "" : "s"}.</p>
    <div class="market-row" id="market-slot"></div>
    <div class="market-meta">Grace Deck: ${GAME.graceDeck.length} · Grace discard: ${GAME.graceDiscard.length}</div>
    <h4 class="gifts-heading">Gifts in play</h4>
    <div id="gifts-in-play"></div>
    <button class="btn" id="market-close">Close</button>`);

  GAME.graceMarket.forEach((card, slot) => {
    const col = document.createElement("div");
    col.className = "market-col";
    if (!card) {
      col.innerHTML = `<div class="market-empty">Empty</div>`;
      el("#market-slot").appendChild(col);
      return;
    }
    const def = cardDef(card);
    col.appendChild(renderCard(card, { size: "medium" }));
    const price = gracePrice(GAME, me.id, card);
    const buy = document.createElement("button");
    buy.className = "btn btn-gold market-buy";
    const shownPrice = price === null ? def.cost : price;
    buy.textContent = `Buy for ${shownPrice}`;
    buy.disabled = !canAct || price === null || me.blessings < price;
    buy.addEventListener("click", () => startBuy(slot));
    col.appendChild(buy);
    if (canAct && giftReady(GAME, me.id, "renewal") && (GAME.graceDeck.length || GAME.graceDiscard.length)) {
      const renew = document.createElement("button");
      renew.className = "btn market-renew";
      renew.textContent = "Renewal: replace";
      renew.addEventListener("click", () => {
        if (!viewerCanAct()) return;
        startMoveOnline("renewal");
        renewMarketSlot(GAME, me.id, slot);
        persist();
        renderPassScreen();
      });
      col.appendChild(renew);
    }
    el("#market-slot").appendChild(col);
  });

  const giftsEl = el("#gifts-in-play");
  const holders = GAME.players.filter(p => (p.gifts || []).length);
  if (!holders.length) giftsEl.innerHTML = `<p class="small-note">No one has a Gift of Grace yet.</p>`;
  holders.forEach(p => {
    const row = document.createElement("div");
    row.className = "gift-holder";
    row.innerHTML = `<div class="gift-holder-name">${escapeText(p.name)}${p.id === me.id ? " (you)" : ""}</div>`;
    const cards = document.createElement("div");
    cards.className = "reveal-row";
    p.gifts.forEach(g => cards.appendChild(renderCard(g, { size: "small" })));
    row.appendChild(cards);
    giftsEl.appendChild(row);
  });
  el("#market-close").addEventListener("click", closeModal);
}

function startBuy(slot) {
  const me = viewerPlayer();
  const card = GAME.graceMarket[slot];
  if (!card) return;
  const def = cardDef(card);
  if (def.kind === "gift" && (me.gifts || []).length >= 2) {
    openModal(`<h3>Room for ${escapeText(def.name)}</h3><p>You can have 2 active Gifts. Choose one to discard.</p>
      <div class="reveal-row" id="gift-slot"></div>
      <button class="btn" id="gift-cancel">Cancel</button>`);
    me.gifts.forEach(g => {
      const c = renderCard(g, { size: "medium" });
      c.classList.add("selectable");
      c.addEventListener("click", () => doBuy(slot, g.uid));
      el("#gift-slot").appendChild(c);
    });
    el("#gift-cancel").addEventListener("click", openGraceMarket);
    return;
  }
  doBuy(slot, null);
}

function doBuy(slot, discardGiftUid) {
  if (!viewerCanAct()) return;
  const me = viewerPlayer();
  startMoveOnline("buy");
  const prevPhase = GAME.turnPhase;
  const res = buyGrace(GAME, me.id, slot, discardGiftUid);
  closeModal();
  if (res.error) {
    alert(res.error);
    if (ONLINE) { ONLINE.abortMove(); return; }
    renderPassScreen();
    return;
  }
  if (res.gift) { persist(); renderPassScreen(); return; }
  // An Act resolves now, then you're back where you were in your turn
  // (it doesn't use up your normal play).
  GAME.turnPhase = "play";
  pushAfter(() => returnFromAct(prevPhase));
  handleEffectResult(res.result, me.id);
}

function returnFromAct(prevPhase) {
  closeModal();
  if (GAME.status === "finished") { renderPassScreen(); return; }
  GAME.turnPhase = prevPhase;
  if (prevPhase === "after" && !canBuyAnyGrace(GAME, currentPlayer(GAME).id)) {
    endTurnNow(GAME.pendingEnd || "normal");
    return;
  }
  persist();
  renderPassScreen();
}

// ---- Acts of Grace ------------------------------------------------------
function modalProvision(result, playerId) {
  const player = findPlayer(GAME, playerId);
  pickCardModal({
    title: "Provision", text: "Place 1 card from your hand on the bottom of the draw pile.",
    cards: player.hand.slice(),
    onPick: card => {
      removeFromHand(player, card.uid);
      GAME.drawPile.push(card);
      log(GAME, `${player.name} placed a card on the bottom of the draw pile (Provision).`);
      if (checkWin(GAME, playerId)) { persist(); renderPassScreen(); return; }
      endTurnAndClose();
    }
  });
}

function modalOpenDoor(result, playerId) {
  const player = findPlayer(GAME, playerId);
  const options = player.hand.filter(c => cardDef(c).type === "number");
  if (!options.length) { log(GAME, `${player.name} had no numbered card for Open Door.`); endTurnAndClose(); return; }
  pickCardModal({
    title: "Open Door", text: "Play 1 numbered card, regardless of suit or number.",
    cards: options, legalFn: () => true,
    onPick: card => {
      removeFromHand(player, card.uid);
      closeModal();
      handleEffectResult(playHandCardDirect(GAME, playerId, card, false), playerId);
    }
  });
}

function modalAbundance(result, playerId) {
  pickSuitModal("Abundance", "Choose a suit. You may then play up to 2 numbered cards of that suit.", suit => {
    log(GAME, `${findPlayer(GAME, playerId).name} chose ${suit} for Abundance.`);
    promptAbundance(playerId, suit, 2);
  });
}

function promptAbundance(playerId, suit, remaining) {
  const player = findPlayer(GAME, playerId);
  if (GAME.status === "finished") { renderPassScreen(); return; }
  const options = player.hand.filter(c => cardDef(c).type === "number" && cardDef(c).suit === suit);
  if (remaining <= 0 || !options.length) { endTurnAndClose(); return; }
  pickCardModal({
    title: "Abundance", text: `Play a numbered ${suit} card (${remaining} left).`,
    cards: options, legalFn: () => true,
    onPick: card => {
      removeFromHand(player, card.uid);
      pushAfter(() => promptAbundance(playerId, suit, remaining - 1));
      closeModal();
      handleEffectResult(playHandCardDirect(GAME, playerId, card, false), playerId);
    },
    skipLabel: "Done", onSkip: endTurnAndClose
  });
}

function modalSecondChance(result, playerId) {
  const player = findPlayer(GAME, playerId);
  const belowTop = GAME.discardPile.slice(0, -1);
  if (!player.hand.length || !belowTop.length) { endTurnAndClose(); return; }
  pickCardModal({
    title: "Second Chance", text: "First, choose the card from your hand to give up.",
    cards: player.hand.slice(),
    onPick: mine => {
      pickCardModal({
        title: "Second Chance", text: "Now choose the card from the discard pile to take.",
        cards: belowTop,
        onPick: theirs => {
          GAME.discardPile = GAME.discardPile.filter(d => d.uid !== theirs.uid);
          removeFromHand(player, mine.uid);
          player.hand.push(theirs);
          discardUnderTop(GAME, [mine]);
          log(GAME, `${player.name} exchanged a card with the discard pile (Second Chance).`);
          endTurnAndClose();
        }
      });
    }
  });
}

function modalGuidance(result, playerId) {
  const player = findPlayer(GAME, playerId);
  const revealed = result.revealed;
  if (!revealed.length) { endTurnAndClose(); return; }
  const legal = c => canPlayCardIgnoringTurn(c, GAME);
  const returnRest = (chosen) => {
    modalReorder("Guidance — return the rest", revealed.filter(r => !chosen || r.uid !== chosen.uid), ordered => {
      GAME.drawPile.unshift(...ordered);
      closeModal();
      if (chosen) {
        log(GAME, `${player.name} played a card found with Guidance.`);
        playExtraCard(playerId, chosen, r => handleEffectResult(r, playerId));
      } else {
        log(GAME, `${player.name} looked at the top 3 cards (Guidance).`);
        finishTurn();
      }
    });
  };
  pickCardModal({
    title: "Guidance", text: revealed.some(legal) ? "Play 1 if able. The rest go back in any order." : "None of these can be played right now.",
    cards: revealed, size: "medium", legalFn: legal,
    onPick: card => returnRest(card),
    skipLabel: revealed.some(legal) ? "Don't play" : "Continue", onSkip: () => returnRest(null)
  });
}

function modalNewPerspective(result, playerId) {
  pickSuitModal("New Perspective", "Choose a new active suit.", suit => {
    chooseSuit(GAME, playerId, suit);
    doExchangeWithDrawPile(playerId, "New Perspective");
  });
}

function modalGiveFreely(result, playerId) {
  const player = findPlayer(GAME, playerId);
  promptGiveByEffect(playerId, "Give Freely", () => {
    if (GAME.status === "finished") return;
    player.blessings += 1;
    log(GAME, `${player.name} gained 1 Blessing (Give Freely).`);
    endTurnAndClose();
  });
}

// ---- Results screen ---------------------------------------------
function renderResultsScreen() {
  const winner = findPlayer(GAME, GAME.winnerId);
  el("#winner-name").textContent = winner.name;
  el("#result-turns").textContent = GAME.turnCount;
  el("#result-blessings").textContent = winner.blessings;
  el("#result-miracles").textContent = GAME.gameLog.filter(l => l.includes("(Miracle)")).length;
}

// ---- Game log / quit ---------------------------------------------
el("#toggle-log-btn").addEventListener("click", () => {
  const logEl = el("#game-log");
  const open = logEl.classList.toggle("open");
  if (open) logEl.innerHTML = GAME.gameLog.slice().reverse().map(l => `<div>${escapeText(l)}</div>`).join("");
});

el("#quit-to-home-btn").addEventListener("click", () => {
  if (ONLINE) {
    if (confirm(`Leave this game? You can rejoin room ${ONLINE.roomId} from the home screen.`)) ONLINE.leave(false);
    return;
  }
  if (confirm("Quit to home? Your game will remain saved and you can resume it.")) {
    showScreen("home-screen");
    initHomeScreen();
  }
});

// ---- Init ---------------------------------------------------
window.addEventListener("DOMContentLoaded", () => {
  initHomeScreen();
  initSetupScreen();
});
