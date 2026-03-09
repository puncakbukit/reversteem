// ============================================================
// blockchain.js
// Steem blockchain interactions — pure async helpers.
// Extended with SteemBiota creature publishing.
// No Vue, no DOM dependencies.
// ============================================================

// ---- SteemBiota app URL (used in post bodies to link back to creature pages) ----
const APP_URL = "https://puncakbukit.github.io/steembiota";

// ---- RPC nodes & fallback ----

const RPC_NODES = [
  "https://api.steemit.com",
  "https://api.justyy.com",
  "https://steemd.steemworld.org",
  "https://api.steem.fans"
];

let currentRPCIndex = 0;

function setRPC(index) {
  currentRPCIndex = index;
  steem.api.setOptions({ url: RPC_NODES[index] });
  console.log("Switched RPC to:", RPC_NODES[index]);
}

// Safe API wrapper with automatic RPC fallback on error.
function callWithFallback(apiCall, args, callback, attempt = 0) {
  apiCall(...args, (err, result) => {
    if (!err) return callback(null, result);
    console.warn("RPC error on", RPC_NODES[currentRPCIndex], err);
    const nextIndex = currentRPCIndex + 1;
    if (nextIndex >= RPC_NODES.length) return callback(err, null);
    setRPC(nextIndex);
    callWithFallback(apiCall, args, callback, attempt + 1);
  });
}

