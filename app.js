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

// ----- CONFIG -----
const RPC = "https://api.steemit.com";
const EXTENSION_NOT_INSTALLED = "Steem Keychain extension is not installed!";
const LOGIN_REJECTED = 'Login rejected';

// ----- CONSTANT -----
const client = new dhive.Client(RPC);
const userP = document.getElementById("user");
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const boardDiv = document.getElementById("board");

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

// ----- Auto-detect previously logged-in user -----
let username = "";
username = localStorage.getItem('steem_user');
if (username) {
  showLoggedIn(username);
}

// ----- Show logged in -----
function showLoggedIn(username) {
  userP.innerText = "Welcome @" + username;
  loginBtn.style.display = 'none';
  logoutBtn.style.display = 'inline-block';
}

// ----- Show logged out -----
function showLoggedOut() {
  userP.innerText = '';
  loginBtn.style.display = 'inline-block';
  logoutBtn.style.display = 'none';
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
  steem_keychain.requestSignBuffer(
    username,
    message,
    "Posting",
    (res) => {
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

// ----- MOVE LOGIC -----
// Update makeMove()
function makeMove(index) {
  if (!username) {
    alert("Login first");
    return;
  }

  const player = "black"; // MVP: single-player color
  const flips = getFlips(index, player);

  if (flips.length === 0) {
    alert("Invalid move");
    return;
  }

  board[index] = player;
  flips.forEach(i => board[i] = player);

  render();
  postMove(index);
}

// ----- POST MOVE TO STEEM -----
function postMove(index) {
  if (!window.steem_keychain) {
    alert(EXTENSION_NOT_INSTALLED);
    return;
  }
  const json = {
    app: "reversteem/0.1",
    action: "move",
    index: index
  };
  steem_keychain.requestPost(
    username,
    "Reversi Move",
    `Move at ${index}`,
    "reversi-root-author",
    "reversi-root-permlink",
    JSON.stringify(json),
    "",
    (res) => {
      console.log("Move posted", res);
    }
  );
}

// ----- START -----
render();
