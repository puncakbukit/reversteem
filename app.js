// ============================================================
// app.js
// Vue 3 + Vue Router 4 application entry point
// ============================================================

const { createApp, ref, computed, onMounted, onUnmounted, watch } = Vue;
const { createRouter, createWebHashHistory } = VueRouter;

// ============================================================
// ROUTE VIEWS (defined as components)
// ============================================================

// ---- DashboardView ----
const DashboardView = {
  name: "DashboardView",
  props: { username: String, hasKeychain: Boolean },
  emits: ["update-elo-cache"],
  components: { GamePreviewComponent },
  data() {
    return { games: [], loading: true };
  },
  computed: {
    featuredGame() { return this.games[0] || null; },
    otherGames() { return this.games.slice(1); }
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
      } catch (e) {
        console.error("Failed to load games", e);
      }
      this.loading = false;
    },
    viewGame(game) {
      this.$router.push(`/game/${game.author}/${game.permlink}`);
    },
    async joinGame(game) {
      if (!this.hasKeychain) { alert("Steem Keychain not installed"); return; }
      if (!this.username) { alert("Login first"); return; }
      if (this.username === game.blackPlayer) { alert("You cannot join your own game."); return; }

      const meta = { app: APP_INFO, action: "join" };
      const body = `## @${this.username} joined as White\n\nGame link: ${LIVE_DEMO}#/game/${game.author}/${game.permlink}`;

      alert("username: " + this.username);
      keychainPost(
        this.username, "", body,
        game.permlink, game.author,
        meta,
        `reversteem-join-${Date.now()}`, "",
        (res) => {
          if (!res.success) { console.log("Join rejected:", res); return; }
          this.$router.push(`/game/${game.author}/${game.permlink}`);
        }
      );
    }
  },
  template: `
    <div>
      <div v-if="loading"><p>Loading games...</p></div>
      <div v-else>
        <div id="featuredGame" v-if="featuredGame">
          <game-preview-component
            :game="featuredGame"
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
  props: { username: String },
  components: { GamePreviewComponent },
  data() {
    return { games: [], loading: true };
  },
  async created() {
    const profileUser = this.$route.params.user;
    this.loading = true;
    try {
      const raw = await loadGamesByUserFromSteem(profileUser);
      const enriched = await enrichGamesWithWhitePlayer(raw);
      await updateEloRatingsFromGames(enriched);
      this.games = enriched.sort((a, b) => new Date(b.created) - new Date(a.created));
    } catch {}
    this.loading = false;
  },
  methods: {
    viewGame(game) {
      this.$router.push(`/game/${game.author}/${game.permlink}`);
    }
  },
  template: `
    <div>
      <h3>Games by @{{ $route.params.user }}</h3>
      <div v-if="loading">Loading...</div>
      <div v-else-if="!games.length"><p>No games found.</p></div>
      <game-preview-component
        v-else
        v-for="game in games"
        :key="game.permlink"
        :game="game"
        :username="username"
        @view="viewGame"
      ></game-preview-component>
    </div>
  `
};

// ---- GameView ----
const GameView = {
  name: "GameView",
  props: { username: String, hasKeychain: Boolean },
  components: {
    BoardComponent,
    PlayerBarComponent,
    SpectatorConsoleComponent
  },
  data() {
    return {
      gameState: null,
      spectatorReplies: [],
      allReplies: [],
      // Account data hoisted here — fetched once, never re-fetched unless player changes
      blackData: null,
      whiteData: null,
      isSubmitting: false,
      pollTimer: null,
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
        return `🏁 Game Over — ${s.winner === "black" ? s.blackPlayer : s.whitePlayer} wins!`;
      }
      if (!s.whitePlayer) return "Waiting for opponent...";
      const playerToMove = s.currentPlayer === "black" ? s.blackPlayer : s.whitePlayer;
      const colorLabel = s.currentPlayer === "black" ? "Black ⚫" : "White ⚪";
      if (this.username === playerToMove) return `🟢 Your turn (${colorLabel})`;
      return `⏳ Waiting for @${playerToMove} (${colorLabel})`;
    },
    canClaimTimeout() {
      return isTimeoutClaimable(this.gameState) && !!this.username;
    },
    loserName() {
      const s = this.gameState;
      if (!s) return "";
      return s.currentPlayer === "black" ? s.blackPlayer : s.whitePlayer;
    }
  },
  async created() {
    await this.load();
  },
  beforeUnmount() {
    if (this.pollTimer) clearTimeout(this.pollTimer);
  },
  methods: {
    async load() {
      // Don't set loading=true on re-polls — that would unmount the board and cause flicker.
      // loading stays true only until the very first successful render.
      this.error = null;
      try {
        const { state, spectatorReplies, allReplies } = await loadGameFromSteem(this.author, this.permlink);

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
        }

        // Fetch account data only when a player username is newly seen
        if (state.blackPlayer && (!this.blackData || this.blackData.username !== state.blackPlayer)) {
          this.blackData = await fetchAccount(state.blackPlayer);
        }
        if (state.whitePlayer && (!this.whiteData || this.whiteData.username !== state.whitePlayer)) {
          this.whiteData = await fetchAccount(state.whitePlayer);
        }

        this.spectatorReplies = spectatorReplies;
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

    postMove(index) {
      const state = this.gameState;
      if (this.isSubmitting) return;
      this.isSubmitting = true;

      const simulatedBoard = [...state.board];
      const flips = getFlipsForBoard(simulatedBoard, index, state.currentPlayer);
      simulatedBoard[index] = state.currentPlayer;
      flips.forEach(f => (simulatedBoard[f] = state.currentPlayer));

      const meta = { app: APP_INFO, action: "move", index, moveNumber: state.appliedMoves };
      const body = `## Move by @${this.username}\n\nPlayed at ${indexToCoord(index)}\n\n${boardToMarkdown(simulatedBoard)}`;

      keychainPost(
        this.username, "", body,
        this.permlink, this.author,
        meta,
        `reversteem-move-${Date.now()}`, "",
        () => {
          this.isSubmitting = false;
          this.load();
        }
      );
    },

    postTimeoutClaim() {
      const state = this.gameState;
      if (!state) return;
      const meta = {
        app: APP_INFO,
        action: "timeout_claim",
        claimAgainst: state.currentPlayer,
        moveNumber: state.appliedMoves
      };
      keychainPost(
        this.username, "", `Timeout claim by @${this.username}`,
        this.permlink, this.author,
        meta,
        `reversteem-timeout-${Date.now()}`, "",
        () => this.load()
      );
    },

    formatTimeout
  },
  template: `
    <div id="gameContainer" style="margin-top:20px;">
      <div v-if="loading"><p>Loading game...</p></div>
      <div v-else-if="error"><p style="color:red;">{{ error }}</p></div>
      <template v-else-if="gameState">
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
          <button @click="postTimeoutClaim">Claim Timeout Victory vs {{ loserName }}</button>
        </div>

        <!-- Turn Indicator -->
        <div id="turnIndicator" style="margin-bottom:10px; font-weight:bold;">
          {{ turnIndicatorText }}
        </div>

        <!-- Board -->
        <board-component
          :board-state="gameState.board"
          :is-locked="isSubmitting"
          @cell-click="handleCellClick"
        ></board-component>

        <!-- Spectator Console -->
        <spectator-console-component
          :all-replies="allReplies"
          :spectator-replies="spectatorReplies"
        ></spectator-console-component>
      </template>
    </div>
  `
};


