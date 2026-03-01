// ============================================================
// app.js
// Vue 3 + Vue Router 4 application entry point
// ============================================================

const { createApp, ref, computed, onMounted, onUnmounted, watch, provide } = Vue;
const { useRoute } = VueRouter;
const { createRouter, createWebHashHistory } = VueRouter;

// ============================================================
// ROUTE VIEWS (defined as components)
// ============================================================

// ---- DashboardView ----
const DashboardView = {
  name: "DashboardView",
  inject: ["username", "hasKeychain", "notify", "setInviteCount"],
  components: { GamePreviewComponent, GameFilterComponent },
  data() {
    return { games: [], loading: true, filterFn: null };
  },
  computed: {
    invitedGames() {
      if (!this.username) return [];
      return this.games.filter(g =>
        !g.whitePlayer &&
        Array.isArray(g.invites) &&
        g.invites.includes(this.username.toLowerCase())
      );
    },
    filteredGames() {
      // Exclude already-shown invited games from the main list
      const invitedPermalinks = new Set(this.invitedGames.map(g => g.permlink));
      const base = this.games.filter(g => !invitedPermalinks.has(g.permlink));
      if (!this.filterFn) return base;
      return base.filter(this.filterFn);
    },
    featuredGames() { return this.filteredGames.slice(0, 2); },
    otherGames()    { return this.filteredGames.slice(2); }
  },
  watch: {
    invitedGames(val) { this.setInviteCount(val.length); }
  },
  async created() {
    await this.loadGames();
  },
  methods: {
    async loadGames() {
      this.loading = true;
      try {
        const raw = await loadOpenGamesFromSteem();
        const enriched = await enrichGamesWithWhitePlayer(raw);
        await updateEloRatingsFromGames(enriched);
        this.games = enriched.sort((a, b) => new Date(b.created) - new Date(a.created));
        this.setInviteCount(this.invitedGames.length);
      } catch (e) {
        console.error("Failed to load games", e);
      }
      this.loading = false;
    },
    timePresetLabel(mins) {
      const preset = Object.entries(TIME_PRESETS).find(([, v]) => v === mins);
      return preset ? preset[0].charAt(0).toUpperCase() + preset[0].slice(1) : mins + ' min';
    },
    viewGame(game) {
      this.$router.push(`/game/${game.author}/${game.permlink}`);
    },
    async joinGame(game) {
      if (!this.hasKeychain) {
        this.notify("Steem Keychain extension is not installed.", "error");
        return;
      }
      if (!this.username) {
        this.notify("Please log in first.", "error");
        return;
      }
      if (this.username === game.blackPlayer) {
        this.notify("You cannot join your own game.", "error");
        return;
      }

      // Guard: enforce invite list before posting to blockchain
      const invites = Array.isArray(game.invites) ? game.invites : [];
      if (invites.length > 0 && !invites.includes(this.username.toLowerCase())) {
        this.notify("You are not invited to this game.", "error");
        return;
      }

      const meta = { app: APP_INFO, action: "join" };
      const body = `## @${this.username} joined as White\n\nGame link: ${LIVE_DEMO}#/game/${game.author}/${game.permlink}`;

      keychainPost(
        this.username, "", body,
        game.permlink, game.author,
        meta,
        `reversteem-join-${Date.now()}`, "",
        (res) => {
          if (!res.success) {
            this.notify("Keychain rejected the join request.", "error");
            return;
          }
          this.$router.push(`/game/${game.author}/${game.permlink}`);
        }
      );
    }
  },
  template: `
    <div>
      <div v-if="loading"><p>Loading games...</p></div>
      <div v-else>
        <!-- Invitations banner -->
        <div v-if="invitedGames.length" style="
          margin: 12px auto; padding: 14px 18px; max-width: 600px;
          background: #fff8e1; border: 2px solid #f9a825;
          border-radius: 8px; text-align: left;
        ">
          <div style="font-weight: bold; margin-bottom: 8px; color: #e65100;">
            📬 You have {{ invitedGames.length === 1 ? '1 invitation' : invitedGames.length + ' invitations' }}
          </div>
          <div v-for="game in invitedGames" :key="game.permlink"
            style="display:flex; align-items:center; justify-content:space-between;
              padding: 6px 0; border-top: 1px solid #ffe082; flex-wrap:wrap; gap:6px;"
          >
            <span style="font-size:13px; color:#333;">
              <a :href="'#/@' + game.blackPlayer" style="color:#2e7d32; text-decoration:none; font-weight:bold;">@{{ game.blackPlayer }}</a>
              invited you to a
              <strong>{{ timePresetLabel(game.timeoutMinutes) }}</strong>
              game
            </span>
            <button
              @click="$emit('view-game', game) || $router.push('/game/' + game.author + '/' + game.permlink)"
              style="padding: 4px 14px; background: #f9a825; border: none;
                border-radius: 20px; font-weight: bold; cursor: pointer; font-size: 13px;"
            >View &amp; Join →</button>
          </div>
        </div>

        <game-filter-component @filter="fn => filterFn = fn"></game-filter-component>
        <p v-if="!filteredGames.length" style="color:#888;">No games match the current filter.</p>
        <div id="featuredGame" v-if="featuredGames.length">
          <game-preview-component
            v-for="game in featuredGames"
            :key="game.permlink"
            :game="game"
            :username="username"
            :is-featured="true"
            @view="viewGame"
            @join="joinGame"
          ></game-preview-component>
        </div>
        <hr v-if="otherGames.length" />
        <div id="gameList">
          <game-preview-component
            v-for="game in otherGames"
            :key="game.permlink"
            :game="game"
            :username="username"
            @view="viewGame"
            @join="joinGame"
          ></game-preview-component>
        </div>
      </div>
    </div>
  `
};

