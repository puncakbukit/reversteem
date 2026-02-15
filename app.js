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


// ============================================================
// STATE
// ============================================================

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

if (username) showLoggedIn(username);

checkKeychain();
resetBoard();
loadOpenGames();
loadMovesFromSteem();


// ============================================================
// AUTHENTICATION
// ============================================================

function showLoggedIn(user) {
  userP.innerText = `Welcome @${user}`;
  loginBtn.style.display = "none";
  logoutBtn.style.display = "inline-block";
  startGameBtn.style.display = "inline-block";
}

function showLoggedOut() {
  userP.innerText = "";
  loginBtn.style.display = "inline-block";
  logoutBtn.style.display = "none";
  startGameBtn.style.display = "none";
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

function isOnBoard(from, to, dir) {
  if (to < 0 || to >= 64) return false;

  if (dir === -1 || dir === 1) {
    return row(from) === row(to);
  }

  if (dir === -9 || dir === 7) {
    return col(to) < col(from);
  }

  if (dir === -7 || dir === 9) {
    return col(to) > col(from);
  }

  return true;
}

function collectFlips(start, dir, player) {
  const opponent = player === "black" ? "white" : "black";
  const flips = [];

  let current = start + dir;

  while (isOnBoard(start, current, dir) && board[current] === opponent) {
    flips.push(current);
    current += dir;
  }

  if (isOnBoard(start, current, dir) && board[current] === player) {
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

      renderGameList(games);
    }
  );
}

function renderGameList(games) {
  gameListDiv.innerHTML = "";

  games.forEach(post => {
    const div = document.createElement("div");
    div.innerHTML = `
      Game by @${post.author}
      <button>Join</button>
    `;

    div.querySelector("button").onclick = () => {
      joinGame(post.author, post.permlink);
    };

    gameListDiv.appendChild(div);
  });
}


// ============================================================
// BLOCKCHAIN STATE LOADING
// ============================================================

async function loadMovesFromSteem() {
  if (!currentGame) return;

  return new Promise((resolve, reject) => {

    // Load root post (black player)
    steem.api.getContent(
      currentGame.author,
      currentGame.permlink,
      (err, root) => {

        if (err) return reject(err);

        try {
          const meta = JSON.parse(root.json_metadata);
          blackPlayer = meta.black;
        } catch {}

        // Load replies (join + moves)
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

                // Join detection
                if (
                  meta.action === "join" &&
                  !whitePlayer &&
                  reply.author !== blackPlayer
                ) {
                  whitePlayer = reply.author;
                }

                // Move detection
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


// ============================================================
// GAME REPLAY (DETERMINISTIC)
// ============================================================

function replayMoves() {
  resetBoard();

  moves.forEach((move, i) => {
    const player = (i % 2 === 0) ? "black" : "white";
    const flips = getFlips(move.index, player);

    board[move.index] = player;
    flips.forEach(f => board[f] = player);
  });

  currentPlayer = (moves.length % 2 === 0) ? "black" : "white";
  renderBoard();
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

  const expected =
    currentPlayer === "black" ? blackPlayer : whitePlayer;

  if (username !== expected) {
    alert("Not your turn");
    return;
  }

  const flips = getFlips(index, currentPlayer);
  if (flips.length === 0) {
    alert("Invalid move");
    return;
  }

  board[index] = currentPlayer;
  flips.forEach(i => board[i] = currentPlayer);
  renderBoard();

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
  currentGame = { author, permlink };
  localStorage.setItem("current_game", JSON.stringify(currentGame));

  loadMovesFromSteem().then(() => {
    if (!whitePlayer && username !== blackPlayer) {
      postJoin();
    }
  });
}

// ============================================================
// KEYCHAIN NOTICE 
// ============================================================

function checkKeychain() {
  const notice = document.getElementById("keychainNotice");

  if (!window.steem_keychain) {
    notice.style.display = "block";
    notice.innerHTML = `
      <strong>Spectator Mode</strong><br><br>
      You are currently viewing games in read-only mode.<br><br>
      To start or join games, please install 
      <a href="https://chrome.google.com/webstore/detail/steem-keychain/" target="_blank">
        Steem Keychain
      </a> browser extension.
    `;
  } else {
    notice.style.display = "none";
  }
}

