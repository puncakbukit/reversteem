// ============================================================
// Reversteem
// Reversi fully derived from Steem blockchain comments
// https://github.com/puncakbukit/reversteem
// Licensed under the MIT License
// ============================================================

/*
================================================================
ARCHITECTURE OVERVIEW
================================================================

Reversteem is a fully decentralized Reversi (Othello) game.

Blockchain Mapping:
• Root Post      → Game thread (Black player)
• Join Comment   → White player registration
• Move Comment   → One move
• Comment Order  → Turn order

There is:
• No backend
• No server authority
• No centralized state

Game state is reconstructed entirely from blockchain history.

Turn Model:
---------------------------------
Move #   Player
0        Black
1        White
2        Black
3        White

currentPlayer = (moves.length % 2 === 0)
                ? "black"
                : "white"

URL Routing:
---------------------------------
#/                 → Homepage
#/@username        → Profile page
#/game/a/p         → Game page

================================================================
*/


// ============================================================
// CONFIGURATION
// ============================================================

const RPC = "https://api.steemit.com";

const APP_NAME = "reversteem";
const APP_VER  = "0.1";
const APP_INFO = `${APP_NAME}/${APP_VER}`;

const LIVE_DEMO = "https://puncakbukit.github.io/reversteem/";

const EXTENSION_NOT_INSTALLED =
  "Steem Keychain extension is not installed!";
const LOGIN_REJECTED = "Login rejected";

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
const featuredDiv  = document.getElementById("featuredGame");
const profileDiv   = document.getElementById("profileHeader");
const keychainDiv  = document.getElementById("keychainNotice");


// ============================================================
// APPLICATION STATE
// ============================================================

const profileUser = getProfileFromURL();
const gameFromURL = getGameFromURL();

let username     = localStorage.getItem("steem_user") || "";
let currentGame  = JSON.parse(localStorage.getItem("current_game") || "null");

let blackPlayer  = null;
let whitePlayer  = null;

let moves        = [];
let currentPlayer = "black";

let board = Array(64).fill(null);


// ============================================================
// INITIALIZATION
// ============================================================

window.addEventListener("load", () => {
  waitForKeychain(checkKeychain);

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

  resetBoard();
});

window.addEventListener("hashchange", () => {
  location.reload();
});


// ============================================================
// AUTHENTICATION
// ============================================================

function showLoggedIn(user) {
  userP.innerText = `Welcome @${user}`;
  loginBtn.style.display = "none";
  logoutBtn.style.display = "inline-block";
  startGameBtn.style.display = "inline-block";

  loadUserProfile(user);
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
// BOARD ENGINE (Pure Reversi Logic)
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

function isOnBoard(from, to, dir) {
  if (to < 0 || to >= 64) return false;

  if (dir === -1 || dir === 1)
    return row(from) === row(to);

  if (dir === -9 || dir === 7)
    return col(to) < col(from);

  if (dir === -7 || dir === 9)
    return col(to) > col(from);

  return true;
}

function collectFlips(start, dir, player) {
  const opponent = player === "black" ? "white" : "black";
  const flips = [];

  let current = start + dir;

  while (
    isOnBoard(start, current, dir) &&
    board[current] === opponent
  ) {
    flips.push(current);
    current += dir;
  }

  if (
    isOnBoard(start, current, dir) &&
    board[current] === player
  ) {
    return flips;
  }

  return [];
}

function getFlips(index, player) {
  if (board[index]) return [];

  let all = [];
  for (const dir of DIRECTIONS) {
    all = all.concat(collectFlips(index, dir, player));
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

// ============================================================
// BOARD PREVIEW (Read-only Mini Board)
// ============================================================

function renderBoardPreview(game, container) {

  // Create isolated board state
  let previewBoard = Array(64).fill(null);

  // Initial Reversi setup
  previewBoard[27] = "white";
  previewBoard[28] = "black";
  previewBoard[35] = "black";
  previewBoard[36] = "white";

  // Load moves from blockchain
  steem.api.getContentReplies(
    game.author,
    game.permlink,
    (err, replies) => {

      if (err) return;

      let previewMoves = [];

      replies.forEach(reply => {
        try {
          const meta = JSON.parse(reply.json_metadata);
          if (
            meta.app === APP_INFO &&
            meta.action === "move"
          ) {
            previewMoves.push(meta.index);
          }
        } catch {}
      });

      // Replay moves locally
      previewMoves.forEach((index, i) => {

        const player = (i % 2 === 0)
          ? "black"
          : "white";

        const flips = getFlipsForPreview(
          previewBoard,
          index,
          player
        );

        previewBoard[index] = player;
        flips.forEach(f => previewBoard[f] = player);
      });

      // Render mini board
      drawMiniBoard(previewBoard, container);
    }
  );
}

function getFlipsForPreview(boardState, index, player) {

  if (boardState[index]) return [];

  let all = [];

  for (const dir of DIRECTIONS) {
    all = all.concat(
      collectFlipsPreview(boardState, index, dir, player)
    );
  }

  return all;
}

function collectFlipsPreview(boardState, start, dir, player) {

  const opponent = player === "black" ? "white" : "black";
  const flips = [];

  let current = start + dir;

  while (
    current >= 0 &&
    current < 64 &&
    boardState[current] === opponent
  ) {
    flips.push(current);
    current += dir;
  }

  if (
    current >= 0 &&
    current < 64 &&
    boardState[current] === player
  ) {
    return flips;
  }

  return [];
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

        try {
          const meta = JSON.parse(root.json_metadata);
          blackPlayer = meta.black;
        } catch {}

        steem.api.getContentReplies(
          currentGame.author,
          currentGame.permlink,
          (err2, replies) => {

            if (err2) return reject(err2);

            moves = [];
            whitePlayer = null;

            replies.forEach(reply => {
              try {
                const meta = JSON.parse(reply.json_metadata);
                if (meta.app !== APP_INFO) return;

                if (
                  meta.action === "join" &&
                  !whitePlayer &&
                  reply.author !== blackPlayer
                ) {
                  whitePlayer = reply.author;
                }

                if (meta.action === "move") {
                  moves.push({
                    index: meta.index,
                    author: reply.author
                  });
                }

              } catch {}
            });

            replayMoves();
            resolve();
          }
        );
      }
    );
  });
}

