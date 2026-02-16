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

Turn Model:
---------------------------------
Move #   Player
0        Black
1        White
2        Black
3        White
...

currentPlayer = (moves.length % 2 === 0) ? "black" : "white"

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

const RPC = "https://api.steemit.com";
const EXTENSION_NOT_INSTALLED = "Steem Keychain extension is not installed!";
const LOGIN_REJECTED = "Login rejected";
const LIVE_DEMO = "https://puncakbukit.github.io/reversteem/";

const APP_NAME = "reversteem";
const APP_VER  = "0.1";
const APP_INFO = `${APP_NAME}/${APP_VER}`;

const DIRECTIONS = [-8, 8, -1, 1, -9, -7, 7, 9];


// ============================================================
// DOM REFERENCES
// ============================================================

const userP        = document.getElementById("user");
const loginBtn     = document.getElementById("loginBtn");
const logoutBtn    = document.getElementById("logoutBtn");
const startGameBtn = document.getElementById("startGameBtn");
const boardDiv     = document.getElementById("board");
const gameListDiv  = document.getElementById("gameList");
const profileHeaderDiv = document.getElementById("profileHeader");
const featuredGameDiv = document.getElementById("featuredGame");

// ============================================================
// STATE
// ============================================================

const profileUser = getProfileFromURL();
const gameFromURL = getGameFromURL();

let username     = localStorage.getItem("steem_user") || "";
let currentGame  = JSON.parse(localStorage.getItem("current_game") || "null");

let blackPlayer = null;
let whitePlayer = null;

let moves        = [];
let currentPlayer = "black";

let board = Array(64).fill(null);

// ============================================================
// INITIALIZATION
// ============================================================

window.addEventListener("hashchange", initRoute);

window.addEventListener("load", () => {
  let attempts = 0;

  const interval = setInterval(() => {
    attempts++;

    if (window.steem_keychain || attempts > 10) {
      clearInterval(interval);
      checkKeychain();
    }
  }, 100);
  
  if (username) showLoggedIn(username);

  if (gameFromURL) {
    currentGame = gameFromURL;
    loadMovesFromSteem();
  }
  else if (profileUser) {
    document.title = `Reversteem – @${profileUser}`;
    loadGamesByUser(profileUser);
  }
  else {
    loadOpenGames();
  }

});

// ============================================================
// AUTHENTICATION
// ============================================================

function showLoggedIn(user) {
  userP.innerText = `Welcome @${user}`;
  loginBtn.style.display = "none";
  logoutBtn.style.display = "inline-block";
  startGameBtn.style.display = "inline-block";

  loadUserProfile(username);
}

function showLoggedOut() {
  userP.innerText = "";
  loginBtn.style.display = "inline-block";
  logoutBtn.style.display = "none";
  startGameBtn.style.display = "none";
  
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

function row(i) { return Math.floor(i / 8); }
function col(i) { return i % 8; }

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

    cell.onclick = () => makeMove(i);
    boardDiv.appendChild(cell);
  }
}

