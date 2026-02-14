// Reversteem
// https://github.com/puncakbukit/reversteem
// Licensed under the MIT License

/**
The core idea (important)
 On Steem, comments are the source of truth.

So we will:
 1. Define one game thread (root post)
 2. Each move = one comment with JSON metadata
 3. The number of moves so far determines:
    - whose turn it is
    - what color the player uses

We do not trust local state for turns.
**/

/**
Turn model (simple & robust)
Move number	Player color
 0	black
 1	white
 2	black
 3	white
 …	…

So:
 currentPlayer = (moveCount % 2 === 0) ? "black" : "white";

This works forever and is replayable from chain history.
**/

/**
The game thread must be created dynamically
and its author + permlink stored as the game ID.

In Steem every post has:
 - author
 - permlink

Together they uniquely identify a post.
So a game should be like:

GAME = {
  author: "alice",
  permlink: "reversteem-game-2026-02-11-123456"
}

And every move will be a comment under that post.
**/

// ----- CONFIG -----
const RPC = "https://api.steemit.com";
const EXTENSION_NOT_INSTALLED = "Steem Keychain extension is not installed!";
const LOGIN_REJECTED = 'Login rejected';
const APP_NAME = "reversteem";
const APP_VER = "0.1";
const APP_INFO = APP_NAME + "/" + APP_VER;

// ----- CONSTANT -----
//const client = new dhive.Client(RPC);
const userP = document.getElementById("user");
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const startGameBtn = document.getElementById('startGameBtn');
const boardDiv = document.getElementById("board");

let currentGame = null; 
// { author: "...", permlink: "..." }

// Track moves from the blockchain
let moves = [];       // [{index, player}]
let currentPlayer = "black";

// ----- REVERSI STATE -----
let board = Array(64).fill(null);

// Initial position
board[27] = "white";
board[28] = "black";
board[35] = "black";
board[36] = "white";

// A move is valid if:
// 1. The target cell is empty
// 2. In at least one direction, you get:
//    your disc → opponent disc(s) → your disc
// When placing:
// - You flip all sandwiched discs
// - In all 8 directions

// Directions we need to scan
const DIRECTIONS = [
  -8,  // up
  8,   // down
  -1,  // left
  1,   // right
  -9,  // up-left
  -7,  // up-right
  7,   // down-left
  9    // down-right
];

// ----- Auto-detect previously logged-in user -----
let username = "";
username = localStorage.getItem('steem_user');
if (username) {
  showLoggedIn(username);
}

// When page loads:
const savedGame = localStorage.getItem("current_game");
if (savedGame) {
  currentGame = JSON.parse(savedGame);
}

// ----- Show logged in -----
function showLoggedIn(username) {
  userP.innerText = "Welcome @" + username;
  loginBtn.style.display = 'none';
  logoutBtn.style.display = 'inline-block';
  startGameBtn.style.display = 'inline-block';
}

// ----- Show logged out -----
function showLoggedOut() {
  userP.innerText = '';
  loginBtn.style.display = 'inline-block';
  logoutBtn.style.display = 'none';
  startGameBtn.style.display = 'none';
}

// ----- Wait for Steem Keychain-----
function waitForKeychain(cb) {
  if (window.steem_keychain) {
    cb();
  } else {
    setTimeout(() => waitForKeychain(cb), 100);
  }
}

// ----- LOGIN -----
function login() {
  if (!window.steem_keychain) {
    alert(EXTENSION_NOT_INSTALLED);
    return;
  }
  username = prompt('Enter your Steem username');
  if (!username) return;
  username = username.trim();
  const message = `Login to Reversteem`;
  console.log("login", "requestSignBuffer");
  steem_keychain.requestSignBuffer(
    username,
    message,
    "Posting",
    (res) => {
      console.log("login", res);
      if (res.success) {
        localStorage.setItem('steem_user', username);
        showLoggedIn(username);
      } else {
        alert(LOGIN_REJECTED);
        return;
      }
    }
  );
}

// ----- LOGOUT -----
function logout() {
  localStorage.removeItem('steem_user');
  showLoggedOut();
}

// Helper: board coordinates
function row(i) { return Math.floor(i / 8); }
function col(i) { return i % 8; }

