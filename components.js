// ============================================================
// components.js
// Vue 3 component definitions for Reversteem
// ============================================================

// ---- ProfileHeaderComponent ----
const ProfileHeaderComponent = {
  name: "ProfileHeaderComponent",
  props: {
    username: String,
    userRating: Number
  },
  data() {
    return { profileData: null };
  },
  watch: {
    username: {
      immediate: true,
      async handler(val) {
        if (val) {
          this.profileData = await fetchAccount(val);
        } else {
          this.profileData = null;
        }
      }
    }
  },
  template: `
    <div id="profileHeader" v-if="profileData">
      <div class="cover" :style="{
        backgroundImage: 'url(' + safeUrl(profileData.coverImage) + ')',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        height: '150px',
        borderRadius: '8px'
      }"></div>
      <div style="display:flex; align-items:center; margin-top:-40px; padding:10px;">
        <img :src="safeUrl(profileData.profileImage)" style="width:80px;height:80px;border-radius:50%;border:3px solid white;background:white;">
        <div style="margin-left:15px;">
          <h2 style="margin:0;">
            {{ profileData.displayName }}
            <span style="font-size:14px; color:#666;">(ELO: {{ userRating }})</span>
          </h2>
          <small>@{{ profileData.username }}</small>
          <p style="margin:5px 0;">{{ profileData.about }}</p>
        </div>
      </div>
    </div>
  `,
  methods: { safeUrl }
};

// ---- AppNotificationComponent ----
// A slim toast bar rendered at the top of the app.
// Type is "error" | "success" | "info". Auto-dismisses after `duration` ms when
// type is "success" or "info"; errors stay until dismissed manually or replaced.
const AppNotificationComponent = {
  name: "AppNotificationComponent",
  props: {
    message: String,
    type: { type: String, default: "error" }   // "error" | "success" | "info"
  },
  emits: ["dismiss"],
  data() {
    return { timer: null };
  },
  watch: {
    message(val) {
      clearTimeout(this.timer);
      if (val && this.type !== "error") {
        this.timer = setTimeout(() => this.$emit("dismiss"), 3500);
      }
    }
  },
  beforeUnmount() {
    clearTimeout(this.timer);
  },
  computed: {
    styles() {
      const base = {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        margin: "10px auto",
        padding: "10px 14px",
        borderRadius: "6px",
        maxWidth: "600px",
        fontSize: "14px",
        gap: "10px"
      };
      if (this.type === "success") return { ...base, background: "#e8f5e9", border: "1px solid #a5d6a7", color: "#1b5e20" };
      if (this.type === "info")    return { ...base, background: "#e3f2fd", border: "1px solid #90caf9", color: "#0d47a1" };
      return                              { ...base, background: "#ffebee", border: "1px solid #ef9a9a", color: "#b71c1c" };
    },
    icon() {
      if (this.type === "success") return "✅";
      if (this.type === "info")    return "ℹ️";
      return "⚠️";
    }
  },
  template: `
    <div v-if="message" :style="styles" role="alert">
      <span>{{ icon }} {{ message }}</span>
      <button
        @click="$emit('dismiss')"
        style="background:none; border:none; cursor:pointer; font-size:16px; padding:0; color:inherit; line-height:1;"
        aria-label="Dismiss"
      >✕</button>
    </div>
  `
};