// ============================================================
// ROUTER
// ============================================================

const routes = [
  { path: "/",                         component: DashboardView },
  { path: "/game/:author/:permlink",   component: GameView },
  { path: "/@:user",                   component: ProfileView }
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
    AuthControlsComponent
  },

  setup() {
    const username = ref(localStorage.getItem("steem_user") || "");
    const hasKeychain = ref(false);
    const accountCache = ref({});
    const eloCache = ref(getEloCache());
    const loginError = ref("");

    // Wait for keychain extension
    onMounted(() => {
      setRPC(0);
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (window.steem_keychain || attempts > 10) {
          clearInterval(interval);
          hasKeychain.value = !!window.steem_keychain;
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
        localStorage.setItem("steem_user", user);
        loginError.value = "";
      });
    }

    function logout() {
      username.value = "";
      localStorage.removeItem("steem_user");
    }

    async function startGame() {
      if (!window.steem_keychain || !username.value) { alert("Login first"); return; }

      // Read timeout from child — we store it on the root
      const rawTimeout = parseInt(document.querySelector("input[type=number]")?.value) || DEFAULT_TIMEOUT_MINUTES;
      const timeoutMinutes = Math.max(MIN_TIMEOUT_MINUTES, Math.min(rawTimeout, MAX_TIMEOUT_MINUTES));
      const permlink = `${APP_NAME}-${Date.now()}`;
      const meta = { app: APP_INFO, type: "game_start", black: username.value, white: null, timeoutMinutes, status: "open" };
      const board = initialBoard();
      const body =
        `## New Reversteem Game\n\n` +
        `Black: @${username.value}\n` +
        `Timeout per move: ${timeoutMinutes} minutes\n\n` +
        boardToMarkdown(board) +
        `\n\n---\nMove by commenting via [Reversteem](${LIVE_DEMO}).`;

      steem_keychain.requestPost(
        username.value, "Reversteem Game Started", body,
        APP_NAME, "",
        JSON.stringify(meta),
        permlink, "",
        (res) => {
          if (!res.success) return;
          alert("Game created!");
          router.push(`/game/${username.value}/${permlink}`);
        }
      );
    }

    function updateAccountCache(data) {
      accountCache.value[data.username] = data;
    }

    return {
      username,
      hasKeychain,
      accountCache,
      eloCache,
      loginError,
      login,
      logout,
      startGame,
      updateAccountCache,
      TIME_PRESETS,
      getUserRating
    };
  },

  // Pass username/hasKeychain to route views via provide or props-on-router-view
  template: `
    <profile-header-component
      :username="username"
      :user-rating="getUserRating(username)"
    ></profile-header-component>

    <h1>Reversteem - Reversi on Steem</h1>

    <auth-controls-component
      :username="username"
      :has-keychain="hasKeychain"
      :time-presets="TIME_PRESETS"
      :timeout-minutes="TIME_PRESETS.standard"
      :login-error="loginError"
      @login="login"
      @logout="logout"
      @start-game="startGame"
    ></auth-controls-component>

    <div v-if="!hasKeychain" class="keychain-notice">
      <strong>Spectator Mode</strong><br><br>
      You are currently viewing games in read-only mode.<br><br>
      To start or join games, please install
      <a href="https://www.google.com/search?q=steem+keychain" target="_blank">Steem Keychain</a>
      browser extension.
    </div>

    <router-view
      :username="username"
      :has-keychain="hasKeychain"
    ></router-view>
  `
};

// ============================================================
// MOUNT
// ============================================================

const vueApp = createApp(App);

// Register global components
vueApp.component("ProfileHeaderComponent", ProfileHeaderComponent);
vueApp.component("AuthControlsComponent", AuthControlsComponent);
vueApp.component("BoardComponent", BoardComponent);
vueApp.component("PlayerBarComponent", PlayerBarComponent);
vueApp.component("SpectatorConsoleComponent", SpectatorConsoleComponent);
vueApp.component("MiniBoardComponent", MiniBoardComponent);
vueApp.component("GamePreviewComponent", GamePreviewComponent);

vueApp.use(router);
vueApp.mount("#app");
