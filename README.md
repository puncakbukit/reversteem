
# Reversteem – Reversi on Steem

A fully client-side, deterministic Reversi (Othello) game built on top of the **Steem** blockchain.

Reversteem demonstrates how a complete turn-based multiplayer game can run using only posts and replies as an immutable event log — without smart contracts and without any backend server.

This project is both a playable game and a protocol experiment.

---

# ✨ Core Properties

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
* Profile image integration from on-chain metadata
* Featured game + mini-board previews
* Replay caching for fast reloads
* Multi-RPC automatic fallback
* Markdown board export for native Steemit viewing
* Deterministic per-move time limit (claimable)
* On-chain derived ELO rating system
* Double-click / duplicate move prevention

---

# 🏗 Architecture

Reversteem is fully decentralized.

There is:

* No backend
* No server authority
* No centralized state
* No off-chain game storage

Everything is derived from the Steem blockchain.

The blockchain acts as a deterministic event log.

All game state, ratings, timers, and outcomes are computed locally by replaying immutable history.

---

# 🔗 On-Chain Game Model

| Blockchain Object | Meaning                            |
| ----------------- | ---------------------------------- |
| Root Post         | Represents a game (Black player)   |
| Join Comment      | Registers the White player         |
| Move Comment      | Represents one move                |
| Timeout Claim     | Claims victory after timeout       |
| Comment Order     | Defines deterministic replay order |

Only comments containing valid JSON metadata for the `reversteem/x.y` app are processed.

All other comments are ignored.

---

# ⏳ Time Limit System

Reversteem supports deterministic per-move time limits.

## Game Creation Metadata

```json
{
  "app": "reversteem/0.1",
  "type": "game_start",
  "black": "username",
  "white": null,
  "timeoutMinutes": 60
}
```

### `timeoutMinutes`

* Defines the maximum time per move
* Minimum enforced: **5 minutes**
* Maximum enforced: protocol-defined upper bound
* Default: **60 minutes (1 hour)**

Timeout is inactive until **both players have joined**.

---

## 🕒 Timeout Mechanics (Claimable Model)

Timeout is derived from blockchain timestamps.

For each move:

1. Determine the timestamp of the last valid move
2. Determine whose turn it is
3. Compare:

```
currentTime - lastMoveTime > timeoutMinutes
```

If true:

* The current player has exceeded their time
* The opponent may post a `timeout_claim` comment

---

## 🏆 Timeout Claim Metadata

```json
{
  "app": "reversteem/0.1",
  "type": "timeout_claim",
  "moveNumber": 12,
  "winner": "black",
  "loser": "white"
}
```

Replay validation requires:

* Game not already finished
* Both players joined
* Timeout threshold exceeded
* `moveNumber` matches expected move index
* `winner` and `loser` match derived turn logic

If valid:

* Game ends immediately
* Winner is set deterministically
* Further moves are ignored

---

## ⚖ Timeout Edge Case Behavior

If timeout is claimable but:

* The opponent has not yet claimed victory
* The timed-out player attempts to move

Replay logic ignores that move.

Once timeout threshold is exceeded:

→ Only a valid `timeout_claim` is accepted
→ Further moves are rejected deterministically

This prevents race-condition ambiguity.

Timeout enforcement is derived during replay — not triggered by UI.

---

# 🎮 Time Control Presets

When creating a game, users can select:

| Mode     | Minutes per move |
| -------- | ---------------- |
| Blitz    | 5                |
| Rapid    | 15               |
| Standard | 60 (default)     |
| Daily    | 1440             |

Users may also enter a custom value (>= 5 minutes).

Presets are UI helpers only — replay enforces actual timeout rules.

---

# 🏆 ELO Rating System

Reversteem includes a fully deterministic, client-derived ELO rating system.

There is:

* No on-chain rating storage
* No backend leaderboard database
* No rating authority

Ratings are computed locally from finished games.

---

## 📊 Rating Formula

For each completed game:

```
R' = R + K × (S - E)
```

Where:

* `R` = current rating
* `R'` = updated rating
* `K` = rating factor (e.g., 32)
* `S` = actual score (1 win, 0 loss, 0.5 draw)
* `E` = expected score

Timeout wins count as normal wins.

---

## 🔄 Deterministic Reconstruction

Ratings are reconstructed by:

1. Collecting finished games
2. Sorting chronologically
3. Replaying outcomes
4. Applying ELO updates in order

Because outcomes are deterministic:

→ Ratings are deterministic.

Any client replaying the same history computes identical ratings.

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
* Timeout blocks further moves once claimable
* Timeout claim must match expected winner/loser

Invalid moves are ignored.

Replay is:

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

No manual pass transaction required.

---

# 🏁 End-of-Game Conditions

A game is finished when:

1. Both players have no valid moves
2. A valid timeout claim is posted

When finished:

* `currentPlayer` becomes `null`
* Further moves are ignored
* Winner is determined
* Board becomes frozen (UI-level enforcement)

---

# 🛑 Double-Click Prevention

To prevent accidental duplicate moves:

* UI locks during move submission
* `moveNumber` validation rejects duplicate or reordered moves
* Replay guarantees only one valid move per index

Even if UI fails, deterministic replay enforces correctness.

---

# 📝 `boardToMarkdown` – Native Steemit Compatibility

Steemit’s default interface does not execute JavaScript.

Reversteem includes a `boardToMarkdown(board)` function to render a visual board using Markdown.

This allows:

* Spectators on Steemit to view the board
* Non-dApp users to follow the game
* Moves to include human-readable snapshots

Protocol transparency remains intact even outside the dApp.

---

# ⚡ Replay Caching

To improve performance:

* Derived game state is cached in `localStorage`
* Cache key includes `author + permlink`
* Cache invalidates if:

  * Latest block changes
  * Reply count changes

Cache is an optimization only — never a source of truth.

Replay remains authoritative.

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

* Client switches automatically
* Retries request

No backend proxy required.

---

# 🔐 Security Model

Reversteem enforces:

* Strict metadata filtering
* Move sequence validation
* Turn validation
* Legal flip validation
* Automatic pass logic
* Deterministic timeout enforcement
* Claimable timeout validation
* End-state freeze
* Deterministic ELO reconstruction
* Replay cache validation
* RPC failover resilience
* Double-move prevention

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

---

## 📄 License

MIT

---

## 🌐 Live Demo

[https://puncakbukit.github.io/reversteem/](https://puncakbukit.github.io/reversteem/)
