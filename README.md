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
* Hash-based SPA routing (Vue Router 4)
* Read-only spectator mode (no Keychain required)
* Profile image integration from on-chain metadata
* Guest header fallback using `@reversteem` cover and avatar
* Featured game + mini-board previews on dashboard
* Game filtering by timeout preset and ELO rating
* Automatic game tagging on creation (time mode, ELO, genre tags)
* Replay caching for fast reloads
* Multi-RPC automatic fallback
* Markdown board export for native Steemit viewing
* Deterministic per-move time limit (claimable)
* On-chain derived ELO rating system
* Double-click / duplicate move prevention
* Flicker-free background polling (stable Vue reactivity)

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

## 📁 File Structure

The application is split into four focused files loaded in order:

| File | Purpose |
|---|---|
| `index.html` | Minimal HTML shell — CDN script tags, global CSS, `<div id="app">` mount point |
| `engine.js` | Pure game logic — board replay, ELO calculation, tag generation, utility functions. No Vue, no DOM, no blockchain dependencies |
| `blockchain.js` | All Steem API interactions — RPC fallback, account fetching, reply traversal, Keychain posting |
| `components.js` | Reusable Vue 3 components — Board, PlayerBar, SpectatorConsole, MiniBoard, GamePreview, GameFilter, Auth controls |
| `app.js` | Vue Router setup, route views (Dashboard / Game / Profile), root `App` component, mount |

This separation keeps the game engine independently testable and the blockchain layer independently swappable.

---

## 🖼 Frontend Framework

Reversteem uses **Vue 3** and **Vue Router 4**, loaded via CDN — no build step required.

```html
<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
<script src="https://unpkg.com/vue-router@4/dist/vue-router.global.js"></script>
```

The application uses the **Options API** for route view components and the **Composition API** (`setup()`) for the root `App` component.

All components are registered globally on the Vue app instance and use in-template string templates (no `.vue` single-file components, no bundler required).

---

## 🗺 Routing

Vue Router 4 uses **hash history** (`createWebHashHistory`), making it compatible with static hosting on GitHub Pages without server-side redirect configuration.

| Route | View | Description |
|---|---|---|
| `#/` | `DashboardView` | Open games list with featured game board preview |
| `#/game/:author/:permlink` | `GameView` | Live game board, polling, spectator chat |
| `#/@:user` | `ProfileView` | All games posted by a specific user |

`username` and `hasKeychain` are passed into each route view via Vue `provide` / `inject`.

---

## 🧩 Vue Components

| Component | Responsibility |
|---|---|
| `ProfileHeaderComponent` | Displays the logged-in user's cover image, avatar, display name, and ELO rating. Falls back to the `@reversteem` account's cover and avatar for guests |
| `AuthControlsComponent` | Login / logout buttons, time preset selector, timeout input (min 1), Start Game button |
| `BoardComponent` | Renders the 8×8 game board reactively; emits `cell-click`; disables interaction while a move is submitting |
| `PlayerBarComponent` | Displays both players' avatars and ELO ratings; highlights the active player with a gold glow |
| `MiniBoardComponent` | Compact 20px-per-cell board used in featured game previews |
| `OthelloTableComponent` | Static marble table image thumbnail used for non-featured game cards |
| `SpectatorConsoleComponent` | Terminal-style chat panel; shows spectator comments anchored to move coordinates |
| `GamePreviewComponent` | Game card used in Dashboard and Profile views; fetches preview state once on mount |
| `GameFilterComponent` | Inline filter bar for Dashboard and Profile views; filters by timeout preset or custom operator and by ELO operator |

### Guest Profile Header

When no user is logged in, `ProfileHeaderComponent` automatically fetches the `@reversteem` account and displays its cover image and avatar instead of leaving the header blank. The ELO badge is hidden in guest mode. The fallback is loaded lazily and only fetched once per session.

### Flicker-Free Polling

`GameView` polls the blockchain every **15 seconds**. To prevent visible page jumps on each poll:

* `PlayerBarComponent` accepts pre-resolved `blackData` / `whiteData` account objects as props — it never fetches accounts itself. The parent (`GameView`) fetches account data once and only re-fetches if a player username changes (e.g., white player just joined).
* On re-polls, `GameView` **merges** updated fields into the existing `gameState` object rather than replacing it entirely. This allows Vue to diff at the field level — unchanged data (player names, timeout settings) never triggers child re-renders.
* `loading` is only `true` on the very first load. Subsequent polls update state silently without unmounting the board.
* `SpectatorConsoleComponent` only auto-scrolls to the bottom when the message count actually increases, preventing jarring scroll jumps while the user is reading.

---

# 🔗 On-Chain Game Model

