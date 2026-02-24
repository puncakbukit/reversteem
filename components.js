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

// ---- AuthControlsComponent ----
const AuthControlsComponent = {
  name: "AuthControlsComponent",
  props: {
    username: String,
    hasKeychain: Boolean,
    timePresets: Object,
    timeoutMinutes: Number
  },
  emits: ["login", "logout", "start-game", "update-timeout"],
  data() {
    return { selectedMode: "standard" };
  },
  methods: {
    selectMode(mode) {
      this.selectedMode = mode;
      this.$emit("update-timeout", this.timePresets[mode]);
    },
    onManualInput(e) {
      this.selectedMode = null;
      this.$emit("update-timeout", parseInt(e.target.value) || DEFAULT_TIMEOUT_MINUTES);
    }
  },
  template: `
    <div>
      <button v-if="!username" @click="$emit('login')">Login with Steem</button>
      <div v-if="username && hasKeychain">
        <button @click="$emit('logout')">Logout</button>
        <button @click="$emit('start-game')">Start New Game</button>
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
        <p>Welcome @{{ username }}</p>
      </div>
    </div>
  `
};

// ---- BoardComponent ----
const BoardComponent = {
  name: "BoardComponent",
  props: {
    boardState: Array,
    isLocked: Boolean
  },
  emits: ["cell-click"],
  template: `
    <div style="position:relative; display:inline-block;">
      <div :class="{ 'board-overlay': isLocked }" v-if="isLocked">
        Posting move...
      </div>
      <div id="board">
        <div
          v-for="(cell, i) in boardState"
          :key="i"
          class="cell"
          @click="$emit('cell-click', i)"
        >
          <div v-if="cell" :class="cell"></div>
        </div>
      </div>
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
    spectatorReplies: Array
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
    }
  },
  // Only auto-scroll when the message count actually increases
  watch: {
    "sortedMessages.length"(newLen, oldLen) {
      if (newLen > oldLen) {
        this.$nextTick(() => {
          const el = this.$el;
          if (el) el.scrollTop = el.scrollHeight;
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
    escapeConsoleText
  },
  template: `
    <div style="
      margin: 30px auto 0 auto;
      max-width: 800px;
      max-height: 300px;
      overflow-y: auto;
      background: #111;
      color: #0f0;
      font-family: monospace;
      font-size: 13px;
      padding: 12px;
      border-radius: 6px;
      text-align: left;
    ">
      <div style="color:#fff; margin-bottom:8px; font-weight:bold;">💬 Spectator Chat</div>
      <div v-if="!sortedMessages.length" style="color:#555;">No spectator comments yet.</div>
      <div v-for="reply in sortedMessages" :key="reply.permlink">
        <span style="color:#888;">[{{ formatTime(reply.created) }}]</span>
        <span style="color:#4fc3f7;">@{{ reply.author }}</span>{{ getMoveExtra(reply) }}:
        <span style="color:#0f0;" v-html="escapeConsoleText(reply.body.slice(0, 200))"></span>
      </div>
    </div>
  `
};

// ---- MiniBoardComponent ----
const MiniBoardComponent = {
  name: "MiniBoardComponent",
  props: { boardState: Array },
  template: `
    <div style="display:grid; grid-template-columns:repeat(8,20px); gap:2px; margin:10px auto;">
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
  `
};

// ---- GamePreviewComponent ----
const GamePreviewComponent = {
  name: "GamePreviewComponent",
  props: {
    game: Object,
    username: String,
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
      // Fetch account data once here, not inside PlayerBarComponent
      if (state.blackPlayer) this.blackData = await fetchAccount(state.blackPlayer);
      if (state.whitePlayer) this.whiteData = await fetchAccount(state.whitePlayer);
    } catch {}
  },
  methods: {
    getGameStatus,
    canJoin() {
      return this.username && !this.game.whitePlayer && this.username !== this.game.blackPlayer;
    }
  },
  components: { MiniBoardComponent, PlayerBarComponent },
  template: `
    <div :style="{ marginBottom: isFeatured ? '20px' : '10px' }">
      <h2 v-if="isFeatured">{{ game.title }}</h2>
      <strong v-else>{{ game.title }}</strong>
      <div v-if="isFeatured && previewState">
        <player-bar-component
          :black-data="blackData"
          :white-data="whiteData"
          :current-player="previewState.currentPlayer"
          :finished="previewState.finished"
        ></player-bar-component>
        <mini-board-component :board-state="previewState.board"></mini-board-component>
      </div>
      <p>Status: {{ getGameStatus(game) }}</p>
      <button @click="$emit('view', game)">View</button>
      <button v-if="canJoin()" @click="$emit('join', game)">Join</button>
    </div>
  `
};
