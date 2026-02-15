
# Reversteem – Reversi on Steem

A fully client-side, decentralized Reversi (Othello) game built on top of the Steem blockchain.

Reversteem demonstrates how a complete turn-based multiplayer game can run on Steem using only posts and replies as an immutable game log — without smart contracts and without any backend server.

---

## ✨ Key Features

* 100% static frontend (GitHub Pages compatible)
* No backend or centralized server
* Deterministic board reconstruction from blockchain history
* URL hash-based routing
* User profile integration (cover, avatar, display name, bio)
* Featured current game view
* Open games list
* Spectator mode (read-only without Keychain)
* Explicit on-chain join protocol
* Fully open-source and forkable

---

## 🧭 Routing System

Reversteem uses client-side hash routing:

| Route                    | Description                           |
| ------------------------ | ------------------------------------- |
| `#/`                     | Homepage (featured game + open games) |
| `#/@username`            | User profile page + user games        |
| `#/game/author/permlink` | Specific game page                    |

Navigation does not reload the site — the entire app is static.

---

## 🏗 Architecture

Reversteem is fully decentralized.

There is:

* No backend
* No server authority
* No centralized state
* No smart contracts

Everything is derived from the Steem blockchain.

---

## 🔗 On-Chain Game Model

| Entity        | Meaning                          |
| ------------- | -------------------------------- |
| Root Post     | Represents a game (Black player) |
| Join Comment  | Registers the White player       |
| Move Comment  | Represents a move                |
| Comment Order | Determines turn order            |

The blockchain itself acts as a deterministic event log.

---

## ♟ Turn Model

Moves alternate automatically based on reply order.

| Move # | Player |
| ------ | ------ |
| 0      | Black  |
| 1      | White  |
| 2      | Black  |
| 3      | White  |
| ...    | ...    |

Turn calculation:

```
currentPlayer = (moves.length % 2 === 0)
  ? "black"
  : "white";
```

* Black = Root post author
* White = First valid `join` comment

---

## 📜 Metadata Protocol

Reversteem uses JSON metadata to identify valid actions.

### Root Post (Game Creation)

```json
{
  "app": "reversteem/0.1",
  "type": "game_start",
  "black": "username",
  "white": null,
  "status": "open"
}
```

---

### Join Comment

```json
{
  "app": "reversteem/0.1",
  "action": "join"
}
```

---

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

## 🖥 User Profiles Integration

After login, Reversteem fetches user profile data directly from Steem:

* Cover image
* Profile image
* Display name
* Biography

These are rendered dynamically in the profile header.

No additional storage is used — profile data is read directly from on-chain account metadata.

---

## 🏠 Homepage Layout

The homepage now displays:

### 🎯 Featured Game

* The most recent game
* Full board rendered
* View / Join controls

### 📋 Other Games

* Title only
* View (spectate)
* Join (if open)

This keeps the interface clean while still highlighting active gameplay.

---

## 👤 User Page

Visiting:

```
#/@username
```

Shows:

* Profile header
* Featured current game (if any)
* List of that user’s games

Same logic as homepage, scoped to one user.

---

## 🔄 Deterministic Replay Engine

When loading a game:

1. Root post defines Black
2. Replies are scanned in chronological order
3. First valid `join` assigns White
4. All valid `move` comments are replayed
5. Board is reconstructed locally

Nothing is trusted.
Everything is derived from chain history.

This makes the game:

* Auditable
* Tamper-resistant
* Fully verifiable by spectators

---

## 👁 Spectator Mode

If Steem Keychain is not installed:

* Login & play buttons are disabled
* App switches to read-only mode
* Games can still be viewed and verified

Reversteem works as a blockchain game explorer even without authentication.

---

## 🧠 Board Engine

The Reversi logic is fully client-side:

* Valid move detection
* Flip calculation
* Turn enforcement
* Board rendering
* Replay reconstruction

The blockchain stores events — the browser computes the state.

---

## 🔐 Security Model

* Turn enforcement is username-based
* Only Black and White can move
* Invalid moves rejected client-side
* Full replay verification
* Spectators can independently verify the game

Because the game is deterministic, malicious clients cannot fake outcomes.

---

## 🚀 Running Locally

Just open:

```
index.html
```

in a browser with Steem Keychain installed.

No build step.
No npm.
No bundler.

Pure static HTML + JS.

---

## 🌍 Deployment

Reversteem can be deployed using:

* GitHub Pages
* Any static hosting provider
* IPFS (optional future improvement)

No backend required.

---

## 🎯 Vision

Reversteem explores how traditional board games can be implemented
as blockchain-native social protocols.

It demonstrates:

* Smart contracts are not required for turn-based games
* Comment trees can act as deterministic event logs
* Social blockchains can host fully verifiable multiplayer games
* Frontend-only dApps are viable for turn-based logic

Reversteem is not just a game —
it is a protocol experiment.

---

## 📄 License

MIT

---

## 🌐 Live Demo

[https://puncakbukit.github.io/reversteem/](https://puncakbukit.github.io/reversteem/)
