// Reversteem
// https://github.com/puncakbukit/reversteem
// Licensed under the MIT License

// ----- CONFIG -----
const RPC = "https://api.steemit.com";
const client = new dhive.Client(RPC);
const EXTENSION_NOT_INSTALLED = "Steem Keychain extension is not installed!";
const userP = document.getElementById("user");
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const boardDiv = document.getElementById("board");

// ----- Auto-detect previously logged-in user -----
let username = "";
username = localStorage.getItem('steem_user');
if (username) {
  showLoggedIn(username);
}

// ----- REVERSI STATE -----
let board = Array(64).fill(null);

// Initial position
board[27] = "white";
board[28] = "black";
board[35] = "black";
board[36] = "white";

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
        result.textContent = 'Login rejected';
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

// ----- MOVE LOGIC (MINIMAL) -----
function makeMove(index) {
  if (!username) {
    alert("Login first");
    return;
  }
  if (board[index]) return;

  // NOTE: This MVP skips legality checks for brevity
  board[index] = "black";
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
