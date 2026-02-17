
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
* Automatic pass rule enforcement
* End-of-game detection + winner calculation
* Move sequence indexing (`moveNumber`) validation
* Replay caching for fast reloads
* Multi-RPC fallback
* Username-based turn enforcement
* Strict JSON metadata protocol filtering
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

| Blockchain Object | Meaning                            |
| ----------------- | ---------------------------------- |
| Root Post         | Represents a game (Black player)   |
| Join Comment      | Registers the White player         |
| Move Comment      | Represents one move                |
| Comment Order     | Defines deterministic replay order |

Only comments containing valid JSON metadata for the `reversteem/x.y` app are processed.

All other comments are ignored.

---

## ♟ Player Model

* **Black** = defined in root post metadata
* **White** = first valid `join` comment author
* Subsequent join attempts are ignored

---

## 📜 Metadata Protocol

All metadata must include:

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

---

### Join Comment

```json
{
  "app": "reversteem/0.1",
  "action": "join"
}
```

The first valid `join` assigns White.

---

### Move Comment

```json
{
  "app": "reversteem/0.1",
  "action": "move",
  "index": 27,
  "moveNumber": 12
}
```

`moveNumber` is required.

It must equal the number of already-applied valid moves during replay.

---

## 🔢 Move Validation Rules

During deterministic replay:

* `moveNumber` must equal `appliedMoves`
* Author must match expected player
* Index must be between `0–63`
* Move must flip at least one opponent piece
* Turn must be correct
* Pass logic is enforced automatically

Invalid moves are ignored.

This makes replay:

* Deterministic
* Tamper-resistant
* Order-safe
* Race-condition safe

---

## 🔄 Automatic Pass Rule

If a player has no valid moves:

* Turn automatically passes to opponent
* If both players have no valid moves → game ends

Pass logic is enforced during replay.

No manual pass transaction is required.

---

## 🏁 End-of-Game Detection

A game is finished when:

```
!blackHasMove && !whiteHasMove
```

When finished:

* `currentPlayer` becomes `null`
* Further moves are ignored
* Winner is computed

---

## 🏆 Winner Calculation

After replay:

```
score.black > score.white → Black wins
score.white > score.black → White wins
equal → draw
```

Winner is derived entirely from board reconstruction.

---

## ⚡ Replay Caching

To improve performance:

* Derived game state is cached in `localStorage`
* Cache key includes `author` + `permlink`
* Cache invalidates if:

  * Latest block changes
  * Reply count changes

If cache is valid, replay is skipped.

If invalid, full deterministic replay runs again.

Cache is optional optimization — state is always derivable from chain.

---

## 🌐 Multi-RPC Fallback

Reversteem automatically rotates between public RPC nodes:

```
https://api.steemit.com
https://api.justyy.com
https://api.steem.house
https://rpc.buildteam.io
```

If one RPC fails:

* Client switches to next RPC
* Retries automatically

This improves availability without requiring a backend proxy.

---

## 🔄 Deterministic Replay Engine

When loading a game:

1. Fetch root post
2. Fetch all replies
3. Sort replies chronologically
4. Extract Black from root metadata
5. Detect first valid `join` as White
6. Extract valid `move` comments
7. Enforce moveNumber ordering
8. Enforce pass logic
9. Replay moves deterministically
10. Detect game end + winner

Board state is never stored on-chain.

It is computed locally by every client.

---

## 🖼 Board Rendering

### Main Board

* Interactive
* Enforces turn rules
* Validates move before posting
* Frozen after game end

### Mini Board Preview

* Read-only
* Used in homepage featured section
* Uses same deterministic engine

There is only one canonical replay engine.

---

## 👁 Spectator Mode

If Steem Keychain is not installed:

* Login disabled
* Start Game disabled
* Join buttons hidden
* App runs in read-only mode

Games can still be verified.

Reversteem functions as a blockchain game explorer.

---

## 🔐 Security Model

Reversteem enforces:

* Strict metadata filtering
* Move sequence validation (`moveNumber`)
* Author turn validation
* Legal flip validation
* Automatic pass logic
* Deterministic replay
* End-state freeze
* Winner calculation
* Replay cache validation
* RPC failover resilience

Because state is derived from immutable history:

Malicious clients cannot forge outcomes.

Every spectator independently verifies the game.

---

## 🧠 Board Engine Details

Fully client-side:

* 8×8 array (length 64)
* 8-direction scanning model
* Flip collection per direction
* Deterministic move replay
* Automatic pass handling
* End detection + winner calculation

The blockchain stores events.
The browser computes the state.

---

## ⚠ Protocol Characteristics

Reversteem intentionally avoids:

* Smart contracts
* Token staking logic
* On-chain state mutation
* Backend arbitration

This keeps the protocol:

* Simple
* Auditable
* Upgradeable
* Frontend-only deployable

Future upgrades (optional):

* Board hash chaining
* Fork-detection verification
* On-chain finalization markers

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
* IPFS

No backend required.

---

## 🎯 Design Philosophy

Reversteem demonstrates:

* Turn-based games do not require smart contracts
* Comment trees can function as deterministic event logs
* Social blockchains can host verifiable multiplayer games
* Fully frontend-only dApps are viable
* Consensus logic can live entirely in the browser

Reversteem is not merely a game.

It is a demonstration that conversation threads can become deterministic state machines.

---

## 📄 License

MIT

---

## 🌐 Live Demo

[https://puncakbukit.github.io/reversteem/](https://puncakbukit.github.io/reversteem/)

