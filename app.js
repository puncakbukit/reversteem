// ============================================================
// Reversteem
// Reversi fully derived from Steem blockchain comments
// https://github.com/puncakbukit/reversteem
// Licensed under the MIT License
// ============================================================

/*
==============================================================
ARCHITECTURE OVERVIEW
==============================================================

Reversteem is fully decentralized.

• Root Post      = Game thread
• Join Comment   = White player registration
• Move Comment   = One move
• Comment order  = Turn order

No backend.
No trusted server.
Game state is derived entirely from blockchain history.

URL Structure
Homepage:
#/
Profile:
#/ @username
Game:
#/game/author/permlink
==============================================================
*/


// ============================================================
// CONFIGURATION
// ============================================================

const RPC_NODES = [
  "https://api.steemit.com",
  "https://api.justyy.com",
  "https://steemd.steemworld.org",
  "https://api.steem.fans"
];
let currentRPCIndex = 0;

const TIME_PRESETS = {
  blitz: 5, // 5 minutes
  rapid: 15, // 15 minutes
  standard: 60, // 1 hour
  daily: 1440 // 24 hours
};

const EXTENSION_NOT_INSTALLED = "Steem Keychain extension is not installed!";
const LOGIN_REJECTED = "Login rejected";
const LIVE_DEMO = "https://puncakbukit.github.io/reversteem/";

const APP_NAME = "reversteem";
const APP_VER = "0.1";
const APP_INFO = `${APP_NAME}/${APP_VER}`;

const DIRECTIONS = [-8, 8, -1, 1, -9, -7, 7, 9];

// ============================================================
// ELO CONFIGURATION
// ============================================================

const ELO_BASE = 1200;
const ELO_K = 32;
const ELO_CACHE_KEY = "reversteem_elo_cache";

// TIMEOUT CONFIGURATION 

const MIN_TIMEOUT_MINUTES = 5;
const DEFAULT_TIMEOUT_MINUTES = 60;
const MAX_TIMEOUT_MINUTES = 10080; // 7 days

// ============================================================
// DOM REFERENCES
// ============================================================

const userP = document.getElementById("user");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const startGameBtn = document.getElementById("startGameBtn");
const boardDiv = document.getElementById("board");
const gameListDiv = document.getElementById("gameList");
const profileHeaderDiv = document.getElementById("profileHeader");
const featuredGameDiv = document.getElementById("featuredGame");
const playerBarDiv = document.getElementById("playerBar");
const shownWhenLoggedInDiv = document.getElementById("shownWhenLoggedIn");
const boardOverlayDiv = document.getElementById("board-overlay")
const keychainNoticeDiv = document.getElementById("keychainNotice");
const timeoutControlsDiv = document.getElementById("timeout-controls");
const timeoutDisplayDiv = document.getElementById("timeoutDisplay");
const timeControlsDiv = document.getElementById("time-controls");
const timeoutInput = document.getElementById("timeout-input");

// ============================================================
// STATE
// ============================================================

const profileUser = getProfileFromURL();
const gameFromURL = getGameFromURL();
const accountCache = {};

let username = localStorage.getItem("steem_user") || "";
let currentGame = JSON.parse(localStorage.getItem("current_game") || "null");

let blackPlayer = null;
let whitePlayer = null;
let finished = false;
let winner = null;
let currentAppliedMoves = 0;
let currentPlayer = "black";
let isSubmittingMove = false;
let gameStartTime = null;
let timeoutMinutes = null;
let lastMoveTime = null;

let moves = [];
let board = Array(64).fill(null);

// ============================================================
// INITIALIZATION
// ============================================================

window.addEventListener("hashchange", initRoute);

window.addEventListener("load", () => {
  setRPC(0);
  let attempts = 0;

  const interval = setInterval(() => {
    attempts++;

    if (window.steem_keychain || attempts > 10) {
      clearInterval(interval);
      checkKeychain();
    }
  }, 100);

  initTimeControls();
  if (username) showLoggedIn(username);

  if (gameFromURL) {
    currentGame = gameFromURL;
    loadMovesFromSteem();
  } else if (profileUser) {
    document.title = `Reversteem – @${profileUser}`;
    loadGamesByUser(profileUser);
  } else {
    loadOpenGames();
  }

});

// ============================================================
// AUTHENTICATION
// ============================================================

function showLoggedIn(user) {
  userP.innerText = `Welcome @${user}`;
  loginBtn.style.display = "none";
  shownWhenLoggedInDiv.style.display = "block";
  
  loadUserProfile(username);
}

function showLoggedOut() {
  userP.innerText = "";
  loginBtn.style.display = "inline-block";
  shownWhenLoggedInDiv.style.display = "none";

  loadUserProfile(null);
}