function replayMoves() {
  resetBoard();

  moves.forEach((move, i) => {
    const player = (i % 2 === 0)
      ? "black"
      : "white";

    const flips = getFlips(move.index, player);

    board[move.index] = player;
    flips.forEach(f => board[f] = player);
  });

  currentPlayer = (moves.length % 2 === 0)
    ? "black"
    : "white";

  renderBoard();
}


// ============================================================
// PROFILE LOADING
// ============================================================

function loadUserProfile(user) {

  if (!user) {
    profileDiv.innerHTML = "";
    return;
  }

  steem.api.getAccounts([user], (err, result) => {

    if (err || !result?.length) return;

    const account = result[0];
    let profile = {};

    try {
      const metadata =
        account.posting_json_metadata ||
        account.json_metadata;

      profile = JSON.parse(metadata).profile || {};
    }
    catch {
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
}

function renderUserProfile(data) {

  profileDiv.innerHTML = `
    <div style="
      background-image:url('${data.coverImage}');
      background-size:cover;
      height:150px;
      border-radius:8px;">
    </div>

    <div style="
      display:flex;
      align-items:center;
      margin-top:-40px;
      padding:10px;">

      <img src="${data.profileImage}"
           style="
             width:80px;
             height:80px;
             border-radius:50%;
             border:3px solid white;
             background:white;">

      <div style="margin-left:15px;">
        <h2 style="margin:0;">
          ${data.displayName}
        </h2>
        <small>@${data.username}</small>
        <p>${data.about}</p>
      </div>
    </div>
  `;
}


// ============================================================
// KEYCHAIN DETECTION
// ============================================================

function waitForKeychain(callback) {
  if (window.steem_keychain) {
    callback();
  } else {
    setTimeout(() =>
      waitForKeychain(callback), 100);
  }
}

function checkKeychain() {

  if (!window.steem_keychain) {
    loginBtn.disabled = true;
    startGameBtn.disabled = true;

    keychainDiv.style.display = "block";
    keychainDiv.innerHTML = `
      <strong>Spectator Mode</strong><br><br>
      You are viewing games in read-only mode.<br><br>
      Install Steem Keychain to play.
    `;
  }
  else {
    keychainDiv.style.display = "none";
  }
}


// ============================================================
// ROUTING HELPERS
// ============================================================

function getProfileFromURL() {
  const hash = window.location.hash;
  return hash.startsWith("#/@")
    ? hash.substring(3)
    : null;
}

function getGameFromURL() {
  const hash = window.location.hash;

  if (!hash.startsWith("#/game/"))
    return null;

  const parts = hash.split("/");

  return {
    author: parts[2],
    permlink: parts[3]
  };
}

// ============================================================
// GAME DISCOVERY
// ============================================================

function loadOpenGames() {
  steem.api.getDiscussionsByCreated(
    { tag: APP_NAME, limit: 20 },
    (err, posts) => {

      if (err) {
        console.log("Error loading games", err);
        return;
      }

      const games = posts.filter(post => {
        try {
          const meta = JSON.parse(post.json_metadata);
          return (
            meta.app === APP_INFO &&
            meta.type === "game_start" &&
            meta.status === "open"
          );
        } catch {
          return false;
        }
      });

      renderDashboard(parseGames(games));
    }
  );
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
            meta.app === APP_INFO &&
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

// Parse games
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
      black: meta.black || post.author,
      status: meta.status || "open"
    };
  });
}

// Featured Renderer
function renderFeaturedGame(game) {
  featuredDiv.innerHTML = "";

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

  featuredDiv.appendChild(div);

  renderBoardPreview(game, div.querySelector("#featuredBoard"));
}

// Status Resolver
function getGameStatus(game) {
  return game.status === "open"
    ? "Waiting for opponent"
    : "In Progress";
}

// Join Button Logic
function renderJoinButtonHTML(game) {
  if (!username) return "";

  if (game.status === "open" && username !== game.black) {
    return `<button class="joinBtn">Join</button>`;
  }

  return "";
}

// And attach
function attachJoinHandler(div, game) {
  const joinBtn = div.querySelector(".joinBtn");
  if (!joinBtn) return;

  joinBtn.onclick = () => {
    postJoinMove(game.author, game.permlink);
  };
}

// Render game list 
function renderGameList(games) {
  gameListDiv.innerHTML = "";

  games.forEach(post => {
    const div = document.createElement("div");
    div.innerHTML = `
      Game by <a href="#/@${post.author}">@${post.author}</a>
      <button>Join</button>
    `;

    div.querySelector("button").onclick = () => {
      joinGame(post.author, post.permlink);
    };

    gameListDiv.appendChild(div);
  });
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

    // Only try to join if the user is logged in and can be white
    if (username && !whitePlayer && username !== blackPlayer) {
      postJoin();
    }
  });
}

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
