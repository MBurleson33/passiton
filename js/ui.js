// ============================================================
// Pass It On — UI Layer
// This is the only file that touches the DOM. All game logic
// lives in engine.js; this file renders state and translates
// clicks into engine calls.
// ============================================================

let GAME = null; // current game state
const SAVE_KEY = "passiton-save-v1";

const el = sel => document.querySelector(sel);
const els = sel => Array.from(document.querySelectorAll(sel));

// ---- Screens ------------------------------------------------
function showScreen(id) {
  els(".screen").forEach(s => s.classList.remove("active"));
  el(`#${id}`).classList.add("active");
}

// ---- Setup screen ---------------------------------------------
function initSetupScreen() {
  const list = el("#player-name-list");
  list.innerHTML = "";
  const count = parseInt(el("#player-count").value, 10);
  for (let i = 0; i < count; i++) {
    const row = document.createElement("div");
    row.className = "player-name-row";
    row.innerHTML = `<label>Player ${i + 1}</label><input type="text" maxlength="16" placeholder="Player ${i + 1}" value="${defaultNames[i] || ""}" />`;
    list.appendChild(row);
  }
}

const defaultNames = ["Matt", "Jessica", "Lauren", "Naomi", "Player 5", "Player 6"];

el("#player-count").addEventListener("change", initSetupScreen);

el("#start-game-btn").addEventListener("click", () => {
  const inputs = els("#player-name-list input");
  const names = inputs.map((inp, i) => inp.value.trim() || `Player ${i + 1}`);
  GAME = createGameState(names);
  persist();
  showScreen("pass-screen");
  renderPassScreen();
});

el("#resume-game-btn").addEventListener("click", () => {
  const saved = loadSave();
  if (saved) {
    GAME = saved;
    showScreen("pass-screen");
    renderPassScreen();
  }
});

// ---- Persistence (PWA requirement, Section 18) -------------------
function persist() {
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
  localStorage.removeItem(SAVE_KEY);
}

// ---- Home screen ------------------------------------------------
function initHomeScreen() {
  const saved = loadSave();
  el("#resume-game-btn").style.display = saved && saved.status === "playing" ? "block" : "none";
}

el("#new-game-btn").addEventListener("click", () => {
  showScreen("setup-screen");
  initSetupScreen();
});

el("#home-btn-results").addEventListener("click", () => {
  clearSave();
  showScreen("home-screen");
  initHomeScreen();
});

el("#play-again-btn").addEventListener("click", () => {
  showScreen("setup-screen");
  initSetupScreen();
});

// ---- Pass-and-play privacy screen (Section 17) -----------------
function renderPassScreen() {
  if (GAME.status === "finished") {
    renderResultsScreen();
    showScreen("results-screen");
    return;
  }
  const p = currentPlayer(GAME);
  el("#pass-to-name").textContent = p.name;
  el("#pass-blessing-count").textContent = p.blessings;
  showScreen("pass-screen");
}

el("#view-hand-btn").addEventListener("click", () => {
  showScreen("game-screen");
  renderGameScreen();
});

