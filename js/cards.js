// ============================================================
// Pass It On — Card Data
// This file is the single source of truth for every card in the
// game. The engine (engine.js) never hard-codes card text or
// suit/number info — it all comes from here, per the data-driven
// architecture called for in the design brief.
// ============================================================

// ---- Configuration (Section 3 of the brief) ----------------
// Deck composition now uses a rarity system: every card carries its
// own `copies` count instead of one shared multiplier per type.
// createFullDeck() (engine.js) just sums whatever `copies` each card
// definition declares — change a number here and the deck, odds,
// and anywhere the app reports deck size all follow automatically.
const NUMBER_CARD_COPIES = 2; // Number cards remain uniform: 36 unique x2 = 72

const SUITS = ["Faith", "Hope", "Love", "Service", "Prayer", "Word"];

// Suit accent colors, pulled from the printed card art you uploaded.
const SUIT_COLORS = {
  Faith: "#1d4e89",   // shield / blue
  Hope: "#a68a1c",    // anchor / gold-olive
  Love: "#a5253f",    // heart / crimson
  Service: "#c1622d", // handshake / burnt orange
  Prayer: "#5b7a3a",  // praying hands / green
  Word: "#4b3f9e"     // open book / indigo-violet
};

// ---- Number Cards (Section 2) -------------------------------
// Artwork paths match the exact filenames in your cards/ folder
// (e.g. "cards/Faith - 1.jpg"). If a file is ever missing, the
// renderer falls back to a suit-colored text card automatically.
function buildNumberCards() {
  const cards = [];
  for (const suit of SUITS) {
    for (let n = 1; n <= 6; n++) {
      cards.push({
        id: `${suit.toLowerCase()}-${n}`,
        name: `${suit} ${n}`,
        type: "number",
        suit,
        number: n,
        copies: NUMBER_CARD_COPIES,
        artwork: `cards/${suit} - ${n}.jpg`
      });
    }
  }
  return cards;
}