// ---- AuthControlsComponent ----
const AuthControlsComponent = {
  name: "AuthControlsComponent",
  props: {
    username: String,
    hasKeychain: Boolean,
    timePresets: Object,
    timeoutMinutes: Number,
    loginError: String,
    defaultTitle: String
  },
  emits: ["login", "logout", "start-game", "update-timeout"],
  data() {
    return {
      selectedMode: "standard",
      usernameInput: "",
      showLoginForm: false,
      gameTitle: "",
      titleEdited: false
    };
  },
  watch: {
    // Close login form when login succeeds
    username(val) {
      if (val) this.showLoginForm = false;
    },
    // Keep gameTitle in sync with the computed default whenever it changes,
    // but only if the user hasn't manually edited it
    defaultTitle: {
      immediate: true,
      handler(val) {
        if (!this.titleEdited) this.gameTitle = val || "";
      }
    }
  },
  methods: {
    selectMode(mode) {
      this.selectedMode = mode;
      this.$emit("update-timeout", this.timePresets[mode]);
    },
    onManualInput(e) {
      this.selectedMode = null;
      this.$emit("update-timeout", parseInt(e.target.value) || DEFAULT_TIMEOUT_MINUTES);
    },
    onTitleInput(e) {
      this.gameTitle = e.target.value;
      this.titleEdited = this.gameTitle !== this.defaultTitle;
    },
    resetTitle() {
      this.titleEdited = false;
      this.gameTitle = this.defaultTitle || "";
    },
    submitLogin() {
      const val = this.usernameInput.trim().toLowerCase();
      if (!val) return;
      this.$emit("login", val);
    },
    openLoginForm() {
      this.usernameInput = "";
      this.showLoginForm = true;
      this.$nextTick(() => this.$refs.usernameField?.focus());
    },
    onLoginKeydown(e) {
      if (e.key === "Enter") this.submitLogin();
      if (e.key === "Escape") this.showLoginForm = false;
    },
    submitStartGame() {
      const title = this.gameTitle.trim() || this.defaultTitle;
      this.$emit("start-game", { title, timeoutMinutes: this.timeoutMinutes });
    }
  },
  template: `
    <div>
      <!-- Logged-out state -->
      <div v-if="!username">
        <button v-if="!showLoginForm" @click="openLoginForm">Login with Steem</button>

        <!-- Inline login form -->
        <div v-if="showLoginForm" style="display:inline-flex; align-items:center; gap:6px; flex-wrap:wrap; justify-content:center;">
          <input
            ref="usernameField"
            v-model="usernameInput"
            type="text"
            placeholder="Steem username"
            autocomplete="username"
            style="padding:7px 10px; border-radius:6px; border:1px solid #ccc; font-size:14px; width:180px;"
            @keydown="onLoginKeydown"
          />
          <button @click="submitLogin" :disabled="!usernameInput.trim()">Sign in</button>
          <button @click="showLoginForm = false" style="background:#888;">Cancel</button>
          <div v-if="loginError" style="width:100%; color:#c62828; font-size:13px; margin-top:4px;">
            {{ loginError }}
          </div>
        </div>
      </div>

      <!-- Logged-in state -->
      <div v-if="username && hasKeychain">
        <button @click="$emit('logout')">Logout</button>

        <!-- Time controls -->
        <div id="time-controls">
          <button
            v-for="(mins, mode) in timePresets"
            :key="mode"
            :data-mode="mode"
            :class="{ 'active-time': selectedMode === mode }"
            @click="selectMode(mode)"
          >{{ mode.charAt(0).toUpperCase() + mode.slice(1) }}</button>
        </div>
        <input type="number" min="5" :value="timeoutMinutes" @input="onManualInput" size="5" /> mins/move

        <!-- Game title input -->
        <div style="margin:8px 0; display:inline-flex; align-items:center; gap:6px; flex-wrap:wrap; justify-content:center;">
          <input
            type="text"
            :value="gameTitle"
            @input="onTitleInput"
            placeholder="Game title"
            maxlength="100"
            style="padding:7px 10px; border-radius:6px; border:1px solid #ccc; font-size:14px; width:280px;"
          />
          <button
            v-if="titleEdited"
            @click="resetTitle"
            title="Reset to default title"
            style="background:#888; padding:7px 10px;"
          >↺</button>
        </div>

        <br/>
        <button @click="submitStartGame">Start New Game</button>
        <p>Welcome @{{ username }}</p>
      </div>
    </div>
  `
};

// ---- BoardComponent ----
// Uses Vue-native interactivity control instead of a DOM overlay:
//   - `pointer-events: none` on the grid prevents all clicks when disabled
//   - opacity fade and status text communicate the submitting state to the user
//   - No fixed overlay, no z-index stacking, no extra DOM node required
const BoardComponent = {
  name: "BoardComponent",
  props: {
    boardState: Array,
    disabled: { type: Boolean, default: false }
  },
  emits: ["cell-click"],
  template: `
    <div>
      <div
        id="board"
        :style="{
          pointerEvents: disabled ? 'none' : 'auto',
          opacity: disabled ? '0.6' : '1',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'opacity 0.2s'
        }"
      >
        <div
          v-for="(cell, i) in boardState"
          :key="i"
          class="cell"
          @click="$emit('cell-click', i)"
        >
          <div v-if="cell" :class="cell"></div>
        </div>
      </div>
      <p v-if="disabled" style="color:#888; font-size:13px; margin-top:6px;">Posting move...</p>
    </div>
  `
};