// ---- Main game screen ------------------------------------------
function renderGameScreen() {
  const p = currentPlayer(GAME);
  el("#current-player-name").textContent = p.name;
  el("#turn-count").textContent = GAME.turnCount;
  el("#draw-pile-count").textContent = GAME.drawPile.length;

  el("#active-suit-badge").textContent = GAME.activeSuit || "—";
  el("#active-suit-badge").style.background = GAME.activeSuit ? SUIT_COLORS[GAME.activeSuit] : "#555";
  el("#active-number-badge").textContent = GAME.activeNumber !== null && GAME.activeNumber !== undefined ? GAME.activeNumber : "—";
  el("#action-lock-badge").style.display = GAME.actionLock.active ? "inline-block" : "none";
  if (GAME.actionLock.active) {
    const owner = findPlayer(GAME, GAME.actionLock.ownerPlayerId);
    el("#action-lock-badge").textContent = `🕊 Peace: no Action cards until ${owner.name}'s next turn`;
  }

  // Discard pile top card
  const top = GAME.discardPile[GAME.discardPile.length - 1];
  el("#discard-pile").innerHTML = "";
  el("#discard-pile").appendChild(renderCard(top, { size: "large" }));

  // Other players' hand counts
  const opponents = el("#opponents-row");
  opponents.innerHTML = "";
  GAME.players.forEach((op, i) => {
    if (op.id === p.id) return;
    const badge = document.createElement("div");
    badge.className = "opponent-badge" + (i === GAME.currentPlayerIndex ? " current" : "");
    badge.innerHTML = `<div class="opp-name">${op.name}</div>
      <div class="opp-hand">${"🂠".repeat(Math.min(op.hand.length, 8))}${op.hand.length > 8 ? "+" : ""} <span>${op.hand.length}</span></div>
      <div class="opp-blessings">✨ ${op.blessings}</div>`;
    opponents.appendChild(badge);
  });

  // Current player's hand
  el("#my-blessings").textContent = p.blessings;
  const handEl = el("#player-hand");
  handEl.innerHTML = "";
  p.hand.forEach(card => {
    const legal = canPlayCard(card, GAME, p.id);
    const cardEl = renderCard(card, { size: "medium", legal });
    cardEl.addEventListener("click", () => onCardClick(card));
    handEl.appendChild(cardEl);
  });

  const anyLegal = hasAnyLegalCard(GAME, p.id);
  el("#draw-btn").style.display = anyLegal ? "none" : "inline-block";
  el("#hint-text").textContent = anyLegal
    ? "Tap a highlighted card to play it."
    : "No legal plays — draw a card.";
}

// Builds an <img> for card art. Unlike a CSS background-image, an
// <img> fires a real "error" event on a 404 or bad path, so we can
// fall back to a readable label instead of silently showing a
// blank black card (see onError callback in renderCard).
function artImg(src, alt, onError) {
  const img = document.createElement("img");
  img.className = "card-art-img";
  img.src = src;
  img.alt = alt;
  img.draggable = false;
  img.addEventListener("error", () => {
    img.remove();
    if (onError) onError();
  });
  return img;
}

function renderCard(card, opts = {}) {
  const def = cardDef(card);
  const wrap = document.createElement("div");
  wrap.className = `card card-${opts.size || "medium"} suit-${(def.suit || "none").toLowerCase()}`;
  if (opts.legal) wrap.classList.add("legal");
  if (opts.faceDown) {
    wrap.classList.add("face-down", "has-art");
    wrap.appendChild(artImg("cards/card-back.jpg", "", () => {
      wrap.classList.remove("has-art");
    }));
    return wrap;
  }
  if (def.artwork) {
    wrap.classList.add("has-art");
    const fallback = document.createElement("div");
    fallback.className = "art-fallback-label";
    fallback.style.color = def.suit ? SUIT_COLORS[def.suit] : "#c99a3c";
    fallback.innerHTML = `<div class="fallback-suit">${def.suit || def.type}</div><div class="fallback-name">${def.name}</div>`;
    fallback.style.display = "none";
    wrap.appendChild(artImg(def.artwork, def.name, () => {
      wrap.classList.remove("has-art");
      fallback.style.display = "flex";
    }));
    wrap.appendChild(fallback);
  } else {
    // Number card rendered from data
    wrap.style.borderColor = SUIT_COLORS[def.suit];
    wrap.innerHTML = `<div class="num-suit" style="color:${SUIT_COLORS[def.suit]}">${def.suit}</div>
      <div class="num-value" style="color:${SUIT_COLORS[def.suit]}">${def.number}</div>`;
  }
  wrap.title = def.type === "action" ? `${def.name} — ${def.playText}` : def.name;
  return wrap;
}

function onCardClick(card) {
  const def = cardDef(card);
  const p = currentPlayer(GAME);
  if (!canPlayCard(card, GAME, p.id)) return;

  if (def.type === "number") {
    const result = playNumberCard(GAME, p.id, card.uid);
    persist();
    afterPlay(result);
    return;
  }

  if (def.type === "action") {
    if (p.blessings >= def.blessingCost && def.blessingCost > 0) {
      showActionChoiceModal(def, card);
    } else {
      const result = playActionCard(GAME, p.id, card.uid, false);
      persist();
      handleEffectResult(result, p.id);
    }
    return;
  }

  if (def.type === "miracle") {
    const result = playMiracleCard(GAME, p.id, card.uid);
    persist();
    handleEffectResult(result, p.id);
  }
}

