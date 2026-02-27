// ============================================================
// engine.js
// Pure Reversi game logic — no DOM, no Vue, no blockchain deps
// ============================================================

const DIRECTIONS = [-8, 8, -1, 1, -9, -7, 7, 9];

const APP_NAME = "reversteem";
const APP_VER = "0.1";
const APP_INFO = `${APP_NAME}/${APP_VER}`;

const TIME_PRESETS = { blitz: 1, rapid: 5, standard: 60, daily: 1440 };

const ELO_BASE = 1200;
const ELO_K = 32;
const ELO_CACHE_KEY = "reversteem_elo_cache";

const MIN_TIMEOUT_MINUTES = 1;
const DEFAULT_TIMEOUT_MINUTES = 60;
const MAX_TIMEOUT_MINUTES = 10080; // 7 days

const LIVE_DEMO = "https://puncakbukit.github.io/reversteem/";

// ---- Board helpers ----

function isOnBoardGeneric(from, to, dir) {
  if (to < 0 || to >= 64) return false;
  const row = i => Math.floor(i / 8);
  const col = i => i % 8;
  if (dir === -1 || dir === 1) return row(from) === row(to);
  if (dir === -9 || dir === 7) return col(to) < col(from);
  if (dir === -7 || dir === 9) return col(to) > col(from);
  return true;
}

function collectFlipsForBoard(boardState, start, dir, player) {
  const opponent = player === "black" ? "white" : "black";
  const flips = [];
  let current = start + dir;
  while (isOnBoardGeneric(start, current, dir) && boardState[current] === opponent) {
    flips.push(current);
    current += dir;
  }
  if (isOnBoardGeneric(start, current, dir) && boardState[current] === player) {
    return flips;
  }
  return [];
}

function getFlipsForBoard(boardState, index, player) {
  if (boardState[index]) return [];
  let all = [];
  for (const dir of DIRECTIONS) {
    all = all.concat(collectFlipsForBoard(boardState, index, dir, player));
  }
  return all;
}

function hasAnyValidMove(boardState, player) {
  for (let i = 0; i < 64; i++) {
    if (getFlipsForBoard(boardState, i, player).length > 0) return true;
  }
  return false;
}

function countDiscs(boardState) {
  let black = 0, white = 0;
  boardState.forEach(cell => {
    if (cell === "black") black++;
    if (cell === "white") white++;
  });
  return { black, white };
}

function initialBoard() {
  const board = Array(64).fill(null);
  board[27] = "white";
  board[28] = "black";
  board[35] = "black";
  board[36] = "white";
  return board;
}

// ---- Game state derivation (blockchain replay) ----

