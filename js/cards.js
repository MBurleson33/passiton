// ============================================================
// Pass It On — Card Data (Rules v1.1 / Card Reference v1.2)
// The single source of truth for every card. engine.js and ui.js
// never hard-code card text, suits, counts or costs.
//
// Deck sizes are always derived by summing `copies`:
//   Main Deck  150 = 108 Number + 30 Action + 12 Miracle
//   Grace Deck  18 = 9 Gifts of Grace + 9 Acts of Grace
// ============================================================

const NUMBER_CARD_COPIES = 3; // 36 unique x3 = 108

const SUITS = ["Faith", "Hope", "Love", "Service", "Prayer", "Word"];

const SUIT_COLORS = {
  Faith: "#1d4e89",   // blue
  Hope: "#a68a1c",    // yellow
  Love: "#a5253f",    // red
  Service: "#c1622d", // orange
  Prayer: "#5b7a3a",  // green
  Word: "#4b3f9e"     // purple
};

// ---- Number Cards ------------------------------------------------
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

// ---- Action Cards ------------------------------------------------
// Each story is one "symbol". Some stories are printed in two
// suits with identical abilities; each suit is its own card here,
// and any card of the same story matches by symbol.
//
// `copiesPerSuit` — the rulebook gives 30 Action cards in total but
// not the split. Assumed: 2 per suit for two-suit stories (4 each)
// and 1 for single-suit stories: 6x4 + 6x1 = 30. Change freely.
//
// Artwork: the suit you already have art for uses your existing
// file. The other suit looks for "cards/Action - <Name> (<Suit>).jpg"
// and shows a placeholder face until that file is uploaded.
const ACTION_STORIES = [
  {
    story: "five-stones", name: "Five Stones", suits: ["Faith"], copiesPerSuit: 1,
    verse: "1 Samuel 17:40-50", art: "Action - Five Stones",
    playText: "Look at the top 5 cards from the draw pile. Put 1 into your hand. Return 4 in any order.",
    blessingText: "Look at the top 5 cards from the draw pile. Play 1 if able. Return 4 in any order.",
    blessingCost: 1,
    effect: { type: "five_stones", count: 5, mode: "keep" },
    blessingEffect: { type: "five_stones", count: 5, mode: "play" }
  },
  {
    story: "living-water", name: "Living Water", suits: ["Prayer"], copiesPerSuit: 1,
    verse: "John 4:1-26", art: "Action - Living Water",
    playText: "Place 1 card from your hand on the bottom of the draw pile.",
    blessingText: "Place 1 card from your hand on the bottom of the draw pile. Play 1 additional card.",
    blessingCost: 1,
    effect: { type: "living_water", extraPlay: false },
    blessingEffect: { type: "living_water", extraPlay: true }
  },
  {
    story: "loaves-and-fish", name: "Loaves & Fish", suits: ["Service", "Love"], copiesPerSuit: 2,
    verse: "Matthew 14:13-21", art: "Action - Loaves and Fish",
    playText: "Reveal the top card of the draw pile. Play it if able. Otherwise, return it to the draw pile.",
    blessingText: "Reveal the top 3 cards from the draw pile. Play 1 if able, return the rest to the deck.",
    blessingCost: 1,
    effect: { type: "loaves_and_fish", count: 1 },
    blessingEffect: { type: "loaves_and_fish", count: 3 }
  },
  {
    story: "mustard-seed", name: "Mustard Seed", suits: ["Faith", "Word"], copiesPerSuit: 2,
    verse: "Matthew 13:31-32", art: "Action - Mustard Seed",
    playText: "Play 1 additional card from your hand.",
    blessingText: "Play 2 additional cards from your hand.",
    blessingCost: 1,
    effect: { type: "mustard_seed", count: 1 },
    blessingEffect: { type: "mustard_seed", count: 2 }
  },
  {
    story: "the-big-fish", name: "The Big Fish", suits: ["Hope"], copiesPerSuit: 1,
    verse: "Jonah 1-2", art: "Action - The Big Fish",
    playText: "Choose the active suit.",
    blessingText: "Choose the active suit. Exchange 1 card from your hand with the top card of the draw pile.",
    blessingCost: 1,
    effect: { type: "big_fish", exchange: false },
    blessingEffect: { type: "big_fish", exchange: true }
  },
  {
    story: "the-big-storm", name: "The Big Storm", suits: ["Prayer"], copiesPerSuit: 1,
    verse: "Mark 4:35-41", art: "Action - The Big Storm",
    playText: "Choose another player. The chosen player may discard 1 card.",
    blessingText: "Choose yourself and one other player. You may each discard 1 card.",
    blessingCost: 2,
    effect: { type: "big_storm", mode: "single" },
    blessingEffect: { type: "big_storm", mode: "double" }
  },
  {
    story: "the-empty-tomb", name: "The Empty Tomb", suits: ["Hope"], copiesPerSuit: 1,
    verse: "Matthew 28:1-10", art: "Action - The Empty Tomb",
    playText: "Choose any 1 card from the discard pile and put it into your hand.",
    blessingText: "Choose any 1 card from the discard pile. Play it regardless of suit.",
    blessingCost: 3,
    effect: { type: "empty_tomb", mode: "take" },
    blessingEffect: { type: "empty_tomb", mode: "play" }
  },
  {
    story: "the-good-samaritan", name: "The Good Samaritan", suits: ["Service", "Love"], copiesPerSuit: 2,
    verse: "Luke 10:25-37", art: "Action - The Good Samaritan",
    playText: "Give 1 card from your hand to another player.",
    blessingText: "Give 1 card from your hand to another player. Then you may play 1 additional card if able.",
    blessingCost: 1,
    effect: { type: "good_samaritan", mode: "normal" },
    blessingEffect: { type: "good_samaritan", mode: "blessing" }
  },
  {
    story: "the-good-shepherd", name: "The Good Shepherd", suits: ["Word"], copiesPerSuit: 1,
    verse: "John 10:11-18", art: "Action - The Good Shepherd",
    playText: "Take the top card from the discard pile and put it into your hand.",
    blessingText: "Look at the top 3 cards of the discard pile. Put 1 into your hand, return the rest in any order.",
    blessingCost: 1,
    effect: { type: "good_shepherd", count: 1 },
    blessingEffect: { type: "good_shepherd", count: 3 }
  },
  {
    story: "tree-climber", name: "Tree Climber", suits: ["Hope", "Word"], copiesPerSuit: 2,
    verse: "Luke 19:1-10", art: "Action - Tree Climber",
    playText: "Look at the top 3 cards of the draw pile. Return them in any order.",
    blessingText: "Look at the top 5 cards of the draw pile. Return them in any order.",
    blessingCost: 1,
    effect: { type: "tree_climber", count: 3 },
    blessingEffect: { type: "tree_climber", count: 5 }
  },
  {
    story: "two-coins", name: "Two Coins", suits: ["Love", "Service"], copiesPerSuit: 2,
    verse: "Mark 12:41-44", art: "Action - Two Coins",
    playText: "Give 1 card from your hand to another player. Gain 1 Blessing.",
    blessingText: "Give 1 card from your hand to another player. Choose the active suit.",
    blessingCost: 1,
    effect: { type: "two_coins", mode: "normal" },
    blessingEffect: { type: "two_coins", mode: "blessing" }
  },
  {
    story: "walk-on-water", name: "Walk On Water", suits: ["Faith", "Prayer"], copiesPerSuit: 2,
    verse: "Matthew 14:22-33", art: "Action - Walk on Water",
    playText: "Play any numbered card from your hand regardless of suit or number.",
    blessingText: "Play any 1 card from your hand regardless of suit or number. Pick who plays next.",
    blessingCost: 1,
    effect: { type: "walk_on_water", pickNext: false, numberOnly: true },
    blessingEffect: { type: "walk_on_water", pickNext: true, numberOnly: false }
  }
];