// ---- PlayerBarComponent ----
// Accepts pre-resolved account data objects as props — never fetches on its own.
// This means re-renders from polling never cause image flicker, because the
// parent only updates these props when the actual player usernames change.
const PlayerBarComponent = {
  name: "PlayerBarComponent",
  props: {
    blackData: Object,   // { username, profileImage, displayName }
    whiteData: Object,
    currentPlayer: String,  // "black" | "white" | null
    finished: Boolean
  },
  methods: {
    safeUrl,
    getUserRating,
    cardStyle(color) {
      const isActive = !this.finished && this.currentPlayer === color;
      return { boxShadow: isActive ? "0 0 10px gold" : "none" };
    }
  },
  template: `
    <div style="display:flex; justify-content:space-between; align-items:center; margin:15px 0;">
      <!-- White Player -->
      <div style="display:flex; align-items:center; gap:10px;">
        <span v-if="!whiteData" style="color:#888;">Waiting...</span>
        <template v-else>
          <img :src="whiteData.profileImage || 'https://via.placeholder.com/40'"
               style="width:40px;height:40px;border-radius:50%;border:3px solid #ccc;"
               :style="cardStyle('white')">
          <div>
            <strong>@{{ whiteData.username }}</strong><br>
            <small>ELO: {{ getUserRating(whiteData.username) }}</small>
          </div>
        </template>
      </div>

      <!-- Black Player -->
      <div style="display:flex; align-items:center; gap:10px;">
        <span v-if="!blackData" style="color:#888;">Waiting...</span>
        <template v-else>
          <img :src="blackData.profileImage || 'https://via.placeholder.com/40'"
               style="width:40px;height:40px;border-radius:50%;border:3px solid black;"
               :style="cardStyle('black')">
          <div>
            <strong>@{{ blackData.username }}</strong><br>
            <small>ELO: {{ getUserRating(blackData.username) }}</small>
          </div>
        </template>
      </div>
    </div>
  `
};

// ---- SpectatorConsoleComponent ----
const SpectatorConsoleComponent = {
  name: "SpectatorConsoleComponent",
  props: {
    allReplies: Array,
    spectatorReplies: Array,
    username: String,
    hasKeychain: Boolean
  },
  emits: ["post-comment"],
  data() {
    return { commentText: "" };
  },
  computed: {
    moveCommentMap() {
      const map = {};
      if (!this.allReplies) return map;
      this.allReplies.forEach(reply => {
        try {
          const meta = JSON.parse(reply.json_metadata);
          if (meta.app?.startsWith(APP_NAME + "/") && meta.action === "move") {
            map[reply.permlink] = meta.index;
          }
        } catch {}
      });
      return map;
    },
    replyLookup() {
      const lookup = {};
      if (!this.allReplies) return lookup;
      this.allReplies.forEach(r => (lookup[r.permlink] = r));
      return lookup;
    },
    sortedMessages() {
      if (!this.spectatorReplies || !this.spectatorReplies.length) return [];
      return [...this.spectatorReplies].sort((a, b) => new Date(a.created) - new Date(b.created));
    },
    canComment() {
      return this.hasKeychain && !!this.username;
    }
  },
  watch: {
    "sortedMessages.length"(newLen, oldLen) {
      if (newLen > oldLen) {
        this.$nextTick(() => {
          const console = this.$refs.console;
          if (console) console.scrollTop = console.scrollHeight;
        });
      }
    }
  },
  methods: {
    getMoveExtra(reply) {
      let parentPermlink = reply.parent_permlink;
      while (parentPermlink) {
        if (this.moveCommentMap[parentPermlink] != null) {
          const idx = this.moveCommentMap[parentPermlink];
          return ` on ${indexToCoord(idx)}`;
        }
        const parent = this.replyLookup[parentPermlink];
        if (!parent) return "";
        parentPermlink = parent.parent_permlink;
      }
      return "";
    },
    formatTime(created) {
      return new Date(created).toLocaleTimeString();
    },
    submitComment() {
      if (!this.commentText.trim()) return;
      this.$emit("post-comment", this.commentText);
      this.commentText = "";
    },
    onKeydown(e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.submitComment();
      }
    },
    escapeConsoleText
  },
  template: `
    <div style="margin:30px auto 0 auto; max-width:800px;">
      <!-- Comment input -->
      <div v-if="canComment" style="display:flex; gap:6px; margin-bottom:8px;">
        <input
          v-model="commentText"
          type="text"
          placeholder="Write a comment... (Enter to send)"
          maxlength="500"
          style="flex:1; padding:7px 10px; border-radius:6px; border:1px solid #ccc; font-size:14px;"
          @keydown="onKeydown"
        />
        <button @click="submitComment" :disabled="!commentText.trim()">Send</button>
      </div>

      <!-- Chat console -->
      <div
        ref="console"
        style="
          max-height:300px;
          overflow-y:auto;
          background:#111;
          color:#0f0;
          font-family:monospace;
          font-size:13px;
          padding:12px;
          border-radius:6px;
          text-align:left;
        "
      >
        <div style="color:#fff; margin-bottom:8px; font-weight:bold;">💬 Spectator Chat</div>
        <div v-if="!sortedMessages.length" style="color:#555;">No spectator comments yet.</div>
        <div v-for="reply in sortedMessages" :key="reply.permlink">
          <span style="color:#888;">[{{ formatTime(reply.created) }}]</span>
          <span style="color:#4fc3f7;">@{{ reply.author }}</span>{{ getMoveExtra(reply) }}:
          <span style="color:#0f0;" v-html="escapeConsoleText(reply.body.slice(0, 200))"></span>
        </div>
      </div>
    </div>
  `
};

