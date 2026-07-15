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

- 2–6 player local pass-and-play, with a "Pass the device" privacy
  screen between turns and hidden opponent hands.
- Full 108-card deck: 72 Number cards (rendered from data — see
  below), 24 Action cards, 12 Miracle cards.
- Suit/number matching, draw pile, discard pile with reshuffle-when-
  empty, Blessing tokens, win detection and a results screen.
- All 12 Action cards from your printed art, each with its normal
  **and** Blessing ability, exactly as written on the cards.
- All 6 Miracle cards, including Peace's Action-card lock and
  Strength's out-of-turn play.
- Save/resume via `localStorage`, offline support via a service
  worker that caches the app shell and card art.

## Decisions made to get a testable prototype (flag these if you want them different)

- **"Grace"** — the original brief's placeholder card — is now the
  **Redeemed** card in your final art, with the mechanic "return 1
  card from the discard pile to your hand." Implemented as such.
- **Strength** ("Play on any card, at any time. Continue play after
  you.") is implemented as: once the current effect finishes
  resolving, the turn passes to whoever played Strength, out of the
  normal player order. If that's not what "continue play after you"
  meant on your table, this is the one piece of logic to revisit
  first — it's isolated in `resolveMiracleEffect()` / `strengthQueue`
  in `js/engine.js`.
- **Number cards have no art yet** (none were in your upload), so
  they're rendered from data: suit name + big number, tinted with
  that suit's color. Drop the real files into `cards/` named like
  `faith-1.jpg`, `hope-3.jpg`, etc. (see the `SUITS` numbering in
  `js/cards.js`) and add `artwork: "cards/faith-1.jpg"` to each
  entry in `buildNumberCards()` — the renderer already checks for an
  `artwork` field before falling back to the data rendering.
- A few Action-card effects needed a small ruling to be playable at
  all (not spelled out on the cards): if none of Five Stones' or
  Loaves & Fish's revealed cards are legal, the prototype lets you
  keep one card in hand (this is the "needs confirmation" item from
  section 11 of the brief — easy to flip to "return all five" in
  `resolveActionEffect`/`modalFiveStonesPlay` if you'd rather).
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
cards/            — card artwork (kebab-case filenames, no spaces)
icons/            — generated placeholder app icons (swap for your logo any time)
```

## Next steps toward the brief's later phases

- Swap the placeholder icons in `icons/` for your circular Pass It On
  logo.
- Add real Number card art (see above).
- Sound, animations, a card library/rulebook screen, and online
  multiplayer are all deliberately out of scope for this prototype,
  per the brief's phased build plan.
