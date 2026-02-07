// Reversteem
// https://github.com/puncakbukit/reversteem
// Licensed under the MIT License

// ----- CONFIG -----
const RPC = "https://api.steemit.com";
const client = new dhive.Client(RPC);

let username = null;

// ----- REVERSI STATE -----
let board = Array(64).fill(null);

// Initial position
board[27] = "white";
board[28] = "black";
board[35] = "black";
board[36] = "white";

  function waitForKeychain(cb) {
    if (window.steem_keychain) {
      cb();
    } else {
      setTimeout(() => waitForKeychain(cb), 100);
    }
  }

// ----- LOGIN -----
function login() {
  waitForKeychain(() => {
  steem_keychain.requestSignBuffer(
    "",
    "Login to Reversteem",
    "Posting",
    (res) => {
      if (res.success) {
        username = res.data.username;
        document.getElementById("user").innerText =
          "Logged in as @" + username;
      }
    }
  );
  });
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
  const json = {
    app: "reversteem/0.1",
    action: "move",
    index: index
  };
  waitForKeychain(() => {
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
  });
}

// ----- START -----
render();