function deriveGameStateFull(rootPost, replies) {
  let _blackPlayer = null;
  let _whitePlayer = null;
  let gameStartTime = null;
  let moves = [];
  let timeoutMinutes = DEFAULT_TIMEOUT_MINUTES;
  let timeoutClaims = [];

  try {
    const rootMeta = JSON.parse(rootPost.json_metadata);
    _blackPlayer = rootMeta.black;
    let tm = parseInt(rootMeta.timeoutMinutes);
    if (isNaN(tm)) tm = DEFAULT_TIMEOUT_MINUTES;
    timeoutMinutes = Math.max(MIN_TIMEOUT_MINUTES, Math.min(tm, MAX_TIMEOUT_MINUTES));
  } catch {}

  replies.sort((a, b) => new Date(a.created) - new Date(b.created));

  replies.forEach(reply => {
    try {
      const meta = JSON.parse(reply.json_metadata);
      if (!meta.app?.startsWith(APP_NAME + "/")) return;

      if (meta.action === "join" && !_whitePlayer && reply.author !== _blackPlayer) {
        _whitePlayer = reply.author;
        gameStartTime = reply.created;
      }

      if (meta.action === "timeout_claim") {
        timeoutClaims.push({
          author: reply.author,
          claimAgainst: meta.claimAgainst,
          moveNumber: meta.moveNumber,
          created: reply.created
        });
      }

      if (
        meta.action === "move" &&
        typeof meta.index === "number" &&
        meta.index >= 0 && meta.index < 64 &&
        typeof meta.moveNumber === "number"
      ) {
        moves.push({
          index: meta.index,
          author: reply.author,
          moveNumber: meta.moveNumber,
          created: reply.created
        });
      }
    } catch {}
  });

  const board = initialBoard();
  let appliedMoves = 0;
  let turn = "black";
  let lastMoveTime = rootPost.created;

  for (const move of moves) {
    if (move.moveNumber !== appliedMoves) continue;

    if (!hasAnyValidMove(board, turn)) {
      const opponent = turn === "black" ? "white" : "black";
      if (hasAnyValidMove(board, opponent)) turn = opponent;
      else break;
    }

    const expectedAuthor = turn === "black" ? _blackPlayer : _whitePlayer;
    if (move.author !== expectedAuthor) continue;

    const flips = getFlipsForBoard(board, move.index, turn);
    if (flips.length === 0) continue;

    board[move.index] = turn;
    flips.forEach(f => (board[f] = turn));
    appliedMoves++;
    lastMoveTime = move.created;
    turn = turn === "black" ? "white" : "black";
  }

  if (!hasAnyValidMove(board, turn)) {
    const opponent = turn === "black" ? "white" : "black";
    if (hasAnyValidMove(board, opponent)) turn = opponent;
  }

  const blackHasMove = hasAnyValidMove(board, "black");
  const whiteHasMove = hasAnyValidMove(board, "white");
  const score = countDiscs(board);
  let finished = !blackHasMove && !whiteHasMove;
  let winner = null;

  if (finished) {
    if (score.black > score.white) winner = "black";
    else if (score.white > score.black) winner = "white";
    else winner = "draw";
  }

  for (const claim of timeoutClaims) {
    if (finished) break;
    if (claim.moveNumber !== appliedMoves) continue;

    const expectedWinner = turn === "black" ? _whitePlayer : _blackPlayer;
    if (claim.author !== expectedWinner) continue;
    if (claim.claimAgainst !== turn) continue;

    const minutesPassed = (new Date(claim.created) - new Date(lastMoveTime)) / (1000 * 60);
    if (minutesPassed >= timeoutMinutes) {
      finished = true;
      winner = turn === "black" ? "white" : "black";
      break;
    }
  }

  return {
    title: rootPost?.title || "",
    blackPlayer: _blackPlayer,
    whitePlayer: _whitePlayer,
    board,
    currentPlayer: finished ? null : turn,
    appliedMoves,
    finished,
    winner,
    score,
    moves,
    timeoutMinutes,
    gameStartTime,
    lastMoveTime
  };
}

function deriveGameState(rootPost, replies) {
  if (!rootPost) return deriveGameStateFull(rootPost, replies);

  const cacheKey = `reversteem_cache_${rootPost.author}_${rootPost.permlink}`;
  let cache = null;
  try { cache = JSON.parse(localStorage.getItem(cacheKey)); } catch {}

  replies.sort((a, b) => new Date(a.created) - new Date(b.created));
  const latestCreated = replies.length > 0 ? replies[replies.length - 1].created : null;

  if (cache && cache.lastCreated === latestCreated && cache.replyCount === replies.length) {
    cache.state.title = rootPost.title || "";
    return cache.state;
  }

  const state = deriveGameStateFull(rootPost, replies);

  try {
    localStorage.setItem(cacheKey, JSON.stringify({
      lastCreated: latestCreated,
      replyCount: replies.length,
      state
    }));
  } catch {}

  return state;
}

// ---- ELO ----

function getEloCache() {
  try { return JSON.parse(localStorage.getItem(ELO_CACHE_KEY)); } catch { return null; }
}

function setEloCache(cache) {
  try { localStorage.setItem(ELO_CACHE_KEY, JSON.stringify(cache)); } catch {}
}

function getRating(ratings, user) {
  if (!ratings[user]) ratings[user] = ELO_BASE;
  return ratings[user];
}

function calculateEloDelta(rA, rB, scoreA) {
  const expectedA = 1 / (1 + Math.pow(10, (rB - rA) / 400));
  return ELO_K * (scoreA - expectedA);
}

