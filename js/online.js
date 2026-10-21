// ============================================================
// Pass It On — Online multiplayer (Firebase/Firestore)
//
// Online games run on the exact same game screen and effect modals
// as local pass-and-play (ui.js). This file:
//   - runs the lobby: names, hosting, joining, the waiting room,
//     rejoining, and "Play Again" with the same group;
//   - keeps a working copy of the game for this device (your real
//     hand + face-down placeholders for everyone else's), and
//     installs an adapter in ui.js so a finished move gets saved to
//     Firestore instead of localStorage;
//   - saves every move in a Firestore transaction.
//
// Data layout (unchanged from the hidden-hands tests):
//   games/{CODE}              public state: piles, turn, blessings,
//                             hand COUNTS, names, seats, log
//   games/{CODE}/hands/{uid}  one player's real hand — Security
//                             Rules let only that player read it
//
// Why transactions: the public doc carries a `rev` counter. A move
// is computed locally from rev N and saved only if the doc is still
// at rev N. The one thing that can legitimately land in between is
// someone playing Favor/Strength out of turn — in that case the
// move is "rebased" onto the newer state (their card, Blessing, and
// hand count are kept alongside yours) instead of overwriting it.
// Anything else unexpected cancels the move and refreshes the board
// rather than losing or duplicating cards.
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot, runTransaction, arrayUnion
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

const $ = sel => document.querySelector(sel);
const ROOM_KEY = "passiton-online-room";
const NAME_KEY = "passiton-name";
const PLACEHOLDER = "ph-";
const LOG_LIMIT = 150;
const META_KEYS = ["seats", "names", "hostUid", "playerUids", "rev", "createdAt", "playerNames"];

