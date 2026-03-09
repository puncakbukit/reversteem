// ============================================================
// app.js
// SteemBiota — Immutable Evolution
// Vue 3 + Vue Router 4 SPA entry point.
// ============================================================

const { createApp, ref, computed, onMounted, provide, inject, nextTick } = Vue;
const { createRouter, createWebHashHistory, useRoute } = VueRouter;

// ============================================================
// STEEMBIOTA GENOME HELPERS (pure functions, no DOM)
// ============================================================

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

function generateGenome() {
  const LIF       = 80 + randomInt(80);
  const FRT_START = Math.min(20 + randomInt(20), LIF - 10);
  const FRT_END   = Math.min(60 + randomInt(20), LIF - 1);
  return {
    GEN: randomInt(1000),
    SX:  randomInt(2),      // 0 = male, 1 = female
    MOR: randomInt(9999),
    APP: randomInt(9999),
    ORN: randomInt(9999),
    CLR: randomInt(360),
    LIF,
    FRT_START,
    FRT_END,
    MUT: randomInt(3)       // 0–2 for founders; range 0–5
  };
}

// ============================================================
// STEEMBIOTA BREEDING SYSTEM
// ============================================================

// Seeded PRNG (mulberry32) — ensures same parents + seed → same child.
// Returns a function yielding floats in [0, 1).
function makePrng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s += 0x6D2B79F5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Derive a deterministic integer seed from two genomes.
// Uses a simple hash over all gene values so order-of-paste doesn't matter.
function breedSeed(a, b) {
  const vals = [a.GEN,a.MOR,a.APP,a.ORN,a.CLR,a.LIF,a.MUT,
                b.GEN,b.MOR,b.APP,b.ORN,b.CLR,b.LIF,b.MUT];
  return vals.reduce((h, v) => (Math.imul(h ^ (v | 0), 0x9e3779b9) >>> 0), 0x12345678);
}

// Mutation probability from both parents' MUT genes.
// base = 1%; scales with combined MUT.
function mutationChance(a, b) {
  return 0.01 * (1 + a.MUT + b.MUT);
}

// Inherit one gene: pick from either parent, then optionally mutate.
// rng     — seeded PRNG function
// a, b    — parent gene values
// mChance — probability of mutation this call
// range   — max ± shift when mutation fires
// min/max — clamp bounds
function inheritGene(rng, a, b, mChance, range, min, max) {
  let v = rng() < 0.5 ? a : b;
  if (rng() < mChance) {
    v = v + Math.floor(rng() * range * 2) - range;
  }
  return Math.max(min, Math.min(max, Math.round(v)));
}

// Rare speciation: 0.5% chance GEN mutates to an entirely new value.
function maybeSpeciate(rng, gen) {
  if (rng() < 0.005) return Math.floor(rng() * 1000);
  return gen;
}

// Parse a Steem post URL into { author, permlink }.
// Handles steemit.com and plain author/permlink strings.
function parseSteemUrl(url) {
  url = url.trim();
  // Match https://steemit.com/category/@author/permlink
  // or    https://steemit.com/@author/permlink
  const m = url.match(/@([a-z0-9.-]+)\/([a-z0-9-]+)\s*$/i);
  if (!m) throw new Error("Cannot parse Steem URL: " + url);
  return { author: m[1], permlink: m[2] };
}

// Load a genome from a published SteemBiota post.
// Tries json_metadata first (fast), falls back to body regex.
// Returns { genome, author, permlink, age } where age is the creature's
// current age in days (stored age + elapsed days since post.created).
async function loadGenomeFromPost(url) {
  const { author, permlink } = parseSteemUrl(url);
  const post = await fetchPost(author, permlink);
  if (!post || !post.author) throw new Error("Post not found: " + url);

  // Try json_metadata.steembiota.genome first
  try {
    const meta = JSON.parse(post.json_metadata || "{}");
    if (meta.steembiota && meta.steembiota.genome) {
      const storedAge  = meta.steembiota.age ?? 0;
      const elapsed    = calculateAge(post.created);   // days since post was published
      const currentAge = storedAge + elapsed;
      return { genome: meta.steembiota.genome, author, permlink, age: currentAge };
    }
  } catch {}

  // Fallback: parse ```genome ... ``` block from post body
  const match = post.body.match(/```genome\s*([\s\S]*?)```/);
  if (!match) throw new Error("No genome found in post: " + url);
  const genome = JSON.parse(match[1].trim());
  const elapsed = calculateAge(post.created);
  return { genome, author, permlink, age: elapsed };
}

// Convert a raw Steem post array into creature card data objects.
// Filters to valid SteemBiota posts, newest first.
const PAGE_SIZE = 15;
function parseSteembiotaPosts(rawPosts) {
  const results = [];
  for (const p of rawPosts) {
    let meta = {};
    try { meta = JSON.parse(p.json_metadata || "{}"); } catch {}
    if (!meta.steembiota || !meta.steembiota.genome) continue;
    const sb = meta.steembiota;
    results.push({
      author:        p.author,
      permlink:      p.permlink,
      name:          sb.name || p.author,
      genome:        sb.genome,
      age:           sb.age ?? 0,
      lifecycleStage: getLifecycleStage(sb.age ?? 0, sb.genome),
      parentA:       sb.parentA || null,
      parentB:       sb.parentB || null,
      created:       p.created || ""
    });
  }
  results.sort((a, b) => (b.created > a.created ? 1 : -1));
  return results;
}

// ============================================================
// STEEMBIOTA USER LEVEL SYSTEM
//
// Derives XP from on-chain activity and maps it to a named rank.
// Sources:
//   - Founder creatures published (type:"founder")  → 100 XP each
//   - Offspring bred and published (type:"offspring") → 60 XP each
//   - Feed replies sent (type:"feed")               → 10 XP each
//   - Unique genera contributed (distinct GEN values in own creatures) → 25 XP each
//   - Speciation event in own offspring             → 75 XP bonus each
//
// Ranks (cumulative XP thresholds):
//   0    Wanderer      🌿
//   100  Naturalist    🔬
//   300  Cultivator    🌱
//   700  Breeder       🐣
//   1500 Ecologist     🍃
//   3000 Evolutionist  🧬
//   6000 Progenitor    🌳
// ============================================================

const USER_RANKS = [
  { minXp: 6000, title: "Progenitor",   icon: "🌳" },
  { minXp: 3000, title: "Evolutionist", icon: "🧬" },
  { minXp: 1500, title: "Ecologist",    icon: "🍃" },
  { minXp:  700, title: "Breeder",      icon: "🐣" },
  { minXp:  300, title: "Cultivator",   icon: "🌱" },
  { minXp:  100, title: "Naturalist",   icon: "🔬" },
  { minXp:    0, title: "Wanderer",     icon: "🌿" },
];

function computeUserLevel(posts, comments) {
  // posts = result of fetchPostsByUser (top-level posts only)
  // comments = result of fetchUserComments (replies/comments)
  const allItems  = [...(posts || []), ...(comments || [])];
  let founders    = 0;
  let offspring   = 0;
  let feedsGiven  = 0;
  let speciated   = 0;
  const genera    = new Set();

  for (const item of allItems) {
    let meta = {};
    try { meta = JSON.parse(item.json_metadata || "{}"); } catch {}
    const sb = meta.steembiota;
    if (!sb) continue;
    if (sb.type === "founder") {
      founders++;
      if (sb.genome) genera.add(sb.genome.GEN);
    } else if (sb.type === "offspring") {
      offspring++;
      if (sb.genome) genera.add(sb.genome.GEN);
      if (sb.speciated) speciated++;
    } else if (sb.type === "feed") {
      feedsGiven++;
    }
  }

  const xpFounders   = founders   * 100;
  const xpOffspring  = offspring  * 60;
  const xpFeeds      = feedsGiven * 10;
  const xpGenera     = genera.size * 25;
  const xpSpeciation = speciated   * 75;
  const totalXp      = xpFounders + xpOffspring + xpFeeds + xpGenera + xpSpeciation;

  const rank = USER_RANKS.find(r => totalXp >= r.minXp) || USER_RANKS[USER_RANKS.length - 1];
  const nextRank = USER_RANKS[USER_RANKS.indexOf(rank) - 1] || null;
  const progressToNext = nextRank
    ? Math.min((totalXp - rank.minXp) / (nextRank.minXp - rank.minXp), 1.0)
    : 1.0;

  return {
    totalXp,
    rank: rank.title,
    icon: rank.icon,
    nextRank: nextRank ? nextRank.title : null,
    nextRankIcon: nextRank ? nextRank.icon : null,
    nextRankXp: nextRank ? nextRank.minXp : null,
    progressToNext,
    breakdown: { founders, offspring, feedsGiven, genera: genera.size, speciated }
  };
}