function showActionChoiceModal(def, card) {
  openModal(`
    <h3>${def.name}</h3>
    <p class="verse">${def.verse}</p>
    <div class="choice-row">
      <button class="btn" id="choice-play">Play<br><small>${def.playText}</small></button>
      <button class="btn btn-gold" id="choice-blessing">Spend ${def.blessingCost} Blessing${def.blessingCost > 1 ? "s" : ""}<br><small>${def.blessingText}</small></button>
    </div>
  `);
  el("#choice-play").addEventListener("click", () => {
    closeModal();
    const result = playActionCard(GAME, currentPlayer(GAME).id, card.uid, false);
    persist();
    handleEffectResult(result, currentPlayer(GAME).id);
  });
  el("#choice-blessing").addEventListener("click", () => {
    closeModal();
    const playerId = currentPlayer(GAME).id;
    const result = playActionCard(GAME, playerId, card.uid, true);
    persist();
    handleEffectResult(result, playerId);
  });
}

el("#draw-btn").addEventListener("click", () => {
  const p = currentPlayer(GAME);
  const drawn = drawCard(GAME, p.id, 1);
  persist();
  if (drawn.length && canPlayCard(drawn[0], GAME, p.id)) {
    openModal(`
      <h3>You drew a legal card</h3>
      <div class="reveal-row" id="drawn-card-slot"></div>
      <div class="choice-row">
        <button class="btn" id="play-drawn">Play it</button>
        <button class="btn" id="keep-drawn">Keep it — end turn</button>
      </div>
    `);
    el("#drawn-card-slot").appendChild(renderCard(drawn[0], { size: "medium" }));
    el("#play-drawn").addEventListener("click", () => {
      closeModal();
      onCardClick(drawn[0]);
    });
    el("#keep-drawn").addEventListener("click", () => {
      closeModal();
      advanceTurn(GAME);
      persist();
      renderPassScreen();
    });
  } else {
    log(GAME, `${p.name} drew a card.`);
    persist();
    advanceTurn(GAME);
    persist();
    renderPassScreen();
  }
});

function afterPlay(result) {
  if (result.won) {
    persist();
    renderPassScreen();
    return;
  }
  renderPassScreen();
}

// ---- Effect result / needsInput dispatcher -----------------------
function handleEffectResult(result, playerId) {
  if (!result) { renderPassScreen(); return; }
  if (result.won) { persist(); renderPassScreen(); return; }
  if (result.error) { alert(result.error); renderGameScreen(); return; }
  if (!result.needsInput) {
    if (result.endTurn === false) {
      // Miracle resolved without consuming the turn
      persist();
      renderGameScreen();
      return;
    }
    persist();
    renderPassScreen();
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
    mustard_seed_extra: modalMustardSeedExtra,
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
    overflow_discard: modalOverflow
  };
  const fn = handlers[result.needsInput];
  if (fn) fn(result, playerId);
  else { persist(); renderPassScreen(); }
}

// ---- Modal shell --------------------------------------------------
function openModal(html) {
  el("#modal-body").innerHTML = html;
  el("#modal-overlay").classList.add("active");
}
function closeModal() {
  el("#modal-overlay").classList.remove("active");
  el("#modal-body").innerHTML = "";
}

function endTurnAndClose() {
  closeModal();
  advanceTurn(GAME);
  persist();
  renderPassScreen();
}

// ---- Individual effect modals --------------------------------------

function modalFiveStonesKeep(result, playerId) {
  const player = findPlayer(GAME, playerId);
  openModal(`<h3>Five Stones</h3><p>Choose 1 card to keep. The rest return to the draw pile.</p>
    <div class="reveal-row" id="reveal-slot"></div>`);
  const slot = el("#reveal-slot");
  result.revealed.forEach(card => {
    const c = renderCard(card, { size: "medium" });
    c.classList.add("selectable");
    c.addEventListener("click", () => {
      player.hand.push(card);
      const rest = result.revealed.filter(r => r.uid !== card.uid);
      GAME.drawPile.unshift(...shuffle(rest));
      log(GAME, `${player.name} kept a card from Five Stones.`);
      endTurnAndClose();
    });
    slot.appendChild(c);
  });
}