// ---- Action Cards (Section 10/11) ----------------------------
// Text transcribed directly from the printed card art. Rarity
// (`copies`) and several mechanics were updated per the July 2026
// rules revision — see README for a full list of what changed.
const ACTION_CARDS = [
  {
    id: "five-stones",
    name: "Five Stones",
    type: "action",
    suit: "Faith",
    number: null,
    copies: 2,
    verse: "1 Samuel 17:40-50",
    artwork: "cards/Action - Five Stones.jpg",
    playText: "Look at the top 5 cards from the draw pile. Put 1 into your hand. Return 4 in any order.",
    blessingText: "Look at the top 5 cards from the draw pile. Play 1 if able. Return 4 in any order.",
    blessingCost: 1,
    effect: { type: "five_stones", count: 5, mode: "keep" },
    blessingEffect: { type: "five_stones", count: 5, mode: "play" }
  },
  {
    id: "living-water",
    name: "Living Water",
    type: "action",
    suit: "Prayer",
    number: null,
    copies: 2,
    verse: "John 4:1-26",
    artwork: "cards/Action - Living Water.jpg",
    playText: "Place 1 card from your hand on the bottom of the draw pile.",
    blessingText: "Place 1 card from your hand on the bottom of the draw pile. Play 1 additional card from your hand.",
    blessingCost: 2,
    effect: { type: "living_water", extraPlay: false },
    blessingEffect: { type: "living_water", extraPlay: true }
  },
  {
    id: "loaves-and-fish",
    name: "Loaves & Fish",
    type: "action",
    suit: "Service",
    number: null,
    copies: 2,
    verse: "Matthew 14:13-21",
    artwork: "cards/Action - Loaves and Fish.jpg",
    playText: "Reveal the top card of the draw pile. If able, play it immediately. Otherwise, return it to the draw pile.",
    blessingText: "Reveal the top 3 cards from the draw pile. Play 1 if able, return the rest to the draw pile.",
    blessingCost: 1,
    effect: { type: "loaves_and_fish", count: 1 },
    blessingEffect: { type: "loaves_and_fish", count: 3 }
  },
  {
    id: "mustard-seed",
    name: "Mustard Seed",
    type: "action",
    suit: "Faith",
    number: null,
    copies: 3,
    verse: "Matthew 13:31-32",
    artwork: "cards/Action - Mustard Seed.jpg",
    playText: "Play 1 additional card from your hand.",
    blessingText: "Play 1 additional card from your hand. If both cards are the same suit, gain 1 Blessing.",
    blessingCost: 1,
    effect: { type: "mustard_seed", rewardSameSuit: false },
    blessingEffect: { type: "mustard_seed", rewardSameSuit: true }
  },
  {
    id: "the-big-fish",
    name: "The Big Fish",
    type: "action",
    suit: "Hope",
    number: null,
    copies: 2,
    verse: "Jonah 1-2",
    artwork: "cards/Action - The Big Fish.jpg",
    playText: "Choose the active suit.",
    blessingText: "Choose the active suit. Exchange 1 card from your hand with the top card of the draw pile.",
    blessingCost: 1,
    effect: { type: "big_fish", exchange: false },
    blessingEffect: { type: "big_fish", exchange: true }
  },
  {
    id: "the-big-storm",
    name: "The Big Storm",
    type: "action",
    suit: "Prayer",
    number: null,
    copies: 1,
    verse: "Mark 4:35-41",
    artwork: "cards/Action - The Big Storm.jpg",
    playText: "Choose another player. The chosen player may discard 1 card.",
    blessingText: "Choose yourself and one other player. You may each discard 1 card.",
    blessingCost: 2,
    effect: { type: "big_storm", mode: "single" },
    blessingEffect: { type: "big_storm", mode: "double" }
  },
  {
    id: "the-empty-tomb",
    name: "The Empty Tomb",
    type: "action",
    suit: "Hope",
    number: null,
    copies: 1,
    verse: "Matthew 28:1-10",
    artwork: "cards/Action - The Empty Tomb.jpg",
    playText: "Choose any 1 card from the discard pile and put it into your hand.",
    blessingText: "Choose any 1 card from the discard pile. Play it regardless of suit.",
    blessingCost: 3,
    effect: { type: "empty_tomb", mode: "take" },
    blessingEffect: { type: "empty_tomb", mode: "play" }
  },
  {
    id: "the-good-samaritan",
    name: "The Good Samaritan",
    type: "action",
    suit: "Service",
    number: null,
    copies: 3,
    verse: "Luke 10:25-37",
    artwork: "cards/Action - The Good Samaritan.jpg",
    playText: "Give 1 card from your hand to another player.",
    blessingText: "Give 1 card from your hand to another player. Then you may play 1 additional card if able.",
    blessingCost: 1,
    effect: { type: "good_samaritan", mode: "normal" },
    blessingEffect: { type: "good_samaritan", mode: "blessing" }
  },
  {
    id: "the-good-shepherd",
    name: "The Good Shepherd",
    type: "action",
    suit: "Word",
    number: null,
    copies: 2,
    verse: "John 10:11-18",
    artwork: "cards/Action - The Good Shepherd.jpg",
    playText: "Take the top card from the discard pile and put it into your hand.",
    blessingText: "Look at the top 3 cards of the discard pile. Put 1 into your hand, return the rest in any order.",
    blessingCost: 1,
    effect: { type: "good_shepherd", count: 1 },
    blessingEffect: { type: "good_shepherd", count: 3 }
  },
  {
    id: "tree-climber",
    name: "Tree Climber",
    type: "action",
    suit: "Hope",
    number: null,
    copies: 2,
    verse: "Luke 19:1-10",
    artwork: "cards/Action - Tree Climber.jpg",
    playText: "Look at the top 3 cards of the draw pile. Return them in any order.",
    blessingText: "Look at the top 5 cards of the draw pile. Return them in any order.",
    blessingCost: 1,
    effect: { type: "tree_climber", count: 3 },
    blessingEffect: { type: "tree_climber", count: 5 }
  },
  {
    id: "two-coins",
    name: "Two Coins",
    type: "action",
    suit: "Love",
    number: null,
    copies: 2,
    verse: "Mark 12:41-44",
    artwork: "cards/Action - Two Coins.jpg",
    playText: "Give 1 card from your hand to another player. Gain 1 Blessing.",
    blessingText: "Give 1 card from your hand to another player. Choose the active suit.",
    blessingCost: 1,
    effect: { type: "two_coins", mode: "normal" },
    blessingEffect: { type: "two_coins", mode: "blessing" }
  },
  {
    id: "walk-on-water",
    name: "Walk On Water",
    type: "action",
    suit: "Faith",
    number: null,
    copies: 3,
    verse: "Matthew 14:22-33",
    artwork: "cards/Action - Walk on Water.jpg",
    playText: "Play any 1 card from your hand regardless of suit or number.",
    blessingText: "Play any 1 card from your hand regardless of suit or number. Pick who plays next.",
    blessingCost: 1,
    effect: { type: "walk_on_water", pickNext: false },
    blessingEffect: { type: "walk_on_water", pickNext: true }
  }
];

