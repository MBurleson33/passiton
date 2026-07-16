# Pass It On — Digital Prototype

A mobile-first Progressive Web App for local pass-and-play testing of
*Pass It On*. Plain HTML/CSS/JS — no build step, so you can drop the
folder straight into a GitHub Pages repo and it works.

## Quick start

1. Copy everything in this folder into the root of your `passiton`
   repo (so `index.html` sits at the repo root, matching your Pages
   settings).
2. Commit and push. GitHub Pages will serve it directly.
3. To test locally first: `cd` into this folder and run any static
   server, e.g. `python3 -m http.server 8080`, then open
   `http://localhost:8080`.

## What's implemented (Phases 1–3 of the brief)

- 2–6 player local pass-and-play, staying on one continuous game
  screen (no interstitial between turns) — opponent hands are still
  hidden as counts only.
- Full 108-card deck: 72 Number cards, 24 Action cards, 12 Miracle
  cards, all using your real artwork.
- Suit/number matching, draw pile, discard pile with reshuffle-when-
  empty, Blessing tokens (each player starts with 1), win detection
  and a results screen.
- All 12 Action cards from your printed art, each with its normal
  **and** Blessing ability, exactly as written on the cards.
- All 6 Miracle cards, including Peace's Action-card lock, Strength's
  out-of-turn play, and the Miracle free-play chain (see below).
- Hold-to-zoom on any card for a full-size view with its rules text;
  desktop mouse-hover shows the same info for Action/Miracle cards
  without needing to click.
- Save/resume via `localStorage`, offline support via a service
  worker that caches the app shell and card art.

## Miracle free-play rule

Per your rule update: Miracle cards don't establish an active suit or
number. Once a Miracle resolves, the *next* player gets a free play —
they may play any card from their hand regardless of the active suit
or number. If they play a Number or Action card, that establishes the
new active suit/number as normal. If they play another Miracle, the
free play chains to the player after them. Drawing instead of playing
expires the free play immediately — the drawn card is then judged
under normal matching rules. Effect-based restrictions still apply
during a free play (e.g. Peace's Action-card lock still blocks Action
cards even for the free-play player). This lives in
`endTurnWithFreePlay()` and `canPlayCard()` in `js/engine.js`.

## Decisions made to get a testable prototype (flag these if you want them different)

- **"Grace"** — the original brief's placeholder card — is now the
  **Redeemed** card in your final art, with the mechanic "return 1
  card from the discard pile to your hand." Implemented as such.
- **Strength** ("Play on any card, at any time. Continue play after
  you.") is implemented as: once the current effect finishes
  resolving, the turn passes to whoever played Strength, out of the
  normal player order (composes with the free-play rule above — the
  Strength player also gets the free play). If that's not what
  "continue play after you" meant on your table, this is the one
  piece of logic to revisit first — it's isolated in
  `resolveMiracleEffect()` / `strengthQueue` in `js/engine.js`.
- **Wisdom** still lets the player choose a suit as printed, but
  since the very next player gets an unrestricted free play right
  after, that choice mostly only matters if the free-play player
  chooses to draw instead of playing (see the free-play rule above).
- **Number card art** points at your real files (`cards/Faith - 1.jpg`
  through `cards/Word - 6.jpg`, etc.). If a specific file is ever
  missing or misnamed, the card falls back to a suit-colored text
  card automatically rather than showing blank.
- A few Action-card effects needed a small ruling to be playable at
  all (not spelled out on the cards): if none of Five Stones' or
  Loaves & Fish's revealed cards are legal, the prototype lets you
  keep one card in hand (this is the "needs confirmation" item from
  section 11 of the brief — easy to flip to "return all five" in
  `resolveActionEffect`/`modalFiveStonesPlay` if you'd rather). Any
  modal that asks you to choose a card now also has a fallback (an
  auto-skip or a "Continue" button) for the edge case where nothing
  legal is actually available to choose, so you can't get stuck on
  screen.
- "Announcing last card" and a maximum Blessing cap are not
  implemented (per the brief, still open decisions) — no penalty or
  cap exists yet.

## Project structure

```
index.html
css/style.css
js/cards.js      — all card data (edit here to change card text/effects)
js/engine.js      — game rules, no DOM access
js/ui.js          — rendering + all the effect-resolution modals
js/app.js         — service worker registration
manifest.webmanifest, service-worker.js
cards/            — card artwork (filenames match your repo exactly, e.g. "Action - Five Stones.jpg")
icons/            — generated placeholder app icons (swap for your logo any time)
```

## Next steps toward the brief's later phases

- Swap the placeholder icons in `icons/` for your circular Pass It On
  logo.
- Add real Number card art (see above).
- Sound, animations, a card library/rulebook screen, and online
  multiplayer are all deliberately out of scope for this prototype,
  per the brief's phased build plan.