const ACTION_CARDS = [];
ACTION_STORIES.forEach(s => {
  s.suits.forEach((suit, i) => {
    const { suits, copiesPerSuit, art, ...rest } = s;
    ACTION_CARDS.push({
      ...rest,
      id: s.suits.length > 1 ? `${s.story}-${suit.toLowerCase()}` : s.story,
      type: "action",
      suit,
      number: null,
      copies: copiesPerSuit,
      artwork: i === 0 ? `cards/${art}.jpg` : `cards/${art} (${suit}).jpg`
    });
  });
});

// ---- Miracle Cards -----------------------------------------------
// After a Miracle resolves, the player who takes the next turn
// chooses the active suit — except Wisdom, whose player chooses.
// Only cards that say "at any time" (Strength) can interrupt.
const MIRACLE_CARDS = [
  {
    id: "wisdom", name: "Wisdom", type: "miracle", suit: null, number: null, copies: 3,
    verse: "Psalm 119:105", artwork: "cards/Miracle - Wisdom.jpg",
    text: "Play on any card. Choose the active suit.",
    timing: "on_your_turn", effect: { type: "choose_suit" }
  },
  {
    id: "redeemed", name: "Redeemed", type: "miracle", suit: null, number: null, copies: 2,
    verse: "2 Corinthians 12:9", artwork: "cards/Miracle - Redeemed.jpg",
    text: "Play on any card. Return 1 card from the discard pile to your hand.",
    timing: "on_your_turn", effect: { type: "return_discard_to_hand", count: 1 }
  },
  {
    id: "peace", name: "Peace", type: "miracle", suit: null, number: null, copies: 1,
    verse: "John 14:27", artwork: "cards/Miracle - Peace.jpg",
    text: "Play on any card. No one may play Action or Miracle cards until your next turn.",
    timing: "on_your_turn", effect: { type: "lock_action_cards" }
  },
  {
    id: "overflow", name: "Overflow", type: "miracle", suit: null, number: null, copies: 1,
    verse: "Psalm 23:5", artwork: "cards/Miracle - Overflow.jpg",
    text: "Play on any card. Discard any number of cards from your hand. Draw that many cards.",
    timing: "on_your_turn", effect: { type: "overflow" }
  },
  {
    id: "favor", name: "Favor", type: "miracle", suit: null, number: null, copies: 3,
    verse: "Psalm 5:12", artwork: "cards/Miracle - Favor.jpg",
    text: "Play on any card. Gain 1 Blessing.",
    timing: "on_your_turn", effect: { type: "gain_blessing", amount: 1 }
  },
  {
    id: "strength", name: "Strength", type: "miracle", suit: null, number: null, copies: 2,
    verse: "Isaiah 40:31", artwork: "cards/Miracle - Strength.jpg",
    text: "Play on any card, at any time. Play continues with the player after you.",
    timing: "any_time", effect: { type: "renewed_strength" }
  }
];