// Promise wrapper around callWithFallback.
function callWithFallbackAsync(apiCall, args) {
  return new Promise((resolve, reject) => {
    callWithFallback(apiCall, args, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

// ---- Account helpers ----

// Fetch a single Steem account and extract its profile metadata.
function fetchAccount(username) {
  return new Promise(resolve => {
    if (!username) return resolve(null);
    steem.api.getAccounts([username], (err, result) => {
      if (err || !result || !result.length) return resolve(null);
      const account = result[0];
      let profile = {};
      try {
        profile = JSON.parse(
          account.posting_json_metadata || account.json_metadata
        ).profile || {};
      } catch {}
      resolve({
        username:     account.name,
        profileImage: profile.profile_image || "",
        displayName:  profile.name || account.name,
        about:        profile.about || "",
        coverImage:   profile.cover_image || ""
      });
    });
  });
}

// Fetch multiple Steem accounts in one API call.
// Returns a map of { username: profileData } for all found accounts.
function fetchAccountsBatch(usernames) {
  return new Promise(resolve => {
    if (!usernames || !usernames.length) return resolve({});
    steem.api.getAccounts(usernames, (err, result) => {
      if (err || !result) return resolve({});
      const map = {};
      for (const account of result) {
        let profile = {};
        try {
          profile = JSON.parse(
            account.posting_json_metadata || account.json_metadata
          ).profile || {};
        } catch {}
        map[account.name] = {
          username:     account.name,
          profileImage: profile.profile_image || "",
          displayName:  profile.name || account.name,
          about:        profile.about || "",
          coverImage:   profile.cover_image || ""
        };
      }
      resolve(map);
    });
  });
}

// ---- Post / comment helpers ----

function fetchPost(author, permlink) {
  return callWithFallbackAsync(steem.api.getContent, [author, permlink]);
}

function fetchReplies(author, permlink) {
  return callWithFallbackAsync(steem.api.getContentReplies, [author, permlink]);
}

function fetchAllReplies(author, permlink) {
  return new Promise(resolve => {
    const collected = [];
    function recurse(author, permlink, done) {
      callWithFallback(
        steem.api.getContentReplies,
        [author, permlink],
        (err, replies) => {
          if (err || !replies || replies.length === 0) return done();
          let pending = replies.length;
          replies.forEach(reply => {
            collected.push(reply);
            recurse(reply.author, reply.permlink, () => {
              if (--pending === 0) done();
            });
          });
        }
      );
    }
    recurse(author, permlink, () => resolve(collected));
  });
}

function fetchPostsByTag(tag, limit = 20) {
  return callWithFallbackAsync(
    steem.api.getDiscussionsByCreated,
    [{ tag, limit }]
  );
}

// Paginated version — use start_author + start_permlink as a cursor.
// The first result will duplicate the cursor post; callers should slice(1).
function fetchPostsByTagPaged(tag, limit, startAuthor, startPermlink) {
  return callWithFallbackAsync(
    steem.api.getDiscussionsByCreated,
    [{ tag, limit, start_author: startAuthor, start_permlink: startPermlink }]
  );
}

function fetchPostsByUser(username, limit = 50) {
  return callWithFallbackAsync(
    steem.api.getDiscussionsByBlog,
    [{ tag: username, limit }]
  );
}

// ---- Keychain helpers ----

function keychainPost(
  username, title, body,
  parentPermlink, parentAuthor,
  jsonMetadata, permlink, tags,
  callback
) {
  const meta = typeof jsonMetadata === "string"
    ? JSON.parse(jsonMetadata)
    : { ...jsonMetadata };
  if (tags && tags.length) meta.tags = tags;

  steem_keychain.requestPost(
    username, title, body,
    parentPermlink, parentAuthor,
    JSON.stringify(meta),
    permlink, "",
    callback
  );
}

// Request a Keychain signature to verify account ownership (login).
function keychainLogin(username, callback) {
  steem_keychain.requestSignBuffer(
    username,
    "Login to SteemBiota",
    "Posting",
    callback
  );
}

// ---- SteemBiota — publish a creature to the blockchain ----
//
// genome          : object produced by generateGenome()
// unicodeArt      : string produced by buildUnicodeArt()
// creatureName    : string produced by generateFullName()
// age             : number — days since creation (calculateAge)
// lifecycleStage  : string — "Juvenile" | "Fertile Adult" | "Elder" | "Fossil"
// callback        : (response) => { response.success, response.message }
function publishCreature(username, genome, unicodeArt, creatureName, age, lifecycleStage, title, callback) {
  const permlink = buildPermlink(title);
  const sexLabel = genome.SX === 0 ? "Male" : "Female";

  const creaturePageUrl = `${APP_URL}/#/@${username}/${permlink}`;

  const body =
    `## 🧬 ${creatureName}\n\n` +
    `**Sex:** ${sexLabel}  \n` +
    `**Age:** ${age} day${age === 1 ? "" : "s"}  \n` +
    `**Status:** ${lifecycleStage}  \n` +
    `**Genus ID:** ${genome.GEN}  \n` +
    `**Hue:** ${genome.CLR}°  \n` +
    `**Lifespan:** ${genome.LIF} days  \n` +
    `**Fertile:** Day ${genome.FRT_START}–${genome.FRT_END}  \n` +
    `**Mutation:** MUT ${genome.MUT}  \n\n` +
    `\`\`\`\n${unicodeArt}\n\`\`\`\n\n` +
    `\`\`\`genome\n${JSON.stringify(genome, null, 2)}\n\`\`\`\n\n` +
    `---\n🔗 [View on SteemBiota](${creaturePageUrl})\n\n` +
    `*Published via [SteemBiota — Immutable Evolution](${APP_URL})*`;

  const jsonMetadata = {
    app: "steembiota/1.0",
    tags: ["steembiota", "gaming", "evolution"],
    steembiota: {
      version: "1.0",
      genome,
      name: creatureName,
      age,
      lifecycleStage,
      type: "founder"
    }
  };

  keychainPost(
    username, title, body,
    "steembiota", "",
    jsonMetadata, permlink,
    ["steembiota", "gaming", "evolution"],
    (response) => callback({ ...response, permlink })
  );
}

// ---- SteemBiota — publish a bred offspring to the blockchain ----
//
// breedInfo: { mutated, speciated, parentA: {author,permlink}, parentB: {author,permlink} }
function publishOffspring(username, genome, unicodeArt, creatureName, breedInfo, title, callback) {
  const permlink = buildPermlink(title);
  const sexLabel = genome.SX === 0 ? "Male" : "Female";
  const pA = breedInfo.parentA;
  const pB = breedInfo.parentB;
  const pAUrl = `https://steemit.com/@${pA.author}/${pA.permlink}`;
  const pBUrl = `https://steemit.com/@${pB.author}/${pB.permlink}`;

  const creaturePageUrl = `${APP_URL}/#/@${username}/${permlink}`;

  const mutLine = breedInfo.speciated
    ? "⚡ **Speciation** — new genus emerged!"
    : breedInfo.mutated
      ? "🧬 **Mutation** occurred during breeding"
      : "✔ Clean inheritance";

  const body =
    `## 🧬 ${creatureName}\n\n` +
    `**Sex:** ${sexLabel}  \n` +
    `**Age:** 0 days (newborn)  \n` +
    `**Genus ID:** ${genome.GEN}  \n` +
    `**Lifespan:** ${genome.LIF} days  \n` +
    `**Fertile:** Day ${genome.FRT_START}–${genome.FRT_END}  \n` +
    `**Mutation tendency:** ${genome.MUT}  \n\n` +
    `${mutLine}  \n\n` +
    `**Parents:**  \n` +
    `- Parent A: ${pAUrl}  \n` +
    `- Parent B: ${pBUrl}  \n\n` +
    `\`\`\`\n${unicodeArt}\n\`\`\`\n\n` +
    `\`\`\`genome\n${JSON.stringify(genome, null, 2)}\n\`\`\`\n\n` +
    `---\n🔗 [View on SteemBiota](${creaturePageUrl})\n\n` +
    `*Bred via [SteemBiota — Immutable Evolution](${APP_URL})*`;

  const jsonMetadata = {
    app: "steembiota/1.0",
    tags: ["steembiota", "gaming", "evolution", "breeding"],
    steembiota: {
      version: "1.0",
      genome,
      name: creatureName,
      age: 0,
      lifecycleStage: "Baby",
      type: "offspring",
      parentA: pA,
      parentB: pB,
      mutated:   breedInfo.mutated,
      speciated: breedInfo.speciated
    }
  };

  keychainPost(
    username, title, body,
    "steembiota", "",
    jsonMetadata, permlink,
    ["steembiota", "gaming", "evolution", "breeding"],
    (response) => callback({ ...response, permlink })
  );
}

// ---- SteemBiota — post a birth-announcement reply to a parent's post ----
//
// Called once per parent after a successful offspring publish.
// parentAuthor    : string — author of the parent post
// parentPermlink  : string — permlink of the parent post
// childAuthor     : string — the user who published the offspring
// childPermlink   : string — permlink of the newly published offspring post
// childName       : string — display name of the offspring
// childGenome     : object — offspring genome
// unicodeArt      : string — current unicode art of the offspring (newborn, age 0)
// breedInfo       : { mutated, speciated }
// callback        : (response) => { response.success, response.message }
function publishBirthReply(parentAuthor, parentPermlink, childAuthor, childPermlink, childName, childGenome, unicodeArt, breedInfo, callback) {
  const replyPermlink = buildPermlink("steembiota-birth-" + childName.toLowerCase());
  const sexLabel      = childGenome.SX === 0 ? "♂ Male" : "♀ Female";
  const childUrl      = `${APP_URL}/#/@${childAuthor}/${childPermlink}`;

  const mutLine = breedInfo.speciated
    ? "⚡ **Speciation** — a new genus emerged!"
    : breedInfo.mutated
      ? "🧬 **Mutation** occurred during breeding"
      : "✔ Clean inheritance";

  const body =
    `🍼 **New Offspring Born!**\n\n` +
    `**${childName}** has been born.\n\n` +
    `**Sex:** ${sexLabel}  \n` +
    `**Genus ID:** ${childGenome.GEN}  \n` +
    `**Lifespan:** ${childGenome.LIF} days  \n` +
    `${mutLine}  \n\n` +
    `\`\`\`\n${unicodeArt}\n\`\`\`\n\n` +
    `🔗 [View ${childName} on SteemBiota](${childUrl})\n\n` +
    `*Recorded via [SteemBiota — Immutable Evolution](${APP_URL})*`;

  const jsonMetadata = {
    app: "steembiota/1.0",
    tags: ["steembiota"],
    steembiota: {
      version: "1.0",
      type: "birth",
      child: { author: childAuthor, permlink: childPermlink },
      ts: new Date().toISOString()
    }
  };

  keychainPost(
    childAuthor, "", body,
    parentPermlink, parentAuthor,
    jsonMetadata, replyPermlink,
    ["steembiota"],
    callback
  );
}


//
// creatureAuthor  : string — author of the creature post
// creaturePermlink: string — permlink of the creature post
// creatureName    : string — display name for the reply body
// foodType        : "nectar" | "fruit" | "crystal"
// unicodeArt      : string — current unicode art snapshot (from buildUnicodeArt)
// callback        : (response) => { response.success, response.message }
function publishFeed(username, creatureAuthor, creaturePermlink, creatureName, foodType, unicodeArt, callback) {
  const permlink = buildPermlink("steembiota-feed-" + creatureName.toLowerCase());

  const foodEmoji = { nectar: "🍯", fruit: "🍎", crystal: "💎" }[foodType] || "🍃";
  const foodLabel = { nectar: "Nectar", fruit: "Fruit", crystal: "Crystal" }[foodType] || foodType;

  const creaturePageUrl = `${APP_URL}/#/@${creatureAuthor}/${creaturePermlink}`;

  const artBlock = unicodeArt
    ? `\`\`\`\n${unicodeArt}\n\`\`\`\n\n`
    : "";

  const body =
    `${foodEmoji} **Feeding Event** — ${foodLabel}\n\n` +
    `@${username} fed **${creatureName}** with ${foodLabel}.\n\n` +
    artBlock +
    `\`\`\`\nSTEEMBIOTA_FEED\ncreature: @${creatureAuthor}/${creaturePermlink}\nfood: ${foodType}\nfeeder: ${username}\n\`\`\`\n\n` +
    `🔗 [View ${creatureName} on SteemBiota](${creaturePageUrl})\n\n` +
    `*Recorded via [SteemBiota — Immutable Evolution](${APP_URL})*`;

  const jsonMetadata = {
    app: "steembiota/1.0",
    tags: ["steembiota"],
    steembiota: {
      version: "1.0",
      type: "feed",
      creature: { author: creatureAuthor, permlink: creaturePermlink },
      feeder: username,
      food: foodType,
      ts: new Date().toISOString()
    }
  };

  keychainPost(
    username, "", body,
    creaturePermlink, creatureAuthor,
    jsonMetadata, permlink,
    ["steembiota"],
    callback
  );
}

// ---- SteemBiota — parse feeding events from a flat reply list ----
//
// replies        : array from fetchAllReplies()
// creatureAuthor : string — owner of the creature post
//
// Returns: { total, ownerFeeds, communityFeeds, byFeeder }
// — total      : number of valid (deduplicated) feed events (capped at 20)
// — ownerFeeds : count by the creature owner
// — communityFeeds : count by others
// — byFeeder   : Map<username, count> (used for per-day dedup and display)
//
// Anti-spam rules enforced here (read-side):
//   1. Only replies whose json_metadata.steembiota.type === "feed" are counted
//   2. Each (feeder, UTC-day) pair is counted at most once
//   3. Total cap: 20 feeds maximum
function parseFeedEvents(replies, creatureAuthor) {
  // Track (feeder + UTC-day) pairs already counted
  const seen      = new Set();
  const byFeeder  = {};
  let total       = 0;
  let ownerFeeds  = 0;
  let communityFeeds = 0;

  // Sort ascending by created so earlier feeds take priority under the cap
  const sorted = [...replies].sort((a, b) =>
    new Date(a.created) - new Date(b.created)
  );

  for (const reply of sorted) {
    if (total >= 20) break;

    let meta;
    try {
      meta = JSON.parse(reply.json_metadata || "{}");
    } catch { continue; }

    if (!meta.steembiota || meta.steembiota.type !== "feed") continue;

    const feeder  = reply.author;
    const created = reply.created;
    // UTC day string used as dedup key — e.g. "2025-07-04"
    const utcDay  = (typeof created === "string"
      ? new Date(created.endsWith("Z") ? created : created + "Z")
      : new Date(created)
    ).toISOString().slice(0, 10);

    const key = `${feeder}::${utcDay}`;
    if (seen.has(key)) continue;
    seen.add(key);

    byFeeder[feeder] = (byFeeder[feeder] || 0) + 1;
    total++;
    if (feeder === creatureAuthor) ownerFeeds++;
    else communityFeeds++;
  }

  return { total, ownerFeeds, communityFeeds, byFeeder };
}

// ============================================================
// BREEDING KINSHIP CHECKER
//
// Prevents inbreeding and farming by forbidding breeding between
// creatures that are related by blood. Forbidden relationships:
//
//   • Ancestors (parents, grandparents, … all the way up)
//   • Descendants (children, grandchildren, … all the way down)
//   • Siblings (full or half — any creature sharing ≥1 parent)
//   • Parents' siblings (aunts/uncles, full or half)
//   • Siblings' descendants (nieces/nephews and their progeny)
//
// Strategy:
//   1. Walk ancestry of both creatures upward via json_metadata
//      parentA/parentB fields (BFS, bounded by MAX_ANCESTOR_DEPTH).
//   2. Collect every author seen during that walk.
//   3. Fetch all SteemBiota posts by those authors to build a local
//      corpus — this is where relatives are most likely to appear.
//   4. Within the corpus, identify all relatives of each creature
//      using the five rules above.
//   5. Check that neither creature appears in the other's forbidden set.
// ============================================================

const MAX_ANCESTOR_DEPTH = 12;   // max generations to walk upward
const POSTS_PER_AUTHOR   = 100;  // how many recent posts to fetch per author

// Parse json_metadata from a raw Steem post object.
// Returns the steembiota sub-object, or null if not a SteemBiota post.
function steembiotaMeta(post) {
  try {
    const m = JSON.parse(post.json_metadata || "{}");
    return (m && m.steembiota) ? m.steembiota : null;
  } catch { return null; }
}

// Canonical key for a creature post.
function nodeKey(author, permlink) { return `${author}/${permlink}`; }

// Fetch a post and return its steembiota meta + key, or null.
async function fetchSteembiotaPost(author, permlink) {
  try {
    const post = await fetchPost(author, permlink);
    if (!post || !post.author) return null;
    const meta = steembiotaMeta(post);
    if (!meta) return null;
    return { key: nodeKey(author, permlink), author, permlink, meta };
  } catch { return null; }
}

// Walk ancestors of a creature upward via BFS.
// Returns a Map<key, {author,permlink,meta,depth}> of all ancestors found.
async function fetchAncestors(startAuthor, startPermlink) {
  const visited = new Map();                           // key → node
  const queue   = [{ author: startAuthor, permlink: startPermlink, depth: 0 }];

  while (queue.length > 0) {
    const { author, permlink, depth } = queue.shift();
    const key = nodeKey(author, permlink);
    if (visited.has(key)) continue;

    const node = await fetchSteembiotaPost(author, permlink);
    if (!node) continue;
    visited.set(key, { ...node, depth });

    if (depth >= MAX_ANCESTOR_DEPTH) continue;

    // Enqueue parents if this was an offspring post
    const pA = node.meta.parentA;
    const pB = node.meta.parentB;
    if (pA && pA.author && pA.permlink)
      queue.push({ author: pA.author, permlink: pA.permlink, depth: depth + 1 });
    if (pB && pB.author && pB.permlink)
      queue.push({ author: pB.author, permlink: pB.permlink, depth: depth + 1 });
  }

  return visited;
}

// Fetch all SteemBiota posts by a set of authors and return as a Map<key, node>.
async function fetchCorpusByAuthors(authorSet) {
  const corpus = new Map();
  await Promise.all([...authorSet].map(async author => {
    try {
      const posts = await fetchPostsByUser(author, POSTS_PER_AUTHOR);
      if (!Array.isArray(posts)) return;
      for (const post of posts) {
        const meta = steembiotaMeta(post);
        if (!meta) continue;
        const key = nodeKey(post.author, post.permlink);
        corpus.set(key, { key, author: post.author, permlink: post.permlink, meta });
      }
    } catch { /* skip author on error */ }
  }));
  return corpus;
}

// From a corpus Map, find all descendants of a set of keys (children, grandchildren, …).
// Returns a Set<key> of all descendants.
function findDescendants(seedKeys, corpus) {
  const descendants = new Set();
  let frontier = new Set(seedKeys);

  while (frontier.size > 0) {
    const nextFrontier = new Set();
    for (const [key, node] of corpus) {
      if (descendants.has(key)) continue;
      const pA = node.meta.parentA;
      const pB = node.meta.parentB;
      const paKey = pA && pA.author ? nodeKey(pA.author, pA.permlink) : null;
      const pbKey = pB && pB.author ? nodeKey(pB.author, pB.permlink) : null;
      if ((paKey && frontier.has(paKey)) || (pbKey && frontier.has(pbKey))) {
        descendants.add(key);
        nextFrontier.add(key);
      }
    }
    frontier = nextFrontier;
  }
  return descendants;
}

// Find all siblings of a set of keys (share ≥1 parent with any key in seedKeys).
// parentMap: Map<key, [parentKeyA, parentKeyB]> built from the corpus.
// Returns a Set<key> of siblings (excluding the seeds themselves).
function findSiblings(seedKeys, corpus) {
  // Collect parent keys for all seeds
  const seedParents = new Set();
  for (const seedKey of seedKeys) {
    const node = corpus.get(seedKey);
    if (!node) continue;
    const pA = node.meta.parentA;
    const pB = node.meta.parentB;
    if (pA && pA.author) seedParents.add(nodeKey(pA.author, pA.permlink));
    if (pB && pB.author) seedParents.add(nodeKey(pB.author, pB.permlink));
  }
  if (seedParents.size === 0) return new Set();

  // Any corpus node that shares a parent with a seed is a sibling
  const siblings = new Set();
  for (const [key, node] of corpus) {
    if (seedKeys.has(key)) continue;
    const pA = node.meta.parentA;
    const pB = node.meta.parentB;
    const paKey = pA && pA.author ? nodeKey(pA.author, pA.permlink) : null;
    const pbKey = pB && pB.author ? nodeKey(pB.author, pB.permlink) : null;
    if ((paKey && seedParents.has(paKey)) || (pbKey && seedParents.has(pbKey))) {
      siblings.add(key);
    }
  }
  return siblings;
}

// Build the complete forbidden set for one creature identified by key.
// ancestorMap : Map returned by fetchAncestors (includes the creature itself at depth 0)
// corpus      : Map of all fetched SteemBiota posts by related authors
// Returns Set<key> of all forbidden counterparts.
function buildForbiddenSet(selfKey, ancestorMap, corpus) {
  const forbidden = new Set();

  // 1. Self (never breed with yourself — also caught by URL equality check)
  forbidden.add(selfKey);

  // 2. All ancestors
  for (const key of ancestorMap.keys()) forbidden.add(key);

  // 3. All descendants of self
  const selfDescendants = findDescendants(new Set([selfKey]), corpus);
  for (const k of selfDescendants) forbidden.add(k);

  // 4. Siblings of self (share a parent with self)
  const selfSiblings = findSiblings(new Set([selfKey]), corpus);
  for (const k of selfSiblings) forbidden.add(k);

  // 5. For each ancestor: its siblings (aunts/uncles) + those siblings' descendants
  for (const ancKey of ancestorMap.keys()) {
    // Siblings of this ancestor (parent's other children)
    const ancSiblings = findSiblings(new Set([ancKey]), corpus);
    for (const k of ancSiblings) forbidden.add(k);
    // Descendants of those siblings (cousins, second cousins, …)
    const sibDescendants = findDescendants(ancSiblings, corpus);
    for (const k of sibDescendants) forbidden.add(k);
  }

  // 6. Descendants of self's siblings
  const sibDescendants = findDescendants(selfSiblings, corpus);
  for (const k of sibDescendants) forbidden.add(k);

  return forbidden;
}

// ---- Main entry point ----
//
// resA, resB : objects from loadGenomeFromPost — { genome, author, permlink }
//
// Returns null if compatible, or throws an Error with a human-readable
// explanation if the pair is forbidden.
async function checkBreedingCompatibility(resA, resB) {
  const keyA = nodeKey(resA.author, resA.permlink);
  const keyB = nodeKey(resB.author, resB.permlink);

  // Walk ancestors for both creatures in parallel
  const [ancestorsA, ancestorsB] = await Promise.all([
    fetchAncestors(resA.author, resA.permlink),
    fetchAncestors(resB.author, resB.permlink)
  ]);

  // Remove self from ancestor maps (fetchAncestors includes depth-0 node)
  ancestorsA.delete(keyA);
  ancestorsB.delete(keyB);

  // Collect all authors from both ancestry trees to build a rich corpus
  const authorSet = new Set([resA.author, resB.author]);
  for (const node of ancestorsA.values()) authorSet.add(node.author);
  for (const node of ancestorsB.values()) authorSet.add(node.author);

  // Fetch all SteemBiota posts by those authors + add known ancestor nodes to corpus
  const corpus = await fetchCorpusByAuthors(authorSet);

  // Seed corpus with ancestor nodes in case they predate the blog fetch window
  for (const [k, n] of ancestorsA) corpus.set(k, n);
  for (const [k, n] of ancestorsB) corpus.set(k, n);
  // Also add the two creatures themselves
  const nodeA = await fetchSteembiotaPost(resA.author, resA.permlink);
  const nodeB = await fetchSteembiotaPost(resB.author, resB.permlink);
  if (nodeA) corpus.set(keyA, nodeA);
  if (nodeB) corpus.set(keyB, nodeB);

  // Build forbidden sets for each creature
  const forbiddenA = buildForbiddenSet(keyA, ancestorsA, corpus);
  const forbiddenB = buildForbiddenSet(keyB, ancestorsB, corpus);

  // Helper: describe the relationship for the error message
  function describeRelationship(subjectKey, otherKey, ancestorMap, corpus) {
    if (ancestorMap.has(otherKey)) {
      const depth = ancestorMap.get(otherKey).depth;
      if (depth === 1) return "a parent";
      if (depth === 2) return "a grandparent";
      if (depth === 3) return "a great-grandparent";
      return `an ancestor (${depth} generations up)`;
    }
    // Check if other is a descendant of subject
    const desc = findDescendants(new Set([subjectKey]), corpus);
    if (desc.has(otherKey)) return "a descendant";

    // Check if sibling
    const sibs = findSiblings(new Set([subjectKey]), corpus);
    if (sibs.has(otherKey)) return "a sibling";

    // Check if aunt/uncle (sibling of an ancestor)
    for (const [ancKey, ancNode] of ancestorMap) {
      const ancSibs = findSiblings(new Set([ancKey]), corpus);
      if (ancSibs.has(otherKey)) {
        const depth = ancNode.depth;
        if (depth === 1) return "an aunt or uncle";
        return `a relative (sibling of an ancestor ${depth} generations up)`;
      }
      // Check if niece/nephew descendant (descendant of a sibling)
      const selfSibs = findSiblings(new Set([subjectKey]), corpus);
      const nibDescendants = findDescendants(selfSibs, corpus);
      if (nibDescendants.has(otherKey)) return "a niece, nephew, or their descendant";
    }
    return "a close relative";
  }

  // Check compatibility
  if (forbiddenA.has(keyB)) {
    const rel = describeRelationship(keyA, keyB, ancestorsA, corpus);
    throw new Error(
      `Breeding forbidden: ${resB.author}/${resB.permlink} is ${rel} of ${resA.author}/${resA.permlink}. ` +
      `SteemBiota prevents inbreeding to encourage genetic diversity.`
    );
  }
  if (forbiddenB.has(keyA)) {
    const rel = describeRelationship(keyB, keyA, ancestorsB, corpus);
    throw new Error(
      `Breeding forbidden: ${resA.author}/${resA.permlink} is ${rel} of ${resB.author}/${resB.permlink}. ` +
      `SteemBiota prevents inbreeding to encourage genetic diversity.`
    );
  }

  return null; // compatible
}

// ---- Utility ----

// Build a Steem permlink from an arbitrary title string.
// Lowercases, replaces whitespace/punctuation with hyphens,
// strips non-ASCII, truncates the slug at 200 chars, then
// appends a millisecond timestamp so it is always unique.
function buildPermlink(title) {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/, "")
    .slice(0, 200);                       // leave room for -<13-digit timestamp>
  return `${slug}-${Date.now()}`;
}

// Format a Date into a natural-language birth phrase.
// e.g. "born at noon on Tuesday, March 4, 2025"
//      "born at 7 in the morning on Monday, January 3, 2026"
function formatBirthTime(date) {
  if (!(date instanceof Date) || isNaN(date)) date = new Date();

  const DAYS   = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const MONTHS = ["January","February","March","April","May","June",
                  "July","August","September","October","November","December"];

  const hour    = date.getUTCHours();
  const weekday = DAYS[date.getUTCDay()];
  const month   = MONTHS[date.getUTCMonth()];
  const day     = date.getUTCDate();
  const year    = date.getUTCFullYear();

  // Convert 0–23 UTC hour to a natural English time-of-day phrase
  const HOUR_PHRASES = [
    "midnight",             // 0
    "1 in the morning",     // 1
    "2 in the morning",     // 2
    "3 in the morning",     // 3
    "4 in the morning",     // 4
    "5 in the morning",     // 5
    "6 in the morning",     // 6
    "7 in the morning",     // 7
    "8 in the morning",     // 8
    "9 in the morning",     // 9
    "10 in the morning",    // 10
    "11 in the morning",    // 11
    "noon",                 // 12
    "1 in the afternoon",   // 13
    "2 in the afternoon",   // 14
    "3 in the afternoon",   // 15
    "4 in the afternoon",   // 16
    "5 in the afternoon",   // 17
    "6 in the evening",     // 18
    "7 in the evening",     // 19
    "8 in the evening",     // 20
    "9 at night",           // 21
    "10 at night",          // 22
    "11 at night",          // 23
  ];

  const timePhrase = HOUR_PHRASES[hour];
  return `born at ${timePhrase} UTC on ${weekday}, ${month} ${day}, ${year}`;
}

// Build the default post title for a creature.
// birthDate : Date object (defaults to now)
function buildDefaultTitle(creatureName, birthDate) {
  const born = formatBirthTime(birthDate instanceof Date ? birthDate : new Date());
  return `${creatureName} — ${born}`;
}

function steemDate(ts) {
  if (!ts) return new Date(NaN);
  if (typeof ts === "string" && !ts.endsWith("Z")) ts += "Z";
  return new Date(ts);
}

// Fetch a user's comment/reply history (feed replies, birth replies, etc.)
function fetchUserComments(username, limit = 100) {
  return callWithFallbackAsync(
    steem.api.getDiscussionsByComments,
    [{ start_author: username, limit }]
  );
}