function login() {
  if (!window.steem_keychain) {
    alert(EXTENSION_NOT_INSTALLED);
    return;
  }

  const input = prompt("Enter your Steem username");
  if (!input) return;

  username = input.trim();

  steem_keychain.requestSignBuffer(
    username,
    "Login to Reversteem",
    "Posting",
    (res) => {
      if (!res.success) {
        alert(LOGIN_REJECTED);
        return;
      }

      localStorage.setItem("steem_user", username);
      showLoggedIn(username);
    }
  );
}

function logout() {
  localStorage.removeItem("steem_user");
  showLoggedOut();
}


// ============================================================
// BOARD ENGINE
// ============================================================

function resetBoard() {
  board = Array(64).fill(null);
  board[27] = "white";
  board[28] = "black";
  board[35] = "black";
  board[36] = "white";
}

function row(i) {
  return Math.floor(i / 8);
}

function col(i) {
  return i % 8;
}

function isOnBoardGeneric(from, to, dir) {
  if (to < 0 || to >= 64) return false;

  const row = i => Math.floor(i / 8);
  const col = i => i % 8;

  if (dir === -1 || dir === 1)
    return row(from) === row(to);

  if (dir === -9 || dir === 7)
    return col(to) < col(from);

  if (dir === -7 || dir === 9)
    return col(to) > col(from);

  return true;
}

function collectFlipsForBoard(boardState, start, dir, player) {
  const opponent = player === "black" ? "white" : "black";
  const flips = [];

  let current = start + dir;

  while (
    isOnBoardGeneric(start, current, dir) &&
    boardState[current] === opponent
  ) {
    flips.push(current);
    current += dir;
  }

  if (
    isOnBoardGeneric(start, current, dir) &&
    boardState[current] === player
  ) {
    return flips;
  }

  return [];
}

function getFlipsForBoard(boardState, index, player) {
  if (boardState[index]) return [];

  let all = [];

  for (const dir of DIRECTIONS) {
    all = all.concat(
      collectFlipsForBoard(boardState, index, dir, player)
    );
  }

  return all;
}

function renderBoard() {
  boardDiv.innerHTML = "";

  for (let i = 0; i < 64; i++) {
    const cell = document.createElement("div");
    cell.className = "cell";

    if (board[i]) {
      const disk = document.createElement("div");
      disk.className = board[i];
      cell.appendChild(disk);
    }

    cell.onclick = () => handleCellClick(i);

    boardDiv.appendChild(cell);
  }
}

function deriveGameStateFull(rootPost, replies) {

  let blackPlayer = null;
  let whitePlayer = null;
  let gameStartTime = null;
  let moves = [];
  let timeoutMinutes = DEFAULT_TIMEOUT_MINUTES;
  let timeoutClaims = [];
  
  // ---- Extract black from root ----
  try {
    const rootMeta = JSON.parse(rootPost.json_metadata);
    blackPlayer = rootMeta.black;
let tm = parseInt(rootMeta.timeoutMinutes);

if (isNaN(tm)) tm = DEFAULT_TIMEOUT_MINUTES;

timeoutMinutes = Math.max(
  MIN_TIMEOUT_MINUTES,
  Math.min(tm, MAX_TIMEOUT_MINUTES)
);
  } catch {}

  // ---- Sort replies chronologically ----
  replies.sort((a, b) => new Date(a.created) - new Date(b.created));

  // ---- Extract join + moves ----
  replies.forEach(reply => {
    try {
      const meta = JSON.parse(reply.json_metadata);
      if (!meta.app?.startsWith(APP_NAME + "/")) return;

      // Detect white join
  if (
  meta.action === "join" &&
  !whitePlayer &&
  reply.author !== blackPlayer
) {
  whitePlayer = reply.author;
  gameStartTime = reply.created;
}    
      if (meta.action === "timeout_claim") {
        timeoutClaims.push({
          author: reply.author,
          claimAgainst: meta.claimAgainst,
          moveNumber: meta.moveNumber,
          created: reply.created
        });
      }

      // Detect move
      if (
        meta.action === "move" &&
        typeof meta.index === "number" &&
        meta.index >= 0 &&
        meta.index < 64 &&
        typeof meta.moveNumber === "number"
      ) {
        moves.push({
          index: meta.index,
          author: reply.author,
          moveNumber: meta.moveNumber,
          created: reply.created
        });
      }
    } catch {}
  });

  // ---- Replay deterministically ----

  const board = Array(64).fill(null);
  board[27] = "white";
  board[28] = "black";
  board[35] = "black";
  board[36] = "white";

  let appliedMoves = 0;
  let turn = "black";
  let lastMoveTime = rootPost.created;

  for (const move of moves) {

    if (move.moveNumber !== appliedMoves) continue;

    // pass logic
    if (!hasAnyValidMove(board, turn)) {
      const opponent = (turn === "black") ? "white" : "black";

      if (hasAnyValidMove(board, opponent)) {
        turn = opponent;
      } else {
        break; // 🔥 GAME ENDS HERE
      }
    }

    const expectedAuthor =
      turn === "black" ? blackPlayer : whitePlayer;

    if (move.author !== expectedAuthor) continue;

    const flips = getFlipsForBoard(board, move.index, turn);
    if (flips.length === 0) continue;

    board[move.index] = turn;
    flips.forEach(f => board[f] = turn);

    appliedMoves++;
    lastMoveTime = move.created;

    turn = (turn === "black") ? "white" : "black";
  }

  if (!hasAnyValidMove(board, turn)) {
    const opponent = (turn === "black") ? "white" : "black";

    if (hasAnyValidMove(board, opponent)) {
      turn = opponent;
    }
  }

  const blackHasMove = hasAnyValidMove(board, "black");
  const whiteHasMove = hasAnyValidMove(board, "white");
  const score = countDiscs(board);
  let finished = !blackHasMove && !whiteHasMove;
  let winner = null;

  if (finished) {
    if (score.black > score.white) winner = "black";
    else if (score.white > score.black) winner = "white";
    else winner = "draw";
  }

  for (const claim of timeoutClaims) {

    if (finished) break;

    // Claim must match current move number
    if (claim.moveNumber !== appliedMoves) continue;

    const expectedLoser =
      turn === "black" ? blackPlayer : whitePlayer;

    const expectedWinner =
      turn === "black" ? whitePlayer : blackPlayer;

    if (claim.author !== expectedWinner) continue;

    if (claim.claimAgainst !== turn) continue;

    const lastMoveDate = new Date(lastMoveTime);
    const claimDate = new Date(claim.created);

    const minutesPassed =
      (claimDate - lastMoveDate) / (1000 * 60);

    if (minutesPassed >= timeoutMinutes) {
      finished = true;
      winner = turn === "black" ? "white" : "black";
      break;
    }
  }

 return {
  blackPlayer,
  whitePlayer,
  board,
  currentPlayer: finished ? null : turn,
  appliedMoves,
  finished,
  winner,
  score,
  moves,
  timeoutMinutes,
  gameStartTime,
  lastMoveTime
};
}