// ---- Grace Deck --------------------------------------------------
// Bought from the 3-card Grace Market with Blessings, on your own
// turn. Gifts (gold) stay in front of you — max 2 active. Acts
// (green) resolve immediately and go to the Grace discard pile.
//
// Artwork: "cards/Grace - <Name>.jpg" — placeholders show until the
// files are uploaded with exactly those names.
//
// Generosity's printed ability isn't confirmed yet, so it's left out
// of the deck (`enabled: false`) until its text is filled in.
const GRACE_CARDS = [
  // Gifts of Grace
  {
    id: "generosity", name: "Generosity", kind: "gift", cost: 2, verse: "",
    text: "Ongoing Pass It On ability — printed text to be confirmed.",
    effect: { type: "none" }, enabled: false
  },
  {
    id: "discernment", name: "Discernment", kind: "gift", cost: 2, verse: "Proverbs 3:21",
    text: "Once per turn, before drawing, look at the top 2 cards of the draw pile and return them in any order.",
    effect: { type: "discernment" }
  },
  {
    id: "encouragement", name: "Encouragement", kind: "gift", cost: 2, verse: "1 Thessalonians 5:11",
    text: "Once per turn, when another player gives you a card through an effect, you both gain 1 Blessing.",
    effect: { type: "encouragement" }
  },
  {
    id: "endurance", name: "Endurance", kind: "gift", cost: 2, verse: "James 1:2",
    text: "Once per turn, if unable to play, draw 2 cards. Keep 1, return the other to the bottom of the pile, end your turn.",
    effect: { type: "endurance" }
  },
  {
    id: "opportunity", name: "Opportunity", kind: "gift", cost: 3, verse: "Colossians 4:5",
    text: "Once per turn, you may play 2 numbered cards together if they share the same number.",
    effect: { type: "opportunity" }
  },
  {
    id: "gratitude", name: "Gratitude", kind: "gift", cost: 2, verse: "1 Thessalonians 5:18",
    text: "Once per turn, when you receive a card through Pass It On, swap it with the top card of the draw pile.",
    effect: { type: "gratitude" }
  },
  {
    id: "renewal", name: "Renewal", kind: "gift", cost: 2, verse: "Romans 12:2",
    text: "Once per turn, you may replace 1 card in the Grace Market with a new card from the Grace Deck.",
    effect: { type: "renewal" }
  },
  {
    id: "unity", name: "Unity", kind: "gift", cost: 3, verse: "Ephesians 4:3",
    text: "Once per turn, when you play a numbered card, you may play 1 additional card of the same suit.",
    effect: { type: "unity" }
  },
  {
    id: "fellowship", name: "Fellowship", kind: "gift", cost: 2, verse: "Hebrews 10:24-25",
    text: "Once per turn, if you Pass It On, the receiver gains 1 Blessing. You swap 1 card with the top of the draw pile.",
    effect: { type: "fellowship" }
  },
  // Acts of Grace
  {
    id: "provision", name: "Provision", kind: "act", cost: 2, verse: "Philippians 4:19",
    text: "Place 1 card from your hand on the bottom of the draw pile.",
    effect: { type: "provision" }
  },
  {
    id: "open-door", name: "Open Door", kind: "act", cost: 2, verse: "Colossians 4:3",
    text: "Play 1 numbered card from your hand, regardless of suit or number.",
    effect: { type: "open_door" }
  },
  {
    id: "refresh", name: "Refresh", kind: "act", cost: 2, verse: "Isaiah 40:31",
    text: "Discard your entire hand, draw that many from the draw pile.",
    effect: { type: "refresh" }
  },
  {
    id: "abundance", name: "Abundance", kind: "act", cost: 3, verse: "2 Corinthians 9:8",
    text: "Choose a suit. Play up to 2 numbered cards of that suit from your hand.",
    effect: { type: "abundance" }
  },
  {
    id: "grace-favor", name: "Favor", kind: "act", cost: 1, verse: "Psalm 5:12",
    text: "Buy 1 additional Grace Market card this turn for 2 fewer Blessings.",
    effect: { type: "extra_purchase", discount: 2 }
  },
  {
    id: "second-chance", name: "Second Chance", kind: "act", cost: 3, verse: "Lamentations 3:22-23",
    text: "Choose 1 card from your hand. Exchange it with any card from the discard pile.",
    effect: { type: "second_chance" }
  },
  {
    id: "guidance", name: "Guidance", kind: "act", cost: 2, verse: "Proverbs 3:5-6",
    text: "Look at the top 3 cards of the draw pile. Play 1 if able. Return the rest in any order.",
    effect: { type: "guidance" }
  },
  {
    id: "new-perspective", name: "New Perspective", kind: "act", cost: 2, verse: "Isaiah 43:19",
    text: "Choose a new active suit. Then exchange 1 card from your hand with the top card of the draw pile.",
    effect: { type: "new_perspective" }
  },
  {
    id: "give-freely", name: "Give Freely", kind: "act", cost: 2, verse: "Matthew 10:8",
    text: "Give any 1 card from your hand to another player. Gain 1 Blessing.",
    effect: { type: "give_freely" }
  }
].map(c => ({
  ...c,
  type: "grace",
  suit: null,
  number: null,
  copies: c.enabled === false ? 0 : 1,
  artwork: `cards/Grace - ${c.name}.jpg`
}));

const NUMBER_CARDS = buildNumberCards();
const MAIN_DECK_CARDS = [...NUMBER_CARDS, ...ACTION_CARDS, ...MIRACLE_CARDS];

const CARD_LIBRARY = {};
[...MAIN_DECK_CARDS, ...GRACE_CARDS].forEach(c => { CARD_LIBRARY[c.id] = c; });

const TOTAL_DECK_SIZE = MAIN_DECK_CARDS.reduce((sum, c) => sum + c.copies, 0);
const GRACE_DECK_SIZE = GRACE_CARDS.reduce((sum, c) => sum + c.copies, 0);