// Breed two genomes into a child genome.
// Returns { child, mutated, speciated } for display purposes.
function breedGenomes(a, b) {
  if (a.GEN !== b.GEN) {
    throw new Error(
      "Genus mismatch: GEN " + a.GEN + " ≠ GEN " + b.GEN +
      ". Only same-genus creatures can breed."
    );
  }
  if (a.SX === b.SX) {
    const sexName = a.SX === 0 ? "Male" : "Female";
    throw new Error(
      "Sex mismatch: both creatures are " + sexName +
      ". Breeding requires one ♂ Male and one ♀ Female."
    );
  }

  const seed  = breedSeed(a, b);
  const rng   = makePrng(seed);
  const mCh   = mutationChance(a, b);
  const i     = (av, bv, range, min, max) => inheritGene(rng, av, bv, mCh, range, min, max);

  // Track whether any mutation fired (for UI feedback)
  const beforeMOR = (rng() < 0.5 ? a.MOR : b.MOR); // peek — rewind not possible, so we check post-hoc below
  void beforeMOR; // used indirectly via child fields

  const child = {
    GEN:       a.GEN,                                   // same genus (may speciate below)
    SX:        Math.floor(rng() * 2),                   // 50/50 sex
    MOR:       i(a.MOR, b.MOR,  200, 0,    9999),
    APP:       i(a.APP, b.APP,  200, 0,    9999),
    ORN:       i(a.ORN, b.ORN,  200, 0,    9999),
    CLR:       i(a.CLR, b.CLR,   10, 0,     359),
    LIF:       i(a.LIF, b.LIF,   10, 40,    200),
    FRT_START: 0,   // recalculated below
    FRT_END:   0,
    MUT:       Math.min(5, i(a.MUT, b.MUT, 1, 0, 5) + (rng() < 0.2 ? 1 : 0))
  };

  // Recalculate FRT bounds from child LIF
  child.FRT_START = Math.min(
    i(a.FRT_START, b.FRT_START, 5, 10, child.LIF - 10),
    child.LIF - 10
  );
  child.FRT_END = Math.min(
    i(a.FRT_END, b.FRT_END, 5, child.FRT_START + 5, child.LIF - 1),
    child.LIF - 1
  );

  // Speciation check — may change GEN to a new value
  const originalGEN = child.GEN;
  child.GEN = maybeSpeciate(rng, child.GEN);
  const speciated = child.GEN !== originalGEN;

  // Detect if any field mutated vs simple mix
  const simpleMix = {
    MOR: rng() < 0.5 ? a.MOR : b.MOR,
    APP: rng() < 0.5 ? a.APP : b.APP,
    ORN: rng() < 0.5 ? a.ORN : b.ORN,
  };
  const mutated =
    speciated ||
    Math.abs(child.MOR - simpleMix.MOR) > 0 ||
    Math.abs(child.APP - simpleMix.APP) > 0 ||
    Math.abs(child.ORN - simpleMix.ORN) > 0;

  return { child, mutated, speciated };
}

// ============================================================
// STEEMBIOTA NAMING SYSTEM v3 — Mythic Binomial
//
// Genus   = PREFIX + CORE + ENDING   (driven by GEN, MOR, SX, APP, MUT)
// Species = ROOT + TITLE             (driven by ORN, CLR, MUT)
//
// Each pool is curated for mythical/biological feel.
// All selection is pure modulo — 100% deterministic, no RNG needed.
// ~5.3 million unique combinations; collision probability is negligible.
// ============================================================

const NAME_PREFIX = [
  "Aer","Aera","Aeral","Aether","Aeth",
  "Aur","Aure","Aural","Aurel",
  "Corv","Chron","Caly","Cy","Cyr",
  "Ferr","Grav","Harmo","Hex",
  "Igni","Kair","Lum","Lumi","Lyn",
  "Mnemo","Nyx","Ordin","Prism",
  "Pyro","Seraph","Syn","Tri",
  "Vael","Var","Veyr","Vire",
  "Volt","Vox","Zephyr","Zyph"
];

const NAME_CORE = [
  "a","ae","al","ar","ath",
  "el","en","er",
  "il","ir",
  "ix","yn","yx",
  "or","on","os",
  "ra","ri",
  "th","thor",
  "va","ve"
];

const NAME_ENDING = [
  "ix","yx","is","os","on",
  "ra","ris","ryn",
  "ex","el","ar","or",
  "eus","ion"
];

const NAME_ROOT = [
  "Volt","Vire","Corv","Aurel","Aether",
  "Lumin","Prism","Cipher","Quill",
  "Signal","Echo","Chron","Flux",
  "Gate","Sky","Thread","Strata",
  "Ledger","Ward","Spark","Ripple"
];

const NAME_TITLE = [
  "aris","archivist","whisper","crest",
  "lynx","spire","guard","wing",
  "tail","fox","wolf","claw",
  "mantis","warden","scribe",
  "howl","specter","paw",
  "drift","node","mind"
];

// Safe modulo — always returns a non-negative index even if n is negative.
function namePick(arr, n) {
  return arr[((n % arr.length) + arr.length) % arr.length];
}

// Public API — signature unchanged.
function generateFullName(g) {
  const prefix  = namePick(NAME_PREFIX,  g.GEN);
  const core    = namePick(NAME_CORE,    g.MOR + g.SX);
  const ending  = namePick(NAME_ENDING,  g.APP + g.MUT);
  const genus   = prefix + core + ending;

  const root    = namePick(NAME_ROOT,    g.ORN);
  const title   = namePick(NAME_TITLE,   g.CLR + g.MUT);
  const species = root + title;

  return genus[0].toUpperCase() + genus.slice(1) + " " + species;
}

// ============================================================
// STEEMBIOTA AGING SYSTEM (deterministic from block timestamp)
// ============================================================

// Returns age in whole days from a Steem post.created timestamp.
function calculateAge(birthTimestamp) {
  const now   = new Date();
  const birth = new Date(
    typeof birthTimestamp === "string" && !birthTimestamp.endsWith("Z")
      ? birthTimestamp + "Z"
      : birthTimestamp
  );
  const diffSeconds = (now - birth) / 1000;
  return Math.max(0, Math.floor(diffSeconds / 86400));
}

// Lifecycle stages defined as percentage thresholds of LIF (lifespan).
// Fossil is the post-death state beyond 100%.
const LIFECYCLE_STAGES = [
  { name: "Baby",        from: 0,    icon: "🥚", color: "#90caf9" },
  { name: "Toddler",     from: 0.05, icon: "🐣", color: "#80deea" },
  { name: "Child",       from: 0.12, icon: "🌿", color: "#a5d6a7" },
  { name: "Teenager",    from: 0.25, icon: "🌱", color: "#66bb6a" },
  { name: "Young Adult", from: 0.40, icon: "🌸", color: "#f48fb1" },
  { name: "Middle-Aged", from: 0.60, icon: "🍃", color: "#ffb74d" },
  { name: "Elder",       from: 0.80, icon: "🍂", color: "#ff8a65" },
  // Sentinel — age >= LIF means Fossil
  { name: "Fossil",      from: 1.00, icon: "🦴", color: "#666"    },
];

// Returns the full stage object for the creature's current age.
function getLifecycleStage(age, genome) {
  const pct = age / genome.LIF;
  // Walk backwards to find the highest threshold not exceeded
  for (let i = LIFECYCLE_STAGES.length - 1; i >= 0; i--) {
    if (pct >= LIFECYCLE_STAGES[i].from) return LIFECYCLE_STAGES[i];
  }
  return LIFECYCLE_STAGES[0];
}

function isFossil(age, genome) {
  return age >= genome.LIF;
}

// ============================================================
// STEEMBIOTA FEEDING SYSTEM
// Derives life-state bonuses from blockchain feed events.
// All logic is pure and deterministic — genome never changes.
// ============================================================

// FOOD_EFFECTS — static config, easy to extend for phase-2 types.
const FOOD_EFFECTS = {
  nectar:  { lifespanPerFeed: 1.0, fertilityBoost: 0.00, label: "Nectar",  emoji: "🍯" },
  fruit:   { lifespanPerFeed: 0.5, fertilityBoost: 0.10, label: "Fruit",   emoji: "🍎" },
  crystal: { lifespanPerFeed: 0.0, fertilityBoost: 0.05, label: "Crystal", emoji: "💎" },
};

// Feed-strength weights: owner feeds count 3×, community 1×.
const OWNER_FEED_WEIGHT     = 3;
const COMMUNITY_FEED_WEIGHT = 1;

// computeFeedState — pure function.
// feedEvents : result of parseFeedEvents() — { total, ownerFeeds, communityFeeds, byFeeder }
// genome     : genome object (used to derive the lifespan cap)
// Returns a feedState object consumed by renderers.
function computeFeedState(feedEvents, genome) {
  if (!feedEvents || feedEvents.total === 0) {
    return {
      weightedScore:  0,   // 0–(20*OWNER + 20*COMMUNITY) combined
      lifespanBonus:  0,   // extra days added to effective lifespan
      fertilityBoost: 0,   // additive fraction on fertility window chance
      healthPct:      0,   // 0.0–1.0 visual health level
      label:          "Unfed",
      symbol:         "·"  // unicode health indicator
    };
  }

  const { total, ownerFeeds, communityFeeds } = feedEvents;

  // Weighted score — drives visual health
  const weightedScore =
    ownerFeeds    * OWNER_FEED_WEIGHT +
    communityFeeds * COMMUNITY_FEED_WEIGHT;

  // Max possible score at cap (20 owner feeds = 60, or 20 community = 20)
  const maxScore = 20 * OWNER_FEED_WEIGHT;
  const healthPct = Math.min(weightedScore / maxScore, 1.0);

  // Lifespan bonus: +1 day per feed, capped at 20% of base LIF
  const maxLifespanBonus = Math.floor(genome.LIF * 0.20);
  const lifespanBonus    = Math.min(total, maxLifespanBonus);

  // Fertility boost: flat additive per community feed (owner feeds don't stack here)
  const fertilityBoost = Math.min(communityFeeds * 0.05, 0.25); // max +25%

  // Health label and unicode symbol
  let label, symbol;
  if      (healthPct >= 0.80) { label = "Thriving";  symbol = "✨"; }
  else if (healthPct >= 0.55) { label = "Well-fed";  symbol = "✦";  }
  else if (healthPct >= 0.30) { label = "Nourished"; symbol = "•";  }
  else if (healthPct >  0.00) { label = "Hungry";    symbol = "·";  }
  else                         { label = "Unfed";     symbol = "·";  }

  return { weightedScore, lifespanBonus, fertilityBoost, healthPct, label, symbol };
}

// ============================================================
// STEEMBIOTA UNICODE ART SYSTEM v3 — Side-profile silhouette
//
// Renders a side-facing quadruped matching the canvas renderer:
//   ears · head+snout+eye · torso · tail · four legs+paws
//   + optional mane, dorsal wing, ornament nodes, fertility sparkles
//
// All output is deterministic from the genome. Width grows with age.
// ============================================================