// Wrapper with cache
function deriveGameState(rootPost, replies) {
  if (!rootPost) {
    return deriveGameStateFull(rootPost, replies);
  }

  const cacheKey = `reversteem_cache_${rootPost.author}_${rootPost.permlink}`;

  let cache = null;

  try {
    cache = JSON.parse(localStorage.getItem(cacheKey));
  } catch {}

  // Always sort same way before comparing
  replies.sort((a, b) => new Date(a.created) - new Date(b.created));

  const latestBlock =
    replies.length > 0 ?
    replies[replies.length - 1].block :
    0;

  // ---- Validate Cache ----
  if (
    cache &&
    cache.lastBlock === latestBlock &&
    cache.replyCount === replies.length
  ) {
    // Cache is still valid
    return cache.state;
  }

  // ---- Fallback to Full Replay ----
  const state = deriveGameStateFull(rootPost, replies);

  // ---- Store Updated Cache ----
  try {
    localStorage.setItem(
      cacheKey,
      JSON.stringify({
        lastBlock: latestBlock,
        replyCount: replies.length,
        state
      })
    );
  } catch {}

  return state;
}

// Count Discs Deterministically
function countDiscs(boardState) {
  let black = 0;
  let white = 0;

  boardState.forEach(cell => {
    if (cell === "black") black++;
    if (cell === "white") white++;
  });

  return {
    black,
    white
  };
}

// Detect Legal Move
function hasAnyValidMove(boardState, player) {
  for (let i = 0; i < 64; i++) {
    if (getFlipsForBoard(boardState, i, player).length > 0) {
      return true;
    }
  }
  return false;
}

// ============================================================
// ELO RATING ENGINE (Deterministic + Cached)
// ============================================================

function getEloCache() {
  try {
    return JSON.parse(localStorage.getItem(ELO_CACHE_KEY));
  } catch {
    return null;
  }
}

