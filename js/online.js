// ============================================================
// Pass It On — Online multiplayer (Firebase/Firestore)
// This file is a <script type="module">, loaded after ui.js and
// engine.js. It reuses their global functions (showScreen,
// renderCard, cardDef, canPlayCard, playNumberCard, etc.) — those
// are plain `function` declarations in classic scripts, which do
// attach to `window` and are safely visible here. `el`/`els` in
// ui.js are `const`, which is NOT reliably visible across the
// classic-script/module boundary, so this file defines its own.
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, onSnapshot, updateDoc, arrayUnion
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

const el = sel => document.querySelector(sel);
const els = sel => Array.from(document.querySelectorAll(sel));

function log(msg) {
  const logEl = el("#online-log");
  if (!logEl) return;
  const line = document.createElement("div");
  line.textContent = `${new Date().toLocaleTimeString()} — ${msg}`;
  logEl.prepend(line);
}
function generateRoomCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

if (!window.firebaseConfig || window.firebaseConfig.apiKey.startsWith("PASTE-")) {
  el("#play-online-btn").addEventListener("click", () => {
    alert("Online play isn't configured yet on this copy of the app.");
  });
} else {
  const app = initializeApp(window.firebaseConfig);
  const db = getFirestore(app);
  const auth = getAuth(app);
  let myUid = null;

  onAuthStateChanged(auth, user => {
    if (user) myUid = user.uid;
  });
  signInAnonymously(auth).catch(err => console.warn("Online sign-in failed:", err));

  el("#play-online-btn").addEventListener("click", () => {
    showScreen("online-lobby-screen");
    el("#online-lobby-status").textContent = "";
  });
  el("#online-back-btn").addEventListener("click", () => showScreen("home-screen"));

  el("#online-host-btn").addEventListener("click", () => {
    el("#online-host-btn").style.display = "none";
    el("#online-count-picker").style.display = "block";
  });
  // Tapping a count both selects it and immediately hosts a room —
  // no separate confirm step needed for a single number choice.
  els("#online-count-row .count-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const n = parseInt(btn.dataset.count, 10);
      const code = generateRoomCode();
      startOnlineGame(code, true, n);
    });
  });

  el("#online-join-btn").addEventListener("click", () => {
    const code = el("#online-join-code").value.trim().toUpperCase();
    if (!code) return;
    startOnlineGame(code, false);
  });

  async function startOnlineGame(roomId, isHost, maxPlayers) {
    if (!myUid) {
      el("#online-lobby-status").textContent = "Still connecting — try again in a second.";
      return;
    }
    el("#online-lobby-status").textContent = isHost ? "Creating room…" : "Joining…";

    const publicRef = doc(db, "games", roomId);
    const myHandRef = doc(db, "games", roomId, "hands", myUid);
    const handRef = uid => doc(db, "games", roomId, "hands", uid);

    let MY_PLAYER_INDEX = -1;
    let latestPublic = null;
    let latestMyHand = null;
    let currentState = null;
    let actionPending = false;
    let pendingAfterCard = null;

    try {
      if (isHost) {
        log(`Creating a ${maxPlayers}-player room…`);
        const seats = new Array(maxPlayers).fill(null);
        seats[0] = myUid;
        await setDoc(publicRef, {
          status: "waiting",
          seats,
          playerUids: [myUid],
          playerNames: seats.map((_, i) => `Player ${i + 1}`)
        });
      } else {
        log("Joining…");
        const snap = await getDoc(publicRef);
        if (!snap.exists()) throw new Error("Room not found — check the code.");
        const data = snap.data();
        const seats = data.seats.slice();

        if (!seats.includes(myUid)) {
          const openIndex = seats.indexOf(null);
          if (openIndex === -1) throw new Error("This room is already full.");
          seats[openIndex] = myUid;
          await setDoc(publicRef, { seats, playerUids: arrayUnion(myUid) }, { merge: true });
          log(`Claimed seat ${openIndex + 1} of ${seats.length}.`);
        } else {
          log("Reconnected to my existing seat.");
        }

        if (data.status === "waiting" && !seats.includes(null)) {
          log(`All ${seats.length} players present — dealing the game…`);
          const names = seats.map((_, i) => `Player ${i + 1}`);
          const fresh = createGameState(names);
          for (let i = 0; i < seats.length; i++) {
            await setDoc(handRef(seats[i]), { hand: fresh.players[i].hand });
          }
          const { players, ...publicRest } = fresh;
          const publicPlayers = players.map(p => ({
            id: p.id, name: p.name, blessings: p.blessings, connected: true, handCount: p.hand.length
          }));
          await setDoc(publicRef, {
            ...publicRest, players: publicPlayers, status: "playing", seats, playerUids: seats
          }, { merge: true });
          log("Dealt — game started.");
        }
      }
    } catch (err) {
      el("#online-lobby-status").textContent = `Error: ${err.message}`;
      log(`Error: ${err.code || err.message}`);
      return;
    }

    showScreen("online-game-screen");
    el("#online-room-code-tag").textContent = `Room ${roomId}`;

    function buildWorkingState() {
      if (!latestPublic || latestPublic.status === "waiting") return null;
      const seats = latestPublic.seats;
      MY_PLAYER_INDEX = seats.indexOf(myUid);
      if (MY_PLAYER_INDEX === -1) return null;
      const { players: publicPlayers, ...rest } = latestPublic;
      const state = JSON.parse(JSON.stringify(rest));
      state.players = publicPlayers.map((p, i) => {
        if (i === MY_PLAYER_INDEX) {
          return { id: p.id, name: p.name, blessings: p.blessings, connected: p.connected, hand: (latestMyHand || []).slice() };
        }
        const placeholder = [];
        for (let k = 0; k < p.handCount; k++) placeholder.push({ uid: `placeholder-${i}-${k}`, defId: "faith-1" });
        return { id: p.id, name: p.name, blessings: p.blessings, connected: p.connected, hand: placeholder };
      });
      return state;
    }

    async function pushSplitState(state) {
      try {
        await setDoc(myHandRef, { hand: state.players[MY_PLAYER_INDEX].hand });
        const { players, ...rest } = state;
        const publicPlayers = players.map(p => ({
          id: p.id, name: p.name, blessings: p.blessings, connected: p.connected, handCount: p.hand.length
        }));
        await setDoc(publicRef, { ...rest, players: publicPlayers, seats: latestPublic.seats, playerUids: latestPublic.playerUids }, { merge: false });
        return true;
      } catch (err) {
        log(`Error saving state: ${err.code || ""} ${err.message}`);
        return false;
      }
    }
    async function giveCardTo(targetUid, card) {
      try {
        await updateDoc(handRef(targetUid), { hand: arrayUnion(card) });
      } catch (err) {
        log(`Error giving card: ${err.code || ""} ${err.message}`);
      }
    }

    function lockControls() {
      actionPending = true;
      el("#online-draw-btn").disabled = true;
      el("#online-player-hand").querySelectorAll(".card").forEach(c => { c.style.pointerEvents = "none"; });
    }
    function showActionPanel(html) {
      const p = el("#online-action-panel");
      p.innerHTML = html;
      p.style.display = "block";
      el("#online-player-hand").style.display = "none";
      el("#online-draw-btn").style.display = "none";
    }
    function hideActionPanel() {
      const p = el("#online-action-panel");
      p.style.display = "none";
      p.innerHTML = "";
      el("#online-player-hand").style.display = "flex";
      el("#online-draw-btn").style.display = "block";
    }
    function pickButtons(description, items, labelFn, onPick, opts = {}) {
      const isCardList = items.length > 0 && items[0] && items[0].defId !== undefined;
      const panel = el("#online-action-panel");
      panel.innerHTML = `<p>${description}</p>`;
      const row = document.createElement("div");
      row.className = "pick-row";
      items.forEach(item => {
        if (isCardList) {
          const cardEl = renderCard(item, { size: "small", legal: true });
          cardEl.addEventListener("click", () => onPick(item));
          row.appendChild(cardEl);
        } else {
          const btn = document.createElement("button");
          btn.className = "pick-btn";
          btn.textContent = labelFn(item);
          btn.addEventListener("click", () => onPick(item));
          row.appendChild(btn);
        }
      });
      panel.appendChild(row);
      if (opts.skipLabel) {
        const skipBtn = document.createElement("button");
        skipBtn.textContent = opts.skipLabel;
        skipBtn.addEventListener("click", opts.onSkip);
        panel.appendChild(skipBtn);
      }
      panel.style.display = "block";
      el("#online-player-hand").style.display = "none";
      el("#online-draw-btn").style.display = "none";
    }
    const SUITS_LOCAL = ["Faith", "Hope", "Love", "Service", "Prayer", "Word"];
    const SUIT_COLORS_LOCAL = {
      Faith: "#1d4e89", Hope: "#a68a1c", Love: "#a5253f",
      Service: "#c1622d", Prayer: "#5b7a3a", Word: "#4b3f9e"
    };
    function pickSuit(description, onPick) {
      const panel = el("#online-action-panel");
      panel.innerHTML = `<p>${description}</p>`;
      const row = document.createElement("div");
      row.className = "pick-row";
      SUITS_LOCAL.forEach(s => {
        const btn = document.createElement("button");
        btn.className = "pick-btn";
        btn.style.borderColor = SUIT_COLORS_LOCAL[s];
        btn.textContent = s;
        btn.addEventListener("click", () => onPick(s));
        row.appendChild(btn);
      });
      panel.appendChild(row);
      panel.style.display = "block";
      el("#online-player-hand").style.display = "none";
      el("#online-draw-btn").style.display = "none";
    }

    function consumePendingAfterCard() {
      if (pendingAfterCard) { const fn = pendingAfterCard; pendingAfterCard = null; fn(); return true; }
      return false;
    }
    function finishTurn() {
      if (consumePendingAfterCard()) return;
      hideActionPanel();
      advanceTurn(currentState);
      pushSplitState(currentState);
    }
    function finishMiracleTurn() {
      if (pendingAfterCard) { pendingAfterCard = null; }
      hideActionPanel();
      endTurnWithFreePlay(currentState);
      pushSplitState(currentState);
    }
    function handleEffectResult(result) {
      if (!result) return;
      if (result.won) { pushSplitState(currentState); return; }
      if (result.error) { alert(result.error); return; }
      if (!result.needsInput) {
        if (result.miracle) {
          if (MY_PLAYER_INDEX === currentState.currentPlayerIndex) finishMiracleTurn();
          else { hideActionPanel(); pushSplitState(currentState); }
        } else {
          finishTurn();
        }
        return;
      }
      routeNeedsInput(result);
    }
    function playExtraCard(card, onResult) {
      const def = cardDef(card);
      const me = currentState.players[MY_PLAYER_INDEX];
      if (def.type === "action" && def.blessingCost > 0 && me.blessings >= def.blessingCost) {
        showActionPanel(`
          <p><b>${def.name}</b></p><p class="verse">${def.verse}</p>
          <button id="choice-play">Play<br><small>${def.playText}</small></button>
          <button id="choice-blessing">Spend ${def.blessingCost} Blessing${def.blessingCost > 1 ? "s" : ""}<br><small>${def.blessingText}</small></button>
        `);
        el("#choice-play").onclick = () => onResult(playHandCardDirect(currentState, me.id, card, false));
        el("#choice-blessing").onclick = () => onResult(playHandCardDirect(currentState, me.id, card, true));
        return;
      }
      onResult(playHandCardDirect(currentState, me.id, card, false));
    }

    function routeNeedsInput(result) {
      const handlers = {
        five_stones_keep: panelFiveStonesKeep,
        five_stones_play: panelFiveStonesPlay,
        living_water_discard: panelLivingWaterDiscard,
        loaves_and_fish_choose: panelLoavesAndFishChoose,
        mustard_seed_extra: r => promptMustardSeedCard(r.count),
        choose_suit_then_maybe_exchange: panelBigFish,
        big_storm_choose_target: panelBigStorm,
        empty_tomb_choose_card: panelEmptyTomb,
        good_samaritan_give: panelGoodSamaritan,
        good_shepherd_choose: panelGoodShepherdChoose,
        tree_climber_reorder: panelTreeClimber,
        two_coins_give: panelTwoCoins,
        walk_on_water_choose: panelWalkOnWater,
        choose_suit: panelChooseSuit,
        redeemed_choose_card: panelRedeemedChoose,
        overflow_discard: panelOverflow
      };
      const fn = handlers[result.needsInput];
      if (fn) fn(result); else finishTurn();
    }

    function panelFiveStonesKeep(result) {
      const me = currentState.players[MY_PLAYER_INDEX];
      if (result.revealed.length === 0) { finishTurn(); return; }
      pickButtons("Five Stones — choose 1 card to keep. The rest return to the draw pile.",
        result.revealed, c => cardDef(c).name, card => {
          me.hand.push(card);
          const rest = result.revealed.filter(r => r.uid !== card.uid);
          currentState.drawPile.unshift(...shuffle(rest));
          finishTurn();
        });
    }
    function panelFiveStonesPlay(result) {
      const me = currentState.players[MY_PLAYER_INDEX];
      if (result.revealed.length === 0) { finishTurn(); return; }
      if (result.playable.length === 0) {
        showActionPanel(`
          <p>Five Stones (Blessing) — none of the 5 revealed cards can be played. Add one to your hand, or return all five?</p>
          <button id="fs-keep-one">Keep 1 in hand</button>
          <button id="fs-return-all">Return all 5</button>
        `);
        el("#fs-keep-one").onclick = () => {
          me.hand.push(result.revealed[0]);
          currentState.drawPile.unshift(...shuffle(result.revealed.slice(1)));
          finishTurn();
        };
        el("#fs-return-all").onclick = () => {
          currentState.drawPile.unshift(...shuffle(result.revealed));
          finishTurn();
        };
        return;
      }
      pickButtons("Five Stones (Blessing) — choose 1 legal card to play immediately.",
        result.playable, c => cardDef(c).name, card => {
          const rest = result.revealed.filter(r => r.uid !== card.uid);
          currentState.drawPile.unshift(...shuffle(rest));
          playExtraCard(card, handleEffectResult);
        });
    }
    function panelLivingWaterDiscard(result) {
      const me = currentState.players[MY_PLAYER_INDEX];
      if (me.hand.length === 0) { finishTurn(); return; }
      pickButtons("Living Water — choose 1 card from your hand to place on the bottom of the draw pile.",
        me.hand.slice(), c => cardDef(c).name, card => {
          me.hand = me.hand.filter(h => h.uid !== card.uid);
          currentState.drawPile.push(card);
          if (checkWin(currentState, me.id)) { pushSplitState(currentState); return; }
          if (result.extraPlay) promptOptionalPlay(() => finishTurn());
          else finishTurn();
        });
    }
    function panelLoavesAndFishChoose(result) {
      if (result.playable.length === 0) {
        currentState.drawPile.unshift(...shuffle(result.revealed));
        finishTurn();
        return;
      }
      pickButtons("Loaves & Fish — choose a legal card to play immediately.",
        result.playable, c => cardDef(c).name, card => {
          const rest = result.revealed.filter(r => r.uid !== card.uid);
          currentState.drawPile.unshift(...shuffle(rest));
          playExtraCard(card, handleEffectResult);
        });
    }
    function promptMustardSeedCard(remaining) {
      if (remaining <= 0) { finishTurn(); return; }
      const me = currentState.players[MY_PLAYER_INDEX];
      const legalCards = me.hand.filter(c => canPlayCard(c, currentState, me.id));
      if (legalCards.length === 0) {
        showActionPanel(`<p>Mustard Seed — no card in your hand can legally be played right now.</p><button id="ms-skip">Continue</button>`);
        el("#ms-skip").onclick = () => promptMustardSeedCard(0);
        return;
      }
      pickButtons(`Mustard Seed — play ${remaining > 1 ? remaining + " additional cards" : "1 additional card"} from your hand.`,
        legalCards, c => cardDef(c).name, card => {
          me.hand = me.hand.filter(h => h.uid !== card.uid);
          pendingAfterCard = () => promptMustardSeedCard(remaining - 1);
          playExtraCard(card, handleEffectResult);
        });
    }
    function panelBigFish(result) {
      pickSuit("The Big Fish — choose the active suit.", suit => {
        currentState.activeSuit = suit;
        if (result.exchange) doExchangeWithDrawPile();
        else finishTurn();
      });
    }
    function doExchangeWithDrawPile() {
      const me = currentState.players[MY_PLAYER_INDEX];
      if (currentState.drawPile.length === 0) { finishTurn(); return; }
      pickButtons("Exchange — choose 1 card from your hand to swap with the top of the draw pile.",
        me.hand.slice(), c => cardDef(c).name, card => {
          const top = currentState.drawPile.shift();
          me.hand = me.hand.filter(h => h.uid !== card.uid);
          me.hand.push(top);
          currentState.drawPile.unshift(card);
          finishTurn();
        });
    }
    function panelBigStorm(result) {
      const me = currentState.players[MY_PLAYER_INDEX];
      const others = currentState.players.filter(p => p.id !== me.id);
      if (result.mode === "single") {
        pickButtons("The Big Storm — choose another player.", others, p => p.name, target => {
          log(`(Simplified) The Big Storm targeted ${target.name} — their discard isn't implemented in online play yet.`);
          finishTurn();
        });
      } else {
        pickButtons("The Big Storm (Blessing) — choose another player. You may discard 1 card.", others, p => p.name, target => {
          promptDiscardSelf(() => {
            log(`(Simplified) The Big Storm targeted ${target.name} — their discard isn't implemented in online play yet.`);
            finishTurn();
          });
        });
      }
    }
    function promptDiscardSelf(onDone) {
      const me = currentState.players[MY_PLAYER_INDEX];
      if (me.hand.length === 0) { onDone(); return; }
      pickButtons("Discard a card (or skip).", me.hand.slice(), c => cardDef(c).name, card => {
        me.hand = me.hand.filter(h => h.uid !== card.uid);
        currentState.discardPile.push(card);
        if (checkWin(currentState, me.id)) { pushSplitState(currentState); return; }
        onDone();
      }, { skipLabel: "Skip", onSkip: onDone });
    }
    function panelEmptyTomb(result) {
      const me = currentState.players[MY_PLAYER_INDEX];
      const belowTop = currentState.discardPile.slice(0, -1);
      if (belowTop.length === 0) { finishTurn(); return; }
      pickButtons("The Empty Tomb — choose any 1 card from the discard pile.",
        belowTop, c => cardDef(c).name, card => {
          currentState.discardPile = currentState.discardPile.filter(d => d.uid !== card.uid);
          if (result.mode === "take") {
            me.hand.push(card);
            if (checkWin(currentState, me.id)) { pushSplitState(currentState); return; }
            finishTurn();
          } else {
            playExtraCard(card, handleEffectResult);
          }
        });
    }
    function panelGoodSamaritan(result) {
      const me = currentState.players[MY_PLAYER_INDEX];
      const others = currentState.players.filter(p => p.id !== me.id);
      pickButtons("The Good Samaritan — choose a player to give a card to.",
        others, p => p.name, target => {
          pickButtons(`Give a card to ${target.name}.`, me.hand.slice(), c => cardDef(c).name, async card => {
            me.hand = me.hand.filter(h => h.uid !== card.uid);
            target.hand.push(card);
            await giveCardTo(latestPublic.seats[currentState.players.indexOf(target)], card);
            if (checkWin(currentState, me.id)) { pushSplitState(currentState); return; }
            if (result.mode === "normal") finishTurn();
            else promptOptionalPlay(() => finishTurn());
          });
        });
    }
    function panelTwoCoins(result) {
      const me = currentState.players[MY_PLAYER_INDEX];
      const others = currentState.players.filter(p => p.id !== me.id);
      pickButtons("Two Coins — choose a player to give a card to.",
        others, p => p.name, target => {
          pickButtons(`Give a card to ${target.name}.`, me.hand.slice(), c => cardDef(c).name, async card => {
            me.hand = me.hand.filter(h => h.uid !== card.uid);
            target.hand.push(card);
            await giveCardTo(latestPublic.seats[currentState.players.indexOf(target)], card);
            if (checkWin(currentState, me.id)) { pushSplitState(currentState); return; }
            if (result.mode === "normal") {
              me.blessings += 1;
              finishTurn();
            } else {
              pickSuit("Choose the active suit.", suit => {
                currentState.activeSuit = suit;
                finishTurn();
              });
            }
          });
        });
    }
    function panelGoodShepherdChoose(result) {
      const me = currentState.players[MY_PLAYER_INDEX];
      if (result.revealed.length === 0) { finishTurn(); return; }
      pickButtons("The Good Shepherd (Blessing) — choose 1 card to put into your hand.",
        result.revealed, c => cardDef(c).name, card => {
          currentState.discardPile = currentState.discardPile.filter(d => d.uid !== card.uid);
          me.hand.push(card);
          if (checkWin(currentState, me.id)) { pushSplitState(currentState); return; }
          finishTurn();
        });
    }
    function panelTreeClimber(result) {
      if (result.revealed.length === 0) { finishTurn(); return; }
      showActionPanel(`
        <p>Tree Climber — looked at: ${result.revealed.map(c => cardDef(c).name).join(", ")}.
        (Reordering is simplified in online play — returned in the order revealed.)</p>
        <button id="tc-confirm">Continue</button>
      `);
      el("#tc-confirm").onclick = () => {
        currentState.drawPile.unshift(...result.revealed);
        finishTurn();
      };
    }
    function panelWalkOnWater(result) {
      const me = currentState.players[MY_PLAYER_INDEX];
      pickButtons("Walk On Water — play any 1 card from your hand, regardless of suit or number.",
        me.hand.slice(), c => cardDef(c).name, card => {
          me.hand = me.hand.filter(h => h.uid !== card.uid);
          if (result.pickNext) pendingAfterCard = () => panelPickNextPlayer();
          playExtraCard(card, handleEffectResult);
        });
    }
    function panelPickNextPlayer() {
      const me = currentState.players[MY_PLAYER_INDEX];
      pickButtons("Walk On Water (Blessing) — pick who plays next.",
        currentState.players, p => p.id === me.id ? `${p.name} (yourself)` : p.name, p => {
          currentState.turnOverrideQueue.push(p.id);
          finishTurn();
        });
    }
    function panelChooseSuit(result) {
      pickSuit("Wisdom — choose the active suit.", suit => {
        currentState.activeSuit = suit;
        currentState.activeNumber = null;
        finishTurn();
      });
    }
    function panelRedeemedChoose(result) {
      const me = currentState.players[MY_PLAYER_INDEX];
      const belowTop = currentState.discardPile.slice(0, -1);
      if (belowTop.length === 0) { finishMiracleTurn(); return; }
      pickButtons("Redeemed — return 1 card from the discard pile to your hand.",
        belowTop, c => cardDef(c).name, card => {
          currentState.discardPile = currentState.discardPile.filter(d => d.uid !== card.uid);
          me.hand.push(card);
          finishMiracleTurn();
        });
    }
    function panelOverflow(result) {
      const me = currentState.players[MY_PLAYER_INDEX];
      const selected = new Set();
      function draw() {
        const panel = el("#online-action-panel");
        panel.innerHTML = `<p>Overflow — select any number of cards to discard, then draw that many.</p>`;
        const row = document.createElement("div");
        row.className = "pick-row";
        me.hand.forEach(c => {
          const cardEl = renderCard(c, { size: "small", legal: selected.has(c.uid) });
          cardEl.addEventListener("click", () => {
            if (selected.has(c.uid)) selected.delete(c.uid); else selected.add(c.uid);
            draw();
          });
          row.appendChild(cardEl);
        });
        panel.appendChild(row);
        const confirmBtn = document.createElement("button");
        confirmBtn.textContent = `Confirm (${selected.size} selected)`;
        confirmBtn.addEventListener("click", () => {
          const toDiscard = me.hand.filter(c => selected.has(c.uid));
          me.hand = me.hand.filter(c => !selected.has(c.uid));
          currentState.discardPile.push(...toDiscard);
          drawCard(currentState, me.id, toDiscard.length);
          if (checkWin(currentState, me.id)) { pushSplitState(currentState); return; }
          finishMiracleTurn();
        });
        panel.appendChild(confirmBtn);
        panel.style.display = "block";
        el("#online-player-hand").style.display = "none";
        el("#online-draw-btn").style.display = "none";
      }
      draw();
    }
    function promptOptionalPlay(onDone) {
      const me = currentState.players[MY_PLAYER_INDEX];
      const legalCards = me.hand.filter(c => canPlayCard(c, currentState, me.id) || canPlayCardIgnoringTurn(c, currentState));
      if (legalCards.length === 0) { onDone(); return; }
      pickButtons(`${me.name} may play 1 card (or skip).`,
        legalCards, c => cardDef(c).name, card => {
          me.hand = me.hand.filter(h => h.uid !== card.uid);
          playExtraCard(card, handleEffectResult);
        }, { skipLabel: "Skip", onSkip: onDone });
    }

    function onCardClick(card) {
      const me = currentState.players[MY_PLAYER_INDEX];
      const def = cardDef(card);
      if (def.type === "number") {
        const result = playNumberCard(currentState, me.id, card.uid);
        if (result.won) { pushSplitState(currentState); return; }
        finishTurn();
        return;
      }
      if (def.type === "action") {
        if (me.blessings >= def.blessingCost && def.blessingCost > 0) {
          showActionPanel(`
            <p><b>${def.name}</b></p><p class="verse">${def.verse}</p>
            <button id="choice-play">Play<br><small>${def.playText}</small></button>
            <button id="choice-blessing">Spend ${def.blessingCost} Blessing${def.blessingCost > 1 ? "s" : ""}<br><small>${def.blessingText}</small></button>
          `);
          el("#choice-play").onclick = () => handleEffectResult(playActionCard(currentState, me.id, card.uid, false));
          el("#choice-blessing").onclick = () => handleEffectResult(playActionCard(currentState, me.id, card.uid, true));
        } else {
          handleEffectResult(playActionCard(currentState, me.id, card.uid, false));
        }
        return;
      }
      if (def.type === "miracle") {
        handleEffectResult(playMiracleCard(currentState, me.id, card.uid));
      }
    }

    onSnapshot(publicRef, { includeMetadataChanges: true }, snap => {
      if (snap.metadata.hasPendingWrites) return;
      latestPublic = snap.data();
      tryRender();
    }, err => { log(`Public doc error: ${err.code || ""} ${err.message}`); });

    onSnapshot(myHandRef, { includeMetadataChanges: true }, snap => {
      if (snap.metadata.hasPendingWrites) return;
      latestMyHand = snap.exists() ? (snap.data().hand || []) : [];
      tryRender();
    }, err => { log(`Hand doc error: ${err.code || ""} ${err.message}`); });

    function tryRender() {
      if (!latestPublic) return;
      if (latestPublic.status === "waiting") {
        const joined = latestPublic.seats.filter(Boolean).length;
        const total = latestPublic.seats.length;
        el("#online-hint-text").textContent = `Waiting for players… (${joined} of ${total}) — share the code "${roomId}"`;
        return;
      }
      if (latestMyHand === null) return;
      const state = buildWorkingState();
      if (!state) return;
      currentState = state;
      render(state);
    }

    function render(state) {
      actionPending = false;
      hideActionPanel();

      if (state.status === "finished") {
        const winner = state.players[state.players.findIndex(p => p.id === state.winnerId)];
        el("#online-hint-text").textContent = `${winner.name} wins! (Turn ${state.turnCount})`;
        el("#online-player-hand").innerHTML = "";
        el("#online-draw-btn").disabled = true;
        return;
      }

      const me = state.players[MY_PLAYER_INDEX];
      const current = state.players[state.currentPlayerIndex];
      const isMyTurn = current.id === me.id;

      el("#online-turn-count").textContent = state.turnCount;
      el("#online-room-code-tag").innerHTML = `<svg class="tag-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="13" height="17" rx="2.5" transform="rotate(-8 9.5 15.5)"/><rect x="8" y="3" width="13" height="17" rx="2.5"/></svg> ${current.name}${isMyTurn ? " (you)" : ""}`;
      el("#online-active-suit-badge").textContent = state.activeSuit || "—";
      el("#online-active-number-badge").textContent = state.activeNumber ?? "—";
      el("#online-my-blessings").textContent = me.blessings;

      const others = state.players.filter((p, i) => i !== MY_PLAYER_INDEX);
      el("#online-opponents-info").textContent = others.map(p => `${p.name}: ${p.hand.length} cards`).join("  ·  ");

      const badgeEl = el("#online-status-badge");
      if (state.actionLock.active) {
        const owner = state.players.find(p => p.id === state.actionLock.ownerPlayerId);
        badgeEl.style.display = "inline-block";
        badgeEl.textContent = `No Action cards until ${owner.name}'s next turn`;
      } else if (state.freePlayPlayerId === me.id) {
        badgeEl.style.display = "inline-block";
        badgeEl.textContent = "Free play — any card in your hand may be played";
      } else {
        badgeEl.style.display = "none";
      }

      el("#online-hint-text").textContent = isMyTurn ? "Tap a highlighted card to play it." : `Waiting on ${current.name}…`;

      const discardSlot = el("#online-discard-slot");
      discardSlot.innerHTML = "";
      const topDiscard = state.discardPile[state.discardPile.length - 1];
      if (topDiscard) discardSlot.appendChild(renderCard(topDiscard, { size: "large" }));

      const handEl = el("#online-player-hand");
      handEl.innerHTML = "";
      me.hand.forEach(card => {
        const legal = canPlayCard(card, state, me.id);
        const cardEl = renderCard(card, { size: "medium", legal });
        cardEl.addEventListener("click", () => {
          if (actionPending) return;
          if (!legal) return;
          lockControls();
          onCardClick(card);
        });
        handEl.appendChild(cardEl);
      });

      const anyLegal = me.hand.some(c => canPlayCard(c, state, me.id));
      el("#online-draw-btn").disabled = !isMyTurn || anyLegal;
    }

    el("#online-draw-btn").addEventListener("click", () => {
      if (!currentState || actionPending) return;
      lockControls();
      const me = currentState.players[MY_PLAYER_INDEX];
      const drawn = drawCard(currentState, me.id, 1);
      currentState.freePlayPlayerId = null;
      const drawnCard = drawn[0];
      if (drawnCard && canPlayCard(drawnCard, currentState, me.id)) {
        showActionPanel(`
          <p>You drew <b>${cardDef(drawnCard).name}</b> — it's playable right now.</p>
          <button id="play-drawn">Play it</button>
          <button id="keep-drawn">Keep it in hand</button>
        `);
        el("#play-drawn").onclick = () => onCardClick(drawnCard);
        el("#keep-drawn").onclick = () => finishTurn();
      } else {
        finishTurn();
      }
    });

    el("#online-quit-btn").addEventListener("click", () => {
      if (confirm("Leave this online game and return home?")) {
        showScreen("home-screen");
      }
    });
  }
}