// ---- Glyph palettes ----
// Body fill — MOR % 6 selects a palette; [dense, mid, light] for top/mid/bottom rows
const UNI_BODY_FILLS = [
  ["▓","▒","░"],   // 0 dense shading
  ["█","▉","▊"],   // 1 solid blocks
  ["◆","◇","◈"],   // 2 diamond texture
  ["●","◉","○"],   // 3 dot texture
  ["▣","▤","▦"],   // 4 patterned blocks
  ["◼","◻","▪"],   // 5 mixed density
];
const UNI_TAIL_CHARS  = ["≋","∿","≈","~","⌇","∾"];  // MOR % 6
const UNI_ORN_CHARS   = ["✦","✧","✶","✹","❈","⬡"];  // ORN % 6
const UNI_EYE_CHARS   = ["◉","◎","⊛","⊙"];           // GEN % 4
const UNI_PAW_CHARS   = ["╨","┴","╩","∪"];           // APP % 4
const UNI_EAR_STYLES  = [" /\\", " /^", " /V", " ^^"]; // APP % 4
const UNI_SIGIL_CHARS = ["⟡","✶","❖","✦","◈","✧"];  // GEN % 6
const UNI_FOSSIL_BODY = ["▒","░","▓","╬","╪","╫"];   // GEN % 6
const UNI_FOSSIL_HEAD = ["☉","⊗","⊙","◎"];           // GEN % 4

// ---- Art width scales with lifecycle ----
function unicodeGridSize(pct) {
  if (pct < 0.05) return 14;
  if (pct < 0.12) return 18;
  if (pct < 0.25) return 24;
  if (pct < 0.50) return 30;
  if (pct < 0.80) return 36;
  if (pct < 1.00) return 30;
  return 24; // fossil
}

// ---- Mirror a single unicode art line (reverses char order) ----
// Used to flip the creature to face right instead of left.
function mirrorUnicodeLine(line) {
  // Split on grapheme boundaries as best we can in plain JS.
  // We use the spread operator which handles most multi-byte Unicode correctly.
  return [...line].reverse().join("");
}

// ---- Main builder ----
// facingRight : boolean — when true the creature faces right (mirrored).
//               Defaults to false (faces left, same as the original).
function buildUnicodeArt(genome, age, feedState, facingRight = false) {
  const effectiveLIF = genome.LIF + (feedState ? feedState.lifespanBonus : 0);
  const pct    = Math.min(age / Math.max(effectiveLIF, 1), 1.0);
  const fossil = pct >= 1.0;
  const W      = unicodeGridSize(pct);

  // Genome fractional values for continuous variation
  const morFrac = (genome.MOR % 1000) / 999;
  const appFrac = (genome.APP % 1000) / 999;
  const ornFrac = (genome.ORN % 1000) / 999;

  // ---- Glyph selection ----
  const fillPool  = UNI_BODY_FILLS[genome.MOR % UNI_BODY_FILLS.length];
  const fillD     = fillPool[0];  // dense — main body interior
  const fillM     = fillPool[1];  // mid   — body edge / shading
  const fillL     = fillPool[2];  // light — belly / top outline row
  const tailChar  = UNI_TAIL_CHARS[genome.MOR % UNI_TAIL_CHARS.length];
  const ornChar   = UNI_ORN_CHARS [genome.ORN % UNI_ORN_CHARS.length];
  const eyeChar   = UNI_EYE_CHARS [genome.GEN % UNI_EYE_CHARS.length];
  const pawChar   = UNI_PAW_CHARS [genome.APP % UNI_PAW_CHARS.length];
  const earStyle  = UNI_EAR_STYLES[genome.APP % UNI_EAR_STYLES.length];
  const sigil     = UNI_SIGIL_CHARS[genome.GEN % UNI_SIGIL_CHARS.length];
  const sex       = genome.SX === 0 ? "♂" : "♀";
  const fertile   = age >= genome.FRT_START && age < genome.FRT_END && !fossil;
  const hasMane   = (genome.ORN % 3) > 0;
  const hasWing   = (genome.APP % 5) === 0;   // ~20% of creatures have a dorsal wing

  // Proportions — all in character columns
  const headW   = Math.max(4, Math.round(W * (0.16 + morFrac * 0.06)));
  const bodyLen = Math.max(6, Math.round(W * (0.42 + morFrac * 0.14)));
  const tailLen = Math.max(3, Math.round(W * (0.20 + appFrac * 0.14)));

  // Layout: creature faces left, tail extends right
  // columns: [1 margin][headW head][bodyLen body][tailLen tail][orb nodes]
  const margin    = 1;
  const headStart = margin;
  const bodyStart = headStart + headW;
  const tailStart = bodyStart + bodyLen;

  // Anatomy counts
  const bodyRows = pct < 0.05 ? 2 : pct < 0.12 ? 3 : pct < 0.4 ? 4 : 5;
  const legH     = pct >= 0.12 ? 2 : 0;  // 0 = newborn has no legs yet
  const showEars = pct >= 0.08;

  // ---- String helpers ----
  const sp   = n => " ".repeat(Math.max(0, n));
  const rep  = (c, n) => { let s = ""; for (let i = 0; i < n; i++) s += c; return s; };
  const pad  = (s, n) => s.length >= n ? s.slice(0, n) : s + sp(n - s.length);

  const lines = [];

  // ---- FOSSIL ----
  if (fossil) {
    const fc = UNI_FOSSIL_BODY[genome.GEN % UNI_FOSSIL_BODY.length];
    const fh = UNI_FOSSIL_HEAD[genome.GEN % UNI_FOSSIL_HEAD.length];
    lines.push(sp(headStart) + fh);
    for (let r = 0; r < 3; r++) lines.push(sp(headStart) + rep(fc, headW + bodyLen));
    lines.push("");
    lines.push(" 🦴 Fossil — genome preserved on-chain");
    return lines.join("\n");
  }

  // ---- EARS row ----
  if (showEars) {
    let earRow = sp(headStart) + earStyle;
    // Mane wisps along the back (above body) for applicable genomes
    if (hasMane && pct >= 0.25) {
      const maneLen = Math.round(bodyLen * 0.45);
      earRow = pad(earRow, bodyStart) + rep("'", maneLen);
    }
    lines.push(earRow);
  }

  // ---- DORSAL WING row (above top body row) ----
  if (hasWing && pct >= 0.4) {
    const wLen = Math.round(bodyLen * 0.35);
    const wOff = bodyStart + Math.round(bodyLen * 0.28);
    lines.push(sp(wOff) + rep("^", wLen));
  }

  // ---- BODY rows ----
  // The head spans the vertically centred rows; top+bottom rows are outline only.
  const headRows = Math.max(1, bodyRows - 2);
  const headTop  = Math.floor((bodyRows - headRows) / 2);
  // Orb column: varies by ORN so each creature has a unique pattern accent position
  const ornCol   = Math.round(bodyLen * (0.30 + ornFrac * 0.42));

  for (let r = 0; r < bodyRows; r++) {
    const isTop    = r === 0;
    const isBottom = r === bodyRows - 1;
    const isMid    = r === Math.floor(bodyRows / 2);
    const hasHead  = r >= headTop && r < headTop + headRows;

    // Row fill density: top/bottom are lighter outline chars; middle is dense
    const rowD = isTop || isBottom ? fillM : fillD;
    const rowL = isTop ? fillL : isBottom ? fillL : fillM;

    let line = sp(margin);

    // Head column
    if (hasHead) {
      const isEyeRow = (r === headTop + Math.floor(headRows / 2));
      if (isEyeRow) {
        // snout dot + eye + body-fill + closing bracket to suggest muzzle
        line += pad("." + eyeChar + rep(rowD, Math.max(0, headW - 3)) + ")", headW);
      } else {
        line += rep(rowL, headW);
      }
    } else {
      line += sp(headW);
    }

    // Body column
    let bodySeg = "";
    for (let c = 0; c < bodyLen; c++) {
      const isEdge = (c === 0 || c === bodyLen - 1);
      // Ornament node: placed at ornCol on the middle row only (adult+)
      if (isMid && pct >= 0.40 && c === ornCol) {
        bodySeg += ornChar;
      } else {
        bodySeg += isEdge ? rowL : rowD;
      }
    }
    line += bodySeg;

    // Tail column — tapers from wide (mid) to narrow (top/bottom)
    if (isMid) {
      line += rep(tailChar, tailLen);
      // Ornament orbs float after the tail tip on mid-row (adult+)
      if (pct >= 0.40) {
        const orbCount = 1 + Math.floor(ornFrac * 3);  // 1–4 orbs
        for (let o = 0; o < orbCount; o++) line += " " + ornChar;
      }
    } else {
      // Taper: rows above/below mid get progressively shorter tail
      const distFromMid = Math.abs(r - Math.floor(bodyRows / 2));
      const taper       = 1 - (distFromMid / Math.ceil(bodyRows / 2)) * 0.65;
      const tLen        = Math.round(tailLen * taper);
      line += sp(tailLen - tLen) + rep(tailChar, tLen);
      // Single sparkle on top tail edge when fertile or thriving
      if (isTop && pct >= 0.40 && (fertile || (feedState && feedState.healthPct >= 0.55))) {
        line += " " + ornChar;
      }
    }

    lines.push(line);
  }

  // ---- LEGS ----
  if (legH > 0) {
    // Four legs: two under head zone (front) + two under body (back)
    const legCols = [
      headStart + Math.round(headW * 0.30),
      headStart + Math.round(headW * 0.82),
      bodyStart + Math.round(bodyLen * 0.26),
      bodyStart + Math.round(bodyLen * 0.72),
    ];
    const rowWidth = tailStart + tailLen + 4;
    for (let lr = 0; lr < legH; lr++) {
      const chars = Array(rowWidth).fill(" ");
      for (const col of legCols) {
        if (col < chars.length)
          chars[col] = (lr === legH - 1) ? pawChar : "|";
      }
      lines.push(chars.join("").trimEnd());
    }
  }

  // ---- HEADER line (sigil · sex · health · fertile sparkles) ----
  const healthSym = feedState && feedState.healthPct > 0 ? feedState.symbol + " " : "";
  const header    = fertile
    ? "✦ " + sigil + sex + " ✦"
    : healthSym + sigil + sex;

  // ---- Mirror all lines when facingRight ----
  const bodyLines = facingRight ? lines.map(mirrorUnicodeLine) : lines;

  return header + "\n" + bodyLines.join("\n");
}
// ============================================================
// ROUTE VIEWS
// ============================================================