const clone = obj => JSON.parse(JSON.stringify(obj));
function store(key, value) {
  try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch (e) {}
}
function load(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function debug(msg) { console.log(`[online] ${msg}`); }
function lobbyStatus(msg) { $("#online-lobby-status").textContent = msg || ""; }

class MoveConflict extends Error {}

function generateRoomCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ---- Public/private split ---------------------------------------
function metaFrom(data) {
  return {
    seats: data.seats,
    names: data.names || data.seats.map((_, i) => `Player ${i + 1}`),
    hostUid: data.hostUid || null,
    playerUids: (data.seats || []).filter(Boolean),
    rev: data.rev || 0,
    createdAt: data.createdAt || Date.now()
  };
}

function toPublic(state, meta) {
  const { players, ...rest } = clone(state);
  rest.gameLog = (rest.gameLog || []).slice(-LOG_LIMIT);
  rest.prompt = rest.prompt || null;
  rest.turnOverrideQueue = rest.turnOverrideQueue || [];
  return {
    ...rest,
    players: players.map(p => ({
      id: p.id, name: p.name, blessings: p.blessings, connected: true, handCount: p.hand.length
    })),
    ...meta
  };
}

// Deals a fresh game into seats (inside a transaction). Used both
// when the last seat fills and for "Play Again".
function dealInto(tx, refs, latestMeta, names) {
  const fresh = createGameState(names);
  fresh.gameId = `g-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const rev = (latestMeta.rev || 0) + 1;
  latestMeta.seats.forEach((uid, i) => {
    tx.set(refs.hand(uid), { hand: fresh.players[i].hand, gameId: fresh.gameId, rev });
  });
  tx.set(refs.pub, toPublic(fresh, { ...latestMeta, names, rev }));
  return rev;
}

if (!window.firebaseConfig || window.firebaseConfig.apiKey.startsWith("PASTE-")) {
  $("#play-online-btn").addEventListener("click", () => alert("Online play isn't configured on this copy of the app."));
  $("#rejoin-online-btn").style.display = "none";
} else {
  const app = initializeApp(window.firebaseConfig);
  const db = getFirestore(app);
  const auth = getAuth(app);
  let myUid = null;
  const authReady = new Promise(resolve => {
    onAuthStateChanged(auth, user => { if (user) { myUid = user.uid; resolve(); } });
  });
  signInAnonymously(auth).catch(err => {
    console.warn("Online sign-in failed:", err);
    lobbyStatus("Couldn't connect to the game server — check your internet connection.");
  });

  const refsFor = code => ({
    pub: doc(db, "games", code),
    hand: uid => doc(db, "games", code, "hands", uid)
  });

  // ---- Lobby ----------------------------------------------------
  function myName() {
    const typed = $("#online-name").value.replace(/[<>&"']/g, "").trim().slice(0, 16);
    if (typed) store(NAME_KEY, typed);
    return typed;
  }
  function requireName() {
    const name = myName();
    if (!name) {
      lobbyStatus("Enter your name first.");
      $("#online-name").focus();
      return null;
    }
    return name;
  }
  function openLobby() {
    showScreen("online-lobby-screen");
    $("#online-name").value = load(NAME_KEY) || "";
    $("#online-join-panel").style.display = "block";
    $("#online-waiting").style.display = "none";
    $("#online-host-btn").style.display = "block";
    $("#online-count-picker").style.display = "none";
    lobbyStatus("");
  }

  $("#play-online-btn").addEventListener("click", openLobby);
  $("#online-back-btn").addEventListener("click", () => {
    if (ROOM) leaveRoom(false);
    else { showScreen("home-screen"); initHomeScreen(); }
  });
  $("#online-host-btn").addEventListener("click", () => {
    if (!requireName()) return;
    $("#online-host-btn").style.display = "none";
    $("#online-count-picker").style.display = "block";
    lobbyStatus("How many players?");
  });
  document.querySelectorAll("#online-count-row .count-btn").forEach(btn => {
    btn.addEventListener("click", () => hostRoom(parseInt(btn.dataset.count, 10)));
  });
  $("#online-join-btn").addEventListener("click", () => {
    const code = $("#online-join-code").value.trim().toUpperCase();
    if (!code) { lobbyStatus("Enter the 4-letter room code."); return; }
    if (!requireName()) return;
    joinRoom(code);
  });
  $("#online-join-code").addEventListener("keydown", e => { if (e.key === "Enter") $("#online-join-btn").click(); });
  $("#rejoin-online-btn").addEventListener("click", () => {
    const code = load(ROOM_KEY);
    if (!code) return;
    openLobby();
    joinRoom(code, { rejoin: true });
  });
  $("#online-copy-code").addEventListener("click", () => {
    if (!ROOM) return;
    const text = `Join my Pass It On game — room code ${ROOM.code}\n${location.href.split("#")[0]}`;
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => lobbyStatus("Invite copied — paste it to your group."));
  });

  async function hostRoom(maxPlayers) {
    const name = requireName();
    if (!name) return;
    lobbyStatus("Creating room…");
    try {
      await authReady;
      let code = null;
      for (let tries = 0; tries < 6 && !code; tries++) {
        const candidate = generateRoomCode();
        const snap = await getDoc(refsFor(candidate).pub);
        if (!snap.exists() || snap.data().status === "finished") code = candidate;
      }
      if (!code) throw new Error("Couldn't find a free room code — try again.");
      const seats = new Array(maxPlayers).fill(null);
      const names = seats.map((_, i) => `Player ${i + 1}`);
      seats[0] = myUid;
      names[0] = name;
      await setDoc(refsFor(code).pub, {
        status: "waiting", seats, names, hostUid: myUid, playerUids: [myUid], rev: 0, createdAt: Date.now()
      });
      enterRoom(code);
    } catch (err) {
      lobbyStatus(`Error: ${err.message}`);
    }
  }

  async function joinRoom(code, opts = {}) {
    lobbyStatus(opts.rejoin ? `Rejoining ${code}…` : "Joining…");
    try {
      await authReady;
      const name = myName() || load(NAME_KEY) || "";
      const refs = refsFor(code);
      await runTransaction(db, async tx => {
        const snap = await tx.get(refs.pub);
        if (!snap.exists()) throw new Error("Room not found — check the code.");
        const data = snap.data();
        const meta = metaFrom(data);
        const seats = meta.seats.slice();
        const names = meta.names.slice();
        let idx = seats.indexOf(myUid);
        if (idx === -1) {
          if (data.status !== "waiting") throw new Error("That game has already started.");
          idx = seats.indexOf(null);
          if (idx === -1) throw new Error("This room is already full.");
          seats[idx] = myUid;
        }
        if (data.status === "waiting" && name) names[idx] = name;
        const newMeta = { ...meta, seats, names, playerUids: seats.filter(Boolean) };
        if (data.status === "waiting" && !seats.includes(null)) {
          dealInto(tx, refs, newMeta, names);
        } else if (data.status === "waiting") {
          tx.set(refs.pub, { ...data, ...newMeta });
        }
      });
      enterRoom(code);
    } catch (err) {
      if (opts.rejoin && /not found/i.test(err.message)) store(ROOM_KEY, null);
      lobbyStatus(err.message);
    }
  }

  // ---- The room ---------------------------------------------------
  // One room at a time. Everything the adapter needs lives here.
  let ROOM = null;

  function enterRoom(code) {
    if (ROOM) stopListening();
    store(ROOM_KEY, code);
    const refs = refsFor(code);
    ROOM = {
      code, refs,
      latestPublic: null, latestHand: null,
      myIdx: -1,
      inMove: false, saving: false,
      moveBase: null, moveBasePub: null, moveBaseRev: 0,
      expectRev: 0, myHandRev: 0,
      unsubs: []
    };
    const room = ROOM;
    room.unsubs.push(onSnapshot(refs.pub, { includeMetadataChanges: true }, snap => {
      if (room !== ROOM || snap.metadata.hasPendingWrites) return;
      if (!snap.exists()) { lobbyStatus("That room no longer exists."); store(ROOM_KEY, null); return; }
      room.latestPublic = snap.data();
      onRemoteChange();
    }, err => debug(`public doc error: ${err.code} ${err.message}`)));
    room.unsubs.push(onSnapshot(refs.hand(myUid), { includeMetadataChanges: true }, snap => {
      if (room !== ROOM || snap.metadata.hasPendingWrites) return;
      room.latestHand = snap.exists() ? snap.data() : null;
      onRemoteChange();
    }, err => debug(`hand doc error: ${err.code} ${err.message}`)));
  }

  function stopListening() {
    if (!ROOM) return;
    ROOM.unsubs.forEach(u => u());
    ROOM = null;
  }

  function leaveRoom(forget) {
    stopListening();
    setOnlineAdapter(null);
    setGame(null);
    closeModal();
    if (forget) store(ROOM_KEY, null);
    showScreen("home-screen");
    initHomeScreen();
  }

  function onRemoteChange() {
    const pub = ROOM.latestPublic;
    if (!pub) return;
    if (pub.status === "waiting") { renderWaitingRoom(pub); return; }
    // Hold remote updates while this device is mid-move or saving;
    // the board catches up as soon as the move is saved.
    if (ROOM.inMove || ROOM.saving) return;
    renderFromLatest();
  }

  function renderWaitingRoom(pub) {
    if (!document.querySelector("#online-lobby-screen").classList.contains("active")) showScreen("online-lobby-screen");
    $("#online-join-panel").style.display = "none";
    $("#online-waiting").style.display = "block";
    $("#online-waiting-code").textContent = ROOM.code;
    const meta = metaFrom(pub);
    const joined = meta.seats.filter(Boolean).length;
    $("#online-seat-list").innerHTML = meta.seats.map((uid, i) => {
      const label = uid ? meta.names[i] : "Waiting…";
      const tags = [uid === meta.hostUid ? "host" : "", uid === myUid ? "you" : ""].filter(Boolean).join(", ");
      return `<li class="${uid ? "filled" : "open"}"><span class="seat-num">${i + 1}</span>${escapeHtml(label)}${tags ? ` <em>(${tags})</em>` : ""}</li>`;
    }).join("");
    lobbyStatus(`${joined} of ${meta.seats.length} joined — the cards are dealt when every seat is full.`);
  }

  function readyToRender() {
    const pub = ROOM.latestPublic, hand = ROOM.latestHand;
    if (!pub || !hand || pub.status === "waiting") return false;
    if (hand.gameId && pub.gameId && hand.gameId !== pub.gameId) return false; // new deal still arriving
    if ((pub.rev || 0) < ROOM.expectRev) return false; // our own save hasn't echoed back yet
    if ((hand.rev || 0) < ROOM.myHandRev) return false;
    // The public doc and your hand doc arrive as separate snapshots.
    // Wait until they agree (e.g. a card just given to you has shown
    // up in your hand), so a move is never built on a stale hand.
    const idx = pub.seats.indexOf(myUid);
    if (idx !== -1 && pub.players && pub.players[idx] && pub.players[idx].handCount !== (hand.hand || []).length) return false;
    return true;
  }

  function buildWorkingState() {
    const pub = ROOM.latestPublic;
    const state = clone(pub);
    META_KEYS.forEach(k => delete state[k]);
    ROOM.myIdx = pub.seats.indexOf(myUid);
    state.players = pub.players.map((p, i) => ({
      id: p.id, name: p.name, blessings: p.blessings, connected: true,
      hand: i === ROOM.myIdx
        ? clone(ROOM.latestHand.hand || [])
        : Array.from({ length: p.handCount }, (_, k) => ({ uid: `${PLACEHOLDER}${i}-${k}`, defId: "faith-1" }))
    }));
    state.prompt = pub.prompt || null;
    state.turnOverrideQueue = state.turnOverrideQueue || [];
    state.gameLog = state.gameLog || [];
    return state;
  }

  function renderFromLatest() {
    if (!ROOM || !readyToRender()) return;
    const state = buildWorkingState();
    if (ROOM.myIdx === -1) { leaveRoom(true); alert("You're not seated in that game."); return; }
    setGame(state);
    setOnlineAdapter(adapter);
    const prompt = state.prompt;
    const promptForMe = state.status === "playing" && prompt && prompt.targetId === state.players[ROOM.myIdx].id;
    showGameOrResults(); // also closes any open modal
    if (promptForMe) openStormPrompt(prompt);
  }

  // ---- Saving a move ------------------------------------------------
  function beginMove() {
    ROOM.inMove = true;
    ROOM.moveBase = clone(getGame());
    ROOM.moveBaseRev = ROOM.latestPublic.rev || 0;
    ROOM.moveBasePub = toPublic(ROOM.moveBase, metaFrom(ROOM.latestPublic));
  }

  function abortMove() {
    ROOM.inMove = false;
    closeModal();
    renderFromLatest();
  }

  // Re-applies this move on top of a newer public state that picked
  // up an out-of-turn Miracle while the move was being made.
  function rebaseMove(mineGame, minePub, latest) {
    const base = ROOM.moveBasePub;
    const sameTurn = latest.status === "playing"
      && latest.gameId === base.gameId
      && latest.currentPlayerIndex === base.currentPlayerIndex
      && latest.turnCount === base.turnCount
      && !!latest.prompt === !!base.prompt;
    if (!sameTurn) throw new MoveConflict("The game changed before your move was saved.");

    debug("rebasing move onto a newer state");
    const out = clone(minePub);
    out.players = minePub.players.map((p, j) => ({
      ...p,
      handCount: j === ROOM.myIdx ? p.handCount
        : latest.players[j].handCount + (p.handCount - base.players[j].handCount),
      blessings: latest.players[j].blessings + (p.blessings - base.players[j].blessings)
    }));

    const baseUids = new Set(base.discardPile.map(c => c.uid));
    const mineUids = new Set(out.discardPile.map(c => c.uid));
    const extra = latest.discardPile.filter(c => !baseUids.has(c.uid) && !mineUids.has(c.uid));
    if (extra.length) {
      const baseTop = base.discardPile[base.discardPile.length - 1];
      const mineTop = out.discardPile[out.discardPile.length - 1];
      if (!mineTop || (baseTop && mineTop.uid === baseTop.uid)) out.discardPile.push(...extra);
      else out.discardPile.splice(out.discardPile.length - 1, 0, ...extra);
    }

    const myLines = mineGame.gameLog.slice(ROOM.moveBase.gameLog.length);
    out.gameLog = (latest.gameLog || []).concat(myLines).slice(-LOG_LIMIT);
    return out;
  }

  async function commitMove() {
    const room = ROOM;
    const mine = getGame();
    room.inMove = false;
    room.saving = true;
    closeModal();
    showGameOrResults(); // show the result right away, marked "Saving…"

    const myHand = clone(mine.players[room.myIdx].hand);
    const gifts = [];
    mine.players.forEach((p, j) => {
      if (j === room.myIdx) return;
      p.hand.forEach(c => { if (!c.uid.startsWith(PLACEHOLDER)) gifts.push({ uid: room.latestPublic.seats[j], card: c }); });
    });

    let newRev = 0;
    try {
      await runTransaction(db, async tx => {
        const snap = await tx.get(room.refs.pub);
        const handSnap = await tx.get(room.refs.hand(myUid));
        const latest = snap.data();
        const savedHand = ((handSnap.data() || {}).hand || []).map(c => c.uid).sort().join();
        const baseHand = room.moveBase.players[room.myIdx].hand.map(c => c.uid).sort().join();
        if (savedHand !== baseHand) throw new MoveConflict("Your hand changed before your move was saved.");
        let pub = toPublic(mine, metaFrom(latest));
        if ((latest.rev || 0) !== room.moveBaseRev) pub = rebaseMove(mine, pub, latest);
        newRev = (latest.rev || 0) + 1;
        pub.rev = newRev;
        tx.set(room.refs.pub, pub);
        tx.set(room.refs.hand(myUid), { hand: myHand, gameId: mine.gameId, rev: newRev });
        gifts.forEach(g => tx.update(room.refs.hand(g.uid), { hand: arrayUnion(g.card) }));
      });
      room.expectRev = newRev;
      room.myHandRev = newRev;
    } catch (err) {
      debug(`save failed: ${err.message}`);
      alert(err instanceof MoveConflict
        ? "Someone else's move landed first, so yours wasn't saved — the board has been refreshed."
        : `Couldn't save that move (${err.message}). The board has been refreshed.`);
    }
    if (room !== ROOM) return;
    room.saving = false;
    renderFromLatest();
  }

  // ---- Out-of-turn Miracles (Favor, Strength) -----------------------
  // Applied directly to the latest state inside the transaction, so
  // it never depends on what this device last saw.
  async function playReaction(card) {
    const room = ROOM;
    room.saving = true;
    renderGameScreen();
    let newRev = 0;
    try {
      await runTransaction(db, async tx => {
        const snap = await tx.get(room.refs.pub);
        const handSnap = await tx.get(room.refs.hand(myUid));
        const latest = snap.data();
        const hand = (handSnap.data() || {}).hand || [];
        if (latest.status !== "playing" || latest.prompt) throw new MoveConflict("That can't be played right now.");
        if (latest.seats[latest.currentPlayerIndex] === myUid) throw new MoveConflict("It's your turn now — play it as normal.");
        if (!hand.some(c => c.uid === card.uid)) throw new Error("That card isn't in your hand anymore.");
        const def = cardDef(card);
        if (def.type !== "miracle" || def.timing !== "any_time") throw new Error("Only Favor and Strength can be played out of turn.");

        const newHand = hand.filter(c => c.uid !== card.uid);
        const pub = clone(latest);
        const me = pub.players[room.myIdx];
        pub.gameLog = pub.gameLog || [];
        pub.discardPile.push(card);
        me.handCount = newHand.length;
        pub.gameLog.push(`${me.name} played ${def.name} (Miracle) out of turn.`);
        if (def.effect.type === "gain_blessing") {
          me.blessings += def.effect.amount;
          pub.gameLog.push(`${me.name} gained ${def.effect.amount} Blessing from ${def.name}.`);
        }
        if (newHand.length === 0) {
          pub.status = "finished";
          pub.winnerId = me.id;
          pub.gameLog.push(`${me.name} wins!`);
        }
        pub.gameLog = pub.gameLog.slice(-LOG_LIMIT);
        newRev = (latest.rev || 0) + 1;
        pub.rev = newRev;
        tx.set(room.refs.pub, pub);
        tx.set(room.refs.hand(myUid), { hand: newHand, gameId: latest.gameId, rev: newRev });
      });
      room.expectRev = newRev;
      room.myHandRev = newRev;
    } catch (err) {
      // Lost a race (e.g. it just became your turn) — the refreshed
      // board explains itself, so only surface real problems.
      if (!(err instanceof MoveConflict)) alert(err.message);
    }
    if (room !== ROOM) return;
    room.saving = false;
    renderFromLatest();
  }

  // ---- The Big Storm: the target's discard ---------------------------
  function openStormPrompt(prompt) {
    const game = getGame();
    const me = game.players[ROOM.myIdx];
    const by = findPlayer(game, prompt.byId);
    openModal(`<h3>The Big Storm</h3>
      <p>${escapeHtml(by ? by.name : "Someone")} chose you — you may discard 1 card.</p>
      <div class="reveal-row" id="storm-slot"></div>
      <button class="btn" id="storm-skip">Keep my cards</button>`);
    const slot = $("#storm-slot");
    me.hand.forEach(card => {
      const c = renderCard(card, { size: "small" });
      c.classList.add("selectable");
      c.addEventListener("click", () => resolveStormPrompt(card));
      slot.appendChild(c);
    });
    $("#storm-skip").addEventListener("click", () => resolveStormPrompt(null));
  }

  async function resolveStormPrompt(card) {
    const room = ROOM;
    closeModal();
    room.saving = true;
    renderGameScreen();
    let newRev = 0;
    try {
      await runTransaction(db, async tx => {
        const snap = await tx.get(room.refs.pub);
        const handSnap = await tx.get(room.refs.hand(myUid));
        const latest = snap.data();
        const hand = (handSnap.data() || {}).hand || [];
        const me = latest.players[room.myIdx];
        if (!latest.prompt || latest.prompt.targetId !== me.id) throw new Error("That prompt has already been answered.");
        const pub = clone(latest);
        const pme = pub.players[room.myIdx];
        pub.gameLog = pub.gameLog || [];
        let newHand = hand;
        if (card && hand.some(c => c.uid === card.uid)) {
          newHand = hand.filter(c => c.uid !== card.uid);
          // Slipped under the top card: it's a discard, not a play,
          // so the active suit/number stay as they were.
          pub.discardPile.splice(Math.max(0, pub.discardPile.length - 1), 0, card);
          pub.gameLog.push(`${pme.name} discarded a card (The Big Storm).`);
        } else {
          pub.gameLog.push(`${pme.name} kept their cards (The Big Storm).`);
        }
        pme.handCount = newHand.length;
        pub.prompt = null;
        if (newHand.length === 0) {
          pub.status = "finished";
          pub.winnerId = pme.id;
          pub.gameLog.push(`${pme.name} wins!`);
        }
        pub.gameLog = pub.gameLog.slice(-LOG_LIMIT);
        newRev = (latest.rev || 0) + 1;
        pub.rev = newRev;
        tx.set(room.refs.pub, pub);
        tx.set(room.refs.hand(myUid), { hand: newHand, gameId: latest.gameId, rev: newRev });
      });
      room.expectRev = newRev;
      room.myHandRev = newRev;
    } catch (err) {
      alert(err.message);
    }
    if (room !== ROOM) return;
    room.saving = false;
    renderFromLatest();
  }

  // ---- Play Again -----------------------------------------------------
  async function rematch() {
    const room = ROOM;
    room.saving = true;
    try {
      await runTransaction(db, async tx => {
        const snap = await tx.get(room.refs.pub);
        const latest = snap.data();
        if (latest.status !== "finished") return; // someone else already started it
        const meta = metaFrom(latest);
        dealInto(tx, room.refs, meta, meta.names);
      });
    } catch (err) {
      alert(`Couldn't start a new game: ${err.message}`);
    }
    if (room !== ROOM) return;
    room.saving = false;
    renderFromLatest();
  }

  // Handy when testing: window.__passItOnOnline() in the console.
  window.__passItOnOnline = () => ROOM && {
    code: ROOM.code, myIdx: ROOM.myIdx, inMove: ROOM.inMove, saving: ROOM.saving,
    rev: ROOM.latestPublic && ROOM.latestPublic.rev, handRev: ROOM.latestHand && ROOM.latestHand.rev,
    expectRev: ROOM.expectRev, myHandRev: ROOM.myHandRev, ready: readyToRender()
  };

  // ---- Adapter used by ui.js -------------------------------------------
  const adapter = {
    get roomId() { return ROOM ? ROOM.code : ""; },
    myIndex: () => ROOM.myIdx,
    canAct: () => {
      if (!ROOM || ROOM.saving || ROOM.inMove) return false;
      const g = getGame();
      return !!g && g.status === "playing" && !g.prompt;
    },
    beginMove,
    abortMove,
    settle: () => {
      if (!ROOM) return;
      if (ROOM.inMove) commitMove();
      else renderFromLatest();
    },
    react: card => playReaction(card),
    rematch: () => rematch(),
    leave: forget => leaveRoom(forget)
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}
