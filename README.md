
# Reversteem – Reversi on Steem

A fully client-side, deterministic Reversi (Othello) game built on top of the Steem blockchain.

Reversteem demonstrates how a complete turn-based multiplayer game can run on Steem using only posts and replies as an immutable event log — without smart contracts and without any backend server.

This project is both a playable game and a protocol experiment.

---

## ✨ Core Properties

* 100% static frontend (GitHub Pages compatible)
* No backend server
* No database
* No smart contracts
* Deterministic board reconstruction from blockchain history
* Username-based turn enforcement
* JSON metadata protocol filtering
* URL hash-based routing
* Read-only spectator mode
* Profile integration from on-chain metadata
* Featured game + mini-board previews

---

## 🧭 Routing System

Reversteem uses client-side hash routing:

| Route                    | Description                             |
| ------------------------ | --------------------------------------- |
| `#/`                     | Homepage (featured game + recent games) |
| `#/@username`            | User profile page + games by that user  |
| `#/game/author/permlink` | Specific game page                      |

Navigation does not reload the page — everything runs as a single-page app.

---

## 🏗 Architecture

Reversteem is fully decentralized.

There is:

* No backend
* No server authority
* No centralized state
* No off-chain game storage

Everything is derived from the Steem blockchain.

The blockchain acts as a deterministic event log.

---

## 🔗 On-Chain Game Model

| Blockchain Object | Meaning                          |
| ----------------- | -------------------------------- |
| Root Post         | Represents a game (Black player) |
| Join Comment      | Registers the White player       |
| Move Comment      | Represents one move              |
| Comment Order     | Determines turn order            |

Only comments containing valid JSON metadata for the `reversteem/x.y` app are considered.

All other comments are ignored.

---

## ♟ Turn Model

Turn order is derived from valid move count:

```
currentPlayer = (validMoveCount % 2 === 0)
  ? "black"
  : "white";
```

| Move # | Player |
| ------ | ------ |
| 0      | Black  |
| 1      | White  |
| 2      | Black  |
| 3      | White  |
| ...    | ...    |

* Black = Root post author
* White = First valid `join` comment author
* Only the expected player may make the next valid move
* Invalid moves are ignored during replay

---

## 📜 Metadata Protocol

Reversteem filters strictly by `app` field:

```
meta.app?.startsWith("reversteem/")
```

Only matching metadata is processed.

---

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

Black is defined in metadata.

---

### Join Comment

```json
{
  "app": "reversteem/0.1",
  "action": "join"
}
```

The first valid `join` comment assigns White.

Subsequent join attempts are ignored.

---

### Move Comment

```json
{
  "app": "reversteem/0.1",
  "action": "move",
  "index": 27
}
```

Validation rules during replay:

* Author must match expected player
* Index must be between 0–63
* Move must flip at least one opponent piece
* Move must be legal on reconstructed board

Invalid moves are ignored.

---

## 🔄 Deterministic Replay Engine

When loading a game:

1. Fetch root post
2. Fetch all replies
3. Sort replies chronologically
4. Extract Black from root metadata
5. Detect first valid `join` as White
6. Replay all valid `move` comments
7. Reconstruct board locally

The board state is never stored anywhere off-chain.

Every client reconstructs it independently.

This makes the game:

* Fully verifiable
* Tamper-resistant
* Auditable by spectators

---

## 🖼 Board Rendering

Two rendering modes exist:

### Main Game Board

* Interactive
* Enforces turn logic
* Client-side validation before posting

### Mini Board Preview

* Read-only
* Rendered in Featured Game section
* Derived using the same deterministic engine

No duplicated game logic is used.

---

## 🧑 User Profile Integration

After login, Reversteem reads account metadata from Steem:

* Display name
* Profile image
* Cover image
* Biography

Profile data is rendered dynamically.

No user data is stored locally (except logged-in username).

---

## 👁 Spectator Mode

If Steem Keychain is not installed:

* Login button is disabled
* Start Game is disabled
* Join buttons hidden
* App runs in read-only mode

Games can still be loaded and verified.

Reversteem functions as a blockchain game explorer even without authentication.

---

## 🔐 Security Model

Reversteem enforces:

* Username-based turn validation
* Legal move validation
* Deterministic replay
* Metadata filtering by app name
* Ignoring malformed JSON
* Ignoring invalid indices
* Ignoring moves by wrong author

Because the state is derived from chain history,
malicious clients cannot forge valid game outcomes.

Every spectator replays the same deterministic logic.

---

## 🏠 Homepage Layout

### 🎯 Featured Game

* Most recent game
* Mini board preview
* Status display
* View button
* Join button (if open and eligible)

### 📋 Other Games

* Title
* Status
* View button
* Join button (if open)

Games are sorted by creation time (newest first).

---

## ⚙ RPC Usage

Reversteem uses the public Steem RPC:

```
https://api.steemit.com
```

All blockchain reads are done via `steem-js`.

No custom backend proxy is used.

---

## 🧠 Board Engine Details

Fully client-side:

* 8×8 board array (length 64)
* Directional scan model (8 directions)
* Flip collection per direction
* Deterministic move replay
* Turn derived from valid move count

The blockchain stores events.
The browser computes the state.

---

## ⚠ Current Limitations

The current implementation intentionally keeps the protocol minimal.

Not yet implemented:

* Automatic pass rule (when a player has no valid moves)
* End-of-game detection
* Winner calculation
* Game finalization metadata update
* Multi-RPC failover

These can be added in future versions without breaking protocol compatibility.

---

## 🚀 Running Locally

Open:

```
index.html
```

In a browser with Steem Keychain installed.

No build step required.
No npm.
No bundler.

Pure static HTML + JavaScript.

---

## 🌍 Deployment

Can be deployed via:

* GitHub Pages
* Any static hosting provider
* IPFS (optional future enhancement)

No backend required.

---

## 🎯 Design Philosophy

Reversteem demonstrates that:

* Smart contracts are not required for turn-based games
* Comment trees can function as deterministic event logs
* Social blockchains can host verifiable multiplayer games
* Fully frontend-only dApps are viable

Reversteem is not merely a game.

It is a demonstration of how conversation threads can become state machines.

---

## 📄 License

MIT

---

## 🌐 Live Demo

[https://puncakbukit.github.io/reversteem/](https://puncakbukit.github.io/reversteem/)