// ---- HomeView ----
const HomeView = {
  name: "HomeView",
  inject: ["username", "hasKeychain", "notify"],
  components: {
    CreatureCanvasComponent,
    CreatureCardComponent,
    GenomeTableComponent,
    LoadingSpinnerComponent,
    BreedingPanelComponent,
    FeedingPanelComponent
  },
  data() {
    return {
      // Founder creation
      genome:         null,
      unicodeArt:     "",
      publishing:     false,
      birthTimestamp: null,
      now:            new Date(),
      feedState:      null,
      customTitle:    "",
      facingRight:    false,
      genusInput:     "",      // user-specified genus (0–999), blank = random
      // All-creatures list + filters
      allCreatures:  [],
      listLoading:   true,
      listError:     "",
      listPage:      1,
      filterGenus:   "",       // "" = all, otherwise genus number as string
      filterSex:     ""        // "" = all, "0" = male, "1" = female
    };
  },
  created() {
    this._ageTicker = setInterval(() => { this.now = new Date(); }, 60000);
    this.loadCreatureList();
  },
  beforeUnmount() {
    clearInterval(this._ageTicker);
  },
  computed: {
    creatureName()   { return this.genome ? generateFullName(this.genome) : null; },
    sexLabel()       { return this.genome ? (this.genome.SX === 0 ? "♂ Male" : "♀ Female") : ""; },
    age() {
      if (!this.birthTimestamp) return 0;
      return Math.max(0, Math.floor((this.now - new Date(this.birthTimestamp)) / 86400000));
    },
    lifecycleStage() { return this.genome ? getLifecycleStage(this.age, this.genome) : null; },
    fossil() {
      if (!this.genome) return false;
      return this.age >= this.genome.LIF + (this.feedState ? this.feedState.lifespanBonus : 0);
    },
    lifecycleColor() { return this.lifecycleStage ? this.lifecycleStage.color : "#888"; },
    lifecycleIcon()  { return this.lifecycleStage ? this.lifecycleStage.icon  : "";    },
    genusInputValid() {
      if (this.genusInput === "") return true;   // blank = random, always ok
      const n = Number(this.genusInput);
      return Number.isInteger(n) && n >= 0 && n <= 999;
    },
    availableGenera() {
      const set = new Set(this.allCreatures.map(c => c.genome.GEN));
      return [...set].sort((a, b) => a - b);
    },
    filteredCreatures() {
      return this.allCreatures.filter(c => {
        if (this.filterGenus !== "" && c.genome.GEN !== Number(this.filterGenus)) return false;
        if (this.filterSex   !== "" && c.genome.SX  !== Number(this.filterSex))   return false;
        return true;
      });
    },
    totalPages()    { return Math.max(1, Math.ceil(this.filteredCreatures.length / PAGE_SIZE)); },
    pagedCreatures() {
      const s = (this.listPage - 1) * PAGE_SIZE;
      return this.filteredCreatures.slice(s, s + PAGE_SIZE);
    }
  },
  watch: {
    age(v)        { if (this.genome) this.unicodeArt = buildUnicodeArt(this.genome, v, this.feedState, this.facingRight); },
    feedState(fs) { if (this.genome) this.unicodeArt = buildUnicodeArt(this.genome, this.age, fs, this.facingRight); },
    filterGenus() { this.listPage = 1; },
    filterSex()   { this.listPage = 1; }
  },
  methods: {
    async loadCreatureList() {
      this.listLoading = true;
      this.listError   = "";
      try {
        const raw = await fetchPostsByTag("steembiota", 100);
        this.allCreatures = parseSteembiotaPosts(Array.isArray(raw) ? raw : []);
      } catch (e) {
        this.listError = e.message || "Failed to load creatures.";
      }
      this.listLoading = false;
    },
    createFounder() {
      if (!this.username) { this.notify("Please log in first.", "error"); return; }
      if (!this.genusInputValid) { this.notify("Genus must be a whole number from 0 to 999.", "error"); return; }
      this.birthTimestamp = new Date().toISOString();
      this.genome         = generateGenome();
      // Override GEN if the user specified one
      if (this.genusInput !== "") this.genome.GEN = Number(this.genusInput);
      this.facingRight    = Math.random() < 0.5;
      this.feedState      = null;
      this.unicodeArt     = buildUnicodeArt(this.genome, 0, null, this.facingRight);
      this.customTitle    = buildDefaultTitle(generateFullName(this.genome), new Date(this.birthTimestamp));
    },
    async publishCreature() {
      if (!this.username)         { this.notify("Please log in first.", "error"); return; }
      if (!this.genome)           { this.notify("Create a creature first.", "error"); return; }
      if (!window.steem_keychain) { this.notify("Steem Keychain is not installed.", "error"); return; }
      this.publishing = true;
      publishCreature(this.username, this.genome, this.unicodeArt, this.creatureName, this.age, this.lifecycleStage.name, this.customTitle, (response) => {
        this.publishing = false;
        if (response.success) {
          this.notify("🌿 " + this.creatureName + " published to the blockchain!", "success");
          this.$router.push("/@" + this.username + "/" + response.permlink);
        } else {
          this.notify("Publish failed: " + (response.message || "Unknown error"), "error");
        }
      });
    },
    prevPage() { if (this.listPage > 1) this.listPage--; },
    nextPage() { if (this.listPage < this.totalPages) this.listPage++; },
    onFacingResolved(dir) {
      this.facingRight = dir;
      if (this.genome) this.unicodeArt = buildUnicodeArt(this.genome, this.age, this.feedState, dir);
    }
  },

  template: `
    <div style="margin-top:20px;padding:0 16px;">

      <!-- Founder creation — visible to any logged-in user -->
      <div v-if="username">
        <div style="display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center;margin-bottom:8px;">
          <label style="font-size:13px;color:#888;">Genus (0–999, blank = random):</label>
          <input
            v-model="genusInput"
            type="number"
            min="0" max="999" step="1"
            placeholder="random"
            style="width:90px;font-size:13px;padding:5px 8px;"
            @keydown.enter="createFounder"
          />
          <button @click="createFounder" :disabled="!genusInputValid">🌱 Create Founder Creature</button>
        </div>

        <div v-if="creatureName" style="margin:16px 0 6px;">
          <div style="font-size:1.3rem;font-weight:bold;color:#a5d6a7;">🧬 {{ creatureName }}</div>
          <div style="font-size:0.9rem;color:#888;margin-top:2px;">{{ sexLabel }}</div>
        </div>

        <creature-canvas-component v-if="genome" :genome="genome" :age="age" :fossil="fossil" :feed-state="feedState"
          @facing-resolved="onFacingResolved"
        ></creature-canvas-component>
        <div v-if="fossil" style="margin:6px 0;color:#666;font-size:0.85rem;">🦴 Fossilised. Genome preserved on-chain.</div>

        <div v-if="genome">
          <h3 style="color:#a5d6a7;margin:16px 0 4px;">Genome</h3>
          <genome-table-component :genome="genome"></genome-table-component>
          <h3 style="color:#a5d6a7;margin:16px 0 4px;">Unicode Render</h3>
          <pre :style="fossil ? { color:'#444', opacity:'0.6' } : {}">{{ unicodeArt }}</pre>
          <div style="margin-top:16px;max-width:520px;margin-left:auto;margin-right:auto;">
            <label style="display:block;font-size:12px;color:#888;margin-bottom:4px;">Post title</label>
            <input v-model="customTitle" type="text" maxlength="255" style="width:100%;font-size:13px;"/>
          </div>
          <br/>
          <button @click="publishCreature" :disabled="publishing||!username" style="background:#1565c0;">
            {{ publishing ? "Publishing…" : "📡 Publish to Steem" }}
          </button>
          <p v-if="!username" style="color:#888;font-size:13px;margin:4px 0;">Log in to publish.</p>
        </div>
        <hr/>
      </div>

      <!-- Feed + Breed panels -->
      <feeding-panel-component
        :username="username"
        @notify="(msg,type) => notify(msg,type)"
        @feed-state-updated="(fs) => { feedState = fs }"
      ></feeding-panel-component>
      <breeding-panel-component
        :username="username"
        @notify="(msg,type) => notify(msg,type)"
      ></breeding-panel-component>

      <hr/>

      <!-- ── All Creatures ── -->
      <h3 style="color:#a5d6a7;margin:18px 0 12px;font-size:1rem;letter-spacing:0.04em;">
        🌿 All Creatures
        <span v-if="!listLoading && !listError" style="font-size:0.75rem;color:#555;font-weight:normal;margin-left:8px;">
          ({{ filteredCreatures.length }}{{ filteredCreatures.length !== allCreatures.length ? ' of ' + allCreatures.length : '' }} total)
        </span>
      </h3>

      <loading-spinner-component v-if="listLoading"></loading-spinner-component>
      <div v-else-if="listError" style="color:#ff8a80;font-size:13px;">⚠ {{ listError }}</div>
      <div v-else-if="allCreatures.length === 0" style="color:#555;font-size:13px;">No creatures published yet.</div>

      <template v-else>
        <!-- Filters -->
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:center;margin-bottom:14px;">
          <select
            v-model="filterGenus"
            style="padding:5px 8px;font-size:13px;background:#1a1a1a;color:#ccc;border:1px solid #333;border-radius:6px;font-family:monospace;"
          >
            <option value="">All genera</option>
            <option v-for="g in availableGenera" :key="g" :value="String(g)">Genus {{ g }}</option>
          </select>
          <div style="display:flex;gap:4px;">
            <button
              @click="filterSex = ''"
              :style="{ padding:'4px 10px', fontSize:'12px', background: filterSex==='' ? '#2e7d32' : '#1a1a1a', color: filterSex==='' ? '#fff' : '#888', border:'1px solid #333', borderRadius:'6px' }"
            >All</button>
            <button
              @click="filterSex = '0'"
              :style="{ padding:'4px 10px', fontSize:'12px', background: filterSex==='0' ? '#1565c0' : '#1a1a1a', color: filterSex==='0' ? '#90caf9' : '#888', border:'1px solid #333', borderRadius:'6px' }"
            >♂ Male</button>
            <button
              @click="filterSex = '1'"
              :style="{ padding:'4px 10px', fontSize:'12px', background: filterSex==='1' ? '#880e4f' : '#1a1a1a', color: filterSex==='1' ? '#f48fb1' : '#888', border:'1px solid #333', borderRadius:'6px' }"
            >♀ Female</button>
          </div>
        </div>

        <div v-if="filteredCreatures.length === 0" style="color:#555;font-size:13px;margin:12px 0;">
          No creatures match the current filter.
        </div>
        <template v-else>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(185px,1fr));gap:12px;max-width:920px;margin:0 auto;">
          <creature-card-component
            v-for="c in pagedCreatures"
            :key="c.author + '/' + c.permlink"
            :post="c"
          ></creature-card-component>
        </div>

        <div v-if="totalPages > 1" style="margin-top:16px;display:flex;align-items:center;justify-content:center;gap:14px;">
          <button @click="prevPage" :disabled="listPage === 1" style="padding:5px 14px;background:#1a2a1a;">◀ Prev</button>
          <span style="font-size:13px;color:#555;">{{ listPage }} / {{ totalPages }}</span>
          <button @click="nextPage" :disabled="listPage === totalPages" style="padding:5px 14px;background:#1a2a1a;">Next ▶</button>
        </div>
        </template>
      </template>

    </div>
  `
};

