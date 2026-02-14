# Reversteem - Reversi on Steem

A fully client-side, decentralized Reversi game built on top of the Steem blockchain.

Reversteem demonstrates how a complete turn-based multiplayer game can run on Steem using only posts and replies as an immutable game log — without smart contracts and without any backend server.

---

## ✨ Key Features

- 100% static frontend (GitHub Pages compatible)
- No backend or centralized server
- Uses Steem posts and replies as the game state
- Deterministic board reconstruction
- Explicit on-chain join protocol
- Unicode + Markdown board rendering directly in posts
- Fully open-source and forkable

---

## 🏗 Architecture

Reversteem is fully decentralized.

### On-Chain Model

- **Root Post** → Represents a game
- **Join Comment** → Registers the White player
- **Move Comment** → Represents a move
- **Comment order** → Determines turn order

No server stores game state.
The entire board is derived from blockchain history.

---

## ♟ Turn Model

Moves alternate automatically based on reply order:

Move # | Player
-------|--------
0      | Black
1      | White
2      | Black
3      | White
...    | ...

Turn calculation:

```

currentPlayer = (moves.length % 2 === 0) ? "black" : "white"

````

Black is always the root post author.
White is the first valid `join` comment.

---

## 📜 Metadata Protocol

Reversteem uses JSON metadata to identify valid game actions.

### Root Post

```json
{
  "app": "reversteem/0.1",
  "type": "game_start",
  "black": "username",
  "white": null,
  "status": "open"
}
````

### Join Comment

```json
{
  "app": "reversteem/0.1",
  "action": "join"
}
```

### Move Comment

```json
{
  "app": "reversteem/0.1",
  "action": "move",
  "index": 27
}
```

Only comments with matching `app` metadata are considered valid.

---

## 🖥 Human-Readable On-Chain Board

Each root post and move comment includes a full board snapshot rendered using:

* Unicode pieces

  * ⚫ Black
  * ⚪ White
  * · Empty

* Markdown table formatting

This allows users to view and follow games directly on Steemit without using the dApp.

The blockchain itself becomes a visual, replayable game archive.

---

## 🔄 Deterministic Replay

When loading a game:

1. The root post defines the Black player
2. Replies are scanned in chronological order
3. First valid `join` comment assigns White
4. All valid `move` comments are replayed
5. Board state is reconstructed locally

No state is trusted.
Everything is derived from chain history.

---

## 🔐 Security Model

* Turn enforcement is identity-based (username)
* Only Black and White can make moves
* Invalid moves are rejected client-side
* Replay ensures tamper resistance
* Spectators can verify the game independently

---

## 🚀 Running Locally

Just open:

```
index.html
```

in a browser with Steem Keychain installed.

No build step required.

---

## 🌍 Deployment

Reversteem is fully static and can be deployed for free using:

* GitHub Pages
* Any static hosting provider

---

## 🎯 Vision

Reversteem explores how traditional board games can be implemented
as blockchain-native protocols using social posts as state transitions.

It demonstrates that:

* Smart contracts are not required for turn-based games
* Blockchain comment trees can act as a deterministic event log
* Games can be fully auditable and censorship-resistant

---

## 📄 License

MIT

---

## 🌐 Live Demo

[https://puncakbukit.github.io/reversteem/](https://puncakbukit.github.io/reversteem/)