| Blockchain Object | Meaning |
|---|---|
| Root Post | Represents a game (Black player is the author) |
| Join Comment | Registers the White player |
| Move Comment | Represents one move |
| Timeout Claim | Claims victory after the opponent exceeds their time limit |
| Comment Order | Defines deterministic replay order (chronological by `created`) |

Only comments containing valid JSON metadata for the `reversteem/x.y` app are processed as game events.

All other comments (including spectator chat) are classified separately and displayed in the spectator console without affecting game state.

---

# 🏷 Automatic Game Tagging

When a game is created, Reversteem automatically builds and attaches up to 7 Steem tags (the maximum supported alongside the required `reversteem` parent tag) derived from the game parameters.

## Tag Format

| Position | Tag | Example |
|---|---|---|
| 1 | Time control preset name, or `mins-[N]` for custom values | `blitz`, `rapid`, `standard`, `daily`, `mins-30` |
| 2 | Black player's raw ELO rating | `elo-1184` |
| 3 | `reversi` | `reversi` |
| 4 | `othello` | `othello` |
| 5 | `board` | `board` |
| 6 | `game` | `game` |
| 7 | `steem` | `steem` |

Tags are generated by `buildGameTags(timeoutMinutes, username)` in `engine.js` and merged into the post's `json_metadata.tags` array before submission. Steem Keychain's `requestPost` reads tags from `json_metadata` — there is no separate tags argument.