// ---- AboutView ----
// Fetches README.md from the GitHub repo and renders it as styled HTML.
const AboutView = {
  name: "AboutView",
  components: { LoadingSpinnerComponent },
  data() { return { html: "", loading: true, loadError: "" }; },
  async created() {
    try {
      const res = await fetch(
        "https://raw.githubusercontent.com/puncakbukit/steembiota/main/README.md"
      );
      if (!res.ok) throw new Error("HTTP " + res.status);
      this.html = this.mdToHtml(await res.text());
    } catch (e) {
      this.loadError = e.message || "Could not load documentation.";
    }
    this.loading = false;
  },
  methods: {
    // Minimal Markdown → HTML (no library needed).
    // Handles: h1/h2/h3, bold, italic, inline code, fenced code blocks,
    // links, unordered lists, ordered lists, tables, hr, paragraphs.
    mdToHtml(md) {
      const esc    = s => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
      const inline = s => s
        .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
        .replace(/`([^`]+)`/g, "<code style='background:#0a0a0a;padding:1px 5px;border-radius:3px;font-size:0.88em;color:#80deea;'>$1</code>")
        .replace(/\*\*([^*]+)\*\*/g, "<strong style='color:#eee;'>$1</strong>")
        .replace(/\*([^*]+)\*/g, "<em>$1</em>")
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g,
          '<a href="$2" target="_blank" rel="noopener" style="color:#80deea;">$1</a>');

      const lines   = md.split("\n");
      const out     = [];
      let inCode    = false, codeBuf = [];
      let inList    = false, listOl  = false, listBuf = [];
      let inTable   = false, tRows   = [];

      const flushList = () => {
        if (!inList) return;
        const tag = listOl ? "ol" : "ul";
        out.push(`<${tag} style="text-align:left;color:#aaa;padding-left:22px;margin:6px 0;">`);
        listBuf.forEach(li => out.push(`<li style="margin:2px 0;">${inline(li)}</li>`));
        out.push(`</${tag}>`);
        inList = false; listBuf = [];
      };

      const flushTable = () => {
        if (!inTable) return;
        out.push('<div style="overflow-x:auto;margin:10px 0;"><table style="border-collapse:collapse;font-size:13px;color:#ccc;text-align:left;min-width:320px;">');
        tRows.forEach((cells, ri) => {
          out.push("<tr>");
          cells.forEach(cell => {
            const tag = ri === 0 ? "th" : "td";
            const sty = ri === 0
              ? "padding:5px 14px;border-bottom:1px solid #2e7d32;color:#a5d6a7;font-weight:bold;white-space:nowrap;"
              : "padding:4px 14px;border-bottom:1px solid #1e1e1e;";
            out.push(`<${tag} style="${sty}">${inline(cell.trim())}</${tag}>`);
          });
          out.push("</tr>");
        });
        out.push("</table></div>");
        inTable = false; tRows = [];
      };

      for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];

        // Fenced code block
        if (raw.startsWith("```")) {
          if (!inCode) {
            flushList(); flushTable();
            inCode = true; codeBuf = [];
          } else {
            out.push(`<pre style="background:#0a0a0a;border:1px solid #1e2e1e;border-radius:6px;
              padding:12px 16px;text-align:left;font-size:12px;overflow-x:auto;
              margin:8px 0;color:#a5d6a7;line-height:1.5;"><code>${esc(codeBuf.join("\n"))}</code></pre>`);
            inCode = false;
          }
          continue;
        }
        if (inCode) { codeBuf.push(raw); continue; }

        // Table row
        if (raw.includes("|") && raw.trim().startsWith("|")) {
          flushList();
          const cells = raw.trim().replace(/^\||\|$/g,"").split("|");
          // Skip separator rows like |---|---|
          if (cells.every(c => /^[-: ]+$/.test(c.trim()))) continue;
          if (!inTable) inTable = true;
          tRows.push(cells);
          continue;
        }
        if (inTable) flushTable();

        // Headings
        if (/^### /.test(raw)) {
          flushList();
          out.push(`<h3 style="color:#66bb6a;margin:14px 0 4px;font-size:0.97rem;">${inline(raw.slice(4))}</h3>`);
          continue;
        }
        if (/^## /.test(raw)) {
          flushList();
          out.push(`<h2 style="color:#80deea;margin:20px 0 5px;font-size:1.1rem;border-bottom:1px solid #1a2a1a;padding-bottom:4px;">${inline(raw.slice(3))}</h2>`);
          continue;
        }
        if (/^# /.test(raw)) {
          flushList();
          out.push(`<h1 style="color:#a5d6a7;margin:0 0 8px;font-size:1.4rem;">${inline(raw.slice(2))}</h1>`);
          continue;
        }

        // Horizontal rule
        if (/^---+$/.test(raw.trim())) {
          flushList();
          out.push('<hr style="border:none;border-top:1px solid #1e2e1e;margin:16px 0;">');
          continue;
        }

        // Unordered list
        const ulM = raw.match(/^[-*+] (.+)/);
        if (ulM) {
          if (!inList || listOl)  { flushList(); inList = true; listOl = false; }
          listBuf.push(ulM[1]);
          continue;
        }

        // Ordered list
        const olM = raw.match(/^\d+\. (.+)/);
        if (olM) {
          if (!inList || !listOl) { flushList(); inList = true; listOl = true; }
          listBuf.push(olM[1]);
          continue;
        }

        flushList();

        // Blank line → spacing
        if (raw.trim() === "") { out.push('<div style="height:6px;"></div>'); continue; }

        // Paragraph
        out.push(`<p style="color:#ccc;margin:4px 0;line-height:1.75;">${inline(raw)}</p>`);
      }

      flushList(); flushTable();
      return out.join("\n");
    }
  },
  template: `
    <div style="margin:20px auto;max-width:720px;padding:0 20px 40px;text-align:left;">
      <loading-spinner-component v-if="loading"></loading-spinner-component>
      <div v-else-if="loadError" style="color:#ff8a80;margin-top:24px;">
        ⚠ {{ loadError }}
      </div>
      <div v-else v-html="html"></div>
    </div>
  `
};

// ---- ProfileView ----
// Shows a user's bred creatures with paginated cards.
// Profile/cover images are already shown globally — not repeated here.
const ProfileView = {
  name: "ProfileView",
  inject: ["notify"],
  components: { CreatureCardComponent, LoadingSpinnerComponent },
  data() {
    return {
      creatures:   [],
      loading:     true,
      loadError:   "",
      listPage:    1,
      filterGenus: "",   // "" = all, otherwise genus number as string
      filterSex:   ""    // "" = all, "0" = male, "1" = female
    };
  },
  async created() {
    const user = this.$route.params.user;
    this.loading = true;
    try {
      const raw = await fetchPostsByUser(user, 100);
      this.creatures = parseSteembiotaPosts(Array.isArray(raw) ? raw : []);
    } catch (e) {
      this.loadError = e.message || "Failed to load creatures.";
      this.notify("Failed to load profile.", "error");
    }
    this.loading = false;
  },
  computed: {
    username()   { return this.$route.params.user; },
    availableGenera() {
      const set = new Set(this.creatures.map(c => c.genome.GEN));
      return [...set].sort((a, b) => a - b);
    },
    filteredCreatures() {
      return this.creatures.filter(c => {
        if (this.filterGenus !== "" && c.genome.GEN !== Number(this.filterGenus)) return false;
        if (this.filterSex   !== "" && c.genome.SX  !== Number(this.filterSex))   return false;
        return true;
      });
    },
    totalPages() { return Math.max(1, Math.ceil(this.filteredCreatures.length / PAGE_SIZE)); },
    pagedCreatures() {
      const s = (this.listPage - 1) * PAGE_SIZE;
      return this.filteredCreatures.slice(s, s + PAGE_SIZE);
    }
  },
  watch: {
    filterGenus() { this.listPage = 1; },
    filterSex()   { this.listPage = 1; }
  },
  methods: {
    prevPage() { if (this.listPage > 1) this.listPage--; },
    nextPage() { if (this.listPage < this.totalPages) this.listPage++; }
  },
  template: `
    <div style="margin-top:20px;padding:0 16px;">

      <!-- User heading -->
      <h2 style="color:#a5d6a7;margin:0 0 4px;">@{{ username }}</h2>
      <p style="color:#555;font-size:13px;margin:0 0 16px;">
        Creatures bred by this user
      </p>

      <loading-spinner-component v-if="loading"></loading-spinner-component>
      <div v-else-if="loadError" style="color:#ff8a80;font-size:13px;">⚠ {{ loadError }}</div>
      <div v-else-if="creatures.length === 0" style="color:#555;font-size:13px;">
        No SteemBiota creatures found for @{{ username }}.
      </div>

      <template v-else>
        <p style="font-size:12px;color:#444;margin:0 0 12px;">
          {{ filteredCreatures.length }}{{ filteredCreatures.length !== creatures.length ? ' of ' + creatures.length : '' }}
          creature{{ filteredCreatures.length === 1 ? '' : 's' }}
        </p>

        <!-- Filters -->
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:center;margin-bottom:14px;">
          <select
            v-model="filterGenus"
            style="padding:5px 8px;font-size:13px;background:#1a1a1a;color:#ccc;border:1px solid #333;border-radius:6px;font-family:monospace;"
          >
            <option value="">All genera</option>
            <option v-for="g in availableGenera" :key="g" :value="String(g)">Genus {{ g }}</option>
          </select>
          <div style="display:flex;gap:4px;">
            <button
              @click="filterSex = ''"
              :style="{ padding:'4px 10px', fontSize:'12px', background: filterSex==='' ? '#2e7d32' : '#1a1a1a', color: filterSex==='' ? '#fff' : '#888', border:'1px solid #333', borderRadius:'6px' }"
            >All</button>
            <button
              @click="filterSex = '0'"
              :style="{ padding:'4px 10px', fontSize:'12px', background: filterSex==='0' ? '#1565c0' : '#1a1a1a', color: filterSex==='0' ? '#90caf9' : '#888', border:'1px solid #333', borderRadius:'6px' }"
            >♂ Male</button>
            <button
              @click="filterSex = '1'"
              :style="{ padding:'4px 10px', fontSize:'12px', background: filterSex==='1' ? '#880e4f' : '#1a1a1a', color: filterSex==='1' ? '#f48fb1' : '#888', border:'1px solid #333', borderRadius:'6px' }"
            >♀ Female</button>
          </div>
        </div>

        <div v-if="filteredCreatures.length === 0" style="color:#555;font-size:13px;margin:12px 0;">
          No creatures match the current filter.
        </div>
        <template v-else>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(185px,1fr));gap:12px;max-width:920px;margin:0 auto;">
          <creature-card-component
            v-for="c in pagedCreatures"
            :key="c.author + '/' + c.permlink"
            :post="c"
          ></creature-card-component>
        </div>

        <div v-if="totalPages > 1" style="margin-top:16px;display:flex;align-items:center;justify-content:center;gap:14px;">
          <button @click="prevPage" :disabled="listPage === 1" style="padding:5px 14px;background:#1a2a1a;">◀ Prev</button>
          <span style="font-size:13px;color:#555;">{{ listPage }} / {{ totalPages }}</span>
          <button @click="nextPage" :disabled="listPage === totalPages" style="padding:5px 14px;background:#1a2a1a;">Next ▶</button>
        </div>
        </template>
      </template>

    </div>
  `
};

