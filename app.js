// Reversteem
// https://github.com/puncakbukit/reversteem
// Licensed under the MIT License

// ----- CONFIG -----
const RPC = "https://api.steemit.com";
const client = new dhive.Client(RPC);
const EXTENSION_NOT_INSTALLED = "Steem Keychain extension is not installed!";

// ----- Auto-detect previously logged-in user -----
let username = localStorage.getItem('steem_user');
if (username) {
  document.getElementById("user").innerText =
    "Welcome back @" + username;
}

// ----- REVERSI STATE -----
let board = Array(64).fill(null);

// Initial position
board[27] = "white";
board[28] = "black";
board[35] = "black";
board[36] = "white";

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
  const message = `Login to Reversteem`;
  steem_keychain.requestSignBuffer(
    username,
    message,
    "Posting",
    (res) => {
      if (res.success) {
        document.getElementById("user").innerText =
          "Logged in as @" + username;
        localStorage.setItem('steem_user', username);
      } else {
        result.textContent = 'Login rejected';
      }
    }
  );
}

// ----- RENDER -----
function render() {
  const boardDiv = document.getElementById("board");
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