async function updateEloRatingsFromGames(posts) {
  if (!posts || posts.length === 0) return;
  const sorted = [...posts].sort((a, b) => new Date(a.created) - new Date(b.created));

  let cache = getEloCache() || { lastProcessed: null, ratings: {} };
  const ratings = cache.ratings;

  for (const post of sorted) {
    if (cache.lastProcessed && new Date(post.created) <= new Date(cache.lastProcessed)) continue;

    const gameState = await deriveGameForElo(post);
    if (!gameState.finished || !gameState.blackPlayer || !gameState.whitePlayer) continue;

    const black = gameState.blackPlayer;
    const white = gameState.whitePlayer;
    const rBlack = getRating(ratings, black);
    const rWhite = getRating(ratings, white);

    let scoreBlack, scoreWhite;
    if (gameState.winner === "black")       { scoreBlack = 1;   scoreWhite = 0; }
    else if (gameState.winner === "white")  { scoreBlack = 0;   scoreWhite = 1; }
    else                                    { scoreBlack = 0.5; scoreWhite = 0.5; }

    ratings[black] = Math.round(rBlack + calculateEloDelta(rBlack, rWhite, scoreBlack));
    ratings[white] = Math.round(rWhite + calculateEloDelta(rWhite, rBlack, scoreWhite));
    cache.lastProcessed = post.created;
  }

  setEloCache(cache);
}

function getUserRating(username) {
  const cache = getEloCache();
  if (!cache || !cache.ratings[username]) return ELO_BASE;
  return Math.round(cache.ratings[username]);
}

// ---- Utilities ----

function indexToCoord(index) {
  const file = String.fromCharCode(65 + (index % 8));
  const rank = Math.floor(index / 8) + 1;
  return file + rank;
}

function esc(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

function safeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? url : "";
  } catch { return ""; }
}

function formatTimeout(minutes) {
  if (minutes < 60) return `${minutes} min`;
  if (minutes % 60 === 0) return `${minutes / 60} hour(s)`;
  return `${minutes} min`;
}

function isTimeoutClaimable(state) {
  if (!state || state.finished || !state.currentPlayer || !state.whitePlayer) return false;
  const lastMoveTime = state.moves.length > 0
    ? state.moves[state.moves.length - 1].created
    : state.gameStartTime || state.rootCreated;
  if (!lastMoveTime) return false;
  const minutesPassed = (new Date() - new Date(lastMoveTime)) / (1000 * 60);
  return minutesPassed >= state.timeoutMinutes;
}

function boardToMarkdown(boardArray) {
  const symbols = { black: "⚫", white: "⚪", null: "·" };
  let md = "### Current Board\n\n";
  md += "| A | B | C | D | E | F | G | H |\n";
  md += "|---|---|---|---|---|---|---|---|\n";
  for (let r = 0; r < 8; r++) {
    md += "|";
    for (let c = 0; c < 8; c++) {
      md += ` ${symbols[boardArray[r * 8 + c]]} |`;
    }
    md += "\n";
  }
  return md;
}

function escapeConsoleText(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function getGameStatus(game, previewState) {
  if (previewState) {
    if (previewState.finished) {
      if (previewState.winner === "draw") return "Finished — Draw";
      const winner = previewState.winner === "black" ? previewState.blackPlayer : previewState.whitePlayer;
      return `Finished — ${winner} wins`;
    }
    if (!previewState.whitePlayer) return "Waiting for opponent";
    return "In Progress";
  }
  // Fallback when previewState not yet loaded
  if (!game.whitePlayer) return "Waiting for opponent";
  return "In Progress";
}

function buildGameTags(timeoutMinutes, username) {
  // First tag: named preset or fallback to mins-[N]
  const preset = Object.entries(TIME_PRESETS).find(([, v]) => v === timeoutMinutes);
  const timeTag = preset ? preset[0] : `mins-${timeoutMinutes}`;

  // Second tag: elo-[rating], rounded to nearest 100 for grouping
  const elo = getUserRating(username);
  const eloTag = `elo-${elo}`;

  // Return plain array — Keychain's requestPost expects Array, not JSON string
  return [timeTag, eloTag, "reversi", "othello", "board", "game", "steem"];
}