// ---- CreatureView ----
// Route: /@:author/:permlink
// Loads a published SteemBiota post, renders the creature,
// shows a kinship panel (parents, siblings, children),
// and provides Feed + Breed interaction panels.
const CreatureView = {
  name: "CreatureView",
  inject: ["username", "notify"],
  components: {
    CreatureCanvasComponent,
    CreatureCardComponent,
    GenomeTableComponent,
    LoadingSpinnerComponent,
    FeedingPanelComponent,
    BreedingPanelComponent
  },
  data() {
    return {
      loading:       true,
      loadError:     null,
      genome:        null,
      name:          null,
      author:        null,
      permlink:      null,
      postAge:       null,
      feedState:     null,
      parentA:       null,   // { name, author, permlink, genome, age, lifecycleStage } | null
      parentB:       null,
      siblings:      [],     // array of card-ready objects
      children:      [],
      kinshipLoading: false,
      now:           new Date(),
      facingRight:   false,   // synced from the canvas component's random direction
      urlCopied:     false    // brief confirmation state for the copy button
    };
  },
  created() {
    this._ticker = setInterval(() => { this.now = new Date(); }, 60000);
    this.loadCreature();
  },
  beforeUnmount() {
    clearInterval(this._ticker);
  },
  computed: {
    sexLabel()      { return this.genome ? (this.genome.SX === 0 ? "♂ Male" : "♀ Female") : ""; },
    lifecycleStage(){ return this.genome ? getLifecycleStage(this.postAge ?? 0, this.genome) : null; },
    fossil() {
      if (!this.genome) return false;
      return (this.postAge ?? 0) >= this.genome.LIF + (this.feedState ? this.feedState.lifespanBonus : 0);
    },
    unicodeArt()       { return this.genome ? buildUnicodeArt(this.genome, this.postAge ?? 0, this.feedState, this.facingRight) : ""; },
    steemitUrl()       {
      if (!this.author || !this.permlink) return null;
      return "https://steemit.com/@" + this.author + "/" + this.permlink;
    },
    breedPrefilledUrl() {
      if (!this.author || !this.permlink) return null;
      return "https://steemit.com/@" + this.author + "/" + this.permlink;
    }
  },
  methods: {
    async loadCreature() {
      this.loading   = true;
      this.loadError = null;
      const { author, permlink } = this.$route.params;
      this.author   = author;
      this.permlink = permlink;
      try {
        const post = await fetchPost(author, permlink);
        if (!post || !post.author) throw new Error("Post not found.");

        let meta = {};
        try { meta = JSON.parse(post.json_metadata || "{}"); } catch {}
        if (!meta.steembiota) throw new Error("This post is not a SteemBiota creature.");

        const sb       = meta.steembiota;
        this.genome    = sb.genome;
        this.name      = sb.name || author;
        this.postAge   = sb.age ?? 0;

        // Load feed events
        const replies    = await fetchAllReplies(author, permlink);
        const feedEvents = parseFeedEvents(replies, author);
        this.feedState   = computeFeedState(feedEvents, this.genome);

        // Store parent refs from metadata (no extra fetch needed for display)
        this._rawParentA = sb.parentA || null;
        this._rawParentB = sb.parentB || null;

      } catch (err) {
        this.loadError = err.message || "Failed to load creature.";
      }
      this.loading = false;

      // Load kinship in background after main render
      if (!this.loadError) this.loadKinship();
    },

    async loadKinship() {
      this.kinshipLoading = true;
      const selfKey = nodeKey(this.author, this.permlink);
      try {
        // --- Parents: fetch individually (cheap, known keys) ---
        const loadParent = async (ref) => {
          if (!ref || !ref.author || !ref.permlink) return null;
          try {
            const node = await fetchSteembiotaPost(ref.author, ref.permlink);
            if (!node) return null;
            return {
              author:        node.author,
              permlink:      node.permlink,
              name:          node.meta.name || node.author,
              genome:        node.meta.genome,
              age:           node.meta.age ?? 0,
              lifecycleStage: getLifecycleStage(node.meta.age ?? 0, node.meta.genome),
              created:       ""
            };
          } catch { return null; }
        };
        const [pA, pB] = await Promise.all([
          loadParent(this._rawParentA),
          loadParent(this._rawParentB)
        ]);
        this.parentA = pA;
        this.parentB = pB;

        // --- Siblings + Children: build a small corpus from this author + parent authors ---
        const authorsToFetch = new Set([this.author]);
        if (this._rawParentA?.author) authorsToFetch.add(this._rawParentA.author);
        if (this._rawParentB?.author) authorsToFetch.add(this._rawParentB.author);

        const corpus = await fetchCorpusByAuthors(authorsToFetch);
        // Seed corpus with the creature itself
        corpus.set(selfKey, {
          key: selfKey, author: this.author, permlink: this.permlink,
          meta: { genome: this.genome, name: this.name, age: this.postAge,
                  parentA: this._rawParentA, parentB: this._rawParentB }
        });

        // Siblings
        const siblingKeys = findSiblings(new Set([selfKey]), corpus);
        this.siblings = [...siblingKeys]
          .filter(k => k !== selfKey)
          .slice(0, 10)
          .map(k => {
            const n = corpus.get(k);
            if (!n) return null;
            return {
              author: n.author, permlink: n.permlink,
              name:   n.meta.name || n.author,
              genome: n.meta.genome, age: n.meta.age ?? 0,
              lifecycleStage: getLifecycleStage(n.meta.age ?? 0, n.meta.genome),
              created: ""
            };
          }).filter(Boolean);

        // Children (direct only)
        const childKeys = findDescendants(new Set([selfKey]), corpus);
        this.children = [...childKeys]
          .slice(0, 10)
          .map(k => {
            const n = corpus.get(k);
            if (!n) return null;
            // Only include direct children (parentA or parentB is selfKey)
            const pA = n.meta.parentA;
            const pB = n.meta.parentB;
            const paKey = pA?.author ? nodeKey(pA.author, pA.permlink) : null;
            const pbKey = pB?.author ? nodeKey(pB.author, pB.permlink) : null;
            if (paKey !== selfKey && pbKey !== selfKey) return null;
            return {
              author: n.author, permlink: n.permlink,
              name:   n.meta.name || n.author,
              genome: n.meta.genome, age: n.meta.age ?? 0,
              lifecycleStage: getLifecycleStage(n.meta.age ?? 0, n.meta.genome),
              created: ""
            };
          }).filter(Boolean);

      } catch { /* kinship is best-effort */ }
      this.kinshipLoading = false;
    },

    onFeedStateUpdated(fs) { this.feedState = fs; },
    onFacingResolved(dir)  { this.facingRight = dir; },
    copyUrl() {
      if (!this.steemitUrl) return;
      navigator.clipboard.writeText(this.steemitUrl).then(() => {
        this.urlCopied = true;
        setTimeout(() => { this.urlCopied = false; }, 1800);
      }).catch(() => {
        const ta = document.createElement("textarea");
        ta.value = this.steemitUrl;
        ta.style.position = "fixed";
        ta.style.opacity  = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        this.urlCopied = true;
        setTimeout(() => { this.urlCopied = false; }, 1800);
      });
    }
  },

  template: `
    <div style="margin-top:20px;padding:0 16px;">

      <loading-spinner-component v-if="loading"></loading-spinner-component>

      <div v-else-if="loadError" style="color:#ff8a80;margin-top:24px;">
        ⚠ {{ loadError }}
        <br/><br/>
        <router-link to="/" style="color:#66bb6a;">← Back to Home</router-link>
      </div>

      <template v-else-if="genome">

        <!-- Identity header -->
        <div style="margin-bottom:12px;">
          <div style="font-size:1.3rem;font-weight:bold;color:#a5d6a7;letter-spacing:0.03em;">🧬 {{ name }}</div>
          <div style="font-size:0.9rem;color:#888;margin-top:2px;">{{ sexLabel }}</div>
          <div style="margin-top:8px;display:inline-flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:center;">
            <span style="font-size:0.85rem;color:#aaa;">
              Age: <strong style="color:#eee;">{{ postAge }} day{{ postAge === 1 ? '' : 's' }}</strong>
            </span>
            <span v-if="lifecycleStage"
              :style="{ fontSize:'0.82rem', fontWeight:'bold', color:lifecycleStage.color,
                        border:'1px solid '+lifecycleStage.color, borderRadius:'12px', padding:'2px 10px' }"
            >{{ lifecycleStage.icon }} {{ lifecycleStage.name }}</span>
            <span style="font-size:0.8rem;color:#666;">
              Lifespan: {{ genome.LIF + (feedState ? feedState.lifespanBonus : 0) }} days
              <template v-if="feedState && feedState.lifespanBonus > 0">
                <span style="color:#66bb6a;">(+{{ feedState.lifespanBonus }}🍃)</span>
              </template>
              &nbsp;·&nbsp; Fertile: {{ genome.FRT_START }}–{{ genome.FRT_END }}
            </span>
            <span v-if="feedState"
              :style="{
                fontSize:'0.80rem', fontWeight:'bold',
                color: feedState.healthPct >= 0.55 ? '#a5d6a7' : feedState.healthPct >= 0.30 ? '#ffb74d' : '#888',
                border:'1px solid '+(feedState.healthPct >= 0.55 ? '#388e3c' : feedState.healthPct >= 0.30 ? '#f57c00' : '#444'),
                borderRadius:'12px', padding:'2px 10px'
              }"
            >{{ feedState.symbol }} {{ feedState.label }}</span>
          </div>
        </div>

        <!-- Canvas render -->
        <creature-canvas-component :genome="genome" :age="postAge" :fossil="fossil" :feed-state="feedState"
          @facing-resolved="onFacingResolved"
        ></creature-canvas-component>
        <div v-if="fossil" style="margin:6px 0;color:#666;font-size:0.85rem;letter-spacing:0.05em;">
          🦴 This creature has fossilised. Its genome is preserved on-chain.
        </div>

        <!-- Unicode render -->
        <h3 style="color:#a5d6a7;margin:16px 0 4px;">Unicode Render</h3>
        <pre :style="fossil ? { color:'#444', opacity:'0.6' } : {}">{{ unicodeArt }}</pre>

        <!-- Genome table -->
        <h3 style="color:#a5d6a7;margin:16px 0 4px;">Genome</h3>
        <genome-table-component :genome="genome"></genome-table-component>

        <!-- Steem post link + copy button -->
        <div v-if="steemitUrl" style="margin:16px 0;display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:center;">
          <a :href="steemitUrl" target="_blank" style="font-size:13px;color:#80deea;">
            📄 View on Steemit
          </a>
          <span style="color:#333;font-size:13px;">·</span>
          <span style="font-size:12px;color:#444;">@{{ author }}/{{ permlink }}</span>
          <button
            @click="copyUrl"
            :style="{
              padding: '4px 12px',
              fontSize: '12px',
              background: urlCopied ? '#1b3a1b' : '#1a1a1a',
              color: urlCopied ? '#66bb6a' : '#555',
              border: '1px solid ' + (urlCopied ? '#2e7d32' : '#2a2a2a'),
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }"
            title="Copy Steemit URL to clipboard"
          >{{ urlCopied ? "✓ Copied!" : "📋 Copy URL" }}</button>
        </div>

        <hr/>

        <!-- ── Kinship Panel ── -->
        <div style="margin:8px 0 20px;">
          <h3 style="color:#a5d6a7;margin:0 0 12px;font-size:1rem;">🌿 Family</h3>

          <div v-if="kinshipLoading" style="color:#555;font-size:13px;margin:8px 0;">
            ⏳ Loading kinship…
          </div>
          <template v-else>

            <!-- Parents -->
            <template v-if="parentA || parentB">
              <div style="font-size:0.78rem;color:#66bb6a;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Parents</div>
              <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(185px,1fr));gap:10px;max-width:500px;">
                <creature-card-component v-if="parentA" :post="parentA"></creature-card-component>
                <creature-card-component v-if="parentB" :post="parentB"></creature-card-component>
              </div>
            </template>
            <div v-else style="font-size:12px;color:#333;margin-bottom:8px;">No parent data (origin creature)</div>

            <!-- Children -->
            <template v-if="children.length > 0">
              <div style="font-size:0.78rem;color:#66bb6a;text-transform:uppercase;letter-spacing:0.08em;margin:14px 0 6px;">
                Children ({{ children.length }})
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(185px,1fr));gap:10px;max-width:920px;">
                <creature-card-component v-for="c in children" :key="c.author+'/'+c.permlink" :post="c"></creature-card-component>
              </div>
            </template>

            <!-- Siblings -->
            <template v-if="siblings.length > 0">
              <div style="font-size:0.78rem;color:#66bb6a;text-transform:uppercase;letter-spacing:0.08em;margin:14px 0 6px;">
                Siblings ({{ siblings.length }})
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(185px,1fr));gap:10px;max-width:920px;">
                <creature-card-component v-for="s in siblings" :key="s.author+'/'+s.permlink" :post="s"></creature-card-component>
              </div>
            </template>

          </template>
        </div>

        <hr/>

        <!-- Feed panel -->
        <feeding-panel-component
          :username="username"
          :initial-url="steemitUrl"
          :unicode-art="unicodeArt"
          @notify="(msg,type) => notify(msg,type)"
          @feed-state-updated="onFeedStateUpdated"
        ></feeding-panel-component>

        <!-- Breed panel — Parent A pre-filled -->
        <breeding-panel-component
          :username="username"
          :initial-url-a="breedPrefilledUrl"
          @notify="(msg,type) => notify(msg,type)"
        ></breeding-panel-component>

      </template>

    </div>
  `
};



