// ============================================================
// app.js
// Vue 3 + Vue Router 4 application entry point
// ============================================================

const { createApp, ref, computed, onMounted, onUnmounted, watch, provide } = Vue;
const { createRouter, createWebHashHistory } = VueRouter;

// ============================================================
// ROUTE VIEWS (defined as components)
// ============================================================

// ---- DashboardView ----
const DashboardView = {
  name: "DashboardView",
  inject: ["username", "hasKeychain", "notify"],
  components: { GamePreviewComponent },
  data() {
    return { games: [], loading: true };
  },
  computed: {
    featuredGames() { return this.games.slice(0, 2); },
    otherGames()    { return this.games.slice(2); }
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
  components: { GamePreviewComponent },
  data() {
    return { games: [], loading: true };
  },
  computed: {
    featuredGames() { return this.games.slice(0, 2); },
    otherGames()    { return this.games.slice(2); }
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
      <h3>Games by @{{ $route.params.user }}</h3>
      <div v-if="loading">Loading...</div>
      <div v-else-if="!games.length"><p>No games found.</p></div>
      <div v-else>
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
    SpectatorConsoleComponent
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
    },
    canJoin() {
      const s = this.gameState;
      if (!s || s.finished || s.whitePlayer) return false;
      return this.hasKeychain && !!this.username && this.username !== s.blackPlayer;
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
      const body = `## Move by @${this.username}\n\nPlayed at ${indexToCoord(index)}\n\n${boardToMarkdown(simulatedBoard)}`;

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
          <button @click="postTimeoutClaim">Claim Timeout Victory vs {{ loserName }}</button>
        </div>

        <!-- Turn Indicator -->
        <div id="turnIndicator" style="margin-bottom:10px; font-weight:bold;">
          {{ turnIndicatorText }}
        </div>

        <!-- Join -->
        <div v-if="canJoin" style="margin:10px 0;">
          <button @click="joinGame">Join as White ⚪</button>
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

    async function startGame({ title, timeoutMinutes: rawTimeout } = {}) {
      if (!window.steem_keychain || !username.value) {
        notify("Please log in first.", "error");
        return;
      }

      const clampedTimeout = Math.max(MIN_TIMEOUT_MINUTES, Math.min(rawTimeout || DEFAULT_TIMEOUT_MINUTES, MAX_TIMEOUT_MINUTES));
      const gameTitle = (title || defaultTitle.value).trim();
      const permlink = `${APP_NAME}-${Date.now()}`;
      const meta = { app: APP_INFO, type: "game_start", black: username.value, white: null, timeoutMinutes: clampedTimeout, status: "open" };
      const board = initialBoard();
      const body =
        `## New Reversteem Game\n\n` +
        `Black: @${username.value}\n` +
        `Timeout per move: ${clampedTimeout} minutes\n\n` +
        boardToMarkdown(board) +
        `\n\n---\nMove by commenting via [Reversteem](${LIVE_DEMO}).`;

      const gameTags = buildGameTags(clampedTimeout, username.value);
      steem_keychain.requestPost(
        username.value, gameTitle, body,
        APP_NAME, "",
        JSON.stringify(meta),
        permlink, gameTags,
        (res) => {
          if (!res.success) return;
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
    provide("username", username);
    provide("hasKeychain", hasKeychain);
    provide("notify", notify);

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
      getUserRating
    };
  },

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
      :timeout-minutes="timeoutMinutes"
      :login-error="loginError"
      :default-title="defaultTitle"
      @login="login"
      @logout="logout"
      @start-game="startGame"
      @update-timeout="updateTimeout"
    ></auth-controls-component>

    <app-notification-component
      :message="notification.message"
      :type="notification.type"
      @dismiss="dismissNotification"
    ></app-notification-component>

    <div v-if="keychainReady && !hasKeychain" class="keychain-notice">
      <strong>Spectator Mode</strong><br><br>
      You are currently viewing games in read-only mode.<br><br>
      To start or join games, please install
      <a href="https://www.google.com/search?q=steem+keychain" target="_blank">Steem Keychain</a>
      browser extension.
    </div>

    <router-view></router-view>
  `
};

// ============================================================
// MOUNT
// ============================================================

const vueApp = createApp(App);

// Register global components
vueApp.component("ProfileHeaderComponent", ProfileHeaderComponent);
vueApp.component("AuthControlsComponent", AuthControlsComponent);
vueApp.component("AppNotificationComponent", AppNotificationComponent);
vueApp.component("BoardComponent", BoardComponent);
vueApp.component("PlayerBarComponent", PlayerBarComponent);
vueApp.component("SpectatorConsoleComponent", SpectatorConsoleComponent);
vueApp.component("OthelloTableComponent", OthelloTableComponent);
vueApp.component("MiniBoardComponent", MiniBoardComponent);
vueApp.component("GamePreviewComponent", GamePreviewComponent);

vueApp.use(router);
vueApp.mount("#app");