// ---- ProfileView ----
const ProfileView = {
  name: "ProfileView",
  inject: ["username", "hasKeychain", "notify"],
  components: { GamePreviewComponent, GameFilterComponent },
  data() {
    return { games: [], loading: true, filterFn: null };
  },
  computed: {
    filteredGames() {
      if (!this.filterFn) return this.games;
      return this.games.filter(this.filterFn);
    },
    featuredGames() { return this.filteredGames.slice(0, 2); },
    otherGames()    { return this.filteredGames.slice(2); }
  },
  async created() {
    const profileUser = this.$route.params.user;
    this.loading = true;
    try {
      const all = await loadAllGamesForUser(profileUser);
      await updateEloRatingsFromGames(all);
      this.games = all;
    } catch {}
    this.loading = false;
  },
  methods: {
    viewGame(game) {
      this.$router.push(`/game/${game.author}/${game.permlink}`);
    },
    async joinGame(game) {
      if (!this.hasKeychain) {
        this.notify("Steem Keychain extension is not installed.", "error");
        return;
      }
      if (!this.username) {
        this.notify("Please log in first.", "error");
        return;
      }
      if (this.username === game.blackPlayer) {
        this.notify("You cannot join your own game.", "error");
        return;
      }
      // Guard: enforce invite list before posting to blockchain
      const invites = Array.isArray(game.invites) ? game.invites : [];
      if (invites.length > 0 && !invites.includes(this.username.toLowerCase())) {
        this.notify("You are not invited to this game.", "error");
        return;
      }

      const meta = { app: APP_INFO, action: "join" };
      const body = `## @${this.username} joined as White\n\nGame link: ${LIVE_DEMO}#/game/${game.author}/${game.permlink}`;
      keychainPost(
        this.username, "", body,
        game.permlink, game.author,
        meta,
        `reversteem-join-${Date.now()}`, "",
        (res) => {
          if (!res.success) {
            this.notify("Keychain rejected the join request.", "error");
            return;
          }
          this.$router.push(`/game/${game.author}/${game.permlink}`);
        }
      );
    }
  },
  template: `
    <div>
      <h3>Games by <a :href="'#/@' + $route.params.user" style="color:#2e7d32;text-decoration:none;">@{{ $route.params.user }}</a></h3>
      <div v-if="loading">Loading...</div>
      <div v-else-if="!games.length"><p>No games found.</p></div>
      <div v-else>
        <game-filter-component @filter="fn => filterFn = fn"></game-filter-component>
        <p v-if="!filteredGames.length" style="color:#888;">No games match the current filter.</p>
        <game-preview-component
          v-for="game in featuredGames"
          :key="game.permlink"
          :game="game"
          :username="username"
          :profile-user="$route.params.user"
          :is-featured="true"
          @view="viewGame"
          @join="joinGame"
        ></game-preview-component>
        <hr v-if="otherGames.length" />
        <game-preview-component
          v-for="game in otherGames"
          :key="game.permlink"
          :game="game"
          :username="username"
          :profile-user="$route.params.user"
          @view="viewGame"
          @join="joinGame"
        ></game-preview-component>
      </div>
    </div>
  `
};

