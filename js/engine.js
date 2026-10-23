// ============================================================
// Pass It On — Game Engine (Rules v1.1)
// Pure game logic. No DOM access — ui.js renders and collects
// choices; online.js syncs state. Card data lives in cards.js.
// ============================================================

let cardInstanceCounter = 0;
// Random per-device prefix so cards dealt on different phones never share a uid.
const UID_PREFIX = Math.random().toString(36).slice(2, 6);
function makeInstance(defId) {
  cardInstanceCounter += 1;
  return { uid: `${UID_PREFIX}${cardInstanceCounter.toString(36)}`, defId };
}

function cardDef(instance) {
  return CARD_LIBRARY[instance.defId];
}

// ---- Decks ---------------------------------------------------------
function createFullDeck() {
  const deck = [];
  for (const def of MAIN_DECK_CARDS) {
    for (let i = 0; i < def.copies; i++) deck.push(makeInstance(def.id));
  }
  return deck;
}

function createGraceDeck() {
  const deck = [];
  for (const def of GRACE_CARDS) {
    for (let i = 0; i < def.copies; i++) deck.push(makeInstance(def.id));
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

// ---- Game state ------------------------------------------------------
function freshTurnFlags() {
  // Everything that's limited to "once per turn". `used` keys are
  // `${playerId}:${thing}` so a receiver's Gift (Encouragement,
  // Gratitude) is also limited once per turn on other people's turns.
  return { purchases: 0, extraPurchaseDiscount: null, used: {} };
}

function createGameState(playerNames) {
  const players = playerNames.map((name, i) => ({
    id: `player-${i + 1}`,
    name,
    hand: [],
    blessings: 1,
    gifts: [],
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
    activeSymbol: null,      // Action story id — matches same-story Action cards
    actionLock: { active: false, ownerPlayerId: null }, // Peace
    suitChooserId: null,     // after a Miracle: this player picks the suit first
    turnPhase: "play",       // "play" | "after" (finished playing; may still buy Grace)
    pendingEnd: null,        // how to end the turn from the "after" phase: "normal" | "miracle"
    turn: freshTurnFlags(),
    prompts: [],             // online: choices other players must make on their own device
    graceDeck: [],
    graceMarket: [],
    graceDiscard: [],
    winnerId: null,
    turnCount: 1,
    gameLog: [],
    turnOverrideQueue: []
  };

  let deck = shuffle(createFullDeck());
  for (const p of players) p.hand = deck.splice(0, 7);

  // Reveal until a Number card is found; skipped cards are reshuffled in.
  const skipped = [];
  let starter = null;
  while (deck.length) {
    const candidate = deck.shift();
    if (cardDef(candidate).type === "number") { starter = candidate; break; }
    skipped.push(candidate);
  }
  if (skipped.length) deck = shuffle([...deck, ...skipped]);
  state.discardPile = [starter];
  state.drawPile = deck;
  state.activeSuit = cardDef(starter).suit;
  state.activeNumber = cardDef(starter).number;

  state.graceDeck = shuffle(createGraceDeck());
  for (let i = 0; i < 3; i++) state.graceMarket.push(state.graceDeck.shift() || null);

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

// ---- Once-per-turn tracking ---------------------------------------
function usedThisTurn(state, playerId, key) {
  return !!(state.turn && state.turn.used && state.turn.used[`${playerId}:${key}`]);
}
function markUsed(state, playerId, key) {
  if (!state.turn) state.turn = freshTurnFlags();
  state.turn.used[`${playerId}:${key}`] = true;
}

function hasGift(state, playerId, giftId) {
  const p = findPlayer(state, playerId);
  return !!p && (p.gifts || []).some(c => c.defId === giftId);
}
// A Gift's once-per-turn ability is available right now.
function giftReady(state, playerId, giftId) {
  return hasGift(state, playerId, giftId) && !usedThisTurn(state, playerId, giftId);
}

// ---- Legal-play function ------------------------------------------
// Single source of truth for whether a card in hand can be played.
function canPlayCard(card, state, playerId) {
  const def = cardDef(card);
  if (state.status !== "playing") return false;
  if (def.type === "grace") return false;

  // Peace: no Action or Miracle cards until its player's next turn.
  if (state.actionLock.active && (def.type === "action" || def.type === "miracle")) return false;

  // The player who must choose the suit after a Miracle does that first.
  if (state.suitChooserId === playerId) return false;

  if (def.type === "miracle") {
    if (def.timing === "any_time") return true;
    return playerId === currentPlayer(state).id && state.turnPhase === "play";
  }

  if (playerId !== currentPlayer(state).id) return false;
  if (state.turnPhase !== "play") return false;
  return matchesActive(card, state);
}

// Suit / number / symbol matching, ignoring whose turn it is.
function matchesActive(card, state) {
  const def = cardDef(card);
  if (def.type === "miracle") return true;
  if (def.type === "grace") return false;
  if (def.suit && def.suit === state.activeSuit) return true;
  if (def.type === "number" && state.activeNumber != null && def.number === state.activeNumber) return true;
  if (def.type === "action" && state.activeSymbol && def.story === state.activeSymbol) return true;
  return false;
}
// Kept for older call sites ("reveal cards, play if able" effects).
function canPlayCardIgnoringTurn(card, state) {
  if (state.actionLock.active && ["action", "miracle"].includes(cardDef(card).type)) return false;
  return matchesActive(card, state);
}

function hasAnyLegalCard(state, playerId) {
  const player = findPlayer(state, playerId);
  return player.hand.some(c => canPlayCard(c, state, playerId));
}

// ---- Draw pile / discard pile ---------------------------------------
function drawCard(state, playerId, count = 1) {
  const player = findPlayer(state, playerId);
  const drawn = [];
  for (let i = 0; i < count; i++) {
    if (state.drawPile.length === 0) {
      reshuffleDiscardIntoDraw(state);
      if (state.drawPile.length === 0) break;
    }
    const card = state.drawPile.shift();
    player.hand.push(card);
    drawn.push(card);
  }
  return drawn;
}

// Takes the top card of the draw pile without putting it anywhere.
function takeFromDrawPile(state) {
  if (state.drawPile.length === 0) reshuffleDiscardIntoDraw(state);
  return state.drawPile.shift() || null;
}

function reshuffleDiscardIntoDraw(state) {
  if (state.discardPile.length <= 1) return;
  const top = state.discardPile[state.discardPile.length - 1];
  const rest = state.discardPile.slice(0, -1);
  state.discardPile = [top];
  state.drawPile = shuffle(rest);
  log(state, "Draw pile was empty — reshuffled the discard pile (top card stays in place).");
}

// A discard that isn't a play (Big Storm, Overflow, Refresh, Second
// Chance) slides under the top card, so the active suit/number/symbol
// shown on the table stays exactly what players must match.
function discardUnderTop(state, cards) {
  const at = Math.max(0, state.discardPile.length - 1);
  state.discardPile.splice(at, 0, ...cards);
}

function removeFromHand(player, cardUid) {
  const idx = player.hand.findIndex(c => c.uid === cardUid);
  if (idx === -1) return null;
  return player.hand.splice(idx, 1)[0];
}

// ---- Turn advancement ------------------------------------------------
function beginTurn(state, index) {
  state.currentPlayerIndex = index;
  state.turnCount += 1;
  state.turnPhase = "play";
  state.pendingEnd = null;
  state.turn = freshTurnFlags();
  checkActionLockExpiry(state, state.players[index].id);
}

function advanceTurn(state) {
  state.suitChooserId = null;
  if (state.turnOverrideQueue.length > 0) {
    const nextId = state.turnOverrideQueue.shift();
    const idx = state.players.findIndex(p => p.id === nextId);
    if (idx !== -1) {
      beginTurn(state, idx);
      log(state, `${state.players[idx].name} plays next.`);
      return;
    }
  }
  const n = state.players.length;
  beginTurn(state, (state.currentPlayerIndex + state.direction + n) % n);
}

function checkActionLockExpiry(state, newCurrentPlayerId) {
  if (state.actionLock.active && state.actionLock.ownerPlayerId === newCurrentPlayerId) {
    state.actionLock = { active: false, ownerPlayerId: null };
    log(state, "Peace has ended — Action and Miracle cards may be played again.");
  }
}

// After a Miracle: the player who takes the next turn chooses the
// active suit (Wisdom is the exception — its player already chose).
function endTurnAfterMiracle(state) {
  advanceTurn(state);
  giveSuitChoiceTo(state, currentPlayer(state).id);
}

function giveSuitChoiceTo(state, playerId) {
  state.suitChooserId = playerId;
  state.activeNumber = null;
  state.activeSymbol = null;
  log(state, `${findPlayer(state, playerId).name} chooses the active suit.`);
}

function chooseSuit(state, playerId, suit) {
  state.activeSuit = suit;
  state.activeNumber = null;
  state.activeSymbol = null;
  if (state.suitChooserId === playerId) state.suitChooserId = null;
  log(state, `${findPlayer(state, playerId).name} chose ${suit} as the active suit.`);
}

// Strength played out of turn: play continues with the player after
// whoever played it, and that player chooses the suit.
function redirectAfterStrength(state, strengthPlayerId) {
  const n = state.players.length;
  const idx = state.players.findIndex(p => p.id === strengthPlayerId);
  state.turnOverrideQueue = [];
  beginTurn(state, (idx + state.direction + n) % n);
  giveSuitChoiceTo(state, currentPlayer(state).id);
}

// ---- Win check -------------------------------------------------------
function checkWin(state, playerId) {
  const player = findPlayer(state, playerId);
  if (player.hand.length === 0 && state.status === "playing") {
    state.status = "finished";
    state.winnerId = playerId;
    log(state, `${player.name} wins!`);
    return true;
  }
  return state.status === "finished" && state.winnerId === playerId;
}

// ---- Playing cards ---------------------------------------------------
function playNumberCard(state, playerId, cardUid) {
  const card = removeFromHand(findPlayer(state, playerId), cardUid);
  return playHandCardDirect(state, playerId, card, false);
}

function playActionCard(state, playerId, cardUid, useBlessing) {
  const player = findPlayer(state, playerId);
  const card = player.hand.find(c => c.uid === cardUid);
  if (useBlessing && player.blessings < cardDef(card).blessingCost) return { error: "Not enough Blessings." };
  removeFromHand(player, cardUid);
  return playHandCardDirect(state, playerId, card, useBlessing);
}

function playMiracleCard(state, playerId, cardUid) {
  const card = removeFromHand(findPlayer(state, playerId), cardUid);
  return playHandCardDirect(state, playerId, card, false);
}

// Plays a card that's already out of the player's hand. Shared by
// normal plays and every "play an additional / revealed card" effect.
// Never advances the turn — it returns a descriptor:
//   { done: true }              effect finished
//   { done: true, numberPlayed } a Number card — UI offers Opportunity,
//                                Pass It On and Unity before moving on
//   { needsInput: ... }          UI must collect a choice
//   { done: true, miracle: true } Miracle resolved — next player picks suit
//   { won: true }
function playHandCardDirect(state, playerId, card, useBlessing) {
  const player = findPlayer(state, playerId);
  const def = cardDef(card);

  if (def.type === "number") {
    state.discardPile.push(card);
    state.activeSuit = def.suit;
    state.activeNumber = def.number;
    state.activeSymbol = null;
    log(state, `${player.name} played ${def.name}.`);
    if (checkWin(state, playerId)) return { won: true };
    return { done: true, numberPlayed: card };
  }

  if (def.type === "action") {
    if (useBlessing && player.blessings < def.blessingCost) return { error: "Not enough Blessings." };
    state.discardPile.push(card);
    state.activeSuit = def.suit;
    state.activeNumber = null;
    state.activeSymbol = def.story;
    if (useBlessing) {
      player.blessings -= def.blessingCost;
      log(state, `${player.name} played ${def.name} (${def.suit}) — Blessing ability.`);
    } else {
      log(state, `${player.name} played ${def.name} (${def.suit}).`);
    }
    if (checkWin(state, playerId)) return { won: true };
    return resolveActionEffect(state, playerId, useBlessing ? def.blessingEffect : def.effect);
  }

  if (def.type === "miracle") {
    state.discardPile.push(card);
    state.activeNumber = null;
    state.activeSymbol = null;
    log(state, `${player.name} played ${def.name} (Miracle).`);
    if (checkWin(state, playerId)) return { won: true };
    return resolveMiracleEffect(state, playerId, def.effect);
  }

  return { done: true };
}

// ---- Giving cards ------------------------------------------------------
// `how` is "pass" (Pass It On) or "effect" (Good Samaritan, Two
// Coins, Give Freely). Returns { gratitude: true } when the receiver
// may use Gratitude on the card they just got.
function giveCard(state, fromId, toId, card, how) {
  const from = findPlayer(state, fromId);
  const to = findPlayer(state, toId);
  removeFromHand(from, card.uid);
  to.hand.push(card);
  const out = {};
  if (how === "effect" && giftReady(state, toId, "encouragement")) {
    markUsed(state, toId, "encouragement");
    from.blessings += 1;
    to.blessings += 1;
    log(state, `Encouragement: ${to.name} and ${from.name} each gain 1 Blessing.`);
  }
  if (how === "pass" && giftReady(state, toId, "gratitude") && state.drawPile.length > 0) {
    out.gratitude = true;
  }
  return out;
}

// Gratitude: swap the received card with the top of the draw pile.
function applyGratitude(state, playerId, cardUid) {
  const player = findPlayer(state, playerId);
  if (!giftReady(state, playerId, "gratitude")) return false;
  const card = removeFromHand(player, cardUid);
  if (!card) return false;
  const top = takeFromDrawPile(state);
  if (!top) { player.hand.push(card); return false; }
  player.hand.push(top);
  state.drawPile.unshift(card);
  markUsed(state, playerId, "gratitude");
  log(state, `${player.name} used Gratitude to swap the card they received.`);
  return true;
}

// ---- Pass It On ----------------------------------------------------------
function passItOnOptions(state, playerId, number) {
  if (usedThisTurn(state, playerId, "pass")) return [];
  if (state.players.length < 2) return [];
  const player = findPlayer(state, playerId);
  return player.hand.filter(c => {
    const d = cardDef(c);
    return d.type === "number" && d.number === number;
  });
}

function passItOn(state, fromId, toId, card) {
  const from = findPlayer(state, fromId);
  const to = findPlayer(state, toId);
  markUsed(state, fromId, "pass");
  const res = giveCard(state, fromId, toId, card, "pass");
  from.blessings += 1;
  log(state, `${from.name} Passed It On — gave ${cardDef(card).name} to ${to.name} and gained 1 Blessing.`);
  if (giftReady(state, fromId, "fellowship")) {
    markUsed(state, fromId, "fellowship");
    to.blessings += 1;
    log(state, `Fellowship: ${to.name} gains 1 Blessing.`);
    res.fellowshipSwap = state.drawPile.length > 0 || state.discardPile.length > 1;
  }
  return res;
}

// Exchange a hand card with the top of the draw pile (Big Fish,
// New Perspective, Fellowship).
function exchangeWithDrawTop(state, playerId, cardUid) {
  const player = findPlayer(state, playerId);
  const top = takeFromDrawPile(state);
  if (!top) return false;
  const card = removeFromHand(player, cardUid);
  player.hand.push(top);
  state.drawPile.unshift(card);
  return true;
}

// ---- The Grace Market ------------------------------------------------------
function drawGrace(state) {
  if (state.graceDeck.length === 0 && state.graceDiscard.length > 0) {
    state.graceDeck = shuffle(state.graceDiscard);
    state.graceDiscard = [];
    log(state, "The Grace Deck ran out — reshuffled the Grace discard pile.");
  }
  return state.graceDeck.shift() || null;
}

function refillMarket(state) {
  for (let i = 0; i < 3; i++) {
    if (!state.graceMarket[i]) state.graceMarket[i] = drawGrace(state);
  }
}

// Cost of the next purchase for this player right now, or null when
// they can't buy at all (not their turn, already bought, etc.).
function gracePrice(state, playerId, card) {
  if (state.status !== "playing") return null;
  if (currentPlayer(state).id !== playerId) return null;
  if (state.suitChooserId === playerId) return null;
  if (state.prompts && state.prompts.length) return null;
  const t = state.turn || freshTurnFlags();
  const def = cardDef(card);
  if (t.purchases === 0) return def.cost;
  if (t.purchases === 1 && t.extraPurchaseDiscount != null) return Math.max(0, def.cost - t.extraPurchaseDiscount);
  return null;
}

function canBuyAnyGrace(state, playerId) {
  const player = findPlayer(state, playerId);
  return state.graceMarket.some(c => {
    if (!c) return false;
    const price = gracePrice(state, playerId, c);
    return price !== null && player.blessings >= price;
  });
}

// Buys market slot `slot`. For a Gift when the player already has
// two, `discardGiftUid` names the one to give up. Returns
// { error } | { gift: true } | { act: card, result } where result is
// a descriptor from resolveGraceAct.
function buyGrace(state, playerId, slot, discardGiftUid) {
  const player = findPlayer(state, playerId);
  const card = state.graceMarket[slot];
  if (!card) return { error: "That market slot is empty." };
  const price = gracePrice(state, playerId, card);
  if (price === null) return { error: "You can't buy another Grace card this turn." };
  if (player.blessings < price) return { error: "Not enough Blessings." };
  const def = cardDef(card);
  if (def.kind === "gift" && player.gifts.length >= 2) {
    const idx = player.gifts.findIndex(g => g.uid === discardGiftUid);
    if (idx === -1) return { error: "Choose a Gift to discard first." };
    const [old] = player.gifts.splice(idx, 1);
    state.graceDiscard.push(old);
    log(state, `${player.name} discarded ${cardDef(old).name} to make room.`);
  }
  player.blessings -= price;
  state.turn.purchases += 1;
  state.graceMarket[slot] = null;
  refillMarket(state);
  log(state, `${player.name} bought ${def.name} (${def.kind === "gift" ? "Gift" : "Act"} of Grace) for ${price} Blessing${price === 1 ? "" : "s"}.`);
  if (def.kind === "gift") {
    player.gifts.push(card);
    return { gift: true };
  }
  state.graceDiscard.push(card);
  return { act: card, result: resolveGraceAct(state, playerId, def.effect) };
}

function renewMarketSlot(state, playerId, slot) {
  if (!giftReady(state, playerId, "renewal")) return false;
  const old = state.graceMarket[slot];
  if (!old) return false;
  const replacement = drawGrace(state);
  if (!replacement) return false;
  state.graceMarket[slot] = replacement;
  state.graceDiscard.push(old);
  markUsed(state, playerId, "renewal");
  log(state, `${findPlayer(state, playerId).name} used Renewal to replace ${cardDef(old).name} in the Grace Market.`);
  return true;
}

function resolveGraceAct(state, playerId, effect) {
  const player = findPlayer(state, playerId);
  switch (effect.type) {
    case "provision":
      return player.hand.length ? { needsInput: "provision" } : { done: true };
    case "open_door":
      return { needsInput: "open_door" };
    case "refresh": {
      const n = player.hand.length;
      discardUnderTop(state, player.hand.splice(0));
      drawCard(state, playerId, n);
      log(state, `${player.name} discarded their hand and drew ${n} new cards (Refresh).`);
      return { done: true };
    }
    case "abundance":
      return { needsInput: "abundance" };
    case "extra_purchase":
      state.turn.extraPurchaseDiscount = effect.discount;
      log(state, `${player.name} may buy 1 more Grace card this turn for ${effect.discount} fewer Blessings.`);
      return { done: true };
    case "second_chance":
      return { needsInput: "second_chance" };
    case "guidance": {
      const revealed = [];
      for (let i = 0; i < 3; i++) { const c = takeFromDrawPile(state); if (c) revealed.push(c); }
      return { needsInput: "guidance", revealed };
    }
    case "new_perspective":
      return { needsInput: "new_perspective" };
    case "give_freely":
      return player.hand.length ? { needsInput: "give_freely" } : { done: true };
    default:
      return { done: true };
  }
}

// ============================================================
// EFFECT HANDLERS (Action / Miracle)
// ============================================================
function resolveActionEffect(state, playerId, effect) {
  const player = findPlayer(state, playerId);
  switch (effect.type) {
    case "five_stones": {
      const revealed = [];
      for (let i = 0; i < effect.count && state.drawPile.length; i++) revealed.push(state.drawPile.shift());
      if (effect.mode === "keep") return { needsInput: "five_stones_keep", revealed };
      const playable = revealed.filter(c => canPlayCardIgnoringTurn(c, state));
      return { needsInput: "five_stones_play", revealed, playable };
    }
    case "living_water":
      return { needsInput: "living_water_discard", extraPlay: effect.extraPlay };
    case "loaves_and_fish": {
      const revealed = [];
      for (let i = 0; i < effect.count && state.drawPile.length; i++) revealed.push(state.drawPile.shift());
      const playable = revealed.filter(c => canPlayCardIgnoringTurn(c, state));
      return { needsInput: "loaves_and_fish_choose", revealed, playable };
    }
    case "mustard_seed":
      return { needsInput: "mustard_seed_extra", count: effect.count };
    case "big_fish":
      return { needsInput: "choose_suit_then_maybe_exchange", exchange: effect.exchange };
    case "big_storm":
      return { needsInput: "big_storm_choose_target", mode: effect.mode };
    case "empty_tomb":
      return { needsInput: "empty_tomb_choose_card", mode: effect.mode };
    case "good_samaritan":
      return { needsInput: "good_samaritan_give", mode: effect.mode };
    case "good_shepherd": {
      if (effect.count === 1) {
        if (state.discardPile.length > 1) {
          const card = state.discardPile.splice(state.discardPile.length - 2, 1)[0];
          player.hand.push(card);
          log(state, `${player.name} took the top discard card into hand.`);
        }
        return { done: true };
      }
      const belowTop = state.discardPile.slice(0, -1);
      const topN = belowTop.slice(-effect.count).reverse();
      return { needsInput: "good_shepherd_choose", revealed: topN };
    }
    case "tree_climber": {
      const revealed = [];
      for (let i = 0; i < effect.count && state.drawPile.length; i++) revealed.push(state.drawPile.shift());
      return { needsInput: "tree_climber_reorder", revealed };
    }
    case "two_coins":
      return { needsInput: "two_coins_give", mode: effect.mode };
    case "walk_on_water":
      return { needsInput: "walk_on_water_choose", pickNext: effect.pickNext, numberOnly: effect.numberOnly };
    default:
      return { done: true };
  }
}

function resolveMiracleEffect(state, playerId, effect) {
  const player = findPlayer(state, playerId);
  switch (effect.type) {
    case "choose_suit":
      return { needsInput: "choose_suit" };
    case "return_discard_to_hand":
      return { needsInput: "redeemed_choose_card" };
    case "lock_action_cards":
      state.actionLock = { active: true, ownerPlayerId: playerId };
      log(state, `${player.name} played Peace — no Action or Miracle cards until their next turn.`);
      return { done: true, miracle: true };
    case "overflow":
      return { needsInput: "overflow_discard" };
    case "gain_blessing":
      player.blessings += effect.amount;
      log(state, `${player.name} gained ${effect.amount} Blessing from Favor.`);
      return { done: true, miracle: true };
    case "renewed_strength":
      return { done: true, miracle: true };
    default:
      return { done: true, miracle: true };
  }
}
