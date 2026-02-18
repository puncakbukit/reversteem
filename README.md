
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
* Username-based turn enforcement
* Strict JSON metadata protocol filtering
* URL hash-based routing
* Read-only spectator mode
* Profile integration from on-chain metadata
* Featured game + mini-board previews
* Replay caching for fast reloads
* Multi-RPC automatic fallback
* Markdown board export for native Steemit viewing
* Deterministic time-limit enforcement
* On-chain derived ELO rating system

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

All game state, ratings, and timers are computed locally by replaying immutable history.

---

# 🔗 On-Chain Game Model

| Blockchain Object | Meaning                            |
| ----------------- | ---------------------------------- |
| Root Post         | Represents a game (Black player)   |
| Join Comment      | Registers the White player         |
| Move Comment      | Represents one move                |
| Comment Order     | Defines deterministic replay order |

Only comments containing valid JSON metadata for the `reversteem/x.y` app are processed.

All other comments are ignored.

---

# ⏳ Time Limit System

Reversteem supports deterministic per-move time limits.

## Game Creation Metadata (with time limit)

```json
{
  "app": "reversteem/0.1",
  "type": "game_start",
  "black": "username",
  "white": null,
  "status": "open",
  "timeLimitSeconds": 86400
}
```

`timeLimitSeconds` defines how long a player has to make a move.

Example:

* `86400` = 24 hours per move

---

## 🕒 How Timeout Works

Timeout is derived from blockchain timestamps:

1. Determine the last valid move timestamp
2. Determine whose turn it is
3. Compare:

```
currentBlockTime - lastMoveTime > timeLimitSeconds
```

If true:

* Current player loses on time
* Opponent wins by timeout

---

## ⚖ Timeout Edge Case Handling

If timeout has technically occurred but:

* The opponent has not claimed victory
* The timed-out player posts a move afterward

Replay logic determines validity strictly by timestamps.

If the move timestamp is after the timeout threshold:

→ It is ignored during deterministic replay.

This ensures:

* No race-condition ambiguity
* No manual timeout transaction required
* Fully deterministic outcome

Timeout enforcement is computed during replay — not triggered by UI actions.

---

# 🏆 ELO Rating System

Reversteem includes a fully deterministic, client-derived ELO rating system.

There is:

* No on-chain rating storage
* No backend leaderboard database
* No rating authority

Ratings are computed by replaying completed games.

---

## 📊 How Ratings Are Calculated

For each finished game:

1. Determine winner (board or timeout)
2. Load both players’ previous ratings
3. Apply standard ELO formula:

```
R' = R + K × (S - E)
```

Where:

* `R` = current rating
* `R'` = new rating
* `K` = configurable factor (e.g. 32)
* `S` = actual score (1 win, 0 loss, 0.5 draw)
* `E` = expected score

---

## 🔄 Deterministic Rating Reconstruction

Ratings are derived by:

1. Fetching all finished games
2. Sorting chronologically
3. Replaying them
4. Applying ELO updates in order

Because game outcomes are deterministic:

→ Ratings are deterministic.

Any client reconstructing the same history will compute identical ratings.

---

## 📈 Rating Properties

* No centralized leaderboard
* No authority can modify ratings
* No rating manipulation possible without altering history
* Ratings auto-update when new games are discovered
* Timeout wins count as normal wins

Ratings are emergent properties of blockchain history.

---

# 🔢 Move Validation Rules

During deterministic replay:

* `moveNumber` must equal `appliedMoves`
* Author must match expected player
* Index must be between `0–63`
* Move must flip at least one opponent piece
* Turn must be correct
* No moves allowed after game end
* Automatic pass logic enforced
* Moves after timeout threshold are ignored

Invalid moves are ignored.

This makes replay:

* Deterministic
* Tamper-resistant
* Order-safe
* Race-condition safe

---

# 🔄 Automatic Pass Rule

If a player has no valid moves:

* Turn automatically passes to opponent
* If both players have no valid moves → game ends

Pass logic is enforced during replay.

No manual pass transaction is required.

---

# 🏁 End-of-Game Detection

A game is finished when:

```
!blackHasMove && !whiteHasMove
```

OR

* A timeout condition is met

When finished:

* `currentPlayer` becomes `null`
* Further moves are ignored
* Winner is computed
* Board becomes frozen (UI-level enforcement)

---

# 📝 `boardToMarkdown` – Native Steemit Compatibility

Reversteem includes a `boardToMarkdown(board)` function.

## Purpose

Steemit’s default interface does not execute JavaScript.

Therefore, users browsing a game directly on Steemit would otherwise only see raw JSON move comments.

`boardToMarkdown` converts the current board state into a Markdown-rendered visual grid.

This allows:

* Non-Reversteem users to follow the game
* Spectators using the default Steemit UI to see the board
* Moves to include a human-readable snapshot of the game

This keeps the protocol understandable even outside the dApp.

---

# ⚡ Replay Caching

To improve performance:

* Derived game state is cached in `localStorage`
* Cache key includes `author` + `permlink`
* Cache invalidates if:

  * Latest block changes
  * Reply count changes

If cache is valid, replay is skipped.

If invalid, full deterministic replay runs again.

Cache is an optimization only — never a source of truth.

---

# 🌐 Multi-RPC Fallback

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

No backend proxy required.

---

# 🔐 Security Model

Reversteem enforces:

* Strict metadata filtering
* Move sequence validation (`moveNumber`)
* Author turn validation
* Legal flip validation
* Automatic pass logic
* Deterministic timeout enforcement
* End-state freeze
* Winner calculation
* Deterministic ELO reconstruction
* Replay cache validation
* RPC failover resilience

Because state is derived from immutable history:

Malicious clients cannot forge outcomes.
Malicious users cannot manipulate ratings.

Every spectator independently verifies the game.

---

# 🎯 Design Philosophy

Reversteem demonstrates:

* Turn-based games do not require smart contracts
* Comment trees can function as deterministic event logs
* Ratings can be derived without on-chain storage
* Time control can be enforced without authority
* Fully frontend-only dApps are viable
* Consensus logic can live entirely in the browser

Reversteem is not merely a game.

It is a deterministic state machine embedded in a social blockchain.
