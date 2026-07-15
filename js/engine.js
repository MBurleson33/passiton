// ============================================================
// Pass It On — Game Engine
// Pure game logic. No DOM access here — ui.js is the only file
// that touches the page. That split keeps this testable and
// keeps card behavior in one place (Section 15/16 of the brief).
// ============================================================

let cardInstanceCounter = 0;
function makeInstance(defId) {
  cardInstanceCounter += 1;
  return { uid: `c${cardInstanceCounter}`, defId };
}

function cardDef(instance) {
  return CARD_LIBRARY[instance.defId];
}

// ---- Deck building (Section 3) --------------------------------
function createFullDeck() {
  const deck = [];
  for (const def of [...NUMBER_CARDS, ...ACTION_CARDS, ...MIRACLE_CARDS]) {
    for (let i = 0; i < def.copies; i++) {
      deck.push(makeInstance(def.id));
    }
  }
  return deck;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---- Game state (Section 14) -----------------------------------
function createGameState(playerNames) {
  const players = playerNames.map((name, i) => ({
    id: `player-${i + 1}`,
    name,
    hand: [],
    blessings: 0,
    connected: true
  }));

  const state = {
    gameId: `local-${Date.now()}`,
    status: "playing",
    players,
    drawPile: [],
    discardPile: [],
    currentPlayerIndex: 0,
    direction: 1,
    activeSuit: null,
    activeNumber: null,
    actionLock: { active: false, ownerPlayerId: null },
    pendingEffect: null,
    winnerId: null,
    turnCount: 1,
    gameLog: [],
    strengthQueue: [] // player ids queued to go next via the Strength miracle
  };

  // Section 4: Initial Setup
  let deck = shuffle(createFullDeck());
  for (const p of players) {
    p.hand = deck.splice(0, 7);
  }

  // Reveal until a Number card is found; skipped cards are returned & reshuffled
  let skipped = [];
  let starter = null;
  while (deck.length) {
    const candidate = deck.shift();
    if (cardDef(candidate).type === "number") {
      starter = candidate;
      break;
    }
    skipped.push(candidate);
  }
  if (skipped.length) {
    deck = shuffle([...deck, ...skipped]);
  }
  state.discardPile = [starter];
  state.drawPile = deck;
  state.activeSuit = cardDef(starter).suit;
  state.activeNumber = cardDef(starter).number;
  state.currentPlayerIndex = Math.floor(Math.random() * players.length);

  log(state, `Game started. ${players[state.currentPlayerIndex].name} goes first. Opening card: ${cardDef(starter).name}.`);
  return state;
}

function log(state, msg) {
  state.gameLog.push(msg);
  if (state.gameLog.length > 200) state.gameLog.shift();
}

function currentPlayer(state) {
  return state.players[state.currentPlayerIndex];
}

function findPlayer(state, id) {
  return state.players.find(p => p.id === id);
}

// ---- Legal-play function (Section 16) ---------------------------
// Single source of truth for whether a card can be played right now.
// Every UI affordance must route through this — never duplicate the
// logic elsewhere.
function canPlayCard(card, state, playerId) {
  const def = cardDef(card);

  if (def.type === "miracle") {
    return checkMiracleTiming(def, state, playerId);
  }

  if (state.actionLock.active && def.type === "action") {
    return false;
  }

  if (playerId !== currentPlayer(state).id) {
    // Only miracles may be played out of turn.
    return false;
  }

  if (def.suit === state.activeSuit) {
    return true;
  }

  if (def.type === "number" && def.number === state.activeNumber) {
    return true;
  }

  return false;
}

function checkMiracleTiming(def, state, playerId) {
  if (def.timing === "any_time") return true;
  if (def.timing === "on_your_turn") return playerId === currentPlayer(state).id;
  if (def.timing === "reaction") return false; // no reaction miracles defined yet
  return false;
}

function hasAnyLegalCard(state, playerId) {
  const player = findPlayer(state, playerId);
  return player.hand.some(c => canPlayCard(c, state, playerId));
}

// ---- Draw pile / discard pile reshuffle (Section 7) --------------
function drawCard(state, playerId, count = 1) {
  const player = findPlayer(state, playerId);
  const drawn = [];
  for (let i = 0; i < count; i++) {
    if (state.drawPile.length === 0) {
      reshuffleDiscardIntoDraw(state);
      if (state.drawPile.length === 0) break; // truly out of cards
    }
    const card = state.drawPile.shift();
    player.hand.push(card);
    drawn.push(card);
  }
  return drawn;
}

function reshuffleDiscardIntoDraw(state) {
  if (state.discardPile.length <= 1) return;
  const top = state.discardPile[state.discardPile.length - 1];
  const rest = state.discardPile.slice(0, -1);
  state.discardPile = [top];
  state.drawPile = shuffle(rest);
  log(state, "Draw pile was empty — reshuffled the discard pile (top card stays in place).");
}

// ---- Turn advancement --------------------------------------------
function advanceTurn(state) {
  if (state.strengthQueue.length > 0) {
    const nextId = state.strengthQueue.shift();
    const idx = state.players.findIndex(p => p.id === nextId);
    if (idx !== -1) {
      state.currentPlayerIndex = idx;
      state.turnCount += 1;
      log(state, `${state.players[idx].name} continues play (Strength).`);
      checkActionLockExpiry(state, nextId);
      return;
    }
  }
  const n = state.players.length;
  state.currentPlayerIndex = (state.currentPlayerIndex + state.direction + n) % n;
  state.turnCount += 1;
  checkActionLockExpiry(state, currentPlayer(state).id);
}

function checkActionLockExpiry(state, newCurrentPlayerId) {
  if (state.actionLock.active && state.actionLock.ownerPlayerId === newCurrentPlayerId) {
    state.actionLock.active = false;
    state.actionLock.ownerPlayerId = null;
    log(state, "Peace's Action-card lock has expired.");
  }
}

// ---- Win check ------------------------------------------------
function checkWin(state, playerId) {
  const player = findPlayer(state, playerId);
  if (player.hand.length === 0) {
    state.status = "finished";
    state.winnerId = playerId;
    log(state, `${player.name} wins!`);
    return true;
  }
  return false;
}

// ---- Playing a Number card (Section 5) -----------------------
function playNumberCard(state, playerId, cardUid) {
  const player = findPlayer(state, playerId);
  const idx = player.hand.findIndex(c => c.uid === cardUid);
  const card = player.hand[idx];
  const def = cardDef(card);
  player.hand.splice(idx, 1);
  state.discardPile.push(card);
  state.activeSuit = def.suit;
  state.activeNumber = def.number;
  log(state, `${player.name} played ${def.name}.`);

  if (checkWin(state, playerId)) return { won: true };
  advanceTurn(state);
  return { won: false };
}

// ---- Playing an Action card (Section 5) ------------------------
// `useBlessing` picks which of the two printed abilities resolves.
// Returns a descriptor telling the UI whether it needs to collect
// more input (e.g. "choose a suit") before the turn can end.
function playActionCard(state, playerId, cardUid, useBlessing) {
  const player = findPlayer(state, playerId);
  const idx = player.hand.findIndex(c => c.uid === cardUid);
  const card = player.hand[idx];
  const def = cardDef(card);

  if (useBlessing && player.blessings < def.blessingCost) {
    return { error: "Not enough Blessings." };
  }

  player.hand.splice(idx, 1);
  state.discardPile.push(card);
  state.activeSuit = def.suit;
  state.activeNumber = null;

  if (useBlessing) {
    player.blessings -= def.blessingCost;
    log(state, `${player.name} played ${def.name} (Blessing ability).`);
  } else {
    log(state, `${player.name} played ${def.name}.`);
  }

  if (checkWin(state, playerId)) return { won: true };

  const effect = useBlessing ? def.blessingEffect : def.effect;
  return resolveActionEffect(state, playerId, effect);
}

// ---- Playing a Miracle card (Section 5) -------------------------
function playMiracleCard(state, playerId, cardUid) {
  const player = findPlayer(state, playerId);
  const idx = player.hand.findIndex(c => c.uid === cardUid);
  const card = player.hand[idx];
  const def = cardDef(card);

  player.hand.splice(idx, 1);
  state.discardPile.push(card);
  log(state, `${player.name} played ${def.name} (Miracle).`);

  if (checkWin(state, playerId)) return { won: true };

  return resolveMiracleEffect(state, playerId, def.effect);
}

// ============================================================
// EFFECT HANDLERS
// Each returns a descriptor: { done: true } when the effect fully
// resolved and the turn should end/advance, or a "needsInput"
// descriptor the UI must satisfy by calling the matching
// resolve*Choice function below.
// ============================================================

function resolveActionEffect(state, playerId, effect) {
  const player = findPlayer(state, playerId);

  switch (effect.type) {
    case "five_stones": {
      const revealed = [];
      for (let i = 0; i < effect.count && state.drawPile.length; i++) {
        revealed.push(state.drawPile.shift());
      }
      if (effect.mode === "keep") {
        return { needsInput: "five_stones_keep", revealed, done: false };
      } else {
        const playable = revealed.filter(c => canPlayCardIgnoringTurn(c, state));
        return { needsInput: "five_stones_play", revealed, playable, done: false };
      }
    }
    case "living_water":
      return { needsInput: "living_water_discard", extraPlay: effect.extraPlay, done: false };
    case "loaves_and_fish": {
      const revealed = [];
      for (let i = 0; i < effect.count && state.drawPile.length; i++) {
        revealed.push(state.drawPile.shift());
      }
      const playable = revealed.filter(c => canPlayCardIgnoringTurn(c, state));
      return { needsInput: "loaves_and_fish_choose", revealed, playable, done: false };
    }
    case "mustard_seed":
      return { needsInput: "mustard_seed_extra", rewardSameSuit: effect.rewardSameSuit, done: false };
    case "big_fish":
      return { needsInput: "choose_suit_then_maybe_exchange", exchange: effect.exchange, done: false };
    case "big_storm":
      return { needsInput: "big_storm_choose_target", mode: effect.mode, done: false };
    case "empty_tomb":
      return { needsInput: "empty_tomb_choose_card", mode: effect.mode, done: false };
    case "good_samaritan":
      return { needsInput: "good_samaritan_give", mode: effect.mode, done: false };
    case "good_shepherd": {
      if (effect.count === 1) {
        if (state.discardPile.length > 1) {
          const card = state.discardPile.splice(state.discardPile.length - 2, 1)[0];
          player.hand.push(card);
          log(state, `${player.name} took the top discard card into hand.`);
        }
        advanceTurn(state);
        return { done: true };
      }
      const belowTop = state.discardPile.slice(0, -1);
      const topN = belowTop.slice(-effect.count).reverse();
      return { needsInput: "good_shepherd_choose", revealed: topN, done: false };
    }
    case "tree_climber": {
      const revealed = [];
      for (let i = 0; i < effect.count && state.drawPile.length; i++) {
        revealed.push(state.drawPile.shift());
      }
      return { needsInput: "tree_climber_reorder", revealed, done: false };
    }
    case "two_coins":
      return { needsInput: "two_coins_give", mode: effect.mode, done: false };
    case "walk_on_water":
      return { needsInput: "walk_on_water_choose", rewardBlessing: effect.rewardBlessing, done: false };
    default:
      advanceTurn(state);
      return { done: true };
  }
}

function resolveMiracleEffect(state, playerId, effect) {
  const player = findPlayer(state, playerId);
  switch (effect.type) {
    case "choose_suit":
      return { needsInput: "choose_suit", done: false };
    case "return_discard_to_hand":
      return { needsInput: "redeemed_choose_card", done: false };
    case "lock_action_cards":
      state.actionLock = { active: true, ownerPlayerId: playerId };
      log(state, `${player.name} played Peace — no Action cards until their next turn.`);
      return { done: true, endTurn: false }; // miracles don't consume the turn
    case "overflow":
      return { needsInput: "overflow_discard", done: false };
    case "gain_blessing":
      player.blessings += effect.amount;
      log(state, `${player.name} gained ${effect.amount} Blessing from Favor.`);
      return { done: true, endTurn: false };
    case "take_next_turn":
      state.strengthQueue.push(playerId);
      log(state, `${player.name} will continue play next (Strength).`);
      return { done: true, endTurn: false };
    default:
      return { done: true, endTurn: false };
  }
}

// A relaxed legality check used for "reveal cards, play if able"
// effects (Five Stones, Loaves & Fish) — same suit/number rule,
// but not gated on whose turn it is, since the card is being
// offered by the effect itself.
function canPlayCardIgnoringTurn(card, state) {
  const def = cardDef(card);
  if (def.type === "miracle") return true;
  if (def.suit === state.activeSuit) return true;
  if (def.type === "number" && def.number === state.activeNumber) return true;
  return false;
}

// ---- Resolution continuations ------------------------------------
// Called by the UI once it has collected the input a needsInput
// descriptor asked for. Each ends by advancing the turn (unless the
// card grants an additional play, in which case the UI loops back).

function finishTurn(state) {
  advanceTurn(state);
}

// Number-card-like resolution helper for when an effect causes a
// card to be discarded and become the new active card (e.g. Loaves
// & Fish auto-play, Five Stones blessing play, Walk on Water).
function playCardDirectly(state, playerId, card) {
  const def = cardDef(card);
  state.discardPile.push(card);
  if (def.type === "number") {
    state.activeSuit = def.suit;
    state.activeNumber = def.number;
  } else if (def.type === "action") {
    state.activeSuit = def.suit;
    state.activeNumber = null;
  }
  log(state, `${findPlayer(state, playerId).name}'s ${def.name} was played.`);
}
