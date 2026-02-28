// ============================================================
// components.js
// Vue 3 component definitions for Reversteem
// ============================================================

// ---- ProfileHeaderComponent ----
const FALLBACK_ACCOUNT = "reversteem";

const ProfileHeaderComponent = {
  name: "ProfileHeaderComponent",
  props: {
    username: String,
    userRating: Number
  },
  data() {
    return { profileData: null, fallbackData: null };
  },
  computed: {
    displayData() {
      return this.profileData || this.fallbackData;
    },
    isGuest() {
      return !this.profileData && !!this.fallbackData;
    }
  },
  watch: {
    username: {
      immediate: true,
      async handler(val) {
        if (val) {
          this.profileData = await fetchAccount(val);
        } else {
          this.profileData = null;
          // Load fallback only once
          if (!this.fallbackData) {
            this.fallbackData = await fetchAccount(FALLBACK_ACCOUNT);
          }
        }
      }
    }
  },
  template: `
    <div id="profileHeader" v-if="displayData">
      <div class="cover" :style="{
        backgroundImage: 'url(' + safeUrl(displayData.coverImage) + ')',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        height: '150px',
        borderRadius: '8px'
      }"></div>
      <div style="display:flex; align-items:center; margin-top:-40px; padding:10px;">
        <img :src="safeUrl(displayData.profileImage)" style="width:80px;height:80px;border-radius:50%;border:3px solid white;background:white;">
        <div style="margin-left:15px;">
          <template v-if="!isGuest">
            <h2 style="margin:0;">
              {{ displayData.displayName }}
              <span style="font-size:14px; color:#666;">(ELO: {{ userRating }})</span>
            </h2>
            <small><a :href="'#/@' + displayData.username" style="color:#555;text-decoration:none;">@{{ displayData.username }}</a></small>
            <p style="margin:5px 0;">{{ displayData.about }}</p>
          </template>
          <template v-else>
            <h2 style="margin:0;">{{ displayData.displayName }}</h2>
            <small><a :href="'#/@' + displayData.username" style="color:#555;text-decoration:none;">@{{ displayData.username }}</a></small>
            <p style="margin:5px 0;">{{ displayData.about }}</p>
          </template>
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
      const val = parseInt(e.target.value);
      if (!isNaN(val)) this.$emit("update-timeout", val);
    },
    onManualChange(e) {
      const val = parseInt(e.target.value);
      const clamped = isNaN(val) ? DEFAULT_TIMEOUT_MINUTES : Math.max(MIN_TIMEOUT_MINUTES, Math.min(val, MAX_TIMEOUT_MINUTES));
      e.target.value = clamped;
      this.selectedMode = null;
      this.$emit("update-timeout", clamped);
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
        <input type="number" min="1" :value="timeoutMinutes" @input="onManualInput" @change="onManualChange" size="5" /> mins/move

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
        <p>Welcome <a :href="'#/@' + username" style="color:#2e7d32;font-weight:bold;text-decoration:none;">@{{ username }}</a></p>
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
            <strong><a :href="'#/@' + whiteData.username" style="color:inherit;text-decoration:none;">@{{ whiteData.username }}</a></strong><br>
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
            <strong><a :href="'#/@' + blackData.username" style="color:inherit;text-decoration:none;">@{{ blackData.username }}</a></strong><br>
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
          <a :href="'#/@' + reply.author" style="color:#4fc3f7;text-decoration:none;">@{{ reply.author }}</a>{{ getMoveExtra(reply) }}:
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
        src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASgAAADYCAYAAABY4n60AABSuElEQVR4nO29eXwk51Uu/LRGXe3urpbU2mVZ4xmPx57NHnuIHRvwknG+S2ISQlYcIDFgB0jIAlxyAyTXYQmEm7BcLtxLuHzhC+QHCYEETEyckNhOPHHs2JOJJ/bso5FGskb72tXd7mqN6vuj+rx96q2qXtRVmq5RPb+fft2qrnrrre2p55z3nPNG1tbWgIgBGBGECBEiRDOhBUBITiFChGhKtFzqDoQIESKEG0KCChEiRNMiJCi/EDEudQ9ChAg8QoLyC6FfL0SIhhESVIgQIZoWIUGFCBGiaRESVIgQIZoWIUGFCBGiaRESVIgQIZoWIUGFCBGiaRESVIgQIZoWIUGFCBGiaRESVIgQIZoWIUGFCE5aTlD6GcIzBI+g/LhJg3Tj+9FXP9Jy/Oyn120H6fpvMgSPoJwepkZvML/z5rx8APwiE7+I34+2vT4HYd6k9/DomkfW1tY8aShEiBAhvEbwFJSXCJq0D1p/Q4RoEJuboIIm7YPW3xAhGsTmJqhLgaCJoKD1N8RlhZCgNhpBE0FB62+IywrBIyg/3ugGa9fr9nnbXrTjVXtBgyF99+ocyO163aZX8OO6+3HsHiOYo3gGvH2ze91eiBB+YBPep8FSUPJbpElZf0Pg5bE3s3IIEvxUuH6QUwDUeDAVVIgQITYFgqWgQjSOZnlrXsqYrmY4/lrQLNfqEqL1UncgxAajWXwYlzKmq1nOQTUEpZ8+IlRQIUJw+JWXGGJdCBVUiBAcYbR+U8FfBeWWzb7eNxRvi7fRyBvPz0x+r9uT/7xsm+/Di/b8vE5u3xtp18v7VG7XCzi15+W18vsZWGf7m3MUL2JsTImVoL2NvegzvxG9Pn4/zilvcz3tb+R1pnMbtPuqAQTHxOMXp5kvlNObotGb2Gn7ZiXAZuyTE5zOn5fk3Gh7btfXq/PrZV99xOZUUCE2L5qV2EM4IjijeJtlZMVLP0iltpv1fG5Ev7z0CwUNARulDBVUiBAhmhbBUVAhQoTYdAgJKkSIjYCfpVIuY4QEBfh7sb2uXRSUG9Ov+kVBOH6nPnrhl+ft+lHZoAkRnDADv+B3jR0v2w7C4JOfDxHfRxDOhRfgx+p1DTRCxOO2PcTmIyj55g4fIm/h9zEH4ZwG4aUUhPOIzWjibdSFCcgNECiE53TT4dIQVIDiMEJcYoS3yqbGpTHxwkje2nG5m4qyL8SJkAz22+V8LkLYsPl8UM2AetIt6n0gqymOS/2AV+pfLb/J60TYcjeC4+uFuDRYZ4rRxph4XqcWOJXy8KJd/r8fJU28SHI2qvxV7EON/WtWRKx/a8Ya1tbWHMlrzZAyJKqdJ6/LzPjdbtCwznt+41JdvErS9DLZk9q6FAmkdL9FHJY5YM1YQ0ukwfeJfIguN33Eh3FnA6X7zFZBoIaNazxHMiqes2qHx83JeuOaGi3hUqk9rxCQpOng5OJxMgG8IzuCF21X8pGs9wXIzRa57XrbdOjb2toaVldXxf+6rgMACnpBtK4XXnZtUtd1FPUCisUi9KIulitRBdFoFFElZv6vKFBiVyCmxCL0P6G11fQ0tERa1seL1cw7wE5yMvnUS4LVCMrSvwbLrnjVllObXhIpb9+jtoJDUM2MjVDftV7viAGsRSxkoes6CnrBmJm6gOWVZRR1HVpmBXrhZWiZDAolUirqRRR1vfxXLFraAKzEQsuXtAzW8jkAwBwju24inngCiRJRpdNptHd2IqpEAQAxRUFUURCLxUwCi8UQVWKIKgri8bgguqSaghK7orSNleQsBMfOVSRiPWkG1hBBi6nm6AGqlYzcfF9Bg9fKyWcl5h1BeS1r3fYB+FMIrFbUMuq0Xjh1y8EMW7toCNWj6zoymWUjq2WQzWWxsrwMLbOCzMoyNE0TBFDUdRR0HUW9iJymoajriCoKctksdF23EY+maeXvy4toiSds/ejt7BIElVBiUBTFQlYEmbR4W7QuJzEAyOkFdKgpS7+i0Si6+/ugqipSbe22/sRiMSTUFFpbTfJLJhJIJFXRBhEcYJJcIpEwSa3FPMd1k1cQSSogheoIoYKqBV6RkNubOGIgwsYrLl68iNXVVaF89MLLyGoZFItFZHM5rCwtoFAoCAWkaVmheohwAAjiURQFuq6jI51Ge2caMUXB4sIicpqGaInAlhcXAZgkUCwWxba6rmNhdlr0rSWeQIeaQkc6LbabWZgHAAvB0H6BMtnl9IKFkDgSSgyqqor9JpJJREvbF0vHE1UUJNSkhWQBoFgsIpFMoqjrSKiq2a+FBbNdVUVCTdouhaqq6O7pRUJNob2tHR3pTmGCCuJyun71wM3kD8MlasbmIyjXUqpe76e8PyIfwzCEz0cmn6XlZawsLZjKh5GOSSBR5LSs+VCWzK72dFo8eEW9aNk1f6DJlCLzjS+jNklhUduJZPmBzmWziEajyGazWNIy6FBTAEzyy+kFc30lJshHbU+b2+kFoaoACLKj7YiQiIh4v5YXFsV+xTGVSEgGbcuPnRObTHIAxHmLlX6jdcjM7OkbQDKRsJiWMSUWURQFra2taGmpMlhR671USTE3ubKpG+sk5c1HUDJ8IKZIJALDMMQDmcksGzMzU8jn81icn8PC3Cw0LYvlhQVkS4pHW14UTZBKURTFQg5r+ZzFFOLqKJlMIqGqFhXF/UaKolhILcYeatkHRQ9sjpl5vE0yvwBYlBZg+pg44RHJZLNZm7lWJiaTnEgZOaFMrlby4f0F4Era1D4AqGrS4vcixGIxtj7/XvaHJZIq1FSbICzA9IFZHPyNDIiEsCCYBCWPvKyHnR1uIoqdaYm0WL7XgjXDVEbz87PG0uICJi+8hMzKMubn57G8YJJPUdcFIZH64P4aIh9VVQGUHdBAWaWI/ZXIihMZAGGeyQoHgIVI6LuiKILcCAk1KXxXgGmiEXnNTk/biI9A7bWn0xZCyWkaZqanLfvUdV0cZyKZRG9/H9RUSjjKOUhVqqkUCoWC8KepJULmCsjJNwWUCScqSKWszqLR1tK5W7VvF7XGMtM6q6tFSzvJRAId6U6kUu2RRMI0X+k+4vdQ1XARp1FbOZLeKxPRbTSziUzQYBKUF3AI6qt646A8MkQKKaNljJmpCxgdGcbY6CjmpqcxszAvCARw9s3Io2JEKum0aSKR4uBKg5tuwv8ijbaRD0k2jwCrL4gTHu+fqqpiWz7aRmRC+y3oOmKKgoKuI6dlLb+ZfqCoUGmk0Ai0nAgJMMmlUCggFosJYieSTLW1o6dvAECZGACTHIhAlGjpPBZ1FIurWF2lEckC37UgqqJeQFSJoagXxH4LhYLoixPk9cTxsL5znxaRlVBXjYaaNAlpbCT8ISi3uJ1LDekG4dHGMjmJNx07hrW1NeRyOUxNvmRMTl7A2MgwZqamkctmoWmaq2IhsyeqKEh3pi0Eo6ZMU4mUATdXCLScHhx6GAhODxa1B8BiFtFIntw2+bmiioL+gX4bcciQl8sPNTeRiCT4+plSuIPcPzJ9o4qC9s60UEm0HvWXlJKaarPsg9rm54GbctRPIie5z3wZPwZ5HzK4QqM+xuNxJBNJJNWUhayqvRCrBph6raC8Jj8P29scCqqGN5eTFAeA1dVVZLSMsTg/i8nJCzhz6gSWFxYtKsGNVGTQzatpWeETIWKQHbpkDhJITZEaImUlP+QAbH0jYrL2j6kuFpPE2+LbqapqiVVyA5GQXnjZQpLUDvWJ1Bw/f3x/pM5kFUbnLKYojuROxEX7l/sskznFXBFaW6NCfcnLCflcVpwnWh6NtgoVZ/5fXp/24+S7ItScJdBsL32f4S1BNZsMXY+kLvVf0zScPHnMmBgbsTxoBDJtnEbBuIMagGUkCyiTC2Alg1w2K0aqciVy4kTETTdu1snryaNa5JeivvF+8VAAGlWjfhFRin2UVE1XV5fFuQyYhKDErrB8iv1I6wJlgiD/Ep1ToEyGWiZjcWa7RbQ7qSPqr2wGUgBrsbhqIRVazklGL+rI5/OCtACgvUSATgRk6RMz4wmkwOg6prt6kFJTEcvIYCMjgLVCjuVrYlyeCmodxEQKSi/qGD57ynjsa4/i1Is/AGCN2SHzjQ+jyzci/UbfxT5YDFCHmkIymUQ2m0VPXx96+/tsagMoj6xRiIG8Lz5sz/fv1F/ZIQ/AFgxJBEUqjPcDgMW3ZP6vOJI3gSskJz8PVz+y2SsTD60vjl0irL4rrxKjbZZzVPJLyQ5veT1xTBQLxkiL2pCDP93Ag1/lgQmxf0WxRMcrimL2qRZ/VZMTi1fYdARlMeWkEZPJyQnj0De/gaeeesoWDQ3AFgFN/9N3PrLWkU5jZnraNlqntqcFWXT29In2rtu9C53dPQCcc98oNopCEwDYwhMA4GLeVCPjU3MYn5pFR0rFYF+36/k4ljG378hdBAAsJbYAAIYiCtShIZGuws/BTGYFvSXfDz8fALAwO4OJ6TmxnNqjNq/Zs1f8z0l1dH4W2vg4xg3dsj4AtKlJ7LnphxCNRrEUMdBRihFaihgYOXMGJ547AgB48F0P4p4fey30om4zt6ymsbPacRrllH+vFbrlJVMoq2vWN/pORMj9VQDgGjAK+EtQlzKJXsLlVw+qyptHdnxHWiLIZDL4/pFnjSe/8XVMTYwL4plbXbU8oHIUtAhMlEbEFEXBUikyu0NNmSqH/aYoCpTOLjEcn8tmUdB14TcBrKpBiV2BaKEAVTVjeGSFZX6Wl+U0Dd95/vOYmptDR0rF237uF9DZ3cu2MUeuxkZHcexf/gGAlUgAYDGdwHvedp8YPeM4d+YkBgaHLD4YwqPffhzHHv4SAEDt7AAWlqB2dkBbWII6NIS3/+w7hZnEceS5Z/DI449hN2Ahv5nMCtYAvO7Nb0FHR6dtu+MvHsVvPXcEmWwWTz1/BHccvEfk73HIxETmVlSJCTLJlkI6isUiinrU9rsb6ciKi4NGFAFYTEWnkIZsLotsLouJiZcMAOjp6YWaarOagfL97ZR61SinNFGQqL8KyusMaUKlNmt0iAOmA5ybc5QzRqTE/yeyok+1PS3Ihh4GMxXD7jyXndRujnXxe5Vhbkrw5UP/XF0tzE7jK994Atl8Hv17d+DBn3irJVLb3KaI84tmisrImTM4MTYsftu9dQd6U23ovnY7BpNtFpMOAM4tzmEw2WZztMcUBcfGxwAAcbWsNvNaWY1ene4SgZLcwX9q+gIA4LU/ehA9Pb2lPhawtLyMc2dOsn6XRyJninkAwBcf/hIy5y5gqL8PH3roIfT0DdjCEQDneCdBGA5OcW4S5vN5W1s8JoqWU3s5LePogOdtyiTF2+TLeIBoRbJygtuj4hSx7mVJJEKD7fmroLxmYl4SxfZbbU0QOU1PTwpzDgD6B4fQj7LvIBqNYqi0TVRRcH3pgbqehQvwESPyJXDzrFAoYHFhsZyYW3Koxzqt6ReaRqNCUaiqikKhIIIjeWIvAJFLx8lpYmwci4uLwtwbHRkpH/D0Mv7ff/9nx3Nx196b0aGmcKKkQAS27sC2oa344qHHMaR2CUUzk1nBuDYPbWHJ1happN1bd+ChD30YHelOoThIrRx74Xl89C/+RPRLoK8damcHPvwLv4Kenl5hSqmpNqS7etDT04tP/fmf4tD5k3BCR+4iMgCWMhqGT58WsVQALBUS8mwbUn+trVHkc1mbGlxdLVpIjgiHYqsSagrxeBzF4qpVGVlGY61hCUVdRx5APJEURCUTFvXFsl1xFXpRx9LSAjo6Oo2BgUFzJLBaiZiqNa98ICfetgdF9vypZuAHKuXQVXIqMtkbiURM0+b8OePI4e9iZmoa6c60JWCQwJ24RDqkXPhwPHds83IlhBzzF9EnKa9EMmmLoeKQndqDff24/a67MTBwpVhOpsWXPvePOHv8BQDAsbOjmJqbQzIex+te/+NI9vchquVQVBOIMjWzpGXwrce/iZPnzqOjrZzn1t/djZ9++324/a67sfXq7cKZ+9UvfwmPPP4YelNtSPaX/WccUS2HK4eGLGoNACayK8hrOZx/9rt45ugxZPNlukjG47j31a/Czbfdjjvvvgfprh7ESubY/Pwsnv/ed/GDsRFX1fbi0R/gC180zcpb774D973hJ6HErsDC3CxOnzhpqbCgtqexc/cubNt+jc0XZbZpV7akfHgAKJFMPp93jF9zWoeCQ+MJh5zCUvs8hIE7/MlEJdJLd/Ug3ZGOVBz9uwxy/bxTUH4fcL1mXYmY1tbW0NLSgrW1NUxPTxpnz5zCwtwMAGDo6q0AyqNFC3Oztrw087suiIbIRE6ElaPHgXI5Ek5KtD6NlvHf6Hdqa2HW7Ge7GsfFfAYTAMZGhhFVFAwMDFpGga4cGsLs2Fksa3mhhob6+/CWt90nCI2HJmRzOfzqxz+CqbmyQxsAllbMbSemp1DUC7zQHA7+l3tx4JbbMDoyjD379gs/DPf3HDn8Xfzh//1L67WYXkYmm0UqmcTuWw7g1rvvwOTJ0wCAwb5udPb04rY778Kzzz2Hs9NTeOWevei78ioAwNHvHcZnH/8P3HH1Ltzzgfsco/AHBq/Co1/9GjLZLCZPnoZ2MIPO2BX4yhf/Gc8cPYZUMin2DwAvPn8ED773fUIBJ0p5hfx685SYZCl1hcw8IhhOPLScq658Lotoezvi8bhJcizsgZtyXE0lu3ss/rJcVoNe1E2HOnO0F4tFxJQYePCnzaHu5I8iZdMEDvBaEEwneTVHoPTb5OSE8fyR5zB8+rRQOIslJzbF/iSYySQnplL8DwCR1sFR1HX0AtB1M3QAKJNBMplERyl9JccSZin5ltdSoge9Q01hCUBnT69lP2v5HGamptHZ3YP2tnYoStlp3D/Qj6MAVrSsUCdLiS2YnBgXhMx9V5qm4c6bb8Nr975ClEshJJQYIp0dGB05h7nZGXT39Iq399zsDDRNs6SeLM7PYfLCBADg7PQU7r3nNQBM39az3zwk2p2am8PexQX82kO/L7alB1aJKuLlUCgUkCs5rPsH+vGOgz+OmWIeX33kYTFIwP1i5xbngL524FwWSxkNE2PjmBgbxzNHj5VGFE0SHuwDsvk8OlIqpianxIBEqlBAuqsb8URSKBjzWptm3epqEfF4HO1t7Wbydi5rJRhJiZHpSGSlRBUUi6vi3lotERVVTODpN3Tf8O98pC+byyGfyyKeSGJ4+JTR29uPrq6eSGury6PsRlIBQfAIynD+bnmDlC7K/OK88ezTh/DCkSOYmJ6y5J+R5KdibDzptlgsIgEIvxGBTDois3IpE8WSbGsuK1emzDH/jqXeUYmQ5GRfIjmFFYRby+dwMZ9BLptFZmVZ3LB64WUz3CCTwZZ4CoBp2mXzeWB62a5mSlA7O/A/f+tj6GgvBR6WCCiqxDB2fgS/9ecfx1eYr4l8TJhexht+4vW48+57kCwpj+6ubnz10a/gW8e+D7WzA//7oT9Cb28/zp45hX1Xb7cQ4J7dewBAqBL+gG7bfg12773R1ldd10WfqiGTzeL7Z011xsMdAJSJO6MhqkSRamsX/inAJExSR6urRXT19EpKhxKDk7agWboepI6i0VZTEZXa62hvF8fM2ysWi7agW7cRwbm5WfF9dnoSeuFlXHhpHDuv22VsvfqaiGNl0Y2o9uojgkVQLuTkhLNnThpf+vw/Ynz0HADThyOXNOE+Hh79ndMLADPZiLyItAArAQHlukTc90JVAYCyj4qX/eAF13gVgnQ6LVRXIpksmTUpLMya5l/71DS6Sw/P6moRx184ise+/DAAYHxqFtl8Hsl4HLtvOWBxcMvD9z/4/mHhbOc4NX0BPzSwHShFGJDCOz05gfHOeXSk0xSvA0VRkEq14w0/+UZ0X7sdgGn6ZLUMtl69HT/7wC8KNTA3N4tvHvkuHv3242JfvdF46fyZ52Xgyqts0fJ60fTn/NgdB23bAOao6OkTJ/Hw9JeRyWahjY/j4I+9FtoPj+P48KggpmTc3G7vtdvQ1dUl/IxaZsVsRyo3DJRH5eiTyIn6pxd1JBNJJJKqJXTBvL5Wv2IiWT7XvI47mY6k2Mh35TTaSPdfuqtb9LFYLGJ+ftbo6uqJiPivy4CcgCARlEt5FKckXwA4c/qkhZwA2EIDFhcXhaLK6QUUF8zKkVviKbTEE+js6UNHOm1RR6qaFGU/NE1DTjPjjnhqCiebwSEzXkhlZEUJsJpWJjYiq2SyPARP/SOCpGJwE+PjmBgfF33SlhfRrsZt/qd3veN+DJR8OfyNXCyu4rOf+TT+1z9+xvFUq50d+OMPfhQDA4PlbRjJFPUC1blCKmUqsFtvuwP7D9yKkXNnTdOFOXTNhz6GbgDHv38UJ8aGzRgp6n8pVmpI7cKdryorM3phJEr7f8XO3dizb7+lhC8NYOy4fje+9cQTmJozA1QHtw7hwfe+z1LuJqGqYvSVh3JY60CZ5lc+z8f8TLPNNNWKlnQZwIxfQsk0dFqHp9TQb5x8aPSwraPT4sMCyv4pMgdltQWY13ZpcQFK7ArD4ji/DEgqGATlcpI5OclEpabacP0+01yQq0jy3LZ0NF2u0dTZJ+oxRaNRtHd2WpQS+aHm5+cxNzUtCITMLwAlM6sc0U2qrSWeQG8pOBOAMBV72WiYXDscALC4KEy8hdkZrGhZZLLmw5NKxrFt+3YzOj2ewMpUeXQslYwjqsSQzeVsMTu5kt9r99YdAGCLCucjdFQtQMusCJJ57GuPYm52xpYjVygUcGr6AnqjcdsoHsV+bd+5E3tu3u94PfNaDkeee8ZW94knPXNVorP/4/E4Bvu6MT41jUw2i4mxcezatw8DVw6K3EG5IJ0ciyXHKYl1S8uIdCg/T46rikZbbaYZN+uyzL8ll4nh7TttW97OTlIUJxVTYpGak46bteKIBJ/joLD+E+CybbWCXy0tLabPYmQYs9OmIiKfD9WrBswbsruvDzlNQxKw1OumcrvLCwsWNTQ6PmYZveOhAURMQFmxyTl8uq6L2t96yTeV08rF2gDzba7CfNhV1exzTtNw6InHcHx4VIxIEY4Pj+K2/XvRvXWbIC4A2HfTAeFPkfPQMivLuPmWV+C+PfuQTCRtTlp6CJaWFlDUC0iqKcrEx9LSAj7/7a+7nn8OUkYcd958Gx78qXcCgFBfmYwZszQx8RL+5C/+DCfGhpE5d8FimqWuuRJ37b0Zr/zhOywpJ6LeuhLD1be+Es8cPQYAGB0fw+133W0SUIlkefwROZ7JTJITiQGreccJSSYyrpCyuZytmB0H7YfvDyinvfDpujgZOyWH82Vqqg2JRKK+6bPkdZuQrPwlKK9r1qC2shS6rmNmalpUowSAhKZBWVy0FYgTJlSxaItZ4tsLfxVLEBaJuLDmldF6vPgbgVRXQomZ7S/MY2lxUZh2AGwjisViEZlsXoxIdbQlhT9lYnoOE9Nz6OzpxVLGdOgn43EMDg1ZRqSIuop6QRSDKxZXRc1tvfAyFEVBtuQHSaopLC0uYHLygsUnc+GlcdM/BbtfS676CXuWDADg2acPQYldgZsO3GLuuzRwkEwkcN3AICZPnsYUM7Gy+TxS08tI3Gw68LnzmptEPHr93PFjmL7wElJt7ejq6UVHR6fNJ0RTcEUVBSvL5cBRrtYspX+ZucWThzmcFBiBSExOxYlGo7b7JJfVLL/L4ORUUT3V+gw2ITkBzWzirSeviK3b299nGW3jAX45TRN5cE71lNpLBeauLtVqmhgfh8Yc6hQL1aGmBIk5VS2Qk0yj0SjS6TTSKN1gpXuQl/al7eXEZCIfwIxVWlrJWoIrR0dGLMrq89/+uqvS+aGB7Th48CCi0VZktYwtrujv//XzyGs5RLUcTk9OWLYd1+bxwZ95ANft2iuOiWPs/AgSagrdXd22GKmoEsNXH3kYn/yHT2NI7UJmZRnXl1Tc0tICvvfsMwCA/be8AidHRsUx9nd3Y6i/B//PvffiG898ByNnzjge17hmjhZm83mMT83ixeePYtuOa9DW0Qk11SZMUTINBwYGsbS0YPE3Wc2+8shmTssIMuPrc5Jzupc4KG6KKzkAwtHO1Sv/jZ9n+TclqpTVE2APXA6IKeeG5iUowHpSay1IHzFQ0AuGRrOgsLAAPqEAlTpZ0jIY7OsX5h1QTj0pF9lXxWgXTWIAmA90b2eXpYaSXNRfVcu/OVW8lCPTFxcWbabl2NioLaASKAdVArCYdxSQ6JSSAgAdO1MY3Lod+XweHaWHlzAzM4Xj3z8qHnY38FErnjQLmP4g66QD5e/pzjSG1C4AwL9+9VFsHz4rfstOTSOhxHDw4EF0qCmcnpzAtq4e7Ny9CwNXDgqHP0dvqg0zpVG4IbULrf19wg81NTGORDKJ0ye+gNvuuAN79u2HmmoTgafC2R7VXIlBBvc38RE9oGze8bw88vnZqnW2lxOmebQ4ffIYKDrH8u+i+oGailhy85ymNpMREMJqboJyg9v8cgzLCwuYmJ6ylU0hZcLnehsfPSfipABTDc1kVpAu5oVvidcXp5HAmYV5JJSYpW44QLOGpEX7mqahoOulUb+sJRUmqigoKkX7smIRC7PTmFtdxeT0nIWMZKSScRFeAAC7bzmAN77mtQCsUdFUj+mpp57CZz/zaXSoKZGWMpE1H/K8lsPdt96Grdu2iW04MivLePzxx/HMt58S50rGW952n8XXwh+uVFs73vWO+8WIFQ/UBIDTJ4/h8cfLYQg5vYCvf/uQIKJtXT14zwO/KPxrXIkoUQWf/dIX8E9/87cAzNIv/YNDWJidxvDp09i2fQe6unosZj4pKCrPK66Bg1lF4GEGfN2O9nbH+Kh4PC5Ul5ZZEQGibe3tln1yODnDnRRpKtUuKnReDqN2MoJHUBHpk781IgCMCFJqKvL6N7/VOH3yGMbPj1mG5AFT+XQMbbWoHUJR16EWi6JMCt+G6i/Js+DSjUTVBOT54+SZT6g9uU+apllSXvoHh9CyMI+Wvm4M9nXb8tdSySQ6Uira1CQy2VHx29233oYb9h+w1B4ix+vs7Az+9auPiqH+ockJ9Kba8L3JcoLxh3/hV7Bnn3WkjUyd4TMnLes64e2Kgo60GeVuz3E0TUCqWGBxeMeuwPLKskhKBmD7BExnN08q5vt59W0/jK/84z+ZI3nTc7h3xzXo7jOLAY6ODFvMKYpBymkZ5LQM8qVZiXmwpeUaOZT0tSkjtpz/T9u2tbeL+LV8Pm+b4MFp9hm30Tx5Vh0AdpIKiFJyg89Ocpd8Hy8TFmV7O2LWet69+4bI0NbtmJp8yTj2wvM4d+asJZ6pUj1xpwqOsjnGi/vnslkRqkCwBH0ycMc5709R14Xvi6O7rw+5oa24ds8Nwqkv+6jmxqzBiMsLC3j6qSdFYCjH2ekpTJ48jQ4AS1jCiYUlnJCO/8h3v4ux0VELcRNmp6ehnThvXdhnre/09Le+ieOdRy3LKLdxYnwciqKgp0Qa/HijioLzi/OW0i8yTiws4bOf+TQG+/qxJGXLJ/VVy5Tt41PTGB0+hwOvfKVYNj87gxWJBOQEXiIt+k0OcaD1eRS+7G/UdR1J9pIj4ukorcdTWbK5ssp3emlS7BnvT3tbu1U91QsPS6I4tu1Rm5dHRc0Kc9wB5dIqx47+wFYl0clE6VBT6OkzY4EohopHf9N036SSqD3AqpgSLOjSaWYSao+n0JS/J0XeH6Xc0IgeJRNTrNXx4XExvA7A4jwncKd6JXORb8vX62hLiv/5d7dt5X1XA7XJ++i2n1rbAoAP/ep78aa3/zQAu68HsDudzWXWCG6n2WeIJOT2nKp1cvDKnTzx2WnGGE5g+VzWQlIDA1di69XX2AmqJv+TA4E0afJwcAhKri3DT6aL3U0xUzSp5okTLxiPf/VRnDt9Uphpcm7exXzG4neyDZ0z0G88NgqwkhTl1fF57jgR8bgoHmoAlCc8IB/XUilos7gwjWWtbO6Vk2JDyHjjT70R73ngFwGUS5hwR7c8aQJQrssEmMTBp7ECYAn6rFayRfZt0TZyCIOlfQdSo77Q9l1dPRFbmlIt5AQ4P0uNEpRPBBccH5TbwVdwClJcSEukBa2trbjhhpsjvb39xvNHnsMzhw5ZHOU8uDKhxCx5ezJ5UcoMQVZjIsYJEDPoJlmgKE2CwEcUu/v6xIgfB3dwA2ZFgtHhc4iyBNyhUixUCBNcyfWm2kQ1Byqvws03As/HA8wSLKScOrt7BTnwOQnJ/Kdl3B+lZVagF15Gqq0dxVKpYj7CBzgTpOz74gGggBmDlaSJLuQwHKnGvisc66o1SC4+qa/gKCg31FlJEyiX+n36qSdx5sRJQSxksslvMLkGFK/nRAXnANjqkiel8IOcpgklRZHtvPwtpbg4hSZomQwWFxZFdQUeFT83PY2piXFbiWIAaFlcMI8/XS7NQsGVfLIHACLXT1teFNvz9qitzp5eLMzOYC3did5Um23SCFl18gEHeXYZwFr7ne+H+szrwtN+qH+0f/qN9pdks9MkSueTz+0HuJdWJhQKBcvEoE6EpkppQrSeeb3LREjERaOXOS1jm4CV1pVjqrhLIB6P46qhbWaxuksxoYJlP/6bhcEnKBk1hPdTETua++4H3z8MPiEkANsMKrL55fSdkwdg9S/xOlMUc0X1j3JaFsuLi45mnhtmiwVcmUwhoSaFf4z2L4cs0Ce/2bla47lvM1PTmGEpQhx8iiuaLfmanddCiV2BzMqypbwxlS8mcALmJWxmiwX0ROUZfHUx+ACUp8Ki3+ThfRqgoNpedKxE/nxqcp47SKZatSnPiTR4jSd+nuWZk53m5yMnO1VolUc3aaZleTr4qBJDd3ePiDtLqilYqhY4oflcSevG5UVQdagpPgX14tKicfzFo3j6W9/EYikdhqfByKEB8v/8QebxK3xEiUauiFD4Q+oWiSyc48WibYSPEw0vN0w+LXp42zs7xb7MSR2SFjKmB5geXJreimY8Xl5cRFZpRVJfRVZpFSWDiUjlOlgARO11muad6qsXBSFrFt8amboyAU5MTwk1RInbhHQpcZv6ap6TItKdaUEQSuwKqKk2i/rgIF8UOaA5wchxWvI25jm2l0RxSj6mOCu+vRxaQL4uUUSvrR09fQOWkULLpAmVUr5CgmpSrHPCTsBq9k2OvyTUDJ8tmMNtdIavy9/qdONS8q8MJ6VDpkk5ot0s9TI1OVVaN2rJ1JcnteTL5ckceNgEvbV58Tant708a3Cqrd3SttuUWfK+zfbLpGyp3sB+44qWKwsiHT7079QP6kuqrd2igoAyuRBRyD4o8/zaZ2XhhfZEf1ndKsA60ScAm+pyKv1L65BTnatEUk2ezOYSMASLoGotDF+nkqLvAJDL5fDii88bT3/rm5iZnnYMhpPnSeM1m6hMizwDr1Ot8zIp2dUMAFfSofnzaF0+iwk9jNQ+f/jIaQsAoyPnkNOySKhJqKoqaiQVCgUszM1aTCNCqq3dZh5x8P2Sj4X2S+CmjUyeTmYY1d0iULkcUmmyIqQ0JVVNorO7x0a6MunIZpoTnHxFTsctF6zjqthpH+Tjamtvt0wtpRdeRlbLWInJre64G6rO6CKt61c1gwbbDRZBAdUP2OnE1wg+/fnY+XPGd79zCBNjZhS6m5IiU4eXTJH9C0Qo3NThioqUEWBVGJRP6OTTWl5cFI52UmS9/X1idmLyaZA6mSv5lRLJpKhrtVzyGXGH+/LCguiX7Meh/nETamFuFoulgnBU24rm7pPzIem4rQGzZaXkNiGp1d9XVi7y3IOc4OWRNu6HIvNNri9FI3c0AgeUVaLsV5JNQvncyKQmhxRQyAPl0wHmxKGlGW3K06CX4Ck5BQjBISh5+NSxGPz6muYjfNw3lcvlMDx8yhgdPiNuVHrwZd+HDDl9hk8vxdUWRzc94OyBXFxYtAV7cnLjDz13mPN98yRp2i9/sPnIIl/OnfqksgCr8pmfn7dNJOEU3MrJlfelu69PONRllSKrRVrGVRHtTz5mrl74CJysoir5gfixyvvn5q+sNAmy2qS59Ih4KB2IzkUq1R6hqgRulWKrklS95NSkdaAIwYmDkk+ihydVvug0PbqqqrjhhpsjVw1tM7TMCop6AZOTF0RcTUHXLSqEm27yQxPVy9NL8SFwGr3TGRmQY9lcpzyCRWYN34flwdfK6wEQFRGSbBRM13VbcjN/mEmxDW4dEsnN9Le4sCjUnjBDFQVQab9Z0cdKI5FrnW3oMbbY/ExAmZTooY7FYkgB4uUAmKRhKeZWmkhThtPxlbfRBSEpsSsQVUySIf8cbScTD5EO9c1cr6yayD/GR/xaW6MikdhCSmZVhYiiKKjmX/KcmBrdboMQDAW1HpZfh2lnAVNqFImu6zrm52eNyckJm+nR2hrF7PQkFkozb5DZI4cg8P9lgqEHW4594bML0zB7uUJoWcU5pdQ4xdOQ74ZASodUTyX/GQ8fIOXA+0bKkju3RTuSPwmAo++NVBOvHc6jud1MOIKTT0gOtEyoKddYJNnvR/sUfWaTK5DjPJFUxRyCct0pytXjhASYOaN1+5ac0OQk0wiCQVDrgRdlJySSIuRyOczPzxqU8MnrflN0cDaXw8rSAjIry5ifn8fk+EvCgQ7AQh4cRV23hDoA9nCGcsZ8eZif+3E4kfDROnnUTDZDgbJPjIOPslVKsuZk6GT2EIHJo3Sy70g2sZwgVxGQIZtgtIzalE06Ml+d9stNQjLRaHSNYKvaoMQigHnN+Jx1FWcCXi9CgmpiNOAUd4Ts46qk3gxzaFnXdRT0grE4P2sLIqSyHqPDZhVIPjQvO5ItiasSOfE2y6Rk9fXIlUP5tEwETmBAeVTMCVydyUGs/H9Z8ZnbOIcROCk8mm3FjaQITvlvPByCiEZWPU6jiE7L1FQb4omkUESAQ1kcYdrGxF3BFRHASEhGUEipiRKHg0lQMmnIZU69RrVQBkZqRFiZzLLBkzyzuSzy+bxlynKadHP4zEmMjpyzOIp5rJJMIk4O6PJvZXUjm5VyWIMMIg2KCAfKZMhHGrWMmcLBlVklBzf5sohQZTiZeZmVZUuaD/m9SBVxf1Sl+CuubOh/lU2iIJtnnHhk2IjIxSxr2GSrhObgjQ3D5UNQjaCWcsK13BjSSCOdW/JfySjoBQMwH5yZmSmR9U7mh1ydESjXwObmiRMB8Gh17qviJVwohMBc315ShA/7OxEaBydQmSgyrG43gYcFuKWaVPIPaZpmi9/i+yfntxxnxOfUM4/LroQIbkRU94iaV/en1+B12bxSTV7WeoNfBOW3RPRaKVW7kdY9QsLOAydVwxrB3traitVS8qsTkREKesFwcsDmspqoFAkAc/NmZYPF+TmLQ1eOvKYHuZI5xZ3ggL1wH4espLRMRmzntJzipeQ4K7FeiWCdUnK4E112WHewxGhZFbmREOCDf6jCfVWTyrKNXPtUZM7L5zUQBOUXSsfekIR2KklRz/xh60WtZmiLdLMwYuOKjCATGpEYn9SSV3zkoGV8Gm7xG3P0A9ZUEjnSG4AtApzAI9v5sL5MLHwSTMr2B2CZGZkrTA4y2dzMMyfTbM1Yqz1tZCOxyUy4aggkQXmCeuV3ozfORuZPSaOOAFwVGhGaPAoFQPjIOLgCyWoZYXrKTmWaXw+wlySRwYmFm71LiwtitMzJJHPql0URleLZBPz2VdYI2wu2UvDxJkcwCKoZ3nJBvnFIwsufgOXcyjWzOB595EvGkWefQ0c6LXxa5APiwYnJRMKcmiuXdVU8ANDV1RMhMgLsJEX/ZzLLBjfTanVUVz4fuPT3VJDvpw1E80aSe3QDeTKiciluJi/9AoKMpE/Acmz8PClRRfwWiUQwfn4MD//7l9GRKufRpZJxtJVipla0LManZtGRUi3LO3t60dnTJyqMruVzuPm22/Gz978LiUQiwlOLCIlEIgKYPiFVVSOek0mjQbwcVZR4fTl0zTO83yxoXoJqAPINz5c7PRBAhTfxpbpfmuxG5aEMqWS5rtKKlkWbmsT41Cym5ubEBKM0NftQ/xz27MiIGuorWhbXXLcLra2t2LKlBYbBzn0Tmjg13xcuoShi+5pGgZvs4JsAPgVrNIgKbyM38uHrVNquEnlVa7tuGOwvCKgwnxonKD6LMWCSDkeSFYbjU7YDQJtq1sZaXV2F4Vbk30DFc7euaxWR/iqtB2k9eVktpUz4QIxfZUz8QJPdq81HUFUmQfAtAK4EuvnFA9DIBav1hl4P/DB7XPppGIYlyj2VjNtIiky/ZDwu5ujjE43W1Q+Cy7mreB/Ues5lwnIiJLgsqwQ6j35dd4JffrQmE3HNR1BV4PT2tJFKHZCdwXK7AGpXQXw9P99ETWgKkVKqRE7tKpW9tZenEXB6uGs9Viezq0KakuXTC/h9zb1uLwDqPnAEJb896yElIiP+SaNBq6urtj9qX/ytrVWPNq/3jbse+NF2pTYNe3gC90O1ScnFZOJxU69djQs/VKVg1Kr9c1M+tZhtbu15BT9VU6VjWG97fqs8D9BcTvIqgZj1jsjJ6ohHbMuf/Hf6lH+jPlicn4B/JpyL47XZbirZB5XN5y3kBMAy0ShgreFeF+Qg22aD19enlqT1yxhNqaDcSMgtJ0oGEQuRCldJBPk3/ru8PS3jfxaz0g+57HYzbvRNGjGwZqxZVA/3P8nqiVCT/0me4bbq+mj+t77XfdsIRd7EaC4FVQeqkRMnIyc/k9N6butU+q21tdVaMhh1DCsHFOQkTyXjNvUEwKaegLL/aVnLr8/EC7Ep0VwKqsaHuho5AVb10ygqPVCyKWhRVUGErGqMCFZXVy0zBRM5OYGP4pnrmgQmm3jUdog6Ua/qDDg2hqAuwUmtpH6cIE8lxT95oi3VD6c/vj8bUa2twTGVyIvz4VUb9OfUZsRAZB0cwhVUqlQPnRQUYE7TVdALRqTWxp366dU95dRWo23z/vrRTy/adjunXrRby7IasTEE5fGb0slH5eQ3coMbCTmtR+TEPwHrLMP8Tx4FBCCISowCenE+1tuGXLKD/vj/ln2Y/6/lc2KxUxyUG0hBNQS5n6JvJTTyQFG7XpYy4f11ams9/XVKV2qkn/L5q9bn9bRbaVmN8IegGmHiGo9FDjdobW21jNI5wanGNycfJyKqpKyq7UcmKkBSVs2g1tdxnSqZeIDVQZ5KJoV552jm1dI/uZ/yDV/rA1Dp7b6R5uZ69uUlgVY6l00GfwiqUSZeT5BeCURUTnAiHblOktMyvm01yKYgAEdVBcDuq9oIwlrvw81QTUE5OcmBspnH1VhVeKUYeFvVljULnNSuF3BSzk2K5nKSc8hBjy7n0C3twYmk3IjIyWyrtG09kP1Vbr6qquTklJ8mL6uV4PiNX4N60nUdc6urtkoGtZh53MTjCkoubLeh8NI3FMJXNC9B1QknopJJiqsg2fHNP6uB1zFy+s4/+e9ViYrHVHE4PUuNPF+yL2cdb9BqZp4TuKP8ksJLNeIngtBHnxEsgqrhern5pjhZycqpFsjF1eh/t+8ycXGyqmT+2XIK6yUij4NGDVvJARNETrU6y0OEWA+CRVBAzZG11RRVrSTlRj4xJWZRSPQ9VqoeGXOoIsnXK+gFo5L55xqiUA+8iEQohQKkizy2KS8+61VRAHAxnwmDNUPUBH8Jyu9s6RoSRImoiKy4mqpETk7ExJcX9AKcyKhAs6ZUmPWWkMksV1RVQH3J0I6o1bdVYd2CXjC4/4hHkvuqoNx8bH7cV16150e/qlwfz9pvQvhLUH7lTVGb8omV1VWFfctEJZMV1cCWVVPpN5SWWT6rQUwZVXjZMqkkERVXVQBsZt+6y8o4PejrvClJMdVDUk7pMFVRqX9+3FdetedHvyhZ2A80eW5jYHPxALifWMP5d6cyLTyRWA4voOL9zKSj5TV1j0jIadYUeYom9t2x916m7gjIIQ413qjctKtXQYmaUPI5rHX/vM+NPFgu90hTIkh99RjB80FVg5zxXiE8gcNJTZGKKpFU1V1zhQRYp9/mn3wdpzb0wstCVckR6oRLVaLYzf/kTcR49f3b1l8vmlw5WBCkvnqMYCuo9aIkmYmkZDXFQYpK9kUBlRWS0ySX9cb+lMjKKLXtqKhqnoa7XlRQNE5mXSqZrKnECvmyKlbVrAdOJHW5Psx1qNzLBZefgnKCfFGlm9ot0LO1tdVRUREqKSQirHpIyTWtpg5F1Yiqsm3rEszIVVR5WX0KanllWdqXSx/WA1mFNbETuC5sMnICNquCcgBXU3xqKgdVZXGeA3bTTv5eCU4JybScf9J3XVEqKio6Brfjc0UE2NKyBQBw8eJFLC4tGjNTFzA6MowXjhzBxPRcTcdTC1a0LA4//R3svG63ke5IR1q2lAMnPVWClUiq1oc9nKvukiIYMwvL8CrRUXa4Sjex2/ThgEkWTiRVK3ji8npigkR6TmnW3UohEzLJ0pTgFONUKBQwPz9rzMxM4dTxF3HmxEkcf/57mJiew/jUNADThOOpLhw0YcLU3JxjHt5Qfx/27BiyzI0HAOrQEG7dsw/7f+iHsGPnLgwMDEZiMXOE1MBaKeLbYYd8FHe9I1yWfM+QhJoVG0tQXtwIG3EzsRveSY24EZWr49slAbkeFPWC4xTigJ2s3NYhosrlcpifnzXGzo/gzKkTOHr0KM4dP4bxqVkAzuZaJYICgPGpacda5IBJUIN93QBMcrL7r8yZiK/dcwP27r8R1+zche3XXIt0RzqyZYup6gzDsASutrS0WH0yjZKUF/CrQkBAKg8IeNjfYCkoh2qPvsDlZq9FUVnMPAdCqpeoiJj4pxNk8pIV1dLiAk6fPIYXnz+KF8+PQBsfx/jUbM2+Iyo8x9GRUrGU0dCRUl0JKpvPY9f2bRjs6xbKyYmg+LJUMo6h/m5s270f1+/dg+t27cXQ1u2RRCIBQVhrRmPT2vv1rNML1KsXKW+P4NV9v1HPUwMIFkH5jdL1qnTjV1JURDycqOpVTTIR1UJO1ZDNZfFHf/pJPPvNQ2Kkza0kCmCSEScuUk9ERvQJlM27TDZrGcXj7ZOCIvXECckaquAc+JlKxrFt+3Zcv+9G7LnhBuzYuQtdXT0RVVURiUTMfMFaFFQ1c7D5ns9Nj81HUJXebHX6NNwUlaymnEjKSRk5EVO9KBaLiEaj4hMAjhz+Ln7rN3+76rYyMQGVzTNOVKSgCERQ2Xwe/d3dGOrvqZi7x8mpWhDoYF83urduw/79+7Hnhv24+urt6OrqKfuv1ktY9RKUrG6aUIEE3b+2+UbxKl2sOh2ufLQPKM+rVzKvIpRQDJgk5aaE6H++vBZycoslkpcf+sbXxXc3PxEAm2oa6u/Btu3bxbJ2NYNlLS9G9Cr5pDhZTc3NYai/p6bEYk5OToSVSsYxMT2Hiek5HH3usDAHB6/dY+y7ab9kDrbAoJADp2vrWf5dExNAM/etBmw+BVUJDdywRFSyXwowc+3o//WaaYAzIZFacvt/8sJL+PX3f8BCPkRSTmRF5tyeHUPYEk8BAFriCfMY8zlczJskJaspWUHJSMbjuG3/XttynqfnpLBkouKmoRN5talJdPb0WsxBy+gglY/xKsAz4ArFhiYLBt18Cqoa6E3bgKnXCLiJVuv6lf5/+sknbWab09TkgElOe6/dhs6eXsvyhBKDtrwIANgST6Fd6kMmm0c2n8fSShYdbUnxCUB8z+ZNUhvq77YdA5GUk8Liycn8UyYz+r6iZTExfRwvvHgcqS8/TKODxnW7d2HfTQdw1dA2pNRUmbDWuPOZ7bjWh/RyIiegqcgJCJKCcmJ2L9heHqqOSL/VgFp8UVw91UtCtUIvln1dxeIq8rksPvE7/x3Hh0ddtyEVRbFKpJoAQG1PC2JyAqmpY2dHMTU3h6UVk2hkkiIk43Gh0EjtAGYCMS/nsqJl0aYm11cFgcHJTNy2fTuuuW4Xdu3bh53X7UL/wFURNaki0sKc7V48pF4lNVNb/MXpJZzueS+fqQYRHIK6FKjD5HMz8WSCWi8p6UUdSlSxfHIUi3wmZXMfw6dO4KGHfsdiyslmWH93N/Zeuw3tahxb4ilczGcsJFUJF/MZHB8ex/jUNPbs2IY2NYnHnjnsSE4EN5OSE5YMIqpaSauWQnptahLtahzt/Vuxc/cui7NdUZTGHrJKL70QdSEYBOXl28itfacbqgGC4gGcWmalJnJyI59qIHIiYiqWyHBudgYPf+4fBGkAEMSRjMexZ8c2YXLJpOREVHwZkdNSRsMdt9+KN779Z5BQU/iD3/4Qvv6dw64ERfsGnB32tRAWsH6V5bYNEda23fvx+je/Fbt332DeBeu537wujyK312Qqx892g+GD8vsNFJG+1+ksdxrJI1CogUxObmRUjZyKxVVEo60WxQTYyalQKCAWi+HOH7sX3Vu3YW5sFMfOjiKTzYrQAfI1XcxnLG0REckkRcvGp+YwPjWLof4evPPBB3D7j9wJwHTQP/je92F86iFMzbnn7lHwZioZF8GiRFaZbFb4zCqZg27kVYm0+G/0nT5p+aEnHkNUUbDj2uuhRGuvWW+B38X0nNqv11nvW6Cqt80Fg6ACBHnuO+57ciOjaqpJJqVK5CQj3ZnGrbfcAm33HnT2HMbC7IxldhVORgAsCon/DgALszM4dnYUAHDXwbvxlrfdh+7uHtbPIvbecBPuv/+d+B9/8qeux0N4z3/9IGKxGM6cOoXjJ46LdBsiKJmsANgISyYqTjr8k//mth61Nzo+hoyWMbo6u+p73C6lOVcLOQXQ3AwJygnrzO/i5MQDNYvFoo2AOCk5kRMnJU5OTuopXjKTWlujyOeyKBQKlrzAmalpnDn6HJa1vCAnIh3+eTGfsakpWTXtvuUA3vWO+7F7740ijEI2Xw++5rU4/NSTeOyZw67n6uTIKP7+C5/HQx/6MHbvvRGv0XUsLS3gwkvjGD59Gqde/AFGR0YEYXHSIjgprKH+bixrefHJCcyJqJxQXJjGzNQFdHd1wWVSG2c0+8Pf7P1zQDB8UJcKNdyc3LxzGr3Lahlkc7X5SdxIqRKi0VYkE0kk1RSU2BXQMitYWlrAyvIyJifG8f3nDmPs7CkAsJCTrJgAZ78TqaaOlIq33Hcf3nzfz2CgfxBrxppjzBdglkQ+euRZ/Pr7P+Bo6vEYrF968AH81Dt/3pYMXdQLyOayuPDSOE6++CKePf4iJk+eFtUVZPBk5sG+btscfPK069UU1s/+0nvw2nt/cv1+qI3A5RaD5YBQQTnBo/gnXdctysJNBTmZb5UUE2F1tYhotBVRJYZUqh2KoiDdkUZXVw8OfesbOPSNr2NhdgaA86SZnKjofw5SMHfcfivuf/f7cOONN4NGuFpaWqAoCiIRwDCAWKzsr1HXVPzonffgwXc9iI99/I8AlElJxj9+7vO44cAB3HTgFgvJRZUYOpQYOjo6sWfffrxeL2Bufg5jI8M4dvQHOHv8BeFTA6zKivIDubpymzTUSWEBwNjoqOknrGPuxA2Hl0nJTQr/FJQf+UmVMrobuVDyth7EP2UyywZXT06qyI18qqmn1dUiWlvNPLtkIoGOdCe6unrQ2tqK6elJPPrIv+HwE/9pMemqQVZSx4fHkUrGcd/9P4fXvP5NNnOHiMkJdE8tLi3ivb/2K3ji0f80+8qUEx/Bu23/XvzxX/9/6OrqiQDVk65JXc3PzmB05BzOnDiJsbOnMDE9h6WMhkw2a6u+QOpKdrgDdnUFANfuuQEf/MjvRlIptT4zT4aXz4GXlRKcqqV6TXgetBWaeID1RK4jtICwuroqzDsts4JcVkM2l/Owo2Vyos+O9naku3oQU2J49plDePjf/hVzY6M2YuKjcrKfif8+PjWHTDaPu171KrzjgXfh2p27AJiEBJRJSSYoy/8RA2sXzX+OHHkOv/Er78bJkdGKFRTe+5534wMf/G1R/wkwYBhlsnMK3wBKddt1HbmshtGRYeG/euHF44KsZMgOd8DubL92zw14/3/7bXR3dUUaJigvySko8Ki//ioov06ol7VxnPrZgIKiB2hxfhbZXBbF4qoYZSNwguFqqBrkbaLRVvT29mNmZgpf+/eHcfS5ZwDYzTl5ZI6W8f8pInyovweve/Nb8RNveisG+gdr8r9EIoABh/NYIqrPfPqv8Acf+0Ox2ElFpZJJfPyTn8C9r3tjxFgz3IfSCaV9yQQGABktI8oVc4c7gchoLd2J7tZWqO1ppNNpdPf3QVVVdPf0YsfOXRgaujrS0rKOelP8nmr0OfCrZpOsxpqUSEMFRWgg9gmwm3dLiwvI5nI2cqoGJ/KiNojIOEG9+PwRPPW1RzA+NWfztchmmwwiKQq43H3LAbzxNa/FwOAQooqCgYFBdHX1QE2qJmGUbj5TTVkDxhwJqgRN0/Dh3/x1PPLl/6h47Ht2bMOf/fWncc2O60xiaOBmj0QiMLCGtYsGcrkcMpllgyqb0oQWvFRya2srWiItiLSU92cr27IRAqaZS7fI2ABVFxKUjHWaeERQGS1j0EhaXnIKF3Ud0RqcrrKyclJOF14ax5OPPYYXnz9i86kA7uTEl/MRurte9SocuPUWpNqsqcAJNUUpIFBiZn8iaIHTiXIyhdbW1tDS0oITx1/Af3vvL1fMCwSAt735Tfjw7308oqqslIv8IKznwYgYiCDiTqTVrvul5IugmXceIiQoggcKijvHl5aXsbpaFKTEyakSUbkpJ77s8NPfwdNPfMMyLF4rObXEEyguTFt8TXe9+tUAzMkTnBCLxTBw5VXo7b8S6Y40tmzZYk5qAJQfevrudB5Ly77w+b/DH/7+H1QsM5xKJvHBD30Qb3/HAxGgVHvciweU9WtdpYKDzA8BJriQoAgeEtTMzBTy+Xzd5OQGUlITYyN4/PHHMTc2avldJic3cw4wVdPE9BwG+7rxs7/0Htxx16sjiqJgfn7WOH9+BIvzc7aJSGOxGAqFAtRUGwYGrkT/wFVQVdXiH4mAm0bSzg3zfOVyOXz4N38d//SFf6noMB/q78Of/9+/wU03vSJiGIbnBFUXLtVzHWBS8RIhQQHrunmdCIrMu9nZGeRdgjPrJSqKDj/89Hdw+KknHVWTU7ClU+rK8eFxAMC9r3sdfuqdP4+rr95uuf6rq6uYnJwwxs6PQMusOM6YDADprm5h9vFpohwVlGE9X6dOHqvJ1Lv31a/Cx//8U5FUKgUa0WsIbiERbjMze1XeJIDpJc2EYBNUoxffyWdSg/x3c5DT6NHyyrItL46UFP8uqysnjI0M49A3vi5GodzIyS1FZUs8JQIu9167DQ+8/9fwo3feUy4p4nBcuVwOU5MvGWPnRxzNPiIl2exzJBLJtAKAL//bF/DRjzzkGgJAcUzv/pX34F3vfv/6RtLc0My+JjdsYpILHkHx0hNeXjgP4p/IvFtZXq7aRjVyymkZPP3kk3jm208CsBMToRJBkTkHAG9405tw3zt/HgMDg+KaVyLiNWMNi0uLxsi5s5idnrSoKSIowHSiDwwMYmBg0HSiVwjZ4CVpPvmxj+Jv/+7vXfcPmKbe73/yj3HnXfdEjIYlVMDhdQmXgCB4BOUHPPI/zc/PGpOTE0IpVZpsE3BXUsdfOIrDT/wnxqdMcuFBhNUiw52Sez/w7vfiwIFbI0pUsfS9FqW4urpq8U8BJkHJx9XW3o7e3n5ztM+JdA2rOTU5NYHf+KWfxzNHjznum5QURZlfeeVV/pCU1+pkE6sdPxASFKEBkiL/08zUBczNzbpOKeUErqAW5+fwzKFDOPKsGXApRzfXSk7ka3rLfffh7fc/UI6GrnCMjqZtSaWSg3tq8iVjbn4OOS0jjkf2qbW3tQuzj6ZYB2BTAJFIBI99/Su2CR341Ff0/ZcefAC/+qGPRJSo0rwPf0AKwAUNIUERGnCUc5WR0+wjaE4kJaun4y/8AEefekLkhcnO8Ep5dbJquuP2W/Ez7/ploZoArKsQn9PxcqKq5FMTQZ4Uz8QfNKOszv73n30Cf/l//sqyH+6HInz8k5/Aa3/8Jy2PasV0mxCXBUKC4qCHSL7JXR5u2ak8OXmh4tTkTiQ1feElPPPtp0RJFKdaRZyYiKg4YdFcdalkHG98+0/jDW++z1RNXl/aEj2srZn+KVKMdCwcRV13N/uYuTc9PYlf/83/ime/eci2O05QQ/09+LO//jR2Xre7bOpR8KWBcFj+MkVIUG6o8U2sF3Xouo7h4VPGfKm0iRtkkjr6vcO2gEsOTkBuKoqrpvvf/T4cOHBLxNG08hIlwtaLpt9tYuIlEVYhE1VraxTJRMJi9snm8Xef+Tb++wd/Q9R64gqKf4ooc5Z64xocGuKygIfjty5wKusQBNT4Mm5tbUUms2zIaS1O4OpqcmIcX/vyw67F/zkROZHT+NQcvvP8CQDA+3/tA/idT/45XvGKV0aAkjqp4nMSiKB+H0ep3dbWVvT1DUR27dobGRi40hJKYf5uBpguryxj5NxZnBs+DS2r2Zp75W0/inc++ABSyaQjOREe/erX8PAXP2cQwUUadc5EykpM/HkBuV233+tpz+nPiz42OfwnKJ7V3cxooH9yMKNbygjH6NlhZLLlkrTySB35ouiTk5M51dMs7jp4Nz72Z/8LP/fAuyNd6a6awgcEZGKKOCyrgpZIC1oiLVCTKq7ZcV1k53W70dbeXpq4QcfqalGk66yuFjE3P4eTJ49hfPw8cqUyNK2trWhtbcXb3n4/7jp4t4WU6JMv+5v/81c4cuQ5w0wGrhLAWe2aihI7kfKfl3Brs67JDQx7P+tto5Z98HPVRM/qxlTU9LKUA4eXpSfWiZZIC9Id6ci+fTcJP1Q1FPUCJqansJTRMNhXnmlXLqAmqybua3rPr34A977+zRE1lRTnoaXa+0Y+XW7ns17zMGLuu6uzK5JSU7YBAz7it7paxOTkBHJZrWz2tbQglUrhl9/zPsvECU4qanxqGn/3V3+B7ddca3R3dUeMSp2sdH/wqgF+VhDwsricV/2U25PhVQkjD47dfwUFeHfh+ZvOy5vJg/ZIRdx84NbIjp270NbRaQstKBTM6aAyK8sV8+lkLGt5HB8ex8T0HG7/kR/BJ/7yU3jLT70jkkgkgLVIZXOukjKqdj5rPSVs34qioK9vILJv302RgSuvAsDmBSwpK8D0Xy3Oz2JxaRG6rsMwDOzecwPe8a5fBGAfyeOhB4eefhb/8rnP4uLFizV20KnPEWdl4gUs1VnX2S4nIy/veSINpz+v4KHKa+6a5H4oJq/flpGySdUSaYGqqlBVNTIwMIj5+VkRWa5lVsQmhUIBE9Nz4qGTp/7my6hW095rt+FtP/cLuOe/vM4sRbLu5Fe2oSfnk9oqf9J5uH7X3khHulMEedJcfQQlqoicv1SqHYlEAve+/s34/nOH8YUvfsnRxCN87u//HntuuNG4486DkZpihWTFFIQRv6D000c0N0H5cXE89zNI/5eaVxQFA/2Dka6uHjHStbK0gMzKMhYXFkVh/xUta3OIAxBR5PtveQUOHjyIW2+/A319A6YTfK3GciFuqmk9kzy6pVoYLt9hlkrp6xuIdHX1YHJywhg+c1KoyFgsZoYiFHV0dHSiUBpAUBQF73zwF/Hi80dwfHhUOM5lLGU0fOqP/whbr95ubNt2TfUocy9UzUbCrY8NV3UIwLEzXD5hBpciZaGSWSX9phd1ZLSMMXLuLE4d+wG+8sV/xjNHj4npx+U5667fdyPuOHgPduy43izcv4a60lREPxpFtfNQhRd4n3O5HMbHRozJCy+JgQRKm6GYKZqd5tFHvoSPfuQh13Y7UiqWMhre+pY344Mf+d2Ip7Ov+JXvGaJuXD4EtZGQoqJrBT2si0uLxpnTJ/DYV/4Dx5//npiCvLOnD3v334gDr3glrtlxXWTLlhbUHWy5UQ/TOk1MOQmZQ021obu7Bx3pTiixK/Cp//nH+Od/+WLVNn/3Y7+H1//k26zxX14hJKhLCv8ISn6IvbrIcrS31+2ud1sJPLfNSfnwtJFisYhEUkVXV08kkUhAlBdxqARAbdhy59bTdyeSqefc1pvbx5brRd1Se4oj3dWNgYFBFPUC/vSjHxLxXjJIRQ319+ATf/kp7N59Q+XQKLdr7PTCaeTebaZ7s962m6xqQqigvIJbmkw1SDeHawG1atuuF+t9kaxTRXIQSctmH1AuMzw6Moz/8Xu/J3x2bnjDT7weH/69j3tr6gHNoaD8etkHABsTZuAFDOnTqzb5nxftNdIHlIMfq8Krm3S9N74c5LkOUJDn9bv2RvYfuBU9fQPit0KhgNGRYaS7unHv614nJt50QkdKxezYWQyfPWVEIqwz8vXg11m+9pX8ibVCvke9uq94m177WZsnJtMRwSGoiPTpVZuV4oTqbcvpey37r2UbL/vq1v4l2r4l0oKudFfkxhtvjtx04BaoqTYA5qScw6dOoL2z0xLQ6oQt8RSefOIxaxS/m6IlMvb6nMrX0st2/brmTa7GgkNQQUA9JOW07kY6uP14c8rH5HQ8FY5RiZqhGTcfuDWy87pdSLW1I6ooyGkaOnt6bSqK/ifyOn7iOIbPnrIHl/P/A/BQupKqV203uWriaO44qCCiUdNnIx4eP/cht12JpFyc9KpqRuX3D1yF8bERg2KmFmZnLL6opYyGjpSKzp5eXMxncDGfwdNPPYkd114PS3G7jX4BNIo6ib3htpsYG0tQQYuMbeZZXv2eWt7vY670Fi/9Rv6p3v4rjb4rr0JUUbCiZTE+NStG8GTT7+jRo7jz/Dnj2p27IkFSCiGcsbEE1YwPuhN4vlKzws++bcRxu0Wkl/xDlPhM/qnUgVsxMDBoJFQVj3zxnwVJtatxy4QRa/kcxs6P4Nqdu6z7uZxGv4L2om8AwQozkPPI5Kzp9SoeL6bWduurl9nytbSzzmnBfakMUW+bNZCIpml47D8fMb7wmb/FipbFtu3bobanMTg0hB3XXYdt23dgaOt2s6gdUFs0uHxe13s+nI7di2vvVHXA6+ogXpdv8ai9YBGUGxo9IX68kfx46P3oI8HLJFofTWO6X8fHzxuTkxPo7upGuqsHKTUlYqBErmLVgQqfHlBq26tz6gdB8X41sSvDf4JqdjnqeXUDH5QTb7tJ33S+tFdlX5GSGbiu6ai8JBC3tpuxTbfjbtLn9PJQUCHqh9c3fIgQPiCMg9qs8LKIIOFSlYoNR+suW4QEFcIbXEolFQq4yxYhQYXwBqGZF8IHBI+g/Ega9qO9jUQjfffruP1o1ylNw6/9XMrta91HkO/ZGhEsgvKTlPwQAH6RqYxG++53Xp6f7TayHy8qGPixPYfh8t2rnMJmJHgGfwnK69IoHF5licslOLyE1zeql+qB2os4LGtmeNk/Xu3Ai3arlW5ZDyrlLXqFJr7vwzADP3A5pVU0E/w4r+G1amoEy8QLsbnhV02kZkOzq9gNREhQfqAZb/oQwUF4/wiEBFUNTTRPfeARhHMZhD5uFJrgXPhDUJfiwPza52aN7/HjfAbhXAahjxsFPypc1Al/CMrpwLy44SNG+a+WfdbTrtN3L9qj/708fr4Pr/vrZYKz1yTHr38zn1M/+0j/ewH52Bvdh9v1kasm1IGNK1jnxQ3v59vNy4dpI7PEvTqvzUxMHH7WrfI6P9GPl0ejNatkeDnFutw3+fjX0ebG+KCawJZ1hFdvuErtrvcmkm9MP9QIb9srYvK6xlK1N3sj58Ut0blRNd6s9zuHk3LymqA9aC+MgwoKNntZk81+/JsU3ikoL30ifiNIfSV4aTZ4Cb/702zHG6IyPL5eoYIKESJE0yKMgwoRwglBEG5ByJ1sEOHEnSFCOCEI7q4g9LFBBE9BeZnR70c7bu16nS3vdX+9btdw+e512161ZcC7a+XnufQS8jE3oRrb3D6oIGayB7HPzQyvzyc95EG7Rk16XwVHQfnJ8F6/7eQ3qJf9bsKbaMPgx/XfLBUSqqEZix5isyuoECFCNDWCo6BChAjhDZrQ1+SGkKBChNhsCJAJGhJUiBAhmhYhQVVCUNIs/CgRE6L5sAmvUfAIyq/qA05oNDl1ozLbvehnmIjrHbysBcXb24TXKHgE5XUxPD8uPC9f0aw3lV9F9bxuayPgdV/puntZvsSpvtImQDDDDDbp28Q3Mt2M5zIo2OTXJ3gKCticF2wTvj1DYHPe6wxhsnBQ4MeNusnfziGaH8FUUCG8QUhOIZocIUFdKoQWW4gQVRES1KVCKF5ChKiKkKBChAjRtAgJKkSIEE2LkKBChAjRtAgJKkSIEE2LkKBChAjRtAgJKkSIEE2LkKBCNB/CtJ4QJfz/ZnDUKIJH4c4AAAAASUVORK5CYII="
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

// ---- GameFilterComponent ----
// Filtering by timeout (preset buttons + operator/<=/> + custom mins)
// and by ELO (operator + value). Emits a `filter` event with a filter
// function that callers apply to their games array.
const GameFilterComponent = {
  name: "GameFilterComponent",
  emits: ["filter"],
  data() {
    return {
      // Timeout filter
      timeoutPreset: null,       // "blitz"|"rapid"|"standard"|"daily"|null
      timeoutOp: "=",            // "<"|"="|">"
      timeoutVal: "",            // custom minutes string
      // ELO filter
      eloOp: "=",
      eloVal: ""
    };
  },
  computed: {
    activeCount() {
      let n = 0;
      if (this.timeoutPreset || this.timeoutVal !== "") n++;
      if (this.eloVal !== "") n++;
      return n;
    }
  },
  watch: {
    // Re-emit whenever any filter value changes
    timeoutPreset() { this.emit(); },
    timeoutOp()     { this.emit(); },
    timeoutVal()    { this.emit(); },
    eloOp()         { this.emit(); },
    eloVal()        { this.emit(); }
  },
  methods: {
    selectPreset(preset) {
      this.timeoutPreset = this.timeoutPreset === preset ? null : preset;
      this.timeoutVal = "";
    },
    onTimeoutValInput() {
      this.timeoutPreset = null;
    },
    reset() {
      this.timeoutPreset = null;
      this.timeoutOp = "=";
      this.timeoutVal = "";
      this.eloOp = "=";
      this.eloVal = "";
    },
    emit() {
      const preset = this.timeoutPreset;
      const timeoutOp = this.timeoutOp;
      const timeoutVal = parseInt(this.timeoutVal);
      const eloOp = this.eloOp;
      const eloVal = parseInt(this.eloVal);
      const hasTimeoutFilter = preset !== null || !isNaN(timeoutVal);
      const hasEloFilter = !isNaN(eloVal);

      this.$emit("filter", (game) => {
        // Timeout filter
        if (hasTimeoutFilter) {
          const mins = game.timeoutMinutes;
          if (mins == null) return false;
          if (preset) {
            const presetMins = TIME_PRESETS[preset];
            if (mins !== presetMins) return false;
          } else {
            if (timeoutOp === "<"  && !(mins <  timeoutVal)) return false;
            if (timeoutOp === "="  && !(mins === timeoutVal)) return false;
            if (timeoutOp === ">"  && !(mins >  timeoutVal)) return false;
          }
        }
        // ELO filter
        if (hasEloFilter) {
          const elo = getUserRating(game.blackPlayer);
          if (eloOp === "<" && !(elo <  eloVal)) return false;
          if (eloOp === "=" && !(elo === eloVal)) return false;
          if (eloOp === ">" && !(elo >  eloVal)) return false;
        }
        return true;
      });
    }
  },
  template: `
    <div style="
      display:flex; flex-wrap:wrap; align-items:center; gap:10px;
      margin:14px auto; padding:12px 16px; max-width:600px;
      background:#f9f9f9; border:1px solid #ddd; border-radius:8px;
      font-size:13px;
    ">
      <!-- Timeout preset buttons -->
      <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
        <span style="color:#555; font-weight:bold;">⏱</span>
        <button
          v-for="(mins, preset) in TIME_PRESETS" :key="preset"
          @click="selectPreset(preset)"
          :style="{
            padding:'4px 10px', borderRadius:'20px', border:'1px solid #ccc',
            background: timeoutPreset === preset ? '#2e7d32' : 'white',
            color: timeoutPreset === preset ? 'white' : '#333',
            fontWeight: timeoutPreset === preset ? 'bold' : 'normal',
            cursor:'pointer', fontSize:'12px'
          }"
        >{{ preset.charAt(0).toUpperCase() + preset.slice(1) }}</button>

        <!-- Operator + custom value -->
        <select v-model="timeoutOp" :disabled="!!timeoutPreset"
          style="padding:3px 6px; border-radius:4px; border:1px solid #ccc; font-size:12px;">
          <option value="<">&lt;</option>
          <option value="=">=</option>
          <option value=">">&gt;</option>
        </select>
        <input
          v-model="timeoutVal"
          @input="onTimeoutValInput"
          :disabled="!!timeoutPreset"
          type="number" min="1" placeholder="mins"
          style="width:58px; padding:3px 6px; border-radius:4px; border:1px solid #ccc; font-size:12px;"
        />
      </div>

      <!-- Divider -->
      <div style="width:1px; height:24px; background:#ddd; margin:0 4px;"></div>

      <!-- ELO filter -->
      <div style="display:flex; align-items:center; gap:6px;">
        <span style="color:#555; font-weight:bold;">ELO</span>
        <select v-model="eloOp"
          style="padding:3px 6px; border-radius:4px; border:1px solid #ccc; font-size:12px;">
          <option value="<">&lt;</option>
          <option value="=">=</option>
          <option value=">">&gt;</option>
        </select>
        <input
          v-model="eloVal"
          type="number" min="0" placeholder="rating"
          style="width:68px; padding:3px 6px; border-radius:4px; border:1px solid #ccc; font-size:12px;"
        />
      </div>

      <!-- Reset -->
      <button
        v-if="activeCount > 0"
        @click="reset"
        style="
          margin-left:auto; padding:4px 10px; border-radius:20px;
          border:1px solid #ccc; background:white; color:#c62828;
          cursor:pointer; font-size:12px;
        "
      >✕ Clear</button>
    </div>
  `
};