function modalFiveStonesPlay(result, playerId) {
  const player = findPlayer(GAME, playerId);
  if (result.playable.length === 0) {
    openModal(`<h3>Five Stones (Blessing)</h3><p>None of the 5 revealed cards can be played. Add one to your hand, or return all five?</p>
      <div class="reveal-row" id="reveal-slot"></div>
      <div class="choice-row">
        <button class="btn" id="ft-keep-one">Keep 1 in hand</button>
        <button class="btn" id="ft-return-all">Return all 5</button>
      </div>`);
    const slot = el("#reveal-slot");
    result.revealed.forEach(c => slot.appendChild(renderCard(c, { size: "small" })));
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
  openModal(`<h3>Five Stones (Blessing)</h3><p>Choose 1 legal card to play immediately.</p>
    <div class="reveal-row" id="reveal-slot"></div>`);
  const slot = el("#reveal-slot");
  result.revealed.forEach(card => {
    const legal = result.playable.some(pc => pc.uid === card.uid);
    const c = renderCard(card, { size: "medium", legal });
    if (legal) {
      c.classList.add("selectable");
      c.addEventListener("click", () => {
        const rest = result.revealed.filter(r => r.uid !== card.uid);
        GAME.drawPile.unshift(...shuffle(rest));
        playCardDirectly(GAME, playerId, card);
        log(GAME, `${player.name} played a card revealed by Five Stones.`);
        if (checkWin(GAME, playerId)) { persist(); closeModal(); renderPassScreen(); return; }
        endTurnAndClose();
      });
    }
    slot.appendChild(c);
  });
}

function modalLivingWaterDiscard(result, playerId) {
  const player = findPlayer(GAME, playerId);
  openModal(`<h3>Living Water</h3><p>Choose 1 card from your hand to place on the bottom of the draw pile.</p>
    <div class="reveal-row" id="hand-slot"></div>`);
  const slot = el("#hand-slot");
  player.hand.forEach(card => {
    const c = renderCard(card, { size: "small" });
    c.classList.add("selectable");
    c.addEventListener("click", () => {
      player.hand = player.hand.filter(h => h.uid !== card.uid);
      GAME.drawPile.push(card);
      log(GAME, `${player.name} placed a card on the bottom of the draw pile.`);
      if (result.extraPlay) {
        closeModal();
        renderGameScreen();
        alert("Play 1 additional card from your hand now.");
      } else {
        endTurnAndClose();
      }
    });
    slot.appendChild(c);
  });
}

function modalLoavesAndFishChoose(result, playerId) {
  const player = findPlayer(GAME, playerId);
  if (result.playable.length === 0) {
    GAME.drawPile.unshift(...shuffle(result.revealed));
    log(GAME, `${player.name}'s Loaves & Fish revealed nothing playable — returned to draw pile.`);
    endTurnAndClose();
    return;
  }
  openModal(`<h3>Loaves & Fish</h3><p>Choose a legal card to play immediately.</p>
    <div class="reveal-row" id="reveal-slot"></div>`);
  const slot = el("#reveal-slot");
  result.revealed.forEach(card => {
    const legal = result.playable.some(pc => pc.uid === card.uid);
    const c = renderCard(card, { size: "medium", legal });
    if (legal) {
      c.classList.add("selectable");
      c.addEventListener("click", () => {
        const rest = result.revealed.filter(r => r.uid !== card.uid);
        GAME.drawPile.unshift(...shuffle(rest));
        playCardDirectly(GAME, playerId, card);
        log(GAME, `${player.name} played a card revealed by Loaves & Fish.`);
        if (checkWin(GAME, playerId)) { persist(); closeModal(); renderPassScreen(); return; }
        endTurnAndClose();
      });
    }
    slot.appendChild(c);
  });
}

function modalMustardSeedExtra(result, playerId) {
  const player = findPlayer(GAME, playerId);
  const firstSuit = GAME.activeSuit;
  openModal(`<h3>Mustard Seed</h3><p>Play 1 additional card from your hand.</p>
    <div class="reveal-row" id="hand-slot"></div>`);
  const slot = el("#hand-slot");
  player.hand.forEach(card => {
    const legal = canPlayCard(card, GAME, playerId);
    const c = renderCard(card, { size: "small", legal });
    if (legal) {
      c.classList.add("selectable");
      c.addEventListener("click", () => {
        const def = cardDef(card);
        player.hand = player.hand.filter(h => h.uid !== card.uid);
        playCardDirectly(GAME, playerId, card);
        if (result.rewardSameSuit && def.suit === firstSuit) {
          player.blessings += 1;
          log(GAME, `${player.name} gained 1 Blessing (same suit bonus).`);
        }
        if (checkWin(GAME, playerId)) { persist(); closeModal(); renderPassScreen(); return; }
        endTurnAndClose();
      });
    }
    slot.appendChild(c);
  });
}

function modalBigFish(result, playerId) {
  openModal(`<h3>The Big Fish</h3><p>Choose the active suit.</p><div class="suit-row" id="suit-slot"></div>`);
  const slot = el("#suit-slot");
  SUITS.forEach(suit => {
    const btn = document.createElement("button");
    btn.className = "suit-btn";
    btn.style.background = SUIT_COLORS[suit];
    btn.textContent = suit;
    btn.addEventListener("click", () => {
      GAME.activeSuit = suit;
      log(GAME, `Active suit set to ${suit} (The Big Fish).`);
      if (result.exchange) {
        doExchangeWithDrawPile(playerId);
      } else {
        endTurnAndClose();
      }
    });
    slot.appendChild(btn);
  });
}

function doExchangeWithDrawPile(playerId) {
  const player = findPlayer(GAME, playerId);
  if (GAME.drawPile.length === 0) { endTurnAndClose(); return; }
  openModal(`<h3>Exchange</h3><p>Choose 1 card from your hand to swap with the top of the draw pile.</p>
    <div class="reveal-row" id="hand-slot"></div>`);
  const slot = el("#hand-slot");
  player.hand.forEach(card => {
    const c = renderCard(card, { size: "small" });
    c.classList.add("selectable");
    c.addEventListener("click", () => {
      const top = GAME.drawPile.shift();
      player.hand = player.hand.filter(h => h.uid !== card.uid);
      player.hand.push(top);
      GAME.drawPile.unshift(card);
      log(GAME, `${player.name} exchanged a card with the draw pile.`);
      endTurnAndClose();
    });
    slot.appendChild(c);
  });
}

function modalBigStorm(result, playerId) {
  const player = findPlayer(GAME, playerId);
  if (result.mode === "single") {
    openModal(`<h3>The Big Storm</h3><p>Choose yourself or another player — they may discard 1 card.</p>
      <div class="choice-row" id="target-slot"></div>`);
    const slot = el("#target-slot");
    GAME.players.forEach(p => {
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.textContent = p.name;
      btn.addEventListener("click", () => promptDiscardOne(p.id, () => endTurnAndClose()));
      slot.appendChild(btn);
    });
  } else {
    // double: self + one other, both discard, then choose suit
    const others = GAME.players.filter(p => p.id !== playerId);
    openModal(`<h3>The Big Storm (Blessing)</h3><p>Choose another player. You and they each discard 1 card.</p>
      <div class="choice-row" id="target-slot"></div>`);
    const slot = el("#target-slot");
    others.forEach(p => {
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.textContent = p.name;
      btn.addEventListener("click", () => {
        promptDiscardOne(playerId, () => {
          promptDiscardOne(p.id, () => {
            modalChooseSuitInline(() => endTurnAndClose());
          });
        });
      });
      slot.appendChild(btn);
    });
  }
}

function promptDiscardOne(playerId, onDone) {
  const player = findPlayer(GAME, playerId);
  if (player.hand.length === 0) { onDone(); return; }
  openModal(`<h3>${player.name}, discard a card</h3><div class="reveal-row" id="hand-slot"></div>
    <button class="btn" id="skip-discard">Skip</button>`);
  const slot = el("#hand-slot");
  player.hand.forEach(card => {
    const c = renderCard(card, { size: "small" });
    c.classList.add("selectable");
    c.addEventListener("click", () => {
      player.hand = player.hand.filter(h => h.uid !== card.uid);
      GAME.discardPile.push(card);
      log(GAME, `${player.name} discarded a card (The Big Storm).`);
      onDone();
    });
    slot.appendChild(c);
  });
  el("#skip-discard").addEventListener("click", onDone);
}

function modalChooseSuitInline(onDone) {
  openModal(`<h3>Choose the active suit</h3><div class="suit-row" id="suit-slot"></div>`);
  const slot = el("#suit-slot");
  SUITS.forEach(suit => {
    const btn = document.createElement("button");
    btn.className = "suit-btn";
    btn.style.background = SUIT_COLORS[suit];
    btn.textContent = suit;
    btn.addEventListener("click", () => {
      GAME.activeSuit = suit;
      log(GAME, `Active suit set to ${suit}.`);
      onDone();
    });
    slot.appendChild(btn);
  });
}

function modalEmptyTomb(result, playerId) {
  const player = findPlayer(GAME, playerId);
  const belowTop = GAME.discardPile.slice(0, -1);
  if (belowTop.length === 0) { endTurnAndClose(); return; }
  openModal(`<h3>The Empty Tomb</h3><p>Choose any 1 card from the discard pile.</p>
    <div class="reveal-row" id="reveal-slot"></div>`);
  const slot = el("#reveal-slot");
  belowTop.forEach(card => {
    const c = renderCard(card, { size: "small" });
    c.classList.add("selectable");
    c.addEventListener("click", () => {
      GAME.discardPile = GAME.discardPile.filter(d => d.uid !== card.uid);
      if (result.mode === "take") {
        player.hand.push(card);
        log(GAME, `${player.name} took a card from the discard pile (The Empty Tomb).`);
        if (checkWin(GAME, playerId)) { persist(); closeModal(); renderPassScreen(); return; }
        endTurnAndClose();
      } else {
        playCardDirectly(GAME, playerId, card);
        log(GAME, `${player.name} played a card from the discard pile regardless of suit (The Empty Tomb).`);
        if (checkWin(GAME, playerId)) { persist(); closeModal(); renderPassScreen(); return; }
        endTurnAndClose();
      }
    });
    slot.appendChild(c);
  });
}

function modalGoodSamaritan(result, playerId) {
  const player = findPlayer(GAME, playerId);
  const others = GAME.players.filter(p => p.id !== playerId);
  openModal(`<h3>The Good Samaritan</h3><p>Choose a player to give a card to.</p>
    <div class="choice-row" id="target-slot"></div>`);
  const tslot = el("#target-slot");
  others.forEach(op => {
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = op.name;
    btn.addEventListener("click", () => {
      openModal(`<h3>Give a card to ${op.name}</h3><div class="reveal-row" id="hand-slot"></div>`);
      const hslot = el("#hand-slot");
      player.hand.forEach(card => {
        const c = renderCard(card, { size: "small" });
        c.classList.add("selectable");
        c.addEventListener("click", () => {
          player.hand = player.hand.filter(h => h.uid !== card.uid);
          op.hand.push(card);
          log(GAME, `${player.name} gave a card to ${op.name} (The Good Samaritan).`);
          if (result.mode === "normal") {
            closeModal();
            renderGameScreen();
            alert(`${player.name}, play 1 additional card from your hand.`);
          } else {
            promptOptionalPlay(playerId, () => promptOptionalPlay(op.id, () => endTurnAndClose()));
          }
        });
        hslot.appendChild(c);
      });
    });
    tslot.appendChild(btn);
  });
}

function promptOptionalPlay(playerId, onDone) {
  const player = findPlayer(GAME, playerId);
  const legalCards = player.hand.filter(c => canPlayCard(c, GAME, playerId) || canPlayCardIgnoringTurn(c, GAME));
  if (legalCards.length === 0) { onDone(); return; }
  openModal(`<h3>${player.name} may play 1 card</h3><div class="reveal-row" id="hand-slot"></div>
    <button class="btn" id="skip-play">Skip</button>`);
  const slot = el("#hand-slot");
  legalCards.forEach(card => {
    const c = renderCard(card, { size: "small", legal: true });
    c.classList.add("selectable");
    c.addEventListener("click", () => {
      player.hand = player.hand.filter(h => h.uid !== card.uid);
      playCardDirectly(GAME, playerId, card);
      if (checkWin(GAME, playerId)) { persist(); closeModal(); renderPassScreen(); return; }
      onDone();
    });
    slot.appendChild(c);
  });
  el("#skip-play").addEventListener("click", onDone);
}

function modalGoodShepherdChoose(result, playerId) {
  const player = findPlayer(GAME, playerId);
  openModal(`<h3>The Good Shepherd (Blessing)</h3><p>Choose 1 card to put into your hand.</p>
    <div class="reveal-row" id="reveal-slot"></div>`);
  const slot = el("#reveal-slot");
  result.revealed.forEach(card => {
    const c = renderCard(card, { size: "small" });
    c.classList.add("selectable");
    c.addEventListener("click", () => {
      GAME.discardPile = GAME.discardPile.filter(d => d.uid !== card.uid);
      player.hand.push(card);
      log(GAME, `${player.name} took a card from the discard pile (The Good Shepherd).`);
      if (checkWin(GAME, playerId)) { persist(); closeModal(); renderPassScreen(); return; }
      endTurnAndClose();
    });
    slot.appendChild(c);
  });
}

function modalTreeClimber(result, playerId) {
  openModal(`<h3>Tree Climber</h3><p>Choose the order to return these cards to the draw pile (tap in the order you want them placed on top).</p>
    <div class="reveal-row" id="reveal-slot"></div>
    <div class="reveal-row" id="chosen-slot"><em>Order chosen:</em></div>
    <button class="btn" id="confirm-order" style="display:none">Confirm order</button>`);
  const revealSlot = el("#reveal-slot");
  const chosenSlot = el("#chosen-slot");
  const chosen = [];
  result.revealed.forEach(card => {
    const c = renderCard(card, { size: "small" });
    c.classList.add("selectable");
    c.addEventListener("click", () => {
      if (chosen.includes(card)) return;
      chosen.push(card);
      c.classList.add("chosen");
      chosenSlot.appendChild(renderCard(card, { size: "small" }));
      if (chosen.length === result.revealed.length) {
        el("#confirm-order").style.display = "inline-block";
      }
    });
    revealSlot.appendChild(c);
  });
  el("#confirm-order").addEventListener("click", () => {
    GAME.drawPile.unshift(...chosen);
    log(GAME, `${findPlayer(GAME, playerId).name} reordered cards on top of the draw pile (Tree Climber).`);
    endTurnAndClose();
  });
}

function modalTwoCoins(result, playerId) {
  const player = findPlayer(GAME, playerId);
  const others = GAME.players.filter(p => p.id !== playerId);
  openModal(`<h3>Two Coins</h3><p>Choose a player to give a card to.</p>
    <div class="choice-row" id="target-slot"></div>`);
  const tslot = el("#target-slot");
  others.forEach(op => {
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = op.name;
    btn.addEventListener("click", () => {
      openModal(`<h3>Give a card to ${op.name}</h3><div class="reveal-row" id="hand-slot"></div>`);
      const hslot = el("#hand-slot");
      player.hand.forEach(card => {
        const c = renderCard(card, { size: "small" });
        c.classList.add("selectable");
        c.addEventListener("click", () => {
          player.hand = player.hand.filter(h => h.uid !== card.uid);
          op.hand.push(card);
          log(GAME, `${player.name} gave a card to ${op.name} (Two Coins).`);
          if (checkWin(GAME, op.id)) { persist(); closeModal(); renderPassScreen(); return; }
          if (result.mode === "normal") {
            player.blessings += 1;
            log(GAME, `${player.name} gained 1 Blessing.`);
            endTurnAndClose();
          } else {
            modalChooseSuitInline(() => endTurnAndClose());
          }
        });
        hslot.appendChild(c);
      });
    });
    tslot.appendChild(btn);
  });
}

function modalWalkOnWater(result, playerId) {
  const player = findPlayer(GAME, playerId);
  openModal(`<h3>Walk On Water</h3><p>Play any 1 card from your hand, regardless of suit or number.</p>
    <div class="reveal-row" id="hand-slot"></div>`);
  const slot = el("#hand-slot");
  player.hand.forEach(card => {
    const c = renderCard(card, { size: "small", legal: true });
    c.classList.add("selectable");
    c.addEventListener("click", () => {
      player.hand = player.hand.filter(h => h.uid !== card.uid);
      playCardDirectly(GAME, playerId, card);
      if (result.rewardBlessing) {
        player.blessings += 1;
        log(GAME, `${player.name} gained 1 Blessing (Walk On Water).`);
      }
      if (checkWin(GAME, playerId)) { persist(); closeModal(); renderPassScreen(); return; }
      endTurnAndClose();
    });
    slot.appendChild(c);
  });
}

function modalChooseSuit(result, playerId) {
  openModal(`<h3>Wisdom</h3><p>Choose the active suit.</p><div class="suit-row" id="suit-slot"></div>`);
  const slot = el("#suit-slot");
  SUITS.forEach(suit => {
    const btn = document.createElement("button");
    btn.className = "suit-btn";
    btn.style.background = SUIT_COLORS[suit];
    btn.textContent = suit;
    btn.addEventListener("click", () => {
      GAME.activeSuit = suit;
      GAME.activeNumber = null;
      log(GAME, `Active suit set to ${suit} (Wisdom).`);
      closeModal();
      persist();
      renderGameScreen(); // Miracles don't consume the turn
    });
    slot.appendChild(btn);
  });
}

function modalRedeemedChoose(result, playerId) {
  const player = findPlayer(GAME, playerId);
  const belowTop = GAME.discardPile.slice(0, -1);
  if (belowTop.length === 0) {
    closeModal();
    persist();
    renderGameScreen();
    return;
  }
  openModal(`<h3>Redeemed</h3><p>Return 1 card from the discard pile to your hand.</p>
    <div class="reveal-row" id="reveal-slot"></div>`);
  const slot = el("#reveal-slot");
  belowTop.forEach(card => {
    const c = renderCard(card, { size: "small" });
    c.classList.add("selectable");
    c.addEventListener("click", () => {
      GAME.discardPile = GAME.discardPile.filter(d => d.uid !== card.uid);
      player.hand.push(card);
      log(GAME, `${player.name} returned a card from the discard pile to hand (Redeemed).`);
      closeModal();
      persist();
      renderGameScreen();
    });
    slot.appendChild(c);
  });
}

function modalOverflow(result, playerId) {
  const player = findPlayer(GAME, playerId);
  openModal(`<h3>Overflow</h3><p>Select any number of cards to discard, then draw that many.</p>
    <div class="reveal-row" id="hand-slot"></div>
    <button class="btn" id="confirm-overflow">Confirm (0+ selected)</button>`);
  const slot = el("#hand-slot");
  const selected = new Set();
  player.hand.forEach(card => {
    const c = renderCard(card, { size: "small" });
    c.classList.add("selectable");
    c.addEventListener("click", () => {
      if (selected.has(card.uid)) { selected.delete(card.uid); c.classList.remove("chosen"); }
      else { selected.add(card.uid); c.classList.add("chosen"); }
      el("#confirm-overflow").textContent = `Confirm (${selected.size} selected)`;
    });
    slot.appendChild(c);
  });
  el("#confirm-overflow").addEventListener("click", () => {
    const toDiscard = player.hand.filter(c => selected.has(c.uid));
    player.hand = player.hand.filter(c => !selected.has(c.uid));
    GAME.discardPile.push(...toDiscard);
    drawCard(GAME, playerId, toDiscard.length);
    log(GAME, `${player.name} discarded ${toDiscard.length} card(s) and drew ${toDiscard.length} (Overflow).`);
    endTurnAndClose();
  });
}

// ---- Results screen (Section 6) ---------------------------------
function renderResultsScreen() {
  const winner = findPlayer(GAME, GAME.winnerId);
  el("#winner-name").textContent = winner.name;
  el("#result-turns").textContent = GAME.turnCount;
  el("#result-blessings").textContent = winner.blessings;
  const miraclesPlayed = GAME.gameLog.filter(l => l.includes("(Miracle)")).length;
  el("#result-miracles").textContent = miraclesPlayed;
}

// ---- Game log toggle -----------------------------------------
el("#toggle-log-btn").addEventListener("click", () => {
  const logEl = el("#game-log");
  const open = logEl.classList.toggle("open");
  if (open) {
    logEl.innerHTML = GAME.gameLog.slice().reverse().map(l => `<div>${l}</div>`).join("");
  }
});

el("#quit-to-home-btn").addEventListener("click", () => {
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
