// ============================================================
// blockchain.js
// Steem blockchain interactions — pure async functions
// No Vue, no DOM dependencies
// ============================================================

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

// Safe API wrapper with RPC fallback
function callWithFallback(apiCall, args, callback, attempt = 0) {
  apiCall(...args, (err, result) => {
    if (!err) return callback(null, result);
    console.warn("RPC error on", RPC_NODES[currentRPCIndex]);
    const nextIndex = currentRPCIndex + 1;
    if (nextIndex >= RPC_NODES.length) return callback(err, null);
    setRPC(nextIndex);
    callWithFallback(apiCall, args, callback, attempt + 1);
  });
}

// Promisified wrapper
function callWithFallbackAsync(apiCall, args) {
  return new Promise((resolve, reject) => {
    callWithFallback(apiCall, args, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

// Fetch a single Steem account
function fetchAccount(username) {
  return new Promise(resolve => {
    if (!username) return resolve(null);
    steem.api.getAccounts([username], (err, result) => {
      if (err || !result || !result.length) return resolve(null);
      const account = result[0];
      let profile = {};
      try {
        profile = JSON.parse(account.posting_json_metadata || account.json_metadata).profile || {};
      } catch {}
      resolve({
        username: account.name,
        profileImage: profile.profile_image || "",
        displayName: profile.name || account.name,
        about: profile.about || "",
        coverImage: profile.cover_image || ""
      });
    });
  });
}

// Recursively fetch all nested replies
function fetchAllReplies(author, permlink) {
  return new Promise(resolve => {
    const collected = [];

    function recurse(author, permlink, done) {
      callWithFallback(steem.api.getContentReplies, [author, permlink], (err, replies) => {
        if (err || !replies || replies.length === 0) return done();
        let pending = replies.length;
        replies.forEach(reply => {
          collected.push(reply);
          recurse(reply.author, reply.permlink, () => {
            pending--;
            if (pending === 0) done();
          });
        });
      });
    }

    recurse(author, permlink, () => resolve(collected));
  });
}

function classifyReplies(replies) {
  const gameReplies = [];
  const spectatorReplies = [];
  replies.forEach(reply => {
    let isGame = false;
    try {
      const meta = JSON.parse(reply.json_metadata);
      if (meta.app?.startsWith(APP_NAME + "/")) isGame = true;
    } catch {}
    if (isGame) gameReplies.push(reply);
    else spectatorReplies.push(reply);
  });
  return { gameReplies, spectatorReplies };
}

// Load open games from Steem
async function loadOpenGamesFromSteem() {
  const posts = await callWithFallbackAsync(steem.api.getDiscussionsByCreated, [{ tag: APP_NAME, limit: 20 }]);
  return posts.filter(post => {
    try {
      const meta = JSON.parse(post.json_metadata);
      return meta.app?.startsWith(APP_NAME + "/") && meta.type === "game_start";
    } catch { return false; }
  });
}

// Load games by user
async function loadGamesByUserFromSteem(user) {
  const posts = await callWithFallbackAsync(steem.api.getDiscussionsByBlog, [{ tag: user, limit: 50 }]);
  return posts.filter(post => {
    try {
      const meta = JSON.parse(post.json_metadata);
      return meta.app?.startsWith(APP_NAME + "/") && meta.type === "game_start";
    } catch { return false; }
  });
}

// Derive white player for a single game post
function deriveWhitePlayer(post) {
  return new Promise(resolve => {
    let meta = {};
    try { meta = JSON.parse(post.json_metadata); } catch {}
    const blackPlayer = meta.black;

    callWithFallback(steem.api.getContentReplies, [post.author, post.permlink], (err, replies) => {
      let whitePlayer = null;
      if (!err && replies) {
        replies
          .sort((a, b) => new Date(a.created) - new Date(b.created))
          .forEach(reply => {
            if (whitePlayer) return;
            try {
              const rmeta = JSON.parse(reply.json_metadata);
              if (rmeta.app?.startsWith(APP_NAME + "/") && rmeta.action === "join" && reply.author !== blackPlayer) {
                whitePlayer = reply.author;
              }
            } catch {}
          });
      }
      resolve({
        author: post.author,
        permlink: post.permlink,
        title: post.title,
        created: post.created,
        blackPlayer,
        whitePlayer,
        status: whitePlayer ? "in_progress" : "open"
      });
    });
  });
}

async function enrichGamesWithWhitePlayer(posts) {
  return Promise.all(posts.map(post => deriveWhitePlayer(post)));
}

// Full game state load from Steem (root + all replies)
async function loadGameFromSteem(author, permlink) {
  const root = await callWithFallbackAsync(steem.api.getContent, [author, permlink]);
  const allReplies = await fetchAllReplies(author, permlink);
  const { gameReplies, spectatorReplies } = classifyReplies(allReplies);
  const state = deriveGameState(root, gameReplies);
  return { state, spectatorReplies, gameReplies, allReplies: [...gameReplies, ...spectatorReplies] };
}

// For ELO computation
function deriveGameForElo(post) {
  return new Promise(resolve => {
    steem.api.getContent(post.author, post.permlink, (err, root) => {
      if (err) return resolve({ finished: false });
      steem.api.getContentReplies(post.author, post.permlink, (err2, replies) => {
        if (err2) return resolve({ finished: false });
        resolve(deriveGameState(root, replies));
      });
    });
  });
}

// Keychain: post a comment/move
function keychainPost(username, title, body, parentPermlink, parentAuthor, jsonMetadata, permlink, tags, callback) {
  steem_keychain.requestPost(
    username, title, body,
    parentPermlink, parentAuthor,
    JSON.stringify(jsonMetadata),
    permlink, tags,
    callback
  );
}