// Helper: is index on board & continuous
function isOnBoard(from, to, dir) {
  if (to < 0 || to >= 64) return false;

  // Prevent wrapping (left/right edges)
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

// ----- RENDER -----
function render() {
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

// Core logic: collect flips in one direction
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

// Check if a move is valid + get all flips
function getFlips(index, player) {
  if (board[index]) return [];

  let allFlips = [];

  for (const dir of DIRECTIONS) {
    const flips = collectFlips(index, dir, player);
    allFlips = allFlips.concat(flips);
  }

  return allFlips;
}

// Load moves from Steem comments
async function loadMovesFromSteem() {
  if (!currentGame) {
    console.log("No active game");
    return;
  }

  const replies = await client.database.call(
    "get_content_replies",
    [currentGame.author, currentGame.permlink]
  );

  moves = [];

  for (const reply of replies) {
    try {
      const meta = JSON.parse(reply.json_metadata);

      if (
        meta.app === APP_INFO &&
        meta.action === "move"
      ) {
        moves.push(meta.index);
      }
    } catch (e) {
      console.log("Invalid metadata", e);
    }
  }

  replayMoves();
}

// Rebuild board from moves (deterministic)
// This is huge:
// ➡️ Any client can reconstruct the full game state from comments alone.
function replayMoves() {
  board = Array(64).fill(null);

  // initial position
  board[27] = "white";
  board[28] = "black";
  board[35] = "black";
  board[36] = "white";

  moves.forEach((index, i) => {
    const player = (i % 2 === 0) ? "black" : "white";
    const flips = getFlips(index, player);

    board[index] = player;
    flips.forEach(j => board[j] = player);
  });

  currentPlayer = (moves.length % 2 === 0) ? "black" : "white";
  render();
}

// ----- MOVE LOGIC -----
// Enforce turns in makeMove
// ⚠️ No hardcoded "black" anymore
function makeMove(index) {
  if (!username) {
    alert("Login first");
    return;
  }

  const flips = getFlips(index, currentPlayer);

  if (flips.length === 0) {
    alert("Invalid move");
    return;
  }

  // Optimistic local update
  board[index] = currentPlayer;
  flips.forEach(i => board[i] = currentPlayer);
  render();

  postMove(index);
}

// ----- POST MOVE TO STEEM -----
// Include player color implicitly via move order
// Post Moves to THAT Game
// Now:
// - Root post = the game
// - Comments = moves
// - Blockchain = full move history
// 🔥 Fully decentralized.
function postMove(index) {
  if (!window.steem_keychain) {
    alert(EXTENSION_NOT_INSTALLED);
    return;
  }
  if (!currentGame) {
    alert("No active game");
    return;
  }
  const json = {
    app: APP_INFO,
    action: "move",
    index: index
  };
  console.log("postMove", "requestPost");
  steem_keychain.requestPost(
    username,
    "Reversi Move",
    `Move at ${index}`,
    currentGame.permlink,
    currentGame.author,
    json,
    `reversteem-move-${Date.now()}`,
    (res) => {
      console.log("postMove", res);
    }
  );
}

// ----- START_GAME -----
// When a user clicks “Start Game”, create a post on Steem.
function startGame() {
  if (!window.steem_keychain) {
    alert(EXTENSION_NOT_INSTALLED);
    return;
  }
  if (!username) {
    alert("Login first");
    return;
  }
  const permlink = APP_NAME + `-${Date.now()}`;
  const json = {
    app: APP_INFO,
    type: "game_start"
  };
  console.log("startGame", "requestPost");
  console.log("steem_keychain", JSON.stringify(window.steem_keychain));
  console.log("username", username);
  console.log("APP_NAME", APP_NAME);
  console.log("json", JSON.stringify(json));
  console.log("permlink", permlink);
  steem_keychain.requestPost(
    username,
    "Reversteem Game Started",
    "A new Reversi game has begun!",
    APP_NAME,          // parent permlink (category/tag)
    "",                 // parent author (empty = top level post)
    json,
    permlink,
    (res) => {
      console.log("startGame", JSON.stringify(res));
      if (res.success) {
        currentGame = {
          author: username,
          permlink: permlink
        };
        localStorage.setItem("current_game", JSON.stringify(currentGame));
        alert("Game created!");
      }
    }
  );
}
 
// ----- START -----
// Load game on startup
loadMovesFromSteem();