// ============================================================
// LEADERBOARD HELPERS
// ============================================================

// Compute per-author XP from a flat array of raw Steem posts (no comments).
// Returns an array of { author, xp, breakdown } sorted by XP descending.
function computeLeaderboardEntries(rawPosts) {
  const byAuthor = {};   // author -> { founders, offspring, genera:Set, speciated }

  for (const p of (rawPosts || [])) {
    let meta = {};
    try { meta = JSON.parse(p.json_metadata || "{}"); } catch {}
    const sb = meta.steembiota;
    if (!sb) continue;
    const a = p.author;
    if (!byAuthor[a]) byAuthor[a] = { founders: 0, offspring: 0, genera: new Set(), speciated: 0 };
    if (sb.type === "founder") {
      byAuthor[a].founders++;
      if (sb.genome) byAuthor[a].genera.add(sb.genome.GEN);
    } else if (sb.type === "offspring") {
      byAuthor[a].offspring++;
      if (sb.genome) byAuthor[a].genera.add(sb.genome.GEN);
      if (sb.speciated) byAuthor[a].speciated++;
    }
  }

  return Object.entries(byAuthor).map(([author, d]) => {
    const xp =
      d.founders   * 100 +
      d.offspring  * 60  +
      d.genera.size * 25 +
      d.speciated  * 75;
    const rank = USER_RANKS.find(r => xp >= r.minXp) || USER_RANKS[USER_RANKS.length - 1];
    return {
      author,
      xp,
      rank:    rank.title,
      icon:    rank.icon,
      breakdown: {
        founders:  d.founders,
        offspring: d.offspring,
        genera:    d.genera.size,
        speciated: d.speciated
      }
    };
  }).sort((a, b) => b.xp - a.xp);
}