// ---- Miracle Cards (Section 9) --------------------------------
// Note on open items resolved for this prototype:
//  - "Grace" from the original brief now appears in the final
//    printed art as "Redeemed", with its mechanic confirmed as
//    returning 1 card from the discard pile to hand.
//  - "Strength" now reads "Play continues with the player after
//    you," which resolves the earlier ambiguity: it does NOT grant
//    the Strength player another turn. In this app only the current
//    player can ever act on their own hand, so "the player after
//    you" is exactly the player who'd go next anyway — Strength
//    resolves like any other Miracle (see `renewed_strength` in
//    engine.js), just playable "at any time" per its timing.
const MIRACLE_CARDS = [
  {
    id: "wisdom",
    name: "Wisdom",
    type: "miracle",
    suit: null,
    number: null,
    copies: 2,
    verse: "Psalm 119:105",
    artwork: "cards/Miracle - Wisdom.jpg",
    text: "Play on any card. Choose the active suit.",
    timing: "on_your_turn",
    effect: { type: "choose_suit" }
  },
  {
    id: "redeemed",
    name: "Redeemed",
    type: "miracle",
    suit: null,
    number: null,
    copies: 3,
    verse: "2 Corinthians 12:9",
    artwork: "cards/Miracle - Redeemed.jpg",
    text: "Play on any card. Return 1 card from the discard pile to your hand.",
    timing: "on_your_turn",
    effect: { type: "return_discard_to_hand", count: 1 }
  },
  {
    id: "peace",
    name: "Peace",
    type: "miracle",
    suit: null,
    number: null,
    copies: 3,
    verse: "John 14:27",
    artwork: "cards/Miracle - Peace.jpg",
    text: "Play on any card. No one may play Action cards until your next turn.",
    timing: "on_your_turn",
    effect: { type: "lock_action_cards" }
  },
  {
    id: "overflow",
    name: "Overflow",
    type: "miracle",
    suit: null,
    number: null,
    copies: 2,
    verse: "Psalm 23:5",
    artwork: "cards/Miracle - Overflow.jpg",
    text: "Play on any card. Discard any number of cards from your hand. Draw that many cards.",
    timing: "on_your_turn",
    effect: { type: "overflow" }
  },
  {
    id: "favor",
    name: "Favor",
    type: "miracle",
    suit: null,
    number: null,
    copies: 3,
    verse: "Psalm 5:12",
    artwork: "cards/Miracle - Favor.jpg",
    text: "Play on any card. Gain 1 Blessing.",
    timing: "any_time",
    effect: { type: "gain_blessing", amount: 1 }
  },
  {
    id: "strength",
    name: "Strength",
    type: "miracle",
    suit: null,
    number: null,
    copies: 2,
    verse: "Isaiah 40:31",
    artwork: "cards/Miracle - Strength.jpg",
    text: "Play on any card, at any time. Play continues with the player after you.",
    timing: "any_time",
    effect: { type: "renewed_strength" }
  }
];

const NUMBER_CARDS = buildNumberCards();

// Every unique card definition, keyed by id, for quick lookup.
const CARD_LIBRARY = {};
[...NUMBER_CARDS, ...ACTION_CARDS, ...MIRACLE_CARDS].forEach(c => {
  CARD_LIBRARY[c.id] = c;
});

// Total deck size, derived by summing every card's `copies` — never
// hardcode this number elsewhere. Change any card's rarity above and
// this (and the whole app) updates automatically.
const TOTAL_DECK_SIZE = [...NUMBER_CARDS, ...ACTION_CARDS, ...MIRACLE_CARDS]
  .reduce((sum, c) => sum + c.copies, 0);