The game title and the `elo-` tag both use the player's raw ELO rating (integer-rounded) for consistency.

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
  "timeoutMinutes": 60,
  "tags": ["standard", "elo-1200", "reversi", "othello", "board", "game", "steem"]
}
```

### `timeoutMinutes`

* Defines the maximum time per move
* Minimum enforced: **1 minute** (aligned with Steem's ~3 second block time)
* Maximum enforced: **10,080 minutes (7 days)**
* Default: **60 minutes (1 hour)**

Timeout is inactive until both players have joined.

---

## 🕒 Timeout Mechanics (Claimable Model)

Timeout is derived from blockchain timestamps.

For each move:

1. Determine the timestamp of the last valid move (or game start time if no moves yet)
2. Determine whose turn it is
3. Compare:

```
currentTime - lastMoveTime >= timeoutMinutes
```

If true:

* The current player has exceeded their time limit
* The opponent may post a `timeout_claim` comment

---

## 🏆 Timeout Claim Metadata

```json
{
  "app": "reversteem/0.1",
  "action": "timeout_claim",
  "claimAgainst": "black",
  "moveNumber": 12
}
```

Replay validation requires:

* Game not already finished
* Both players joined
* Timeout threshold exceeded (`minutesPassed >= timeoutMinutes`)
* `moveNumber` matches `appliedMoves` at time of claim
* `claimAgainst` matches the color of the player whose turn it is
* Claim author matches the expected winner (the opponent of the timed-out player)

If valid:

* Game ends immediately
* Winner is set deterministically
* Further moves are ignored

---

## ⚖ Timeout Edge Case Behavior

Once the timeout threshold is exceeded:

* Only a valid `timeout_claim` is accepted
* Further moves by the timed-out player are rejected deterministically during replay

This prevents race-condition ambiguity between a late move and a timeout claim.

Timeout enforcement is derived during replay — not triggered by UI.

---

# 🎮 Time Control Presets

When creating a game, users can select:

| Mode | Minutes per move |
|---|---|
| Blitz | 1 |
| Rapid | 5 |
| Standard | 60 (default) |
| Daily | 1440 |

Users may also enter a custom value (minimum 1 minute, maximum 10,080 minutes).

Presets are UI helpers only — replay enforces the actual `timeoutMinutes` value stored in the root post metadata.

---

# 🔍 Game Filtering

The Dashboard and Profile views include a `GameFilterComponent` that lets visitors narrow the game list without reloading from the blockchain.

## Timeout Filter

* **Preset buttons**: tap Blitz, Rapid, Standard, or Daily to filter to that exact timeout value
* **Custom operator**: use `<`, `=`, or `>` with a manually entered minute value for non-preset timeouts
* Preset and custom modes are mutually exclusive

## ELO Filter

* Use `<`, `=`, or `>` with a rating value to filter games by the Black player's current ELO

A **✕ Clear** button appears whenever any filter is active.

Filtering is purely client-side — it operates on the already-loaded game list and adds no additional blockchain requests. The `timeoutMinutes` field is extracted from each game's `json_metadata` during enrichment in `deriveWhitePlayer`, making it available without loading the full game state.

---

# 🏆 ELO Rating System

Reversteem includes a fully deterministic, client-derived ELO rating system.

There is:

* No on-chain rating storage
* No backend leaderboard database
* No rating authority

Ratings are computed locally from finished games and cached in `localStorage` under the key `reversteem_elo_cache`.

---

## 📊 Rating Parameters

| Parameter | Value |
|---|---|
| Base rating | 1200 |
| K-factor | 32 |

## Rating Formula

For each completed game:

```
R' = R + K × (S - E)
E  = 1 / (1 + 10^((R_opponent - R) / 400))
```

Where `S` = 1 (win), 0 (loss), or 0.5 (draw). Timeout wins count as normal wins.

---

## 🔄 Deterministic Reconstruction

Ratings are reconstructed by:

1. Collecting finished games
2. Sorting chronologically by `created`
3. Replaying outcomes in order
4. Applying ELO updates incrementally

The ELO cache is incremental — only games newer than `lastProcessed` are computed on subsequent loads.

Because outcomes are deterministic, ratings are deterministic. Any client replaying the same history computes identical ratings.

---

# 🔢 Move Validation Rules

During deterministic replay:

* `moveNumber` must equal `appliedMoves` (sequential, no gaps or duplicates)
* Author must match the expected player for the current turn color
* Board index must be in range `0–63`
* Move must flip at least one opponent piece
* Turn must be correct (respecting automatic pass logic)
* No moves accepted after game end
* Moves are rejected once a valid timeout threshold has been exceeded

Invalid moves are silently skipped. Replay is deterministic, tamper-resistant, order-safe, and race-condition safe.

---

# 🔄 Automatic Pass Rule

If a player has no valid moves:

* Turn automatically passes to the opponent
* If both players have no valid moves → game ends immediately

Pass logic is enforced during replay. No manual pass transaction is required or supported.

---

# 🏁 End-of-Game Conditions

A game is finished when:

1. Both players have no valid moves remaining
2. A valid `timeout_claim` is applied during replay

When finished:

* `currentPlayer` becomes `null`
* Further moves are ignored
* Winner is determined by disc count, or set to the timeout claimant's opponent
* Board becomes frozen in the UI

---

# 🛑 Double-Click Prevention

To prevent accidental duplicate moves:

* The board UI disables clicks while a move is submitting (`isSubmitting` flag in `GameView`)
* `moveNumber` validation during replay rejects any duplicate or out-of-sequence move comment
* Even if the UI fails, deterministic replay enforces correctness

---

# 📝 `boardToMarkdown` – Native Steemit Compatibility

Steemit's default interface does not execute JavaScript.

Reversteem includes a `boardToMarkdown(board)` function in `engine.js` to render a visual board snapshot using a Markdown table with emoji pieces (⚫ / ⚪ / ·).

This is embedded in every move comment body, allowing:

* Spectators on Steemit to view the board position after each move
* Non-dApp users to follow the game
* Protocol transparency to remain intact outside the dApp

---

# ⚡ Replay Caching

To reduce redundant blockchain fetches:

* Derived game state is cached in `localStorage` per game, keyed by `author + permlink`
* Cache is considered valid if the latest reply `created` timestamp and total reply count both match
* Cache is invalidated automatically when new replies arrive

Cache is an optimization only — never a source of truth. Full replay remains authoritative.

---

# 🌐 Multi-RPC Fallback

Reversteem automatically rotates between public RPC nodes if a request fails:

```
https://api.steemit.com
https://api.justyy.com
https://steemd.steemworld.org
https://api.steem.fans
```

The fallback logic lives in `callWithFallback` / `callWithFallbackAsync` in `blockchain.js`. On failure, it increments `currentRPCIndex` and retries transparently. No backend proxy required.

---

# 🔐 Security Model

Reversteem enforces:

* Strict metadata filtering (`app` field must start with `reversteem/`)
* Move sequence validation (`moveNumber` must equal `appliedMoves`)
* Turn validation (author must match expected player)
* Legal flip validation (at least one piece must be flipped)
* Automatic pass logic
* Deterministic timeout enforcement
* Claimable timeout validation (`claimAgainst`, `moveNumber`, and elapsed time all verified)
* End-state freeze (no moves after game end)
* Deterministic ELO reconstruction
* Replay cache validation (invalidated on reply count or timestamp change)
* RPC failover resilience
* Double-move prevention (UI lock + `moveNumber` replay guard)

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
* Fully frontend-only dApps are viable on static hosting
* Consensus logic can live entirely in the browser
* A modern reactive UI framework (Vue 3) can be adopted with zero build tooling

Reversteem is not merely a game.

It is a deterministic state machine embedded in a social blockchain.

---

## 📄 License

MIT

---

## 🌐 Live Demo

[https://puncakbukit.github.io/reversteem/](https://puncakbukit.github.io/reversteem/)