// ---- LeaderboardView ----
const LeaderboardView = {
  name: "LeaderboardView",
  inject: ["notify"],
  components: { LoadingSpinnerComponent },
  data() {
    return {
      entries:   [],   // sorted leaderboard rows with profile data merged
      loading:   true,
      loadError: "",
      topXp:     1     // used to scale XP bars
    };
  },
  async created() {
    this.loading   = true;
    this.loadError = "";
    try {
      // getDiscussionsByCreated has a hard limit of 100 per call.
      // Fetch two pages using start_author/start_permlink cursor to get ~200 posts.
      const page1 = await fetchPostsByTag("steembiota", 100);
      let allRaw = Array.isArray(page1) ? [...page1] : [];

      // Only fetch page 2 if page 1 was full (there may be more)
      if (allRaw.length === 100) {
        const last = allRaw[allRaw.length - 1];
        const page2 = await fetchPostsByTagPaged("steembiota", 100, last.author, last.permlink);
        if (Array.isArray(page2)) {
          // The first result of page2 overlaps with the last of page1 — skip it
          const fresh = page2.slice(1);
          allRaw = allRaw.concat(fresh);
        }
      }

      const computed = computeLeaderboardEntries(allRaw);

      if (computed.length === 0) {
        this.entries = [];
        this.loading = false;
        return;
      }

      // Batch-fetch all author profiles in one API call
      const authors  = computed.map(e => e.author);
      const profiles = await fetchAccountsBatch(authors);

      this.entries = computed.map(e => ({
        ...e,
        profile: profiles[e.author] || { username: e.author, displayName: e.author, profileImage: "", about: "" }
      }));
      this.topXp = Math.max(1, this.entries[0]?.xp ?? 1);
    } catch (e) {
      this.loadError = e.message || "Failed to load leaderboard.";
    }
    this.loading = false;
  },
  methods: {
    safeUrl(url) {
      try { return new URL(url).protocol === "https:" ? url : ""; } catch { return ""; }
    },
    medalColor(rank) {
      if (rank === 1) return "#ffd700";
      if (rank === 2) return "#c0c0c0";
      if (rank === 3) return "#cd7f32";
      return "#444";
    },
    rankColor(rankTitle) {
      const colors = {
        "Progenitor":   "#ffd700",
        "Evolutionist": "#80deea",
        "Ecologist":    "#a5d6a7",
        "Breeder":      "#f48fb1",
        "Cultivator":   "#66bb6a",
        "Naturalist":   "#90caf9",
        "Wanderer":     "#555"
      };
      return colors[rankTitle] || "#555";
    }
  },
  template: `
    <div style="margin-top:20px;padding:0 16px 40px;">
      <h2 style="color:#a5d6a7;margin:0 0 4px;font-size:1.1rem;letter-spacing:0.05em;">🏆 Leaderboard</h2>
      <p style="font-size:12px;color:#444;margin:0 0 20px;">
        Ranked by XP from founders, offspring, genera contributed &amp; speciation events.
        Feed XP not included (requires per-user scan).
      </p>

      <loading-spinner-component v-if="loading"></loading-spinner-component>
      <div v-else-if="loadError" style="color:#ff8a80;font-size:13px;">⚠ {{ loadError }}</div>
      <div v-else-if="entries.length === 0" style="color:#555;font-size:13px;">No activity on-chain yet.</div>

      <div v-else style="max-width:700px;margin:0 auto;display:flex;flex-direction:column;gap:10px;">
        <router-link
          v-for="(entry, idx) in entries"
          :key="entry.author"
          :to="'/@' + entry.author"
          style="text-decoration:none;"
        >
          <div :style="{
            background: idx === 0 ? 'linear-gradient(135deg,#1a2a0a,#0f1a0f)' : '#111',
            border: '1px solid ' + (idx < 3 ? medalColor(idx+1) : '#222'),
            borderRadius: '10px',
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            transition: 'background 0.15s',
            cursor: 'pointer'
          }"
          @mouseover="$event.currentTarget.style.background='#1a2a1a'"
          @mouseleave="$event.currentTarget.style.background = idx===0 ? 'linear-gradient(135deg,#1a2a0a,#0f1a0f)' : '#111'"
          >
            <!-- Position number -->
            <div :style="{
              minWidth: '28px',
              textAlign: 'center',
              fontWeight: 'bold',
              fontSize: idx < 3 ? '1.2rem' : '0.85rem',
              color: medalColor(idx+1),
              flexShrink: 0
            }">
              {{ idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '#' + (idx+1) }}
            </div>

            <!-- Avatar -->
            <img
              v-if="safeUrl(entry.profile.profileImage)"
              :src="safeUrl(entry.profile.profileImage)"
              @error="$event.target.style.display='none'"
              style="width:38px;height:38px;border-radius:50%;object-fit:cover;border:1px solid #333;flex-shrink:0;"
            />
            <div v-else style="width:38px;height:38px;border-radius:50%;background:#1a2e1a;border:1px solid #333;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:1rem;">
              🌿
            </div>

            <!-- Name + rank + XP bar -->
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;">
                <span style="font-size:0.9rem;font-weight:bold;color:#eee;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px;">
                  {{ entry.profile.displayName }}
                </span>
                <span style="font-size:0.72rem;color:#555;">@{{ entry.author }}</span>
                <span :style="{
                  fontSize: '0.7rem',
                  color: rankColor(entry.rank),
                  background: '#111',
                  border: '1px solid #2a2a2a',
                  borderRadius: '10px',
                  padding: '1px 7px',
                  whiteSpace: 'nowrap'
                }">{{ entry.icon }} {{ entry.rank }}</span>
              </div>

              <!-- XP bar -->
              <div style="margin-top:5px;background:#1a1a1a;border-radius:4px;height:5px;overflow:hidden;max-width:360px;">
                <div :style="{
                  width: Math.round((entry.xp / topXp) * 100) + '%',
                  height: '100%',
                  background: 'linear-gradient(90deg,#2e7d32,#66bb6a)',
                  borderRadius: '4px'
                }"></div>
              </div>

              <!-- Activity breakdown -->
              <div style="font-size:0.68rem;color:#444;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                <span style="color:#66bb6a;font-weight:bold;">{{ entry.xp }} XP</span>
                &nbsp;·&nbsp; 🌱 {{ entry.breakdown.founders }}
                &nbsp;·&nbsp; 🐣 {{ entry.breakdown.offspring }}
                &nbsp;·&nbsp; 🔬 {{ entry.breakdown.genera }} genera
                <template v-if="entry.breakdown.speciated > 0">
                  &nbsp;·&nbsp; ⚡ {{ entry.breakdown.speciated }} spec.
                </template>
              </div>
            </div>
          </div>
        </router-link>
      </div>
    </div>
  `
};


const routes = [
  { path: "/",                    component: HomeView       },
  { path: "/about",               component: AboutView      },
  { path: "/leaderboard",         component: LeaderboardView },
  { path: "/@:author/:permlink",  component: CreatureView   },
  { path: "/@:user",              component: ProfileView    },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes
});

// ============================================================
// ROOT APP
// ============================================================

const App = {
  components: {
    AppNotificationComponent,
    AuthComponent,
    UserProfileComponent,
    LoadingSpinnerComponent,
    CreatureCanvasComponent,
    GenomeTableComponent,
    GlobalProfileBannerComponent
  },

  setup() {
    const username      = ref(localStorage.getItem("steem_user") || "");
    const hasKeychain   = ref(false);
    const keychainReady = ref(false);
    const loginError    = ref("");
    const showLoginForm = ref(false);
    const isLoggingIn   = ref(false);
    const notification  = ref({ message: "", type: "error" });
    const profileData   = ref(null);
    const userLevel     = ref(null);   // computed from on-chain activity

    async function loadProfile(user) {
      if (!user) {
        // No logged-in user — show @steembiota's profile as the site identity
        profileData.value = await fetchAccount("steembiota");
        userLevel.value   = null;
        return;
      }
      profileData.value = await fetchAccount(user);
      // Load level data in parallel (best-effort — failure is non-fatal)
      try {
        const [posts, comments] = await Promise.all([
          fetchPostsByUser(user, 100),
          fetchUserComments(user, 100)
        ]);
        userLevel.value = computeUserLevel(
          Array.isArray(posts)    ? posts    : [],
          Array.isArray(comments) ? comments : []
        );
      } catch (e) {
        console.warn("Level load failed:", e);
        userLevel.value = null;
      }
    }

    function notify(message, type = "error") {
      notification.value = { message, type };
    }
    function dismissNotification() {
      notification.value = { message: "", type: "error" };
    }

    onMounted(() => {
      setRPC(0);
      // Always load a profile — logged-in user's own, or @steembiota as fallback
      loadProfile(username.value || "");
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (window.steem_keychain || attempts > 10) {
          clearInterval(interval);
          hasKeychain.value   = !!window.steem_keychain;
          keychainReady.value = true;
        }
      }, 100);
    });

    function login(user) {
      loginError.value = "";
      if (!window.steem_keychain) {
        loginError.value = "Steem Keychain extension is not installed.";
        return;
      }
      if (!user) return;
      isLoggingIn.value = true;
      keychainLogin(user, (res) => {
        isLoggingIn.value = false;
        if (!res.success) {
          loginError.value = "Keychain sign-in was rejected.";
          return;
        }
        const verified = res.data?.username || res.username;
        if (verified !== user) {
          loginError.value = "Signed account does not match entered username.";
          return;
        }
        username.value      = user;
        hasKeychain.value   = true;
        localStorage.setItem("steem_user", user);
        loginError.value    = "";
        showLoginForm.value = false;
        notify("Logged in as @" + user, "success");
        loadProfile(user);
      });
    }

    function logout() {
      username.value = "";
      localStorage.removeItem("steem_user");
      showLoginForm.value = false;
      loadProfile(""); // fall back to @steembiota
    }

    provide("username",    username);
    provide("hasKeychain", hasKeychain);
    provide("notify",      notify);
    provide("profileData", profileData);

    return {
      username, hasKeychain, keychainReady,
      loginError, showLoginForm, isLoggingIn,
      notification, notify, dismissNotification,
      login, logout, profileData, userLevel
    };
  },

  template: `
    <h1>🌿 SteemBiota — Immutable Evolution</h1>

    <!-- Navigation -->
    <nav>
      <router-link to="/"            exact-active-class="nav-active">Home</router-link>
      <router-link
        v-if="username"
        :to="'/@' + username"
        exact-active-class="nav-active"
      >Profile</router-link>
      <router-link to="/leaderboard" exact-active-class="nav-active">🏆 Leaderboard</router-link>
      <router-link to="/about"       exact-active-class="nav-active">About</router-link>

      <a v-if="!username" href="#" @click.prevent="showLoginForm = !showLoginForm">Login</a>
      <a v-else           href="#" @click.prevent="logout">Logout (@{{ username }})</a>
    </nav>

    <!-- Inline login form -->
    <div v-if="!username && showLoginForm" style="margin:8px 0;">
      <auth-component
        :username="username"
        :has-keychain="hasKeychain"
        :login-error="loginError"
        :is-logging-in="isLoggingIn"
        @login="login"
        @logout="logout"
        @close="showLoginForm = false"
      ></auth-component>
    </div>

    <!-- Keychain not detected notice -->
    <div v-if="keychainReady && !hasKeychain" class="keychain-notice">
      <strong>Read-only mode</strong> — Install the
      <a href="https://www.google.com/search?q=steem+keychain" target="_blank" style="color:#ffe082;">
        Steem Keychain
      </a>
      browser extension to publish creatures.
    </div>

    <!-- Global notification -->
    <app-notification-component
      :message="notification.message"
      :type="notification.type"
      @dismiss="dismissNotification"
    ></app-notification-component>

    <!-- Global profile banner — logged-in user, or @steembiota as fallback -->
    <global-profile-banner-component
      :profile-data="profileData"
      :user-level="userLevel"
      :is-logged-in="!!username"
    ></global-profile-banner-component>

    <hr/>

    <!-- Page content -->
    <router-view></router-view>
  `
};

// ============================================================
// MOUNT
// ============================================================

const vueApp = createApp(App);

vueApp.component("AppNotificationComponent",    AppNotificationComponent);
vueApp.component("AuthComponent",               AuthComponent);
vueApp.component("UserProfileComponent",        UserProfileComponent);
vueApp.component("LoadingSpinnerComponent",     LoadingSpinnerComponent);
vueApp.component("CreatureCanvasComponent",     CreatureCanvasComponent);
vueApp.component("GenomeTableComponent",        GenomeTableComponent);
vueApp.component("BreedingPanelComponent",      BreedingPanelComponent);
vueApp.component("GlobalProfileBannerComponent", GlobalProfileBannerComponent);
vueApp.component("FeedingPanelComponent",       FeedingPanelComponent);
vueApp.component("CreatureView",                CreatureView);
vueApp.component("LeaderboardView",             LeaderboardView);

vueApp.use(router);
vueApp.mount("#app");