// ---- GameView ----
const GameView = {
  name: "GameView",
  inject: ["username", "hasKeychain", "notify"],
  components: {
    BoardComponent,
    PlayerBarComponent,
    SpectatorConsoleComponent,
    MoveTranscriptComponent
  },
  data() {
    return {
      gameState: null,
      spectatorReplies: [],
      allReplies: [],
      gameReplies: [],
      // Account data hoisted here — fetched once, never re-fetched unless player changes
      blackData: null,
      whiteData: null,
      isSubmitting: false,
      pollTimer: null,
      nowTick: Date.now(),   // updated every second so timeout computeds stay reactive
      nowTickTimer: null,
      // `loading` is only true on the very first load, not on subsequent polls.
      // This prevents the board from unmounting/remounting every 15 seconds.
      loading: true,
      error: null
    };
  },
  computed: {
    author() { return this.$route.params.author; },
    permlink() { return this.$route.params.permlink; },
    turnIndicatorText() {
      const s = this.gameState;
      if (!s) return "";
      if (s.finished) {
        if (s.winner === "draw") return "🏁 Game Over — Draw!";
        return `🏁 Game Over — @${s.winner === "black" ? s.blackPlayer : s.whitePlayer} wins!`;
      }
      if (!s.whitePlayer) return "Waiting for opponent...";
      const playerToMove = s.currentPlayer === "black" ? s.blackPlayer : s.whitePlayer;
      const colorLabel = s.currentPlayer === "black" ? "Black ⚫" : "White ⚪";
      if (this.username === playerToMove) return `🟢 Your turn (${colorLabel})`;
      return `⏳ Waiting for @${playerToMove} (${colorLabel})`; // @username replaced in template
    },
    canClaimTimeout() {
      void this.nowTick; // reactive dependency — re-evaluates every second
      const s = this.gameState;
      if (!isTimeoutClaimable(s) || !this.username) return false;
      // Only the opponent of the timed-out player may claim.
      // currentPlayer is the one who timed out — the winner is the other.
      const expectedWinner = s.currentPlayer === "black" ? s.whitePlayer : s.blackPlayer;
      return this.username === expectedWinner;
    },
    isLosingByTimeout() {
      void this.nowTick; // reactive dependency — re-evaluates every second
      const s = this.gameState;
      if (!isTimeoutClaimable(s) || !this.username || s.finished) return false;
      // The timed-out player is whoever's turn it currently is
      const timedOutPlayer = s.currentPlayer === "black" ? s.blackPlayer : s.whitePlayer;
      return this.username === timedOutPlayer;
    },
    loserName() {
      const s = this.gameState;
      if (!s) return "";
      return s.currentPlayer === "black" ? s.blackPlayer : s.whitePlayer;
    },
    waitingForPlayer() {
      const s = this.gameState;
      if (!s || s.finished || !s.whitePlayer) return null;
      const playerToMove = s.currentPlayer === "black" ? s.blackPlayer : s.whitePlayer;
      if (this.username === playerToMove) return null;
      return playerToMove;
    },
    winnerPlayer() {
      const s = this.gameState;
      if (!s || !s.finished || s.winner === "draw") return null;
      return s.winner === "black" ? s.blackPlayer : s.whitePlayer;
    },
    canJoin() {
      const s = this.gameState;
      if (!s || s.finished || s.whitePlayer) return false;
      if (!this.hasKeychain || !this.username || this.username === s.blackPlayer) return false;
      // invites is always an array after the cache fix ([] = open game)
      const invites = Array.isArray(s.invites) ? s.invites : [];
      if (invites.length > 0) {
        return invites.includes(this.username.toLowerCase());
      }
      return true;
    },
    // The author+permlink that a spectator comment should reply to.
    // Replies to last move while game is in progress; replies to root otherwise.
    commentTarget() {
      const s = this.gameState;
      if (!s) return null;
      const useRoot = !s.whitePlayer || s.finished || !this.gameReplies.length;
      if (useRoot) return { author: this.author, permlink: this.permlink };
      // Find the reply matching the last applied move (appliedMoves - 1)
      const lastMoveNumber = s.appliedMoves - 1;
      const lastMoveReply = this.gameReplies.find(r => {
        try {
          const meta = JSON.parse(r.json_metadata);
          return meta.action === "move" && meta.moveNumber === lastMoveNumber;
        } catch { return false; }
      });
      return lastMoveReply
        ? { author: lastMoveReply.author, permlink: lastMoveReply.permlink }
        : { author: this.author, permlink: this.permlink };
    }
  },
  async created() {
    await this.load();
    this.nowTickTimer = setInterval(() => { this.nowTick = Date.now(); }, 1000);
  },
  beforeUnmount() {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.nowTickTimer) clearInterval(this.nowTickTimer);
  },
  methods: {
    async load() {
      // Don't set loading=true on re-polls — that would unmount the board and cause flicker.
      // loading stays true only until the very first successful render.
      this.error = null;
      try {
        const { state, spectatorReplies, gameReplies, allReplies } = await loadGameFromSteem(this.author, this.permlink);

        // --- Merge game state fields individually instead of replacing the whole object.
        // Vue can then diff at the field level; stable fields (board cells that didn't
        // change, timeoutMinutes, player names) won't trigger child re-renders.
        if (!this.gameState) {
          this.gameState = state;
        } else {
          // Only overwrite what may have changed
          this.gameState.board = state.board;
          this.gameState.currentPlayer = state.currentPlayer;
          this.gameState.appliedMoves = state.appliedMoves;
          this.gameState.finished = state.finished;
          this.gameState.winner = state.winner;
          this.gameState.score = state.score;
          this.gameState.moves = state.moves;
          this.gameState.lastMoveTime = state.lastMoveTime;
          // whitePlayer may have just joined
          this.gameState.whitePlayer = state.whitePlayer;
          this.gameState.invites = state.invites || [];
        }

        // Fetch account data only when a player username is newly seen
        if (state.blackPlayer && (!this.blackData || this.blackData.username !== state.blackPlayer)) {
          this.blackData = await fetchAccount(state.blackPlayer);
        }
        if (state.whitePlayer && (!this.whiteData || this.whiteData.username !== state.whitePlayer)) {
          this.whiteData = await fetchAccount(state.whitePlayer);
        }

        this.spectatorReplies = spectatorReplies;
        this.gameReplies = gameReplies;
        this.allReplies = allReplies;
      } catch (e) {
        // Only show error on first load; silent on background polls
        if (this.loading) this.error = "Failed to load game.";
        console.error(e);
      }

      this.loading = false;

      if (this.gameState && !this.gameState.finished) {
        this.pollTimer = setTimeout(() => this.load(), 15000);
      }
    },

    handleCellClick(index) {
      const state = this.gameState;
      if (!state || state.finished || !state.currentPlayer || this.isSubmitting) return;
      if (isTimeoutClaimable(state)) return;

      const expected = state.currentPlayer === "black" ? state.blackPlayer : state.whitePlayer;
      if (this.username !== expected) return;

      const flips = getFlipsForBoard(state.board, index, state.currentPlayer);
      if (flips.length === 0) return;

      this.postMove(index);
    },

    postComment(text) {
      const target = this.commentTarget;
      if (!target || !text.trim()) return;
      const meta = { app: APP_INFO, action: "spectator_comment" };
      keychainPost(
        this.username, "", text.trim(),
        target.permlink, target.author,
        meta,
        `reversteem-comment-${Date.now()}`, "",
        (res) => {
          if (!res.success) {
            this.notify(res.message || "Failed to post comment.", "error");
            return;
          }
          this.load();
        }
      );
    },

    async joinGame() {
      const state = this.gameState;
      if (!state) return;
      // Guard: enforce invite list before posting to blockchain
      const invites = Array.isArray(state.invites) ? state.invites : [];
      if (invites.length > 0 && !invites.includes(this.username.toLowerCase())) {
        this.notify("You are not invited to this game.", "error");
        return;
      }
      const meta = { app: APP_INFO, action: "join" };
      const body = `## @${this.username} joined as White\n\nGame link: ${LIVE_DEMO}#/game/${this.author}/${this.permlink}`;
      keychainPost(
        this.username, "", body,
        this.permlink, this.author,
        meta,
        `reversteem-join-${Date.now()}`, "",
        (res) => {
          if (!res.success) {
            this.notify(res.message || "Failed to join game.", "error");
            return;
          }
          this.load();
        }
      );
    },

    postMove(index) {
      const state = this.gameState;
      if (this.isSubmitting) return;
      this.isSubmitting = true;

      const simulatedBoard = [...state.board];
      const flips = getFlipsForBoard(simulatedBoard, index, state.currentPlayer);
      simulatedBoard[index] = state.currentPlayer;
      flips.forEach(f => (simulatedBoard[f] = state.currentPlayer));

      const meta = { app: APP_INFO, action: "move", index, moveNumber: state.appliedMoves };

      // Detect if this move ends the game
      const nextColor = state.currentPlayer === "black" ? "white" : "black";
      const blackCanMove = hasAnyValidMove(simulatedBoard, "black");
      const whiteCanMove = hasAnyValidMove(simulatedBoard, "white");
      const gameEndsAfterMove = !blackCanMove && !whiteCanMove;
      let finishSuffix = "";
      if (gameEndsAfterMove) {
        const score = countDiscs(simulatedBoard);
        let resultLine;
        if (score.black > score.white) resultLine = `⚫ ${state.blackPlayer} wins! (${score.black}–${score.white})`;
        else if (score.white > score.black) resultLine = `⚪ ${state.whitePlayer} wins! (${score.white}–${score.black})`;
        else resultLine = `🤝 Draw! (${score.black}–${score.white})`;
        finishSuffix = `\n\n---\n🏁 **Game Over** — ${resultLine}`;
      }

      const simulatedMoves = [...(state.moves || []), { author: this.username, index, created: new Date().toISOString() }];
      const transcript = movesToTranscript(simulatedMoves, state.blackPlayer, state.whitePlayer);

      const body = `## Move by @${this.username}\n\nPlayed at ${indexToCoord(index)}\n\n${boardToMarkdown(simulatedBoard)}\n\n${transcript}${finishSuffix}`;

      keychainPost(
        this.username, "", body,
        this.permlink, this.author,
        meta,
        `reversteem-move-${Date.now()}`, "",
        (res) => {
          this.isSubmitting = false;
          if (!res.success) {
            this.notify(res.message || "Move failed. Please try again.", "error");
            return;
          }
          this.load();
        }
      );
    },

    postTimeoutClaim() {
      const state = this.gameState;
      if (!state) return;
      // Guard: only the opponent of the timed-out player may post a claim
      const expectedWinner = state.currentPlayer === "black" ? state.whitePlayer : state.blackPlayer;
      if (this.username !== expectedWinner) {
        this.notify("You are not the opponent of the timed-out player.", "error");
        return;
      }
      const meta = {
        app: APP_INFO,
        action: "timeout_claim",
        claimAgainst: state.currentPlayer,
        moveNumber: state.appliedMoves
      };
      const timedOutPlayer = state.currentPlayer === "black" ? state.blackPlayer : state.whitePlayer;
      const claimBody = `## Timeout Claim by @${this.username}\n\n@${timedOutPlayer} exceeded the ${formatTimeout(state.timeoutMinutes)} move time limit.\n\n---\n🏁 **Game Over** — ⏰ @${this.username} wins by timeout!`;
      keychainPost(
        this.username, "", claimBody,
        this.permlink, this.author,
        meta,
        `reversteem-timeout-${Date.now()}`, "",
        (res) => {
          if (!res.success) {
            this.notify(res.message || "Timeout claim failed. Please try again.", "error");
            return;
          }
          this.load();
        }
      );
    },

    formatTimeout
  },
  template: `
    <div id="gameContainer" style="margin-top:20px;">
      <div v-if="loading"><p>Loading game...</p></div>
      <div v-else-if="error"><p style="color:red;">{{ error }}</p></div>
      <template v-else-if="gameState">
        <!-- Game Title -->
        <h2 v-if="gameState.title" style="margin-bottom:10px;">{{ gameState.title }}</h2>

        <!-- Player Bar: receives stable account objects, not raw usernames -->
        <player-bar-component
          :black-data="blackData"
          :white-data="whiteData"
          :current-player="gameState.currentPlayer"
          :finished="gameState.finished"
        ></player-bar-component>

        <!-- Timeout Info -->
        <div id="timeoutDisplay" style="margin-bottom:10px;">
          Move timeout: {{ formatTimeout(gameState.timeoutMinutes) }}
        </div>

        <!-- Timeout Claim -->
        <div v-if="canClaimTimeout" style="margin:10px 0;">
          <button @click="postTimeoutClaim">Claim Timeout Victory vs @{{ loserName }}</button>
        </div>

        <!-- Timeout loss warning for the player who ran out of time -->
        <div v-if="isLosingByTimeout" style="
          margin: 10px auto; padding: 12px 16px; max-width: 480px;
          background: #fff3e0; border: 2px solid #e65100;
          border-radius: 8px; font-weight: bold; color: #b71c1c;
        ">
          ⏰ Your time is up! Your opponent may claim timeout victory against you at any moment.
        </div>

        <!-- Turn Indicator -->
        <div id="turnIndicator" style="margin-bottom:10px; font-weight:bold;">
          <template v-if="winnerPlayer">
            🏁 Game Over — <a :href="'#/@' + winnerPlayer" style="color:#2e7d32;text-decoration:none;">@{{ winnerPlayer }}</a> wins!
          </template>
          <template v-else-if="waitingForPlayer">
            ⏳ Waiting for <a :href="'#/@' + waitingForPlayer" style="color:#2e7d32;text-decoration:none;">@{{ waitingForPlayer }}</a> ({{ gameState.currentPlayer === 'black' ? 'Black ⚫' : 'White ⚪' }})
          </template>
          <template v-else>{{ turnIndicatorText }}</template>
        </div>

        <!-- Join -->
        <div v-if="canJoin" style="margin:10px 0;">
          <button @click="joinGame">Join as White ⚪</button>
        </div>

        <!-- Invite list (shown when game is open and has restrictions) -->
        <div v-if="!gameState.whitePlayer && gameState.invites && gameState.invites.length > 0"
          style="margin:8px 0; font-size:13px; color:#555;">
          Open to:
          <span v-for="(u, i) in gameState.invites" :key="u">
            <a :href="'#/@' + u" style="color:#2e7d32; text-decoration:none; font-weight:bold;">@{{ u }}</a><span v-if="i < gameState.invites.length - 1">, </span>
          </span>
        </div>

        <!-- Board -->
        <board-component
          :board-state="gameState.board"
          :disabled="isSubmitting"
          @cell-click="handleCellClick"
        ></board-component>

        <!-- Spectator Console -->
        <spectator-console-component
          :all-replies="allReplies"
          :spectator-replies="spectatorReplies"
          :username="username"
          :has-keychain="hasKeychain"
          @post-comment="postComment"
        ></spectator-console-component>

        <!-- Move Transcript -->
        <move-transcript-component
          :moves="gameState.moves"
          :black-player="gameState.blackPlayer"
          :white-player="gameState.whitePlayer"
        ></move-transcript-component>
      </template>
    </div>
  `
};