function setEloCache(cache) {
  try {
    localStorage.setItem(ELO_CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

function getRating(ratings, user) {
  if (!ratings[user]) ratings[user] = ELO_BASE;
  return ratings[user];
}

function calculateEloDelta(rA, rB, scoreA) {
  const expectedA = 1 / (1 + Math.pow(10, (rB - rA) / 400));
  return ELO_K * (scoreA - expectedA);
}

// Core incremental updater
async function updateEloRatingsFromGames(posts) {

  if (!posts || posts.length === 0) return;

  // Sort chronologically (oldest first)
  posts.sort((a, b) => new Date(a.created) - new Date(b.created));

  let cache = getEloCache();

  if (!cache) {
    cache = {
      lastProcessed: null,
      ratings: {}
    };
  }

  const ratings = cache.ratings;

  for (const post of posts) {

    // Skip already processed games
    if (
      cache.lastProcessed &&
      new Date(post.created) <= new Date(cache.lastProcessed)
    ) {
      continue;
    }

    const gameState = await deriveGameForElo(post);

    if (!gameState.finished) continue;
    if (!gameState.blackPlayer || !gameState.whitePlayer) continue;

    const black = gameState.blackPlayer;
    const white = gameState.whitePlayer;

    const rBlack = getRating(ratings, black);
    const rWhite = getRating(ratings, white);

    let scoreBlack;
    let scoreWhite;

    if (gameState.winner === "black") {
      scoreBlack = 1;
      scoreWhite = 0;
    } else if (gameState.winner === "white") {
      scoreBlack = 0;
      scoreWhite = 1;
    } else {
      scoreBlack = 0.5;
      scoreWhite = 0.5;
    }

    const deltaBlack = calculateEloDelta(rBlack, rWhite, scoreBlack);
    const deltaWhite = calculateEloDelta(rWhite, rBlack, scoreWhite);

    ratings[black] = Math.round(rBlack + deltaBlack);
    ratings[white] = Math.round(rWhite + deltaWhite);

    cache.lastProcessed = post.created;

  }

  setEloCache(cache);
}

// Helper: fully derive one game deterministically
function deriveGameForElo(post) {
  return new Promise((resolve) => {

    steem.api.getContent(post.author, post.permlink, (err, root) => {
      if (err) return resolve({
        finished: false
      });

      steem.api.getContentReplies(
        post.author,
        post.permlink,
        (err2, replies) => {

          if (err2) return resolve({
            finished: false
          });

          const state = deriveGameState(root, replies);
          resolve(state);
        }
      );
    });

  });
}

function getUserRating(username) {
  const cache = getEloCache();
  if (!cache || !cache.ratings[username]) return ELO_BASE;
  return Math.round(cache.ratings[username]);
}

// ============================================================
// GAME DISCOVERY
// ============================================================

async function loadOpenGames() {
  callWithFallback(
    steem.api.getDiscussionsByCreated,
    [{
      tag: APP_NAME,
      limit: 20
    }],
    async (err, posts) => {

      if (err) return;

      const games = posts.filter(post => {
        try {
          const meta = JSON.parse(post.json_metadata);
          return (
            meta.app?.startsWith(APP_NAME + "/") &&
            meta.type === "game_start"
          );
        } catch {
          return false;
        }
      });

      const enriched = await enrichGamesWithWhitePlayer(games);
      await updateEloRatingsFromGames(enriched);

      renderDashboard(enriched);
    }
  );
}

async function enrichGamesWithWhitePlayer(posts) {

  const enriched = await Promise.all(
    posts.map(post => deriveWhitePlayer(post))
  );

  return enriched;
}

function deriveWhitePlayer(post) {

  return new Promise(resolve => {

    let meta = {};
    try {
      meta = JSON.parse(post.json_metadata);
    } catch {}

    const blackPlayer = meta.black;
    callWithFallback(
      steem.api.getContentReplies,
      [post.author, post.permlink],
      (err, replies) => {

        let whitePlayer = null;

        if (!err && replies) {

          replies
            .sort((a, b) => new Date(a.created) - new Date(b.created))
            .forEach(reply => {

              if (whitePlayer) return;

              try {
                const rmeta = JSON.parse(reply.json_metadata);

                if (
                  rmeta.app?.startsWith(APP_NAME + "/") &&
                  rmeta.action === "join" &&
                  reply.author !== blackPlayer
                ) {
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
      }
    );
  });
}

// ============================================================
// BLOCKCHAIN STATE LOADING
// ============================================================

async function loadMovesFromSteem() {
  if (!currentGame) return;

  return new Promise((resolve, reject) => {
    callWithFallback(
      steem.api.getContent,
      [currentGame.author, currentGame.permlink],
      (err, root) => {

        if (err) return reject(err);

        steem.api.getContentReplies(
          currentGame.author,
          currentGame.permlink,
          (err2, replies) => {

            if (err2) return reject(err2);

            const state = deriveGameState(root, replies);
            
timeoutMinutes = state.timeoutMinutes;
gameStartTime = state.gameStartTime;
lastMoveTime = state.lastMoveTime;
            blackPlayer = state.blackPlayer;
            whitePlayer = state.whitePlayer;
            board = state.board;
            currentPlayer = state.currentPlayer;
            moves = state.moves;
            finished = state.finished;
            winner = state.winner;
            currentAppliedMoves = state.appliedMoves;
            timeoutDisplayDiv.innerText =
              `Move timeout: ${formatTimeout(state.timeoutMinutes)}`;

            renderBoard();
            renderPlayerBar(playerBarDiv, blackPlayer, whitePlayer);

            if (!finished && isTimeoutClaimable()) {
              renderClaimButton();
            }

            resolve();
          }
        );
      }
    );
  });
}

// ============================================================
// GAME ACTIONS
// ============================================================

function makeMove(index) {
  if (!username) {
    alert("Login first");
    return;
  }

  if (currentPlayer === null) {
    alert("Game finished");
    return;
  }

  if (currentPlayer === "white" && !whitePlayer) {
    alert("No opponent yet");
    return;
  }

  if (!hasAnyValidMove(board, currentPlayer)) {
    alert("No valid moves. Turn passes automatically.");
    return;
  }

  const expected =
    currentPlayer === "black" ? blackPlayer : whitePlayer;

  if (username !== expected) {
    alert("Not your turn");
    return;
  }

  const flips = getFlipsForBoard(board, index, currentPlayer);
  if (flips.length === 0) return;

  postMove(index);
}


// ============================================================
// BLOCKCHAIN POSTS
// ============================================================

function startGame() {

  if (!window.steem_keychain || !username) {
    alert("Login first");
    return;
  }

  resetBoard();

  let timeoutMinutes = parseInt(timeoutInput?.value);

  if (isNaN(timeoutMinutes)) {
    timeoutMinutes = DEFAULT_TIMEOUT_MINUTES;
  }

  // 🔥 Clamp safely
timeoutMinutes = Math.max(
  MIN_TIMEOUT_MINUTES,
  Math.min(
    timeoutMinutes,
    MAX_TIMEOUT_MINUTES
  )
);

  const permlink = `${APP_NAME}-${Date.now()}`;

  const meta = {
    app: APP_INFO,
    type: "game_start",
    black: username,
    white: null,
    timeoutMinutes,
    status: "open"
  };

  const body =
    `## New Reversteem Game\n\n` +
    `Black: @${username}\n` +
    `Timeout per move: ${timeoutMinutes} minutes\n\n` +
    boardToMarkdown(board) +
    `\n\n---\nMove by commenting via [Reversteem](${LIVE_DEMO}).`;

  steem_keychain.requestPost(
    username,
    "Reversteem Game Started",
    body,
    APP_NAME,
    "",
    JSON.stringify(meta),
    permlink,
    "",
    (res) => {
      if (!res.success) return;

      currentGame = {
        author: username,
        permlink
      };
      localStorage.setItem("current_game", JSON.stringify(currentGame));
      alert("Game created!");
    }
  );
}

function postMove(index) {

  if (isSubmittingMove) return;
  isSubmittingMove = true;

  boardOverlayDiv.style.display = "flex";

  const meta = {
    app: APP_INFO,
    action: "move",
    index,
    moveNumber: currentAppliedMoves
  };

  const body =
    `## Move by @${username}\n\n` +
    `Played at index ${indexToCoord(index)}\n\n` +
    boardToMarkdown(board);

  steem_keychain.requestPost(
    username,
    "Reversi Move",
    body,
    currentGame.permlink,
    currentGame.author,
    JSON.stringify(meta),
    `reversteem-move-${Date.now()}`,
    "",
    () => {
      isSubmittingMove = false;
      boardOverlayDiv.style.display = "none";
      loadMovesFromSteem();
    }
  );
}

// Board → Markdown Renderer
function boardToMarkdown(boardArray) {
  const symbols = {
    black: "⚫",
    white: "⚪",
    null: "·"
  };

  let md = "### Current Board\n\n";
  md += "| A | B | C | D | E | F | G | H |\n";
  md += "|---|---|---|---|---|---|---|---|\n";

  for (let r = 0; r < 8; r++) {
    md += "|";
    for (let c = 0; c < 8; c++) {
      const piece = boardArray[r * 8 + c];
      md += ` ${symbols[piece]} |`;
    }
    md += "\n";
  }

  return md;
}

// Chess-style coordinates:
function indexToCoord(index) {
  const file = String.fromCharCode(65 + (index % 8));
  const rank = 8 - Math.floor(index / 8);
  return file + rank;
}

// ============================================================
// JOIN FLOW
// ============================================================

function joinGame(author, permlink) {
  console.log("author", author);
  console.log("permlink", permlink);
  // Update URL hash
  window.location.hash = `#/game/${author}/${permlink}`;

  // Set current game
  currentGame = {
    author,
    permlink
  };
  localStorage.setItem("current_game", JSON.stringify(currentGame));

  loadMovesFromSteem().then(() => {
    // Render board is already called inside loadMovesFromSteem via replayMoves()

  });
}

// ============================================================
// KEYCHAIN NOTICE 
// ============================================================

function waitForKeychain(callback) {
  if (window.steem_keychain) {
    callback();
  } else {
    setTimeout(() => waitForKeychain(callback), 100);
  }
}

function checkKeychain() {
  if (!window.steem_keychain) {
    shownWhenLoggedInDiv.style.display = "none"
    keychainNoticeDiv.style.display = "block";
    keychainNoticeDiv.innerHTML = `
      <strong>Spectator Mode</strong><br><br>
      You are currently viewing games in read-only mode.<br><br>
      To start or join games, please install 
      <a href="https://www.google.com/search?q=steem+keychain" target="_blank">
        Steem Keychain
      </a> browser extension.
    `;
  } else {
    keychainNoticeDiv.style.display = "none";
    shownWhenLoggedInDiv.style.display = "block"
  }
}

// ============================================================
// DASHBOARD FEATURES 
// ============================================================

// Parse Username from URL
function getProfileFromURL() {
  const hash = window.location.hash;

  if (hash.startsWith("#/@")) {
    return hash.substring(3); // remove "#/@"
  }

  return null;
}

// Parse Game From URL
function getGameFromURL() {
  const hash = window.location.hash;

  if (hash.startsWith("#/game/")) {
    const parts = hash.split("/");

    return {
      author: parts[2],
      permlink: parts[3]
    };
  }

  return null;
}

// Load Games By User
function loadGamesByUser(user) {
  steem.api.getDiscussionsByBlog({
      tag: user,
      limit: 50
    },
    (err, posts) => {

      if (err) {
        console.log("Error loading user games", err);
        return;
      }

      const games = posts.filter(post => {
        try {
          const meta = JSON.parse(post.json_metadata);
          return (
            meta.app?.startsWith(APP_NAME + "/") &&
            meta.type === "game_start"
          );
        } catch {
          return false;
        }
      });

      updateEloRatingsFromGames(games);
      renderDashboard(parseGames(games));
    }
  );
}

// Render user game list
function renderUserGameList(user, games) {
  gameListDiv.innerHTML = `
    <h3>Games by @${user}</h3>
  `;

  if (games.length === 0) {
    gameListDiv.innerHTML += `<p>No games found.</p>`;
    return;
  }

  games.forEach(post => {
    const div = document.createElement("div");

    div.innerHTML = `
      <strong>${post.title}</strong>
      <button>View</button>
    `;

    div.querySelector("button").onclick = () => {
      console.log("post", JSON.stringify(post));
      joinGame(post.author, post.permlink);
    };

    gameListDiv.appendChild(div);
  });
}

// Fetch Account Data
function loadUserProfile(username) {
  if (username) {
    steem.api.getAccounts([username], function(err, result) {
      if (err || !result || !result.length) return;

      const account = result[0];
      let profile = {};

      try {
        const metadata = account.posting_json_metadata || account.json_metadata;
        profile = JSON.parse(metadata).profile || {};
      } catch (e) {
        profile = {};
      }

      renderUserProfile({
        username: account.name,
        displayName: profile.name || account.name,
        about: profile.about || "",
        profileImage: profile.profile_image || "",
        coverImage: profile.cover_image || ""
      });
    });
  } else {
    profileHeaderDiv.innerHTML = '';
  }
}

// Render Profile UI
function renderUserProfile(data) {
  profileHeaderDiv.innerHTML = `
    <div class="cover" style="
      background-image:url('${data.coverImage}');
      background-size:cover;
      background-position:center;
      height:150px;
      border-radius:8px;
    "></div>

    <div style="display:flex; align-items:center; margin-top:-40px; padding:10px;">
      <img src="${data.profileImage}" 
           style="width:80px; height:80px; border-radius:50%; border:3px solid white; background:white;">
      
      <div style="margin-left:15px;">
        <h2 style="margin:0;">
  ${data.displayName}
  <span style="font-size:14px; color:#666;">
    (ELO: ${getUserRating(data.username)})
  </span>
</h2>

        <small>@${data.username}</small>
        <p style="margin:5px 0;">${data.about}</p>
      </div>
    </div>
  `;
}

// Status Resolver
function getGameStatus(game) {
  if (!game.whitePlayer) return "Waiting for opponent";
  if (game.finished) return "Finished";
  return "In Progress";
}

// Featured Renderer
function renderFeaturedGame(game) {
  featuredGameDiv.innerHTML = "";

  const div = document.createElement("div");

  div.innerHTML = `
    <h2>${game.title}</h2>
    <div id="featuredBoard"></div>
    <p>Status: ${getGameStatus(game)}</p>
    <button class="viewBtn">View</button>
    ${renderJoinButtonHTML(game)}
  `;

  div.querySelector(".viewBtn").onclick = () => {
    joinGame(game.author, game.permlink);
  };

  attachJoinHandler(div, game);

  featuredGameDiv.appendChild(div);

  renderBoardPreview(game, div.querySelector("#featuredBoard"));
}

// Render List Games
function renderGameList(games) {
  gameListDiv.innerHTML = "";

  games.forEach(game => {
    const div = document.createElement("div");

    div.innerHTML = `
      <strong>${game.title}</strong>
      <p>Status: ${getGameStatus(game)}</p>
      <button class="viewBtn">View</button>
      ${renderJoinButtonHTML(game)}
    `;

    div.querySelector(".viewBtn").onclick = () => {
      joinGame(game.author, game.permlink);
    };

    attachJoinHandler(div, game);

    gameListDiv.appendChild(div);
  });
}

// Join Button Logic
function renderJoinButtonHTML(game) {
console.log("JOIN CHECK:", {
  username,
  black: game.blackPlayer,
  white: game.whitePlayer,
  status: game.status
});

  if (!username) return "";

  if (!game.whitePlayer && username !== game.blackPlayer) {
    return `<button class="joinBtn">Join</button>`;
  }

  return "";
}

// And attach
function attachJoinHandler(div, game) {
  const joinBtn = div.querySelector(".joinBtn");
  if (!joinBtn) return;

  joinBtn.onclick = () => {
    currentGame = game;
    localStorage.setItem("current_game", JSON.stringify(game));
    window.location.hash = `#/game/${game.author}/${game.permlink}`;
    postJoin();
  };
}

// Unified Dashboard Renderer
function renderDashboard(games) {
  if (!games.length) return;

  const sorted = games.sort((a, b) =>
    new Date(b.created) - new Date(a.created)
  );

  const featured = sorted[0];
  const others = sorted.slice(1);

  renderFeaturedGame(featured);
  renderGameList(others);
}

function parseGames(posts) {
  return posts.map(post => {
    let meta = {};
    try {
      meta = JSON.parse(post.json_metadata);
    } catch {}

    return {
      author: post.author,
      permlink: post.permlink,
      title: post.title,
      created: post.created,
      blackPlayer: meta.black,
      whitePlayer: null, // will be derived later
      status: meta.status || "open"
    };
  });
}

// 🔥 Clear previous UI
function clearUI() {
  featuredGameDiv.innerHTML = "";
  gameListDiv.innerHTML = "";
  boardDiv.innerHTML = "";
}

// Init route
function initRoute() {
  clearUI();

  const profileUser = getProfileFromURL();
  const gameFromURL = getGameFromURL();

  if (gameFromURL) {
    currentGame = gameFromURL;
    loadMovesFromSteem();
  } else if (profileUser) {
    loadGamesByUser(profileUser);
  } else {
    loadOpenGames();
  }
}

// ============================================================
// BOARD PREVIEW (Read-only Mini Board)
// ============================================================

function renderBoardPreview(game, container) {

  steem.api.getContent(game.author, game.permlink, (err, root) => {

    if (err) return;

    steem.api.getContentReplies(
      game.author,
      game.permlink,
      (err2, replies) => {

        if (err2) return;

        // 🔥 Single canonical deterministic engine call
        const state = deriveGameState(root, replies);

        container.innerHTML = "";
        const playerBar = document.createElement("div");
        container.appendChild(playerBar);

        renderPlayerBar(playerBar, state.blackPlayer, state.whitePlayer, state);

        const boardContainer = document.createElement("div");
        container.appendChild(boardContainer);

        drawMiniBoard(state.board, boardContainer);
      }
    );
  });
}

function drawMiniBoard(boardState, container) {

  container.innerHTML = "";

  const miniBoard = document.createElement("div");
  miniBoard.style.display = "grid";
  miniBoard.style.gridTemplateColumns = "repeat(8, 20px)";
  miniBoard.style.gap = "2px";
  miniBoard.style.margin = "10px auto";

  for (let i = 0; i < 64; i++) {

    const cell = document.createElement("div");
    cell.style.width = "20px";
    cell.style.height = "20px";
    cell.style.background = "#2e7d32";
    cell.style.borderRadius = "3px";

    if (boardState[i]) {
      const disk = document.createElement("div");
      disk.style.width = "16px";
      disk.style.height = "16px";
      disk.style.borderRadius = "50%";
      disk.style.margin = "2px";
      disk.style.background =
        boardState[i] === "black" ?
        "black" :
        "white";

      cell.appendChild(disk);
    }

    miniBoard.appendChild(cell);
  }

  container.appendChild(miniBoard);
}

// RPC Switcher
function setRPC(index) {
  currentRPCIndex = index;
  steem.api.setOptions({
    url: RPC_NODES[index]
  });
  console.log("Switched RPC to:", RPC_NODES[index]);
}

// Safe API Wrapper
function callWithFallback(apiCall, args, callback, attempt = 0) {

  apiCall(...args, (err, result) => {

    if (!err) {
      return callback(null, result);
    }

    console.warn("RPC error on", RPC_NODES[currentRPCIndex]);

    const nextIndex = currentRPCIndex + 1;

    if (nextIndex >= RPC_NODES.length) {
      return callback(err, null); // all failed
    }

    setRPC(nextIndex);

    callWithFallback(apiCall, args, callback, attempt + 1);
  });
}

// Fetch user's Steem account 
function fetchAccount(username) {
  return new Promise(resolve => {

    if (!username) return resolve(null);

    if (accountCache[username]) {
      return resolve(accountCache[username]);
    }

    steem.api.getAccounts([username], (err, result) => {

      if (err || !result || !result.length) {
        return resolve(null);
      }

      const account = result[0];
      let profile = {};

      try {
        const metadata =
          account.posting_json_metadata || account.json_metadata;

        profile = JSON.parse(metadata).profile || {};
      } catch {}

      const data = {
        username: account.name,
        profileImage: profile.profile_image || "",
        displayName: profile.name || account.name
      };

      accountCache[username] = data;
      resolve(data);
    });

  });
}

// Render player bar
async function renderPlayerBar(container, black, white, state = null) {
  container.innerHTML = "";

  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.justifyContent = "space-between";
  wrapper.style.alignItems = "center";
  wrapper.style.margin = "15px 0";

  const whiteData = await fetchAccount(white);
  const blackData = await fetchAccount(black);

  const whiteDiv = createPlayerCard(whiteData, "white", state);
  const blackDiv = createPlayerCard(blackData, "black", state);

  wrapper.appendChild(whiteDiv);
  wrapper.appendChild(blackDiv);

  container.appendChild(wrapper);
}

// Create player card
function createPlayerCard(data, color, state) {

  const div = document.createElement("div");
  div.style.display = "flex";
  div.style.alignItems = "center";
  div.style.gap = "10px";

  if (!data) {
    div.innerHTML = `<span style="color:#888;">Waiting...</span>`;
    return div;
  }

  const img = document.createElement("img");
  img.src = data.profileImage || "https://via.placeholder.com/40";
  img.style.width = "40px";
  img.style.height = "40px";
  img.style.borderRadius = "50%";
  img.style.border = `3px solid ${color === "black" ? "black" : "#ccc"}`;

  const isFinished = state ? state.finished : finished;
  const turn = state ? state.currentPlayer : currentPlayer;
  if (!isFinished && turn === color) {
    img.style.boxShadow = "0 0 10px gold";
  }

  const name = document.createElement("div");
  name.innerHTML = `
    <strong>@${data.username}</strong><br>
    <small>ELO: ${getUserRating(data.username)}</small>
  `;

  div.appendChild(img);
  div.appendChild(name);

  return div;
}

// TIMEOUT FEATURE 

// Post timeout claim 
function postTimeoutClaim() {

  const meta = {
    app: APP_INFO,
    action: "timeout_claim",
    claimAgainst: currentPlayer,
    moveNumber: currentAppliedMoves
  };

  const body = `Timeout claim by @${username}`;

  steem_keychain.requestPost(
    username,
    "Timeout Claim",
    body,
    currentGame.permlink,
    currentGame.author,
    JSON.stringify(meta),
    `reversteem-timeout-${Date.now()}`,
    "",
    () => loadMovesFromSteem()
  );
}

// Format timeout
function formatTimeout(minutes) {
  if (minutes < 60) return `${minutes} min`;
  if (minutes % 60 === 0) return `${minutes / 60} hour(s)`;
  return `${minutes} min`;
}

function isTimeoutClaimable() {

  if (!timeoutMinutes) return false;
  if (!gameStartTime) return false;
  if (finished) return false;
  
const loser =
  currentPlayer === "black" ? blackPlayer : whitePlayer;
const winner =
  currentPlayer === "black" ? whitePlayer : blackPlayer;
if (username !== winner) return false;

  let referenceTime = new Date(lastMoveTime);
  if (currentAppliedMoves === 0)
    referenceTime = new Date(gameStartTime);

  const now = new Date();
  const minutesPassed = (now - referenceTime) / 60000;

  return minutesPassed >= timeoutMinutes;
}

function renderClaimButton() {
  timeoutControlsDiv.innerHTML = "";

  if (!isTimeoutClaimable()) return;

  const loser =
    currentPlayer === "black" ? blackPlayer : whitePlayer;

  const btn = document.createElement("button");
  btn.textContent = `Claim Timeout Victory vs ${loser}`;
  btn.onclick = () => postTimeoutClaim();

  timeoutControlsDiv.appendChild(btn);
}

// Init Time Controls
function initTimeControls() {
  const buttons = document.querySelectorAll("#time-controls button");

  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      const minutes = TIME_PRESETS[mode];

      timeoutInput.value = minutes;

      highlightSelectedMode(mode);
    });
  });

  // Manual input clears preset highlight
  timeoutInput.addEventListener("input", () => {
    clearPresetHighlight();
  });

  // Set default highlight (Standard)
  highlightSelectedMode("standard");
}

function highlightSelectedMode(mode) {
  const buttons = document.querySelectorAll("#time-controls button");

  buttons.forEach(btn => {
    if (btn.dataset.mode === mode) {
      btn.classList.add("active-time");
    } else {
      btn.classList.remove("active-time");
    }
  });
}

function clearPresetHighlight() {
  const buttons = document.querySelectorAll("#time-controls button");
  buttons.forEach(btn => btn.classList.remove("active-time"));
}

async function handleCellClick(index) {
  if (finished) return;
  if (isSubmittingMove) return;

  // Only allow current player to move
  const expected =
    currentPlayer === "black" ? blackPlayer : whitePlayer;

  if (username !== expected) return;

  // If timeout is claimable, do not allow move
  if (isTimeoutClaimable()) return;

  makeMove(index);
}

function lockBoardUI() {
  boardOverlayDiv.style.display = "flex";
}

function unlockBoardUI() {
  boardOverlayDiv.style.display = "none";
}