function deriveGameState(rootPost, replies) {

  let blackPlayer = null;
  let whitePlayer = null;
  let moves = [];

  // ---- Extract black from root ----
  try {
    const meta = JSON.parse(rootPost.json_metadata);
    blackPlayer = meta.black;
  } catch {}

  // ---- Sort replies chronologically ----
  replies.sort((a,b)=> new Date(a.created) - new Date(b.created));

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
      }

      // Detect move
      if (
        meta.action === "move" &&
        typeof meta.index === "number" &&
        meta.index >= 0 &&
        meta.index < 64
      ) {
        moves.push({
          index: meta.index,
          author: reply.author
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

moves.forEach(move => {

  // 🔁 Automatic pass BEFORE validating move
if (!hasAnyValidMove(board, turn)) {
  const opponent = (turn === "black") ? "white" : "black";

  if (hasAnyValidMove(board, opponent)) {
    turn = opponent; // single pass
  } else {
    return; // game ended — stop replaying further moves
  }
}

  const expectedAuthor =
    turn === "black"
      ? blackPlayer
      : whitePlayer;

  if (move.author !== expectedAuthor) return;
  if (!blackPlayer || !whitePlayer) return;

  const flips = getFlipsForBoard(board, move.index, turn);
  if (flips.length === 0) return;

  board[move.index] = turn;
  flips.forEach(f => board[f] = turn);

  appliedMoves++;

  // Switch turn after successful move
  turn = (turn === "black") ? "white" : "black";
});

if (!hasAnyValidMove(board, turn)) {
  const opponent = (turn === "black") ? "white" : "black";

  if (hasAnyValidMove(board, opponent)) {
    turn = opponent;
  }
}

  const currentPlayer = turn;
  
const blackHasMove = hasAnyValidMove(board, "black");
const whiteHasMove = hasAnyValidMove(board, "white");

const finished = !blackHasMove && !whiteHasMove;

let winner = null;

if (finished) {
  const { black, white } = countDiscs(board);

  if (black > white) winner = "black";
  else if (white > black) winner = "white";
  else winner = "draw";
}

  return {
    blackPlayer,
    whitePlayer,
    board,
    currentPlayer,
    appliedMoves,
    moves,
    finished,
    winner
  };
}

// ============================================================
// GAME DISCOVERY
// ============================================================

async function loadOpenGames() {
  steem.api.getDiscussionsByCreated(
    { tag: APP_NAME, limit: 20 },
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
    try { meta = JSON.parse(post.json_metadata); } catch {}

    const blackPlayer = meta.black;

    steem.api.getContentReplies(
      post.author,
      post.permlink,
      (err, replies) => {

        let whitePlayer = null;

        if (!err && replies) {

          replies
            .sort((a,b)=> new Date(a.created) - new Date(b.created))
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

    steem.api.getContent(
      currentGame.author,
      currentGame.permlink,
      (err, root) => {

        if (err) return reject(err);

        steem.api.getContentReplies(
          currentGame.author,
          currentGame.permlink,
          (err2, replies) => {

            if (err2) return reject(err2);

            const state = deriveGameState(root, replies);

            blackPlayer   = state.blackPlayer;
            whitePlayer   = state.whitePlayer;
            board         = state.board;
            currentPlayer = state.currentPlayer;
            moves         = state.moves;

            renderBoard();
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

  if (flips.length === 0) {
    alert("Invalid move");
    return;
  }

  board[index] = currentPlayer;
  flips.forEach(i => board[i] = currentPlayer);
  renderBoard();

  postMove(index);
  loadMovesFromSteem();
}

// ============================================================
// BLOCKCHAIN POSTS
// ============================================================

function startGame() {
  if (!window.steem_keychain || !username) {
    alert("Login first");
    return;
  }

  // ✅ Initialize fresh board for new game
  resetBoard();
  
  const permlink = `${APP_NAME}-${Date.now()}`;

  const meta = {
    app: APP_INFO,
    type: "game_start",
    black: username,
    white: null,
    status: "open"
  };

const body =
  `## New Reversteem Game\n\n` +
  `Black: @${username}\n\n` +
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

      currentGame = { author: username, permlink };
      localStorage.setItem("current_game", JSON.stringify(currentGame));
      alert("Game created!");
    }
  );
}

function postJoin() {
  const meta = { app: APP_INFO, action: "join" };

const body =
  `## @${username} joined as White\n\n` +
  boardToMarkdown(board);
  
  steem_keychain.requestPost(
    username,
    "Join Game",
    body,
    currentGame.permlink,
    currentGame.author,
    JSON.stringify(meta),
    `reversteem-join-${Date.now()}`,
    "",
    () => loadMovesFromSteem()
  );
}

function postMove(index) {
  const meta = {
    app: APP_INFO,
    action: "move",
    index
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
    () => {}
  );
}

// Board → Markdown Renderer
function boardToMarkdown(boardArray) {
  const symbols = {
    black: "⚫",
    white: "⚪",
    null:  "·"
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
  currentGame = { author, permlink };
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
  const notice = document.getElementById("keychainNotice");

  if (!window.steem_keychain) {
    loginBtn.disabled = true;
    startGameBtn.disabled = true;
    notice.style.display = "block";
    notice.innerHTML = `
      <strong>Spectator Mode</strong><br><br>
      You are currently viewing games in read-only mode.<br><br>
      To start or join games, please install 
      <a href="https://www.google.com/search?q=steem+keychain" target="_blank">
        Steem Keychain
      </a> browser extension.
    `;
  } else {
    notice.style.display = "none";
  }
}

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
  steem.api.getDiscussionsByBlog(
    { tag: user, limit: 50 },
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
        <h2 style="margin:0;">${data.displayName}</h2>
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
  const container = document.getElementById("gameList");
  container.innerHTML = "";

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

    container.appendChild(div);
  });
}

// Join Button Logic
function renderJoinButtonHTML(game) {
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
    try { meta = JSON.parse(post.json_metadata); } catch {}

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

        drawMiniBoard(state.board, container);
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
        boardState[i] === "black"
          ? "black"
          : "white";

      cell.appendChild(disk);
    }

    miniBoard.appendChild(cell);
  }

  container.appendChild(miniBoard);
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