// ---- MiniBoardComponent ----
const MiniBoardComponent = {
  name: "MiniBoardComponent",
  props: { boardState: Array },
  template: `
    <div style="display:table; margin:10px auto;">
      <div style="display:grid; grid-template-columns:repeat(8,20px); gap:2px;">
        <div
          v-for="(cell, i) in boardState"
          :key="i"
          style="width:20px;height:20px;background:#2e7d32;border-radius:3px;"
        >
          <div v-if="cell" :style="{
            width:'16px', height:'16px', borderRadius:'50%',
            margin:'2px', background: cell === 'black' ? 'black' : 'white'
          }"></div>
        </div>
      </div>
    </div>
  `
};

// ---- OthelloTableComponent ----
// Thematic marble table thumbnail for non-featured game cards.
const OthelloTableComponent = {
  name: "OthelloTableComponent",
  template: `
    <div style="display:table; margin:10px auto;">
      <img
        src="data:image/png;base64,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"
        alt="Reversi table"
        style="width:174px; height:174px; object-fit:cover; border-radius:6px; display:block;"
      />
    </div>
  `
};
// ---- GamePreviewComponent ----
const GamePreviewComponent = {
  name: "GamePreviewComponent",
  props: {
    game: Object,
    username: String,
    profileUser: { type: String, default: null },
    isFeatured: { type: Boolean, default: false }
  },
  emits: ["view", "join"],
  data() {
    return { previewState: null, blackData: null, whiteData: null };
  },
  async created() {
    try {
      const { state } = await loadGameFromSteem(this.game.author, this.game.permlink);
      this.previewState = state;
      if (state.blackPlayer) this.blackData = await fetchAccount(state.blackPlayer);
      if (state.whitePlayer) this.whiteData = await fetchAccount(state.whitePlayer);
    } catch(e) {
      console.error("GamePreviewComponent failed to load", this.game.author, this.game.permlink, e);
    }
  },
  computed: {
    roleLabel() {
      if (!this.profileUser) return null;
      if (this.game.blackPlayer === this.profileUser) return { text: "⚫ Black", color: "#333", bg: "#e0e0e0" };
      if (this.game.whitePlayer === this.profileUser) return { text: "⚪ White", color: "#555", bg: "#f5f5f5", border: "1px solid #ccc" };
      return null;
    }
  },
  methods: {
    getGameStatus,
    canJoin() {
      return this.username && !this.game.whitePlayer && this.username !== this.game.blackPlayer;
    }
  },
  components: { MiniBoardComponent, PlayerBarComponent, OthelloTableComponent },
  template: `
    <div :style="{ maxWidth: '600px', margin: '0 auto 20px auto' }">
      <div v-if="roleLabel" :style="{
        display: 'inline-block', margin: '4px 0 6px', padding: '2px 10px',
        borderRadius: '12px', fontSize: '12px', fontWeight: 'bold',
        background: roleLabel.bg, color: roleLabel.color, border: roleLabel.border || 'none'
      }">{{ roleLabel.text }}</div>
      <h2 v-if="isFeatured">{{ game.title }}</h2>
      <strong v-else>{{ game.title }}</strong>
      <div style="text-align:center;">
        <player-bar-component
          v-if="previewState"
          :black-data="blackData"
          :white-data="whiteData"
          :current-player="previewState.currentPlayer"
          :finished="previewState.finished"
        ></player-bar-component>
        <mini-board-component v-if="isFeatured && previewState" :board-state="previewState.board"></mini-board-component>
        <othello-table-component v-else-if="!isFeatured"></othello-table-component>
      </div>
      <p>Status: {{ getGameStatus(game, previewState) }}</p>
      <button @click="$emit('view', game)">View</button>
      <button v-if="canJoin()" @click="$emit('join', game)">Join</button>
    </div>
  `
};
