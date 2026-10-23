# Pass It On — Digital Prototype

A mobile-first Progressive Web App for local pass-and-play testing of
*Pass It On*. Plain HTML/CSS/JS — no build step, so you can drop the
folder straight into a GitHub Pages repo and it works

## Quick start

1. Copy everything in this folder into the root of your `passiton`
   repo (so `index.html` sits at the repo root, matching your Pages
   settings).
2. Commit and push. GitHub Pages will serve it directly.
3. To test locally first: `cd` into this folder and run any static
   server, e.g. `python3 -m http.server 8080`, then open
   `http://localhost:8080`.

## What's implemented (Rules v1.1 / Card Reference v1.2)

- 2–6 player local pass-and-play on one continuous game screen, and
  2–6 player online play with one phone per player (see below).
- **Main Deck (150):** 108 Number cards (36 × 3), 30 Action cards,
  12 Miracle cards. **Grace Deck (18):** 9 Gifts + 9 Acts of Grace.
- Matching by **suit, number, or symbol** — an Action card can be
  played on any Action card of the same story, whatever its suit.
- **Pass It On:** after playing a numbered card you may give another
  player a card with the same number and gain 1 Blessing (optional,
  once per turn). Winning by passing your last card counts.
- **Miracles:** after one resolves, the player who takes the next turn
  chooses the active suit (Wisdom's player chooses instead). Only
  **Strength** ("at any time") can be played on someone else's turn —
  it interrupts, and play continues after the Strength player.
  **Peace** now stops Action *and* Miracle cards.
- **Grace Market:** 3 face-up cards; buy 1 per turn on your own turn,
  before or after your play (after you play, the turn pauses with an
  **End Turn** button whenever you can still afford something). Gifts
  stay in front of you (max 2 — buying a third asks which to discard);
  Acts resolve immediately and go to the Grace discard pile, which is
  reshuffled when the Grace Deck runs out. Every Gift and Act is
  implemented except Generosity (see below).
- **Landscape only:** phones and tablets held upright see a "turn your
  phone sideways" screen. Sideways, the table is on the left and your
  hand on the right.
- **Turn panel:** one box above your hand always says whose turn it is
  and what to do ("Play a Faith card or any 4"), with a single obvious
  button when one is needed (Draw a Card, Grace Market, End Turn).
  Tapping a card you can't play says why.
- Hold-to-zoom on any card for its full text; desktop hover tooltips.
- Save/resume via `localStorage` (save format bumped — games saved
  before this update can't be resumed), offline support via a
  service worker.

## Online play (Firebase)

Tap **Play Online** on the home screen. Each phone is its own seat:

1. Enter your name. One person taps **Host a New Game** and picks the
   player count (2–6); everyone else types the 4-letter room code and
   taps **Join**. The waiting room shows who's in, and **Share invite**
   sends the code + link. Cards are dealt the moment every seat fills.
2. The game uses the same table, card art, hold-to-zoom, game log and
   effect pop-ups as pass-and-play — you only ever see your own hand.
3. **Strength** lights up on other people's turns and can be played
   at any time — it interrupts their turn.
4. Choices that belong to another player happen on their own phone,
   and play pauses until they answer: **The Big Storm**'s discard, and
   **Gratitude** when someone Passes It On to them.
5. Closed the app or lost signal? Home screen → **Rejoin Online Game**.
6. When someone wins, anyone can tap **Play Again** to deal a new game
   to the same group in the same room.

How it stays in sync (`js/online.js`): every move is saved in a
Firestore transaction against a `rev` counter, together with your hand
(and any card you gave someone). If Strength interrupts you mid-move,
your unfinished move is canceled and the board refreshes, so cards
can't be lost or duplicated. Hands stay private via Security
Rules (`games/{code}/hands/{uid}` readable only by that player).

The old `sync-test.html`, `sync-game-test.html`, `hidden-hands-test.html`
and `auth-test.html` pages are still in the repo but are no longer
needed — the main app has everything they tested.

## Design refresh

The visual style got a full pass while keeping the same vintage
navy/cream/gold direction from your printed cards:

- Playfair Display (headings) + Lora (body) via Google Fonts, loaded
  in `index.html` — falls back to Georgia if fonts.googleapis.com is
  unreachable.
- Richer layered shadows and a subtle gradient background instead of
  flat color, on every screen.
- Home/Setup/Results screens now sit in a bordered, elevated panel
  instead of loose centered text.
- Legal cards in your hand now have a soft animated glow (in addition
  to the lift + border), and non-legal cards are more clearly dimmed.
- Refined buttons, badges, opponent tiles, and modals — softer
  gradients, consistent radii, hover states on desktop.
- The draw/discard pile area now sits in a subtle "table" recess for
  visual grounding.

All of this is CSS-only (`css/style.css`) plus two `<link>` tags in
`index.html` — no JS or markup structure changed, so nothing else
should need re-testing on your end beyond a visual check.

## Card art and placeholders

Cards without uploaded art get a designed placeholder face (name,
type, cost and text) and pick up the real art automatically once a
file with the expected name is in `cards/`:

- **Grace cards:** `cards/Grace - <Name>.jpg` — e.g.
  `Grace - Discernment.jpg`, `Grace - Open Door.jpg`,
  `Grace - Second Chance.jpg`, `Grace - Favor.jpg` (the Act).
- **Second-suit Action cards:** the suit you already have art for keeps
  its file; the other suit uses `cards/Action - <Name> (<Suit>).jpg` —
  `Tree Climber (Word)`, `Loaves and Fish (Love)`,
  `Mustard Seed (Word)`, `The Good Samaritan (Love)`,
  `Two Coins (Service)`, `Walk on Water (Prayer)`.

## Decisions made where the rules are open (flag any you want different)

- **Action card split.** The rules give 30 Action cards but not the
  copies per card. Assumed 2 per suit for the six two-suit stories
  (4 each) and 1 each for the six single-suit stories. One place to
  change it: `copiesPerSuit` in `js/cards.js`.
- **Generosity** is left out of the Grace Deck (so it has 17 cards)
  until its printed ability is confirmed — set its text/effect and
  `enabled` in `js/cards.js`.
- **Encouragement** triggers on cards given by an effect (Good
  Samaritan, Two Coins, Give Freely), not on Pass It On.
- **Unity's** extra card can be any card of that suit (Number or
  Action), and resolves normally.
- **Strength online:** a move isn't saved until it's finished, so an
  interrupted player's whole unfinished move is canceled (cards go
  back to their hand). An interrupted normal draw still completes.
- Playing a Miracle through an Act (e.g. Guidance) ends your turn like
  any Miracle.
- **Five Stones (Blessing)** with nothing playable still lets you keep
  1 card or return all 5. Five Stones' leftover cards are returned in
  the order you choose, as printed.
- **New Perspective** and Wisdom clear the active number when the suit
  is chosen.

## Project structure

```
index.html
css/style.css
js/cards.js      — all card data incl. the Grace Deck (edit here to change text, costs, copies)
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
- Upload the Grace card art and the second-suit Action art (names above).
- Confirm Generosity's ability.
- Sound, animations, and a card library/rulebook screen.
- Online: no handling yet for a player who leaves for good mid-game
  (the table waits for them). Rejoining works from the same phone and
  browser they joined on.