// ---- AboutView ----
const AboutView = {
  name: "AboutView",
  data() {
    return { rawMarkdown: `# Reversteem – Reversi on Steem

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
* Move sequence indexing (\`moveNumber\`) validation
* Username-based turn enforcement
* Strict JSON metadata protocol filtering
* Hash-based SPA routing (Vue Router 4)
* Read-only spectator mode (no Keychain required)
* Profile image integration from on-chain metadata
* Guest header fallback using \`@reversteem\` cover and avatar
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
| \`index.html\` | Minimal HTML shell — CDN script tags, global CSS, \`<div id="app">\` mount point |
| \`engine.js\` | Pure game logic — board replay, ELO calculation, tag generation, utility functions. No Vue, no DOM, no blockchain dependencies |
| \`blockchain.js\` | All Steem API interactions — RPC fallback, account fetching, reply traversal, Keychain posting |
| \`components.js\` | Reusable Vue 3 components — Board, PlayerBar, SpectatorConsole, MiniBoard, GamePreview, GameFilter, Auth controls |
| \`app.js\` | Vue Router setup, route views (Dashboard / Game / Profile), root \`App\` component, mount |

This separation keeps the game engine independently testable and the blockchain layer independently swappable.

---

## 🖼 Frontend Framework

Reversteem uses **Vue 3** and **Vue Router 4**, loaded via CDN — no build step required.

\`\`\`html
<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
<script src="https://unpkg.com/vue-router@4/dist/vue-router.global.js"></script>
\`\`\`

The application uses the **Options API** for route view components and the **Composition API** (\`setup()\`) for the root \`App\` component.

All components are registered globally on the Vue app instance and use in-template string templates (no \`.vue\` single-file components, no bundler required).

---

## 🗺 Routing

Vue Router 4 uses **hash history** (\`createWebHashHistory\`), making it compatible with static hosting on GitHub Pages without server-side redirect configuration.

| Route | View | Description |
|---|---|---|
| \`#/\` | \`DashboardView\` | Open games list with featured game board preview |
| \`#/game/:author/:permlink\` | \`GameView\` | Live game board, polling, spectator chat |
| \`#/@:user\` | \`ProfileView\` | All games posted by a specific user |

\`username\` and \`hasKeychain\` are passed into each route view via Vue \`provide\` / \`inject\`.

---

## 🧩 Vue Components

| Component | Responsibility |
|---|---|
| \`ProfileHeaderComponent\` | Displays the logged-in user's cover image, avatar, display name, and ELO rating. Falls back to the \`@reversteem\` account's cover and avatar for guests |
| \`AuthControlsComponent\` | Login / logout buttons, time preset selector, timeout input (min 1), Start Game button |
| \`BoardComponent\` | Renders the 8×8 game board reactively; emits \`cell-click\`; disables interaction while a move is submitting |
| \`PlayerBarComponent\` | Displays both players' avatars and ELO ratings; highlights the active player with a gold glow |
| \`MiniBoardComponent\` | Compact 20px-per-cell board used in featured game previews |
| \`OthelloTableComponent\` | Static marble table image thumbnail used for non-featured game cards |
| \`SpectatorConsoleComponent\` | Terminal-style chat panel; shows spectator comments anchored to move coordinates |
| \`GamePreviewComponent\` | Game card used in Dashboard and Profile views; fetches preview state once on mount |
| \`GameFilterComponent\` | Inline filter bar for Dashboard and Profile views; filters by timeout preset or custom operator and by ELO operator |

### Guest Profile Header

When no user is logged in, \`ProfileHeaderComponent\` automatically fetches the \`@reversteem\` account and displays its cover image and avatar instead of leaving the header blank. The ELO badge is hidden in guest mode. The fallback is loaded lazily and only fetched once per session.

### Flicker-Free Polling

\`GameView\` polls the blockchain every **15 seconds**. To prevent visible page jumps on each poll:

* \`PlayerBarComponent\` accepts pre-resolved \`blackData\` / \`whiteData\` account objects as props — it never fetches accounts itself. The parent (\`GameView\`) fetches account data once and only re-fetches if a player username changes (e.g., white player just joined).
* On re-polls, \`GameView\` **merges** updated fields into the existing \`gameState\` object rather than replacing it entirely. This allows Vue to diff at the field level — unchanged data (player names, timeout settings) never triggers child re-renders.
* \`loading\` is only \`true\` on the very first load. Subsequent polls update state silently without unmounting the board.
* \`SpectatorConsoleComponent\` only auto-scrolls to the bottom when the message count actually increases, preventing jarring scroll jumps while the user is reading.

---

# 🔗 On-Chain Game Model

| Blockchain Object | Meaning |
|---|---|
| Root Post | Represents a game (Black player is the author) |
| Join Comment | Registers the White player |
| Move Comment | Represents one move |
| Timeout Claim | Claims victory after the opponent exceeds their time limit |
| Comment Order | Defines deterministic replay order (chronological by \`created\`) |

Only comments containing valid JSON metadata for the \`reversteem/x.y\` app are processed as game events.

All other comments (including spectator chat) are classified separately and displayed in the spectator console without affecting game state.

---

# 🏷 Automatic Game Tagging

When a game is created, Reversteem automatically builds and attaches up to 7 Steem tags (the maximum supported alongside the required \`reversteem\` parent tag) derived from the game parameters.

## Tag Format

| Position | Tag | Example |
|---|---|---|
| 1 | Time control preset name, or \`mins-[N]\` for custom values | \`blitz\`, \`rapid\`, \`standard\`, \`daily\`, \`mins-30\` |
| 2 | Black player's raw ELO rating | \`elo-1184\` |
| 3 | \`reversi\` | \`reversi\` |
| 4 | \`othello\` | \`othello\` |
| 5 | \`board\` | \`board\` |
| 6 | \`game\` | \`game\` |
| 7 | \`steem\` | \`steem\` |

Tags are generated by \`buildGameTags(timeoutMinutes, username)\` in \`engine.js\` and merged into the post's \`json_metadata.tags\` array before submission. Steem Keychain's \`requestPost\` reads tags from \`json_metadata\` — there is no separate tags argument.

The game title and the \`elo-\` tag both use the player's raw ELO rating (integer-rounded) for consistency.

---

# ⏳ Time Limit System

Reversteem supports deterministic per-move time limits.

## Game Creation Metadata

\`\`\`json
{
  "app": "reversteem/0.1",
  "type": "game_start",
  "black": "username",
  "white": null,
  "timeoutMinutes": 60,
  "tags": ["standard", "elo-1200", "reversi", "othello", "board", "game", "steem"]
}
\`\`\`

### \`timeoutMinutes\`

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

\`\`\`
currentTime - lastMoveTime >= timeoutMinutes
\`\`\`

If true:

* The current player has exceeded their time limit
* The opponent may post a \`timeout_claim\` comment

---

## 🏆 Timeout Claim Metadata

\`\`\`json
{
  "app": "reversteem/0.1",
  "action": "timeout_claim",
  "claimAgainst": "black",
  "moveNumber": 12
}
\`\`\`

Replay validation requires:

* Game not already finished
* Both players joined
* Timeout threshold exceeded (\`minutesPassed >= timeoutMinutes\`)
* \`moveNumber\` matches \`appliedMoves\` at time of claim
* \`claimAgainst\` matches the color of the player whose turn it is
* Claim author matches the expected winner (the opponent of the timed-out player)

If valid:

* Game ends immediately
* Winner is set deterministically
* Further moves are ignored

---

## ⚖ Timeout Edge Case Behavior

Once the timeout threshold is exceeded:

* Only a valid \`timeout_claim\` is accepted
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

Presets are UI helpers only — replay enforces the actual \`timeoutMinutes\` value stored in the root post metadata.

---

# 🔍 Game Filtering

The Dashboard and Profile views include a \`GameFilterComponent\` that lets visitors narrow the game list without reloading from the blockchain.

## Timeout Filter

* **Preset buttons**: tap Blitz, Rapid, Standard, or Daily to filter to that exact timeout value
* **Custom operator**: use \`<\`, \`=\`, or \`>\` with a manually entered minute value for non-preset timeouts
* Preset and custom modes are mutually exclusive

## ELO Filter

* Use \`<\`, \`=\`, or \`>\` with a rating value to filter games by the Black player's current ELO

A **✕ Clear** button appears whenever any filter is active.

Filtering is purely client-side — it operates on the already-loaded game list and adds no additional blockchain requests. The \`timeoutMinutes\` field is extracted from each game's \`json_metadata\` during enrichment in \`deriveWhitePlayer\`, making it available without loading the full game state.

---

# 🏆 ELO Rating System

Reversteem includes a fully deterministic, client-derived ELO rating system.

There is:

* No on-chain rating storage
* No backend leaderboard database
* No rating authority

Ratings are computed locally from finished games and cached in \`localStorage\` under the key \`reversteem_elo_cache\`.

---

## 📊 Rating Parameters

| Parameter | Value |
|---|---|
| Base rating | 1200 |
| K-factor | 32 |

## Rating Formula

For each completed game:

\`\`\`
R' = R + K × (S - E)
E  = 1 / (1 + 10^((R_opponent - R) / 400))
\`\`\`

Where \`S\` = 1 (win), 0 (loss), or 0.5 (draw). Timeout wins count as normal wins.

---

## 🔄 Deterministic Reconstruction

Ratings are reconstructed by:

1. Collecting finished games
2. Sorting chronologically by \`created\`
3. Replaying outcomes in order
4. Applying ELO updates incrementally

The ELO cache is incremental — only games newer than \`lastProcessed\` are computed on subsequent loads.

Because outcomes are deterministic, ratings are deterministic. Any client replaying the same history computes identical ratings.

---

# 🔢 Move Validation Rules

During deterministic replay:

* \`moveNumber\` must equal \`appliedMoves\` (sequential, no gaps or duplicates)
* Author must match the expected player for the current turn color
* Board index must be in range \`0–63\`
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
2. A valid \`timeout_claim\` is applied during replay

When finished:

* \`currentPlayer\` becomes \`null\`
* Further moves are ignored
* Winner is determined by disc count, or set to the timeout claimant's opponent
* Board becomes frozen in the UI

---

# 🛑 Double-Click Prevention

To prevent accidental duplicate moves:

* The board UI disables clicks while a move is submitting (\`isSubmitting\` flag in \`GameView\`)
* \`moveNumber\` validation during replay rejects any duplicate or out-of-sequence move comment
* Even if the UI fails, deterministic replay enforces correctness

---

# 📝 \`boardToMarkdown\` – Native Steemit Compatibility

Steemit's default interface does not execute JavaScript.

Reversteem includes a \`boardToMarkdown(board)\` function in \`engine.js\` to render a visual board snapshot using a Markdown table with emoji pieces (⚫ / ⚪ / ·).

This is embedded in every move comment body, allowing:

* Spectators on Steemit to view the board position after each move
* Non-dApp users to follow the game
* Protocol transparency to remain intact outside the dApp

---

# ⚡ Replay Caching

To reduce redundant blockchain fetches:

* Derived game state is cached in \`localStorage\` per game, keyed by \`author + permlink\`
* Cache is considered valid if the latest reply \`created\` timestamp and total reply count both match
* Cache is invalidated automatically when new replies arrive

Cache is an optimization only — never a source of truth. Full replay remains authoritative.

---

# 🌐 Multi-RPC Fallback

Reversteem automatically rotates between public RPC nodes if a request fails:

\`\`\`
https://api.steemit.com
https://api.justyy.com
https://steemd.steemworld.org
https://api.steem.fans
\`\`\`

The fallback logic lives in \`callWithFallback\` / \`callWithFallbackAsync\` in \`blockchain.js\`. On failure, it increments \`currentRPCIndex\` and retries transparently. No backend proxy required.

---

# 🔐 Security Model

Reversteem enforces:

* Strict metadata filtering (\`app\` field must start with \`reversteem/\`)
* Move sequence validation (\`moveNumber\` must equal \`appliedMoves\`)
* Turn validation (author must match expected player)
* Legal flip validation (at least one piece must be flipped)
* Automatic pass logic
* Deterministic timeout enforcement
* Claimable timeout validation (\`claimAgainst\`, \`moveNumber\`, and elapsed time all verified)
* End-state freeze (no moves after game end)
* Deterministic ELO reconstruction
* Replay cache validation (invalidated on reply count or timestamp change)
* RPC failover resilience
* Double-move prevention (UI lock + \`moveNumber\` replay guard)

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
` };
  },
  computed: {
    renderedHtml() {
      // Minimal Markdown → HTML renderer (headings, bold, code, tables, hr, links, lists)
      let md = this.rawMarkdown;

      // Fenced code blocks
      md = md.replace(/```[\w]*\n([\s\S]*?)```/g, (_, code) =>
        `<pre style="background:#f4f4f4;padding:12px;border-radius:6px;overflow-x:auto;font-size:12px;text-align:left;"><code>${esc(code.trimEnd())}</code></pre>`
      );
      // Headings
      md = md.replace(/^###### (.+)$/gm, '<h6>$1</h6>');
      md = md.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
      md = md.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
      md = md.replace(/^### (.+)$/gm, '<h3>$1</h3>');
      md = md.replace(/^## (.+)$/gm, '<h2>$1</h2>');
      md = md.replace(/^# (.+)$/gm, '<h1>$1</h1>');
      // HR
      md = md.replace(/^---$/gm, '<hr>');
      // Bold
      md = md.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      // Inline code
      md = md.replace(/`([^`]+)`/g, '<code style="background:#f4f4f4;padding:2px 5px;border-radius:3px;font-size:12px;">$1</code>');
      // Links
      md = md.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color:#2e7d32;">$1</a>');
      // Tables — header row | separator | body rows
      md = md.replace(/((?:^\|.+\|\n)+)/gm, (table) => {
        const rows = table.trim().split('\n');
        let html = '<table style="border-collapse:collapse;width:100%;margin:12px 0;font-size:13px;text-align:left;">';
        rows.forEach((row, i) => {
          if (/^\|[-| :]+\|$/.test(row)) return; // separator
          const cells = row.split('|').filter((_, j, a) => j > 0 && j < a.length - 1);
          const tag = i === 0 ? 'th' : 'td';
          const style = i === 0
            ? 'background:#2e7d32;color:white;padding:6px 10px;'
            : 'padding:6px 10px;border-bottom:1px solid #eee;';
          html += '<tr>' + cells.map(c => `<${tag} style="${style}">${c.trim()}</${tag}>`).join('') + '</tr>';
        });
        html += '</table>';
        return html;
      });
      // Unordered lists
      md = md.replace(/((?:^\* .+\n?)+)/gm, (block) => {
        const items = block.trim().split('\n').map(l => `<li>${l.replace(/^\* /, '')}</li>`).join('');
        return `<ul style="text-align:left;padding-left:20px;">${items}</ul>`;
      });
      // Paragraphs — wrap bare lines
      md = md.replace(/^(?!<)(.+)$/gm, '<p style="margin:6px 0;">$1</p>');

      return md;
    }
  },
  methods: { esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; } },
  template: `
    <div style="max-width:800px; margin:20px auto; padding:0 16px; text-align:left;">
      <div v-html="renderedHtml"></div>
    </div>
  `
};

// ---- LicenseView ----
const LicenseView = {
  name: "LicenseView",
  data() {
    return { text: `MIT License

Copyright (c) 2025 Reversteem Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.` };
  },
  template: `
    <div style="max-width:700px; margin:40px auto; padding:0 16px;">
      <h2 style="text-align:center;">License</h2>
      <pre style="
        background:#f4f4f4; border-radius:8px; padding:24px;
        font-size:13px; line-height:1.7; white-space:pre-wrap;
        word-break:break-word; text-align:left;
      ">{{ text }}</pre>
    </div>
  `
};

// ============================================================
// ROUTER
// ============================================================

const routes = [
  { path: "/",                         component: DashboardView },
  { path: "/game/:author/:permlink",   component: GameView },
  { path: "/@:user",                   component: ProfileView },
  { path: "/about",                    component: AboutView },
  { path: "/license",                  component: LicenseView }
];

const router = createRouter({
  history: createWebHashHistory(),
  routes
});


// ============================================================
// ROOT APP
// ============================================================

const App = {
  components: {
    ProfileHeaderComponent,
    AuthControlsComponent,
    AppNotificationComponent
  },

  setup() {
    const username = ref(localStorage.getItem("steem_user") || "");
    const hasKeychain = ref(false);
    const keychainReady = ref(false);
    const accountCache = ref({});
    const eloCache = ref(getEloCache());
    const loginError = ref("");
    const notification = ref({ message: "", type: "error" });
    const timeoutMinutes = ref(DEFAULT_TIMEOUT_MINUTES);

    const defaultTitle = computed(() => {
      const mins = timeoutMinutes.value;
      const preset = Object.entries(TIME_PRESETS).find(([, v]) => v === mins);
      const typeLabel = preset
        ? preset[0].charAt(0).toUpperCase() + preset[0].slice(1)
        : `${mins} Mins/Move`;
      const elo = Math.round(getUserRating(username.value));
      return `${typeLabel} Reversteem Game By An ELO ${elo} Player`;
    });

    function notify(message, type = "error") {
      notification.value = { message, type };
    }

    function dismissNotification() {
      notification.value = { message: "", type: "error" };
    }

    // Wait for keychain extension
    onMounted(() => {
      setRPC(0);
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (window.steem_keychain || attempts > 10) {
          clearInterval(interval);
          hasKeychain.value = !!window.steem_keychain;
          keychainReady.value = true;
        }
      }, 100);
    });

    function login(user) {
      loginError.value = "";
      if (!window.steem_keychain) {
        loginError.value = "Steem Keychain extension is not installed.";
        return;
      }
      if (!user) return;
      steem_keychain.requestSignBuffer(user, "Login to Reversteem", "Posting", (res) => {
        if (!res.success) {
          loginError.value = "Keychain sign-in was rejected.";
          return;
        }
        const verified = res.data?.username || res.username;
        if (verified !== user) {
          loginError.value = "Signed account does not match entered username.";
          return;
        }
        username.value = user;
        hasKeychain.value = true;
        localStorage.setItem("steem_user", user);
        loginError.value = "";
      });
    }

    function logout() {
      username.value = "";
      localStorage.removeItem("steem_user");
    }

    async function startGame({ title, timeoutMinutes: rawTimeout, invites: rawInvites } = {}) {
      if (!window.steem_keychain || !username.value) {
        notify("Please log in first.", "error");
        return;
      }

      const clampedTimeout = Math.max(MIN_TIMEOUT_MINUTES, Math.min(rawTimeout || DEFAULT_TIMEOUT_MINUTES, MAX_TIMEOUT_MINUTES));
      const gameTitle = (title || defaultTitle.value).trim();
      const permlink = `${APP_NAME}-${Date.now()}`;

      // Sanitise invites: strip @, lowercase, dedupe, exclude self, cap at 3
      const invites = (rawInvites || [])
        .map(u => u.trim().toLowerCase().replace(/^@/, ""))
        .filter(Boolean)
        .filter(u => u !== username.value.toLowerCase())
        .filter((u, i, a) => a.indexOf(u) === i)
        .slice(0, 3);

      const meta = { app: APP_INFO, type: "game_start", black: username.value, white: null, timeoutMinutes: clampedTimeout, status: "open" };
      if (invites.length > 0) meta.invites = invites;

      const board = initialBoard();
      const inviteLine = invites.length > 0
        ? `Invited: ${invites.map(u => `@${u}`).join(", ")} (only they can join)\n`
        : "";
      const body =
        `## New Reversteem Game\n\n` +
        `Black: @${username.value}\n` +
        `Timeout per move: ${clampedTimeout} minutes\n` +
        inviteLine +
        `\n` +
        boardToMarkdown(board) +
        `\n\n---\nMove by commenting via [Reversteem](${LIVE_DEMO}).`;

      meta.tags = buildGameTags(clampedTimeout, username.value);
      steem_keychain.requestPost(
        username.value, gameTitle, body,
        APP_NAME, "",
        JSON.stringify(meta),
        permlink, "",
        (res) => {
          if (!res.success) {
            notify(res.message || "Failed to create game. Please try again.", "error");
            return;
          }
          notify("Game created! Redirecting…", "success");
          router.push(`/game/${username.value}/${permlink}`);
        }
      );
    }

    function updateTimeout(v) {
      timeoutMinutes.value = v;
    }

    function updateAccountCache(data) {
      accountCache.value[data.username] = data;
    }

    // Provide shared state to all descendant components (including route views).
    // This is the correct Vue pattern for passing data that isn't route-param-based
    // down through <router-view> without manually threading props on every route.
    const inviteCount = ref(0);
    function setInviteCount(n) { inviteCount.value = n; }
    const currentRoute = useRoute();
    provide("username", username);
    provide("hasKeychain", hasKeychain);
    provide("notify", notify);
    provide("setInviteCount", setInviteCount);

    return {
      username,
      hasKeychain,
      keychainReady,
      accountCache,
      eloCache,
      loginError,
      notification,
      notify,
      dismissNotification,
      login,
      logout,
      startGame,
      timeoutMinutes,
      defaultTitle,
      updateTimeout,
      updateAccountCache,
      TIME_PRESETS,
      getUserRating,
      inviteCount,
      currentRoute
    };
  },

  template: `
    <profile-header-component
      :username="username"
      :user-rating="getUserRating(username)"
    ></profile-header-component>

    <h1>Reversteem - Reversi on Steem</h1>

    <nav style="margin: 8px 0 4px;">
      <router-link
        to="/"
        style="margin: 0 10px; text-decoration: none; color: #2e7d32; font-weight: bold;"
        active-class=""
        exact-active-class="nav-active"
      >Home<span v-if="inviteCount > 0" style="
          display:inline-flex; align-items:center; justify-content:center;
          background:#c62828; color:white; font-size:10px; font-weight:bold;
          border-radius:50%; width:16px; height:16px; margin-left:4px;
          vertical-align:middle; line-height:1;
        ">{{ inviteCount }}</span></router-link>
      <router-link
        v-if="username"
        :to="'/@' + username"
        style="margin: 0 10px; text-decoration: none; color: #2e7d32; font-weight: bold;"
        exact-active-class="nav-active"
      >Games</router-link>
      <router-link
        to="/about"
        style="margin: 0 10px; text-decoration: none; color: #2e7d32; font-weight: bold;"
        exact-active-class="nav-active"
      >About</router-link>
      <router-link
        to="/license"
        style="margin: 0 10px; text-decoration: none; color: #2e7d32; font-weight: bold;"
        exact-active-class="nav-active"
      >License</router-link>
    </nav>

    <template v-if="!currentRoute || !currentRoute.path.startsWith('/game/')">
      <auth-controls-component
        :username="username"
        :has-keychain="hasKeychain"
        :time-presets="TIME_PRESETS"
        :timeout-minutes="timeoutMinutes"
        :login-error="loginError"
        :default-title="defaultTitle"
        @login="login"
        @logout="logout"
        @start-game="startGame"
        @update-timeout="updateTimeout"
      ></auth-controls-component>

      <div v-if="keychainReady && !hasKeychain" class="keychain-notice">
        <strong>Spectator Mode</strong><br><br>
        You are currently viewing games in read-only mode.<br><br>
        To start or join games, please install
        <a href="https://www.google.com/search?q=steem+keychain" target="_blank">Steem Keychain</a>
        browser extension.
      </div>
    </template>

    <app-notification-component
      :message="notification.message"
      :type="notification.type"
      @dismiss="dismissNotification"
    ></app-notification-component>

    <router-view></router-view>
  `
};

// ============================================================
// MOUNT
// ============================================================

const vueApp = createApp(App);

// Register global components
vueApp.component("MoveTranscriptComponent", MoveTranscriptComponent);
vueApp.component("ProfileHeaderComponent", ProfileHeaderComponent);
vueApp.component("AuthControlsComponent", AuthControlsComponent);
vueApp.component("AppNotificationComponent", AppNotificationComponent);
vueApp.component("BoardComponent", BoardComponent);
vueApp.component("PlayerBarComponent", PlayerBarComponent);
vueApp.component("SpectatorConsoleComponent", SpectatorConsoleComponent);
vueApp.component("OthelloTableComponent", OthelloTableComponent);
vueApp.component("MiniBoardComponent", MiniBoardComponent);
vueApp.component("GamePreviewComponent", GamePreviewComponent);
vueApp.component("GameFilterComponent", GameFilterComponent);

vueApp.use(router);
vueApp.mount("#app");
