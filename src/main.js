import { AudioEngine } from "./audio.js";
import {
  TAU,
  angleDiff,
  clamp,
  comboMultiplier,
  difficultyFor,
  dist,
  distSq,
  enemyTypeFor,
  formatRank,
  formatScore,
  formatTime,
  hullStatus,
  lerp,
  rand,
  randInt,
  waveTitle,
} from "./core.js";

const $ = (id) => document.getElementById(id);

const canvas = $("game");
const ctx = canvas.getContext("2d", { alpha: false });

const dom = {
  hud: $("hud"),
  hudRight: document.querySelector(".hud-right"),
  scoreValue: $("scoreValue"),
  multiplier: $("multiplier"),
  comboLabel: $("comboLabel"),
  comboFill: $("comboFill"),
  waveValue: $("waveValue"),
  waveFill: $("waveFill"),
  hullCells: $("hullCells"),
  hullStatus: $("hullStatus"),
  pauseBtn: $("pauseBtn"),
  overdrive: $("overdrive"),
  odFill: $("odFill"),
  odPct: $("odPct"),
  dashWrap: $("dashWrap"),
  dashBtn: $("dashBtn"),
  dashArc: $("dashArc"),
  waveBanner: $("waveBanner"),
  waveTitle: $("waveTitle"),
  waveSub: $("waveSub"),
  menu: $("menu"),
  playBtn: $("playBtn"),
  bestValue: $("bestValue"),
  rankValue: $("rankValue"),
  soundBtn: $("soundBtn"),
  soundLabel: $("soundLabel"),
  gameOver: $("gameOver"),
  finalScore: $("finalScore"),
  finalWave: $("finalWave"),
  finalKills: $("finalKills"),
  finalTime: $("finalTime"),
  newBest: $("newBest"),
  retryBtn: $("retryBtn"),
  menuBtn: $("menuBtn"),
  pauseOverlay: $("pauseOverlay"),
  resumeBtn: $("resumeBtn"),
  restartBtn: $("restartBtn"),
  quitBtn: $("quitBtn"),
  pauseSoundBtn: $("pauseSoundBtn"),
  pauseSoundLabel: $("pauseSoundLabel"),
  touchHint: $("touchHint"),
  boot: $("boot"),
};

const CONFIG = {
  maxSpeed: 390,
  playerRadius: 13,
  fireInterval: 0.155,
  overdriveFireInterval: 0.082,
  bulletSpeed: 1040,
  bulletLife: 1.35,
  dashCooldown: 3.2,
  dashDuration: 0.17,
  dashSpeed: 1180,
  waveDuration: 21,
  comboWindow: 2.9,
  overdriveDuration: 6.5,
  overdriveShard: 0.058,
  maxParticles: 650,
  touchHintTime: 5.2,
};

const ENEMY_CONFIG = {
  dart: {
    r: 11,
    hp: 1,
    speed: [175, 235],
    score: 60,
    color: [255, 64, 150],
    turn: 0,
    drop: 1,
    shape: "dart",
    glow: 2.6,
  },
  haunt: {
    r: 15,
    hp: 2,
    speed: [72, 108],
    score: 90,
    color: [255, 178, 70],
    turn: 1.55,
    drop: 1,
    shape: "diamond",
    glow: 2.7,
  },
  splitter: {
    r: 19,
    hp: 2,
    speed: [60, 88],
    score: 130,
    color: [64, 242, 200],
    turn: 0.92,
    drop: 2,
    shape: "hex",
    glow: 2.9,
  },
  fragment: {
    r: 9,
    hp: 1,
    speed: [150, 205],
    score: 35,
    color: [110, 248, 255],
    turn: 2.4,
    drop: 0,
    shape: "shard",
    glow: 2.2,
  },
  brute: {
    r: 27,
    hp: 6,
    speed: [44, 66],
    score: 300,
    color: [255, 98, 70],
    turn: 0.62,
    drop: 3,
    shape: "penta",
    glow: 3.3,
  },
};

const audio = new AudioEngine();
const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let W = 0;
let H = 0;
let DPR = 1;
let bgCanvas = null;
let fxCanvas = null;
let stars = [];
let lastFrame = performance.now();
let bannerTimer = 0;
let touchHintTimer = 0;

const state = {
  mode: "boot",
  time: 0,
  runTime: 0,
  demo: false,
  score: 0,
  displayScore: 0,
  best: 0,
  wave: 1,
  waveTimer: CONFIG.waveDuration,
  hull: 3,
  maxHull: 3,
  kills: 0,
  combo: 0,
  comboTimer: 0,
  multiplier: 1,
  spawnTimer: 0,
  shake: 0,
  redFlash: 0,
  overTimer: 0,
  finalStats: null,
  lastHitSfx: 0,
  lastShootSfx: 0,
  diff: difficultyFor(1),
  player: null,
  enemies: [],
  bullets: [],
  particles: [],
  pickups: [],
  floaters: [],
  rings: [],
  overdrive: { charge: 0, active: 0 },
  ui: { score: "", multiplier: 0, combo: "", waves: "", hull: -1, dash: -1, od: -1, hot: false },
};

const joystick = {
  active: false,
  id: null,
  ox: 0,
  oy: 0,
  x: 0,
  y: 0,
  startTime: 0,
  startX: 0,
  startY: 0,
};

const keys = new Set();
let lastTap = 0;

const glowCache = new Map();

function glowSprite(color) {
  const key = color.join(",");
  const cached = glowCache.get(key);
  if (cached) return cached;
  const size = 128;
  const sprite = document.createElement("canvas");
  sprite.width = size;
  sprite.height = size;
  const g = sprite.getContext("2d");
  const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,0.98)");
  gradient.addColorStop(0.13, `rgba(${color[0]},${color[1]},${color[2]},0.85)`);
  gradient.addColorStop(0.42, `rgba(${color[0]},${color[1]},${color[2]},0.26)`);
  gradient.addColorStop(1, `rgba(${color[0]},${color[1]},${color[2]},0)`);
  g.fillStyle = gradient;
  g.fillRect(0, 0, size, size);
  glowCache.set(key, sprite);
  return sprite;
}

function drawGlow(color, x, y, radius, alpha = 1) {
  if (radius <= 0.1 || alpha <= 0.01) return;
  const sprite = glowSprite(color);
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
  ctx.globalAlpha = 1;
}

function rgba(color, alpha) {
  return `rgba(${color[0]},${color[1]},${color[2]},${alpha})`;
}

function readBest() {
  try {
    const value = Number(localStorage.getItem("rast.best"));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    localStorage.setItem("rast.best", String(Math.floor(value)));
  } catch {
    /* storage may be unavailable */
  }
}

function resize() {
  const previousW = W;
  const previousH = H;
  W = Math.max(320, window.innerWidth);
  H = Math.max(320, window.innerHeight);
  DPR = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.imageSmoothingEnabled = true;

  if (state.player) {
    if (previousW > 0 && previousH > 0) {
      state.player.x = (state.player.x / previousW) * W;
      state.player.y = (state.player.y / previousH) * H;
    }
    state.player.x = clamp(state.player.x, 20, W - 20);
    state.player.y = clamp(state.player.y, 20, H - 20);
  }

  buildBackdrop();
  buildStars();

  if (state.mode === "menu" && state.player) {
    state.player.x = W * 0.5;
    state.player.y = H * 0.54;
  }
}

function buildStars() {
  const count = Math.round(clamp((W * H) / 9000, 42, 150));
  stars = Array.from({ length: count }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    z: rand(0.25, 1),
    size: rand(0.5, 1.9),
    phase: rand(0, TAU),
    speed: rand(2, 13),
    tint: Math.random() < 0.14 ? [255, 120, 190] : Math.random() < 0.3 ? [140, 255, 235] : [180, 232, 255],
  }));
}

function buildBackdrop() {
  const bg = document.createElement("canvas");
  bg.width = Math.round(W * DPR);
  bg.height = Math.round(H * DPR);
  const g = bg.getContext("2d");
  g.scale(DPR, DPR);

  const base = g.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, "#05070f");
  base.addColorStop(0.45, "#070d1d");
  base.addColorStop(0.78, "#050a16");
  base.addColorStop(1, "#02040a");
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);

  const m = Math.min(W, H);
  g.globalCompositeOperation = "lighter";

  const nebula = (x, y, radius, color) => {
    const gradient = g.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, rgba(color, 0.18));
    gradient.addColorStop(0.45, rgba(color, 0.07));
    gradient.addColorStop(1, rgba(color, 0));
    g.fillStyle = gradient;
    g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  };

  nebula(W * 0.18, H * 0.2, m * 0.78, [66, 28, 160]);
  nebula(W * 0.84, H * 0.68, m * 0.85, [0, 118, 150]);
  nebula(W * 0.62, H * 0.18, m * 0.52, [255, 30, 120]);
  nebula(W * 0.35, H * 0.88, m * 0.6, [30, 80, 200]);

  g.globalCompositeOperation = "source-over";

  g.strokeStyle = "rgba(95, 220, 255, 0.028)";
  g.lineWidth = 1;
  for (let i = -3; i < 8; i += 1) {
    const offset = i * m * 0.32;
    g.beginPath();
    g.moveTo(-W * 0.2 + offset, H);
    g.lineTo(W * 0.8 + offset, 0);
    g.stroke();
  }

  for (let i = 0; i < 460; i += 1) {
    const alpha = rand(0.015, 0.075);
    g.fillStyle = `rgba(185,240,255,${alpha})`;
    g.fillRect(Math.random() * W, Math.random() * H, rand(0.5, 1.4), rand(0.5, 1.4));
  }

  const floor = g.createLinearGradient(0, H * 0.68, 0, H);
  floor.addColorStop(0, "rgba(16, 90, 130, 0)");
  floor.addColorStop(1, "rgba(18, 120, 170, 0.055)");
  g.fillStyle = floor;
  g.fillRect(0, H * 0.68, W, H * 0.32);

  bgCanvas = bg;

  const fx = document.createElement("canvas");
  fx.width = bg.width;
  fx.height = bg.height;
  const f = fx.getContext("2d");
  f.scale(DPR, DPR);
  f.strokeStyle = "rgba(190, 250, 255, 0.045)";
  f.lineWidth = 1;
  for (let y = 0; y < H; y += 3) {
    f.beginPath();
    f.moveTo(0, y + 0.5);
    f.lineTo(W, y + 0.5);
    f.stroke();
  }
  const vignette = f.createRadialGradient(W / 2, H * 0.46, m * 0.2, W / 2, H * 0.5, Math.max(W, H) * 0.74);
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(0.6, "rgba(2, 3, 9, 0.06)");
  vignette.addColorStop(1, "rgba(1, 2, 6, 0.64)");
  f.fillStyle = vignette;
  f.fillRect(0, 0, W, H);
  fxCanvas = fx;
}

function syncSoundUI() {
  const muted = !audio.enabled;
  dom.soundBtn.classList.toggle("muted", muted);
  dom.pauseSoundBtn.classList.toggle("muted", muted);
  dom.soundLabel.textContent = muted ? "SOUND OFF" : "SOUND ON";
  dom.pauseSoundLabel.textContent = muted ? "SOUND OFF" : "SOUND ON";
  dom.soundBtn.setAttribute("aria-label", muted ? "Enable audio" : "Mute audio");
  dom.pauseSoundBtn.setAttribute("aria-label", muted ? "Enable audio" : "Mute audio");
}

function updateMenuStats() {
  dom.bestValue.textContent = formatScore(state.best);
  dom.rankValue.textContent = formatRank(state.best);
}

function showBanner(title, subtitle, hot = false) {
  window.clearTimeout(bannerTimer);
  dom.waveTitle.textContent = title;
  dom.waveSub.textContent = subtitle;
  dom.waveBanner.classList.toggle("hot", hot);
  dom.waveBanner.classList.add("show");
  bannerTimer = window.setTimeout(() => {
    dom.waveBanner.classList.remove("show");
  }, 2000);
}

function hideBanner() {
  window.clearTimeout(bannerTimer);
  dom.waveBanner.classList.remove("show");
  dom.waveBanner.classList.remove("hot");
}

function resetRun(demo) {
  state.mode = demo ? "menu" : "playing";
  state.demo = demo;
  state.runTime = 0;
  state.score = 0;
  state.displayScore = 0;
  state.wave = 1;
  state.waveTimer = CONFIG.waveDuration;
  state.hull = 3;
  state.maxHull = 3;
  state.kills = 0;
  state.combo = 0;
  state.comboTimer = 0;
  state.multiplier = 1;
  state.spawnTimer = demo ? 0.7 : 0.36;
  state.shake = 0;
  state.redFlash = 0;
  state.overTimer = 0;
  state.finalStats = null;
  state.lastHitSfx = 0;
  state.lastShootSfx = 0;
  state.diff = difficultyFor(1);
  state.overdrive.charge = 0;
  state.overdrive.active = 0;
  state.enemies = [];
  state.bullets = [];
  state.particles = [];
  state.pickups = [];
  state.floaters = [];
  state.rings = [];
  state.ui = { score: "", multiplier: 0, combo: "", waves: "", hull: -1, dash: -1, od: -1, hot: false };
  joystick.active = false;
  joystick.id = null;
  keys.clear();

  state.player = {
    x: W * 0.5,
    y: H * 0.54,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    moveAngle: -Math.PI / 2,
    r: CONFIG.playerRadius,
    fireTimer: 0.28,
    invuln: demo ? 9999 : 3.0,
    dashTimer: 0,
    dashCooldown: 0,
    dashVx: 0,
    dashVy: 0,
    trail: [],
  };

  buildHull();
  syncHull();
  spawnInitial();
  hideBanner();

  if (!demo) {
    showBanner("WAVE 01", waveTitle(1));
  }
}

function buildHull() {
  dom.hullCells.replaceChildren();
  for (let i = 0; i < state.maxHull; i += 1) {
    const cell = document.createElement("span");
    cell.className = "hull-cell";
    dom.hullCells.appendChild(cell);
  }
}

function syncHull() {
  const cells = [...dom.hullCells.children];
  cells.forEach((cell, index) => cell.classList.toggle("lost", index >= state.hull));
  dom.hudRight.classList.toggle("critical", state.hull <= 1);
  const status = hullStatus(state.hull, state.maxHull);
  if (dom.hullStatus.textContent !== status) dom.hullStatus.textContent = status;
}

function startRun() {
  audio.ensure();
  audio.click();
  audio.setPaused(false);
  hideBanner();
  resetRun(false);
  dom.menu.hidden = true;
  dom.gameOver.hidden = true;
  dom.pauseOverlay.hidden = true;
  dom.hud.hidden = false;
  dom.pauseBtn.hidden = false;
  dom.pauseBtn.setAttribute("aria-label", "Pause game");
  dom.overdrive.hidden = false;
  dom.dashWrap.hidden = false;
  dom.touchHint.hidden = !coarsePointer;
  if (coarsePointer) {
    window.clearTimeout(touchHintTimer);
    touchHintTimer = window.setTimeout(() => {
      dom.touchHint.hidden = true;
    }, CONFIG.touchHintTime * 1000);
  }
  updateMenuStats();
  updateHud(0);
  showBanner("WAVE 01", waveTitle(1));
}

function showMenu() {
  audio.setPaused(false);
  resetRun(true);
  state.mode = "menu";
  state.best = readBest();
  dom.menu.hidden = false;
  dom.gameOver.hidden = true;
  dom.pauseOverlay.hidden = true;
  dom.hud.hidden = true;
  dom.pauseBtn.hidden = true;
  dom.overdrive.hidden = true;
  dom.dashWrap.hidden = true;
  dom.touchHint.hidden = true;
  hideBanner();
  updateMenuStats();
  syncSoundUI();
}

function showGameOver() {
  if (!state.finalStats) return;
  state.mode = "over";
  state.finalStats = state.finalStats || {
    score: state.score,
    wave: state.wave,
    kills: state.kills,
    time: state.runTime,
  };
  const stats = state.finalStats;
  const isBest = stats.score > state.best;
  if (isBest) {
    state.best = stats.score;
    saveBest(state.best);
  }
  dom.finalScore.textContent = formatScore(stats.score);
  dom.finalWave.textContent = String(stats.wave).padStart(2, "0");
  dom.finalKills.textContent = formatScore(stats.kills);
  dom.finalTime.textContent = formatTime(stats.time);
  dom.newBest.hidden = !isBest;
  dom.gameOver.hidden = false;
  dom.hud.hidden = true;
  dom.pauseBtn.hidden = true;
  dom.overdrive.hidden = true;
  dom.dashWrap.hidden = true;
  dom.touchHint.hidden = true;
  updateMenuStats();
  audio.setPaused(true);
}

function togglePause() {
  if (state.mode === "playing") {
    state.mode = "paused";
    dom.pauseOverlay.hidden = false;
    dom.pauseBtn.hidden = true;
    dom.touchHint.hidden = true;
    joystick.active = false;
    joystick.id = null;
    audio.setPaused(true);
  } else if (state.mode === "paused") {
    state.mode = "playing";
    dom.pauseOverlay.hidden = true;
    dom.pauseBtn.hidden = false;
    audio.setPaused(false);
  }
}

function resumeRun() {
  if (state.mode !== "paused") return;
  state.mode = "playing";
  dom.pauseOverlay.hidden = true;
  dom.pauseBtn.hidden = false;
  audio.setPaused(false);
}

function toggleSound() {
  audio.ensure();
  const enabled = audio.toggle();
  syncSoundUI();
  if (enabled) audio.click();
}

function addParticle(x, y, config = {}) {
  if (state.particles.length >= CONFIG.maxParticles) state.particles.shift();
  state.particles.push({
    x,
    y,
    vx: config.vx ?? rand(-60, 60),
    vy: config.vy ?? rand(-60, 60),
    life: config.life ?? rand(0.25, 0.7),
    maxLife: config.life ?? rand(0.25, 0.7),
    size: config.size ?? rand(1.2, 3.6),
    color: config.color ?? [120, 245, 255],
    drag: config.drag ?? 2.4,
    spark: config.spark ?? false,
    gravity: config.gravity ?? 0,
  });
}

function burst(x, y, color, count, speed = 180, life = 0.7, size = 3) {
  const n = reduceMotion ? Math.ceil(count * 0.5) : count;
  for (let i = 0; i < n; i += 1) {
    const angle = rand(0, TAU);
    const velocity = rand(speed * 0.25, speed);
    addParticle(x, y, {
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      life: rand(life * 0.45, life),
      size: rand(size * 0.4, size),
      color: Math.random() < 0.22 ? [255, 255, 255] : color,
      drag: rand(1.6, 3.8),
      spark: Math.random() < 0.35,
    });
  }
}

function addRing(x, y, color, endRadius, life = 0.5, width = 2, startRadius = 4) {
  state.rings.push({
    x,
    y,
    startRadius,
    endRadius,
    life,
    maxLife: life,
    color,
    width,
  });
}

function addFloater(x, y, text, color, size = 13) {
  state.floaters.push({
    x,
    y,
    text,
    color,
    size,
    life: 0.85,
    maxLife: 0.85,
    vy: -42,
  });
}


function edgeSpawn() {
  const margin = 46;
  const side = randInt(0, 3);
  if (side === 0) return { x: rand(-margin, W + margin), y: -margin };
  if (side === 1) return { x: W + margin, y: rand(-margin, H + margin) };
  if (side === 2) return { x: rand(-margin, W + margin), y: H + margin };
  return { x: -margin, y: rand(-margin, H + margin) };
}

function spawnEnemy(type, options = {}) {
  const config = ENEMY_CONFIG[type];
  if (!config) return null;
  const diff = state.diff || difficultyFor(state.wave);
  const position = options.x == null || options.y == null ? edgeSpawn() : { x: options.x, y: options.y };
  const angle = options.angle ?? Math.atan2(state.player.y - position.y, state.player.x - position.x);
  const speedScale = state.demo ? 0.58 : diff.speedScale;
  const speed = (options.speed ?? rand(config.speed[0], config.speed[1])) * speedScale;
  const hp = state.demo ? 1 : (options.hp ?? config.hp) + diff.hpBonus;
  const enemy = {
    type,
    x: position.x,
    y: position.y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    angle,
    speed,
    turn: config.turn,
    r: config.r,
    hp,
    maxHp: hp,
    color: config.color,
    shape: config.shape,
    glow: config.glow,
    spin: rand(0, TAU),
    spinSpeed: rand(-2.4, 2.4),
    age: 0,
    flash: 0,
    dead: false,
  };
  state.enemies.push(enemy);
  addRing(enemy.x, enemy.y, config.color, config.r * 2.6, 0.42, 1.5, config.r * 0.4);
  return enemy;
}

function spawnInitial() {
  const demo = state.demo;
  const types = demo
    ? ["dart", "haunt", "splitter", "dart", "brute", "haunt", "splitter", "dart"]
    : ["dart", "dart", "haunt", "splitter", "dart", "haunt", "dart", "haunt", "splitter"];
  const count = types.length;
  const baseRadius = Math.min(W, H) * (demo ? 0.36 : 0.375);
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * TAU + rand(-0.16, 0.16);
    const radius = baseRadius * rand(0.86, 1.12);
    spawnEnemy(types[i], {
      x: state.player.x + Math.cos(angle) * radius,
      y: state.player.y + Math.sin(angle) * radius,
      angle: angle + Math.PI + rand(-0.1, 0.1),
      speed: demo ? rand(62, 95) : undefined,
    });
  }
}

function nearestEnemy(maxDistance = Infinity) {
  let best = null;
  let bestDist = maxDistance * maxDistance;
  for (const enemy of state.enemies) {
    if (enemy.dead) continue;
    const d = distSq(state.player.x, state.player.y, enemy.x, enemy.y);
    if (d < bestDist) {
      bestDist = d;
      best = enemy;
    }
  }
  return best;
}

function fireAt(target) {
  const player = state.player;
  const baseAngle = Math.atan2(target.y - player.y, target.x - player.x);
  const overdrive = state.overdrive.active > 0;
  const spread = overdrive ? [-0.105, 0, 0.105] : [0];
  const color = overdrive ? [255, 226, 140] : [126, 246, 255];
  player.fireTimer = overdrive ? CONFIG.overdriveFireInterval : CONFIG.fireInterval;

  for (const offset of spread) {
    const angle = baseAngle + offset + rand(-0.012, 0.012);
    const x = player.x + Math.cos(angle) * 18;
    const y = player.y + Math.sin(angle) * 18;
    state.bullets.push({
      x,
      y,
      px: x - Math.cos(angle) * 10,
      py: y - Math.sin(angle) * 10,
      vx: Math.cos(angle) * CONFIG.bulletSpeed + player.vx * 0.12,
      vy: Math.sin(angle) * CONFIG.bulletSpeed + player.vy * 0.12,
      r: overdrive ? 4 : 3.3,
      life: CONFIG.bulletLife,
      damage: 1,
      color,
      dead: false,
    });
    for (let i = 0; i < 2; i += 1) {
      addParticle(x, y, {
        vx: Math.cos(angle + rand(-0.5, 0.5)) * rand(40, 120),
        vy: Math.sin(angle + rand(-0.5, 0.5)) * rand(40, 120),
        life: rand(0.1, 0.24),
        size: rand(1, 2.2),
        color,
        drag: 5,
      });
    }
  }

  if (state.time - state.lastShootSfx > 0.035) {
    audio.shoot();
    state.lastShootSfx = state.time;
  }
}

function aimAndFire(dt) {
  const player = state.player;
  const target = nearestEnemy(880);
  let desired = player.angle;
  if (target) {
    desired = Math.atan2(target.y - player.y, target.x - player.x);
  } else if (Math.hypot(player.vx, player.vy) > 24) {
    desired = Math.atan2(player.vy, player.vx);
  }
  player.angle += angleDiff(desired, player.angle) * Math.min(1, 17 * dt);
  player.fireTimer -= dt;
  if (target && player.fireTimer <= 0) fireAt(target);
}

function updatePlayer(dt) {
  const player = state.player;
  let ix = 0;
  let iy = 0;
  if (keys.has("a") || keys.has("arrowleft")) ix -= 1;
  if (keys.has("d") || keys.has("arrowright")) ix += 1;
  if (keys.has("w") || keys.has("arrowup")) iy -= 1;
  if (keys.has("s") || keys.has("arrowdown")) iy += 1;

  if (joystick.active) {
    const dx = joystick.x - joystick.ox;
    const dy = joystick.y - joystick.oy;
    const length = Math.hypot(dx, dy);
    if (length > 5) {
      const strength = clamp((length - 5) / 52, 0, 1);
      ix += (dx / length) * strength;
      iy += (dy / length) * strength;
    }
  }

  const magnitude = Math.hypot(ix, iy);
  if (magnitude > 1) {
    ix /= magnitude;
    iy /= magnitude;
  }
  if (magnitude > 0.07) player.moveAngle = Math.atan2(iy, ix);

  const smoothing = 1 - Math.exp(-11 * dt);
  player.vx = lerp(player.vx, ix * CONFIG.maxSpeed, smoothing);
  player.vy = lerp(player.vy, iy * CONFIG.maxSpeed, smoothing);

  if (player.dashTimer > 0) {
    player.dashTimer -= dt;
    player.vx = player.dashVx;
    player.vy = player.dashVy;
    if (Math.random() < 0.85) {
      addParticle(player.x - player.dashVx * 0.012, player.y - player.dashVy * 0.012, {
        vx: rand(-40, 40),
        vy: rand(-40, 40),
        life: rand(0.16, 0.36),
        size: rand(1.4, 3.4),
        color: [97, 245, 255],
        drag: 3,
      });
    }
  }

  player.x += player.vx * dt;
  player.y += player.vy * dt;

  const margin = 20;
  if (player.x < margin) {
    player.x = margin;
    player.vx = Math.abs(player.vx) * 0.15;
  } else if (player.x > W - margin) {
    player.x = W - margin;
    player.vx = -Math.abs(player.vx) * 0.15;
  }
  if (player.y < margin) {
    player.y = margin;
    player.vy = Math.abs(player.vy) * 0.15;
  } else if (player.y > H - margin) {
    player.y = H - margin;
    player.vy = -Math.abs(player.vy) * 0.15;
  }

  player.invuln = Math.max(0, player.invuln - dt);
  player.dashCooldown = Math.max(0, player.dashCooldown - dt);

  player.trail.unshift({ x: player.x, y: player.y, life: 1 });
  if (player.trail.length > 17) player.trail.pop();
  for (const point of player.trail) point.life -= dt * 2.6;

  if (magnitude > 0.15 && Math.random() < 0.7) {
    const angle = Math.atan2(player.vy, player.vx) + Math.PI;
    addParticle(player.x + Math.cos(angle) * 13, player.y + Math.sin(angle) * 13, {
      vx: Math.cos(angle + rand(-0.4, 0.4)) * rand(20, 80) + player.vx * -0.15,
      vy: Math.sin(angle + rand(-0.4, 0.4)) * rand(20, 80) + player.vy * -0.15,
      life: rand(0.16, 0.4),
      size: rand(1, 2.8),
      color: Math.random() < 0.3 ? [255, 90, 180] : [97, 245, 255],
      drag: 4,
    });
  }

  aimAndFire(dt);
}

function updateDemo(dt) {
  const player = state.player;
  const radius = Math.min(W, H) * 0.16;
  player.x = W * 0.5 + Math.cos(state.time * 0.31) * radius;
  player.y = H * 0.54 + Math.sin(state.time * 0.46) * radius * 0.62;
  player.vx = -Math.sin(state.time * 0.31) * radius * 0.31;
  player.vy = Math.cos(state.time * 0.46) * radius * 0.62 * 0.46;
  player.trail.unshift({ x: player.x, y: player.y, life: 1 });
  if (player.trail.length > 17) player.trail.pop();
  for (const point of player.trail) point.life -= dt * 2.6;
  aimAndFire(dt);
  updateSpawning(dt);
  updateEnemies(dt);
  updateBullets(dt);
  collideBullets();
}

function updateSpawning(dt) {
  state.spawnTimer -= dt;
  const maxEnemies = state.demo ? 10 : state.diff.maxEnemies;
  if (state.spawnTimer > 0 || state.enemies.length >= maxEnemies) return;
  if (state.demo) {
    spawnEnemy(enemyTypeFor(4));
    state.spawnTimer = rand(0.55, 1.05);
  } else {
    spawnEnemy(enemyTypeFor(state.wave));
    state.spawnTimer = state.diff.spawnInterval * rand(0.72, 1.26);
  }
}

function updateEnemies(dt) {
  const player = state.player;
  for (const enemy of state.enemies) {
    if (enemy.dead) continue;
    enemy.age += dt;
    enemy.flash = Math.max(0, enemy.flash - dt * 7);

    if (enemy.turn > 0) {
      const desired = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      const delta = angleDiff(desired, enemy.angle);
      enemy.angle += clamp(delta, -enemy.turn * dt, enemy.turn * dt);
      enemy.vx = Math.cos(enemy.angle) * enemy.speed;
      enemy.vy = Math.sin(enemy.angle) * enemy.speed;
    }

    enemy.x += enemy.vx * dt;
    enemy.y += enemy.vy * dt;

    const limit = Math.max(W, H) * 1.8;
    if (
      enemy.age > 2 &&
      (enemy.x < -limit || enemy.x > W + limit || enemy.y < -limit || enemy.y > H + limit)
    ) {
      enemy.dead = true;
    }
  }
  state.enemies = state.enemies.filter((enemy) => !enemy.dead);
}

function updateBullets(dt) {
  for (const bullet of state.bullets) {
    if (bullet.dead) continue;
    bullet.px = bullet.x;
    bullet.py = bullet.y;
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;
    if (bullet.life <= 0 || bullet.x < -80 || bullet.x > W + 80 || bullet.y < -80 || bullet.y > H + 80) {
      bullet.dead = true;
    }
  }
  state.bullets = state.bullets.filter((bullet) => !bullet.dead);
}

function collideBullets() {
  for (const bullet of state.bullets) {
    if (bullet.dead) continue;
    for (const enemy of state.enemies) {
      if (enemy.dead) continue;
      const radius = bullet.r + enemy.r;
      if (distSq(bullet.x, bullet.y, enemy.x, enemy.y) <= radius * radius) {
        bullet.dead = true;
        enemy.hp -= bullet.damage;
        enemy.flash = 1;
        burst(bullet.x, bullet.y, bullet.color, 3, 120, 0.28, 2);
        if (state.time - state.lastHitSfx > 0.045) {
          audio.hit();
          state.lastHitSfx = state.time;
        }
        if (enemy.hp <= 0) killEnemy(enemy);
        break;
      }
    }
  }
  state.bullets = state.bullets.filter((bullet) => !bullet.dead);
  state.enemies = state.enemies.filter((enemy) => !enemy.dead);
}

function killEnemy(enemy, credit = true, chain = true) {
  if (enemy.dead) return;
  enemy.dead = true;
  const config = ENEMY_CONFIG[enemy.type];
  const demo = state.demo;

  if (credit && !demo) {
    state.kills += 1;
    state.combo += 1;
    state.comboTimer = CONFIG.comboWindow;
    state.multiplier = comboMultiplier(state.combo);
    const points = config.score * state.multiplier;
    state.score += points;
    addFloater(enemy.x, enemy.y - enemy.r, `+${points}`, config.color, state.multiplier > 1 ? 16 : 13);
  }

  const count = enemy.type === "brute" ? 30 : enemy.type === "splitter" ? 18 : 12;
  burst(enemy.x, enemy.y, enemy.color, count, enemy.type === "brute" ? 300 : 190, 0.85, enemy.type === "brute" ? 4.4 : 3.2);
  addRing(enemy.x, enemy.y, enemy.color, enemy.r * (enemy.type === "brute" ? 4.1 : 3.1), 0.55, enemy.type === "brute" ? 3 : 2);
  state.shake = Math.min(22, state.shake + (enemy.type === "brute" ? 9 : 3));
  audio.explode(enemy.type === "brute" ? 1.5 : 1);

  if (chain && enemy.type === "splitter") {
    for (let i = 0; i < 2; i += 1) {
      const angle = enemy.angle + (i === 0 ? -1 : 1) * rand(0.85, 1.5);
      spawnEnemy("fragment", {
        x: enemy.x + Math.cos(angle) * 10,
        y: enemy.y + Math.sin(angle) * 10,
        angle,
        speed: rand(155, 200),
      });
    }
  }

  if (credit && !demo) {
    for (let i = 0; i < config.drop; i += 1) dropShard(enemy.x, enemy.y);
    if (state.hull < state.maxHull && Math.random() < 0.075) dropHull(enemy.x, enemy.y);
  }
}

function dropShard(x, y) {
  const angle = rand(0, TAU);
  const speed = rand(18, 78);
  state.pickups.push({
    kind: "shard",
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    age: 0,
    life: 10,
    phase: rand(0, TAU),
    r: 8,
  });
}

function dropHull(x, y) {
  state.pickups.push({
    kind: "hull",
    x,
    y,
    vx: rand(-20, 20),
    vy: rand(-40, -10),
    age: 0,
    life: 12,
    phase: rand(0, TAU),
    r: 11,
  });
}

function updatePickups(dt) {
  const player = state.player;
  for (const pickup of state.pickups) {
    pickup.age += dt;
    pickup.life -= dt;
    pickup.x += pickup.vx * dt;
    pickup.y += pickup.vy * dt;
    const damping = Math.exp(-2.4 * dt);
    pickup.vx *= damping;
    pickup.vy *= damping;

    const d = dist(pickup.x, pickup.y, player.x, player.y);
    if (pickup.age > 0.24 && d < 250) {
      const pull = (1 - d / 250) * 1700 * dt;
      pickup.vx += ((player.x - pickup.x) / Math.max(1, d)) * pull;
      pickup.vy += ((player.y - pickup.y) / Math.max(1, d)) * pull;
    }

    if (d < player.r + pickup.r && state.mode === "playing") {
      pickup.life = 0;
      if (pickup.kind === "shard") collectShard(pickup);
      else collectHull(pickup);
    }
  }
  state.pickups = state.pickups.filter((pickup) => pickup.life > 0);
}

function collectShard(pickup) {
  audio.pickup();
  burst(pickup.x, pickup.y, [97, 245, 255], 5, 120, 0.35, 2.2);
  if (state.overdrive.active > 0) {
    state.score += 15 * state.multiplier;
    addFloater(pickup.x, pickup.y - 8, "+15", [255, 226, 140], 11);
    return;
  }
  state.overdrive.charge = Math.min(1, state.overdrive.charge + CONFIG.overdriveShard);
  if (state.overdrive.charge >= 1) activateOverdrive();
}

function collectHull(pickup) {
  state.hull = Math.min(state.maxHull, state.hull + 1);
  syncHull();
  audio.pickup();
  audio.wave();
  burst(pickup.x, pickup.y, [122, 255, 180], 14, 170, 0.6, 3);
  addRing(pickup.x, pickup.y, [122, 255, 180], 42, 0.5, 2);
  addFloater(pickup.x, pickup.y - 12, "+HULL", [122, 255, 180], 14);
}

function activateOverdrive() {
  state.overdrive.active = CONFIG.overdriveDuration;
  state.overdrive.charge = 0;
  showBanner("OVERDRIVE", "ARRAY UNLEASHED", true);
  audio.overdrive();
  addRing(state.player.x, state.player.y, [255, 205, 110], 190, 0.8, 4);
  addRing(state.player.x, state.player.y, [255, 62, 158], 150, 0.6, 2);
  burst(state.player.x, state.player.y, [255, 220, 130], 34, 270, 1, 3.4);
  state.player.invuln = Math.max(state.player.invuln, 0.7);
}

function damagePlayer() {
  if (state.mode !== "playing" || state.player.invuln > 0) return;
  state.player.invuln = 1.55;
  state.hull -= 1;
  state.combo = 0;
  state.comboTimer = 0;
  state.multiplier = 1;
  state.shake = 24;
  state.redFlash = 1;
  audio.hurt();
  syncHull();
  burst(state.player.x, state.player.y, [255, 60, 90], 26, 280, 0.8, 3.6);
  addRing(state.player.x, state.player.y, [255, 70, 110], 120, 0.65, 3);
  addFloater(state.player.x, state.player.y - 24, `HULL ${state.hull}/${state.maxHull}`, [255, 110, 130], 13);

  for (const enemy of state.enemies) {
    if (enemy.dead) continue;
    if (dist(enemy.x, enemy.y, state.player.x, state.player.y) < 122) {
      killEnemy(enemy, false, false);
    }
  }
  state.enemies = state.enemies.filter((enemy) => !enemy.dead);

  if (state.hull <= 0) die();
}

function die() {
  if (state.mode !== "playing") return;
  state.mode = "dying";
  state.overTimer = 1.15;
  state.finalStats = {
    score: state.score,
    wave: state.wave,
    kills: state.kills,
    time: state.runTime,
  };
  state.shake = 32;
  state.redFlash = 1;
  burst(state.player.x, state.player.y, [255, 90, 130], 54, 380, 1.3, 5);
  burst(state.player.x, state.player.y, [97, 245, 255], 30, 260, 1.1, 3.6);
  addRing(state.player.x, state.player.y, [255, 90, 130], 220, 0.9, 4);
  addRing(state.player.x, state.player.y, [97, 245, 255], 160, 0.7, 2);
  audio.hurt();
  audio.over();
  dom.pauseBtn.hidden = true;
  dom.overdrive.hidden = true;
  dom.dashWrap.hidden = true;
  dom.touchHint.hidden = true;
}

function updateOverdrive(dt) {
  if (state.overdrive.active > 0) {
    state.overdrive.active = Math.max(0, state.overdrive.active - dt);
    if (state.overdrive.active === 0) {
      addRing(state.player.x, state.player.y, [120, 240, 255], 110, 0.6, 2);
    }
  }
}

function updateWave(dt) {
  state.waveTimer -= dt;
  if (state.waveTimer > 0) return;
  state.wave += 1;
  state.waveTimer = CONFIG.waveDuration;
  state.diff = difficultyFor(state.wave);
  if (state.wave % 3 === 0 && state.hull < state.maxHull) {
    state.hull += 1;
    syncHull();
    addFloater(state.player.x, state.player.y - 30, "+HULL", [122, 255, 180], 14);
  }
  showBanner(`WAVE ${String(state.wave).padStart(2, "0")}`, waveTitle(state.wave));
  audio.wave();
  addRing(state.player.x, state.player.y, [97, 245, 255], Math.min(W, H) * 0.42, 0.9, 2, 20);
  for (let i = 0; i < state.diff.burst; i += 1) {
    spawnEnemy(enemyTypeFor(state.wave));
  }
}

function updateCombo(dt) {
  if (state.combo <= 0) return;
  state.comboTimer -= dt;
  if (state.comboTimer <= 0) {
    state.combo = 0;
    state.comboTimer = 0;
    state.multiplier = 1;
  }
}

function updateEffects(dt) {
  for (const particle of state.particles) {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += particle.gravity * dt;
    const damping = Math.exp(-particle.drag * dt);
    particle.vx *= damping;
    particle.vy *= damping;
  }
  state.particles = state.particles.filter((particle) => particle.life > 0);

  for (const ring of state.rings) ring.life -= dt;
  state.rings = state.rings.filter((ring) => ring.life > 0);

  for (const floater of state.floaters) {
    floater.life -= dt;
    floater.y += floater.vy * dt;
    floater.vy *= Math.exp(-2.8 * dt);
  }
  state.floaters = state.floaters.filter((floater) => floater.life > 0);

  for (const star of stars) {
    star.y += star.speed * star.z * dt;
    if (star.y > H + 3) {
      star.y = -3;
      star.x = Math.random() * W;
    }
  }

  state.shake *= Math.exp(-6.5 * dt);
  if (state.shake < 0.08) state.shake = 0;
  state.redFlash = Math.max(0, state.redFlash - dt * 2.2);
}

function update(dt) {
  state.time += dt;

  if (state.mode !== "paused") updateEffects(dt);

  if (state.mode === "playing") {
    state.runTime += dt;
    updatePlayer(dt);
    updateSpawning(dt);
    updateEnemies(dt);
    updateBullets(dt);
    collideBullets();
    updatePickups(dt);
    updateWave(dt);
    updateCombo(dt);
    updateOverdrive(dt);

    if (state.mode === "playing" && state.player.invuln <= 0) {
      for (const enemy of state.enemies) {
        if (enemy.dead) continue;
        const radius = enemy.r + CONFIG.playerRadius;
        if (distSq(state.player.x, state.player.y, enemy.x, enemy.y) <= radius * radius) {
          damagePlayer();
          break;
        }
      }
    }
  } else if (state.mode === "menu") {
    updateDemo(dt);
  } else if (state.mode === "dying") {
    state.overTimer -= dt;
    if (state.overTimer <= 0) showGameOver();
  }

  updateHud(dt);
}


function updateHud(dt) {
  const target = state.score;
  if (Math.abs(target - state.displayScore) < 0.9) {
    state.displayScore = target;
  } else {
    state.displayScore = lerp(state.displayScore, target, 1 - Math.exp(-9 * dt));
  }
  const scoreText = formatScore(state.displayScore);
  if (state.ui.score !== scoreText) {
    dom.scoreValue.textContent = scoreText;
    state.ui.score = scoreText;
  }

  if (state.ui.multiplier !== state.multiplier) {
    dom.multiplier.textContent = `×${state.multiplier}`;
    dom.multiplier.classList.remove("bump");
    void dom.multiplier.offsetWidth;
    dom.multiplier.classList.add("bump");
    state.ui.multiplier = state.multiplier;
  }

  const comboText = `COMBO ${state.combo}`;
  if (state.ui.combo !== comboText) {
    dom.comboLabel.textContent = comboText;
    state.ui.combo = comboText;
  }
  dom.comboFill.style.width = `${clamp((state.comboTimer / CONFIG.comboWindow) * 100, 0, 100)}%`;

  const waveText = String(state.wave).padStart(2, "0");
  if (state.ui.waves !== waveText) {
    dom.waveValue.textContent = waveText;
    state.ui.waves = waveText;
  }
  dom.waveFill.style.width = `${clamp((1 - state.waveTimer / CONFIG.waveDuration) * 100, 0, 100)}%`;

  if (state.ui.hull !== state.hull) {
    syncHull();
    state.ui.hull = state.hull;
  }

  const dashFraction = 1 - state.player.dashCooldown / CONFIG.dashCooldown;
  if (Math.abs(state.ui.dash - dashFraction) > 0.01) {
    const circumference = 2 * Math.PI * 44;
    dom.dashArc.style.strokeDashoffset = String(circumference * (1 - clamp(dashFraction, 0, 1)));
    dom.dashBtn.classList.toggle("ready", dashFraction >= 1);
    state.ui.dash = dashFraction;
  }

  const overdriveFraction = state.overdrive.active > 0
    ? state.overdrive.active / CONFIG.overdriveDuration
    : state.overdrive.charge;
  if (Math.abs(state.ui.od - overdriveFraction) > 0.005) {
    dom.odFill.style.width = `${clamp(overdriveFraction * 100, 0, 100)}%`;
    dom.odPct.textContent = `${Math.round(clamp(overdriveFraction, 0, 1) * 100)}%`;
    state.ui.od = overdriveFraction;
  }
  const hot = state.overdrive.active > 0;
  if (state.ui.hot !== hot) {
    dom.overdrive.classList.toggle("hot", hot);
    state.ui.hot = hot;
  }
}

function dash() {
  if (state.mode !== "playing") return;
  const player = state.player;
  if (player.dashCooldown > 0 || state.player.dashTimer > 0) return;
  let ix = 0;
  let iy = 0;
  if (keys.has("a") || keys.has("arrowleft")) ix -= 1;
  if (keys.has("d") || keys.has("arrowright")) ix += 1;
  if (keys.has("w") || keys.has("arrowup")) iy -= 1;
  if (keys.has("s") || keys.has("arrowdown")) iy += 1;
  if (joystick.active) {
    const dx = joystick.x - joystick.ox;
    const dy = joystick.y - joystick.oy;
    if (Math.hypot(dx, dy) > 6) {
      ix += dx;
      iy += dy;
    }
  }
  let angle = player.angle;
  if (Math.hypot(ix, iy) > 0.1) angle = Math.atan2(iy, ix);
  else angle = player.moveAngle;
  player.dashTimer = CONFIG.dashDuration;
  player.dashCooldown = CONFIG.dashCooldown;
  player.dashVx = Math.cos(angle) * CONFIG.dashSpeed;
  player.dashVy = Math.sin(angle) * CONFIG.dashSpeed;
  player.invuln = Math.max(player.invuln, CONFIG.dashDuration + 0.12);
  audio.dash();
  burst(player.x, player.y, [120, 246, 255], 12, 220, 0.5, 2.8);
  addRing(player.x, player.y, [97, 245, 255], 54, 0.35, 2);
  if (!dom.touchHint.hidden) dom.touchHint.hidden = true;
}

function screenToWorld(pointerX, pointerY) {
  return { x: pointerX, y: pointerY };
}

function beginJoystick(event) {
  if (state.mode !== "playing") return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  const point = screenToWorld(event.clientX, event.clientY);
  joystick.active = true;
  joystick.id = event.pointerId;
  joystick.ox = point.x;
  joystick.oy = point.y;
  joystick.x = point.x;
  joystick.y = point.y;
  joystick.startTime = performance.now();
  joystick.startX = point.x;
  joystick.startY = point.y;
  try {
    canvas.setPointerCapture(event.pointerId);
  } catch {
    /* pointer capture can fail on older browsers */
  }
  if (!dom.touchHint.hidden) dom.touchHint.hidden = true;
}

function moveJoystick(event) {
  if (!joystick.active || event.pointerId !== joystick.id) return;
  const point = screenToWorld(event.clientX, event.clientY);
  joystick.x = point.x;
  joystick.y = point.y;
}

function endJoystick(event) {
  if (!joystick.active || event.pointerId !== joystick.id) return;
  const point = screenToWorld(event.clientX, event.clientY);
  const duration = performance.now() - joystick.startTime;
  const moved = dist(point.x, point.y, joystick.startX, joystick.startY);
  joystick.active = false;
  joystick.id = null;
  try {
    canvas.releasePointerCapture(event.pointerId);
  } catch {
    /* ignore */
  }
  if (duration < 230 && moved < 14) {
    const now = performance.now();
    if (now - lastTap < 330) {
      dash();
      lastTap = 0;
    } else {
      lastTap = now;
    }
  }
}

function attachEvents() {
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => window.setTimeout(resize, 160));

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
    if (event.repeat && key !== " ") return;
    keys.add(key);
    if (key === " ") dash();
    if (key === "p" || key === "escape") {
      if (state.mode === "playing" || state.mode === "paused") togglePause();
    }
    if (key === "m") toggleSound();
  });
  window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
  window.addEventListener("blur", () => {
    keys.clear();
    joystick.active = false;
    joystick.id = null;
    if (state.mode === "playing") togglePause();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.mode === "playing") togglePause();
  });

  canvas.addEventListener("pointerdown", beginJoystick);
  canvas.addEventListener("pointermove", moveJoystick);
  canvas.addEventListener("pointerup", endJoystick);
  canvas.addEventListener("pointercancel", endJoystick);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  dom.playBtn.addEventListener("click", startRun);
  dom.retryBtn.addEventListener("click", startRun);
  dom.menuBtn.addEventListener("click", showMenu);
  dom.pauseBtn.addEventListener("click", togglePause);
  dom.resumeBtn.addEventListener("click", resumeRun);
  dom.restartBtn.addEventListener("click", startRun);
  dom.quitBtn.addEventListener("click", showMenu);
  dom.soundBtn.addEventListener("click", toggleSound);
  dom.pauseSoundBtn.addEventListener("click", toggleSound);
  dom.dashBtn.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    dash();
  });
  dom.touchHint.addEventListener("click", () => {
    dom.touchHint.hidden = true;
  });
}

function drawStars() {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const star of stars) {
    const twinkle = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(state.time * 1.6 + star.phase));
    const alpha = clamp(0.16 + twinkle * 0.42 * star.z, 0, 0.72);
    ctx.fillStyle = rgba(star.tint, alpha);
    ctx.fillRect(star.x, star.y, star.size * star.z, star.size * star.z);
    if (star.size > 1.5) drawGlow(star.tint, star.x, star.y, star.size * 4, alpha * 0.16);
  }
  ctx.restore();
}

function drawGrid() {
  const step = Math.max(56, Math.round(Math.min(W, H) / 11));
  const offset = (state.time * 5.5) % step;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(90, 220, 255, 0.033)";
  ctx.beginPath();
  for (let x = -offset; x <= W + step; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
  }
  for (let y = -offset * 0.55; y <= H + step; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();

  ctx.fillStyle = "rgba(120, 235, 255, 0.085)";
  for (let x = -offset; x <= W + step; x += step) {
    for (let y = -offset * 0.55; y <= H + step; y += step) {
      const major = Math.round(x / step) % 3 === 0 && Math.round(y / step) % 3 === 0;
      if (!major) continue;
      ctx.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
    }
  }
  ctx.restore();
}

function drawArena() {
  const cx = W * 0.5;
  const cy = H * 0.52;
  const radius = Math.min(W, H) * 0.405;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(97, 245, 255, 0.055)";
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.stroke();

  ctx.rotate(state.time * 0.08);
  ctx.setLineDash([3, 17]);
  ctx.strokeStyle = "rgba(97, 245, 255, 0.1)";
  ctx.beginPath();
  ctx.arc(0, 0, radius + 13, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.rotate(-state.time * 0.08);
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 4; i += 1) {
    const start = (i / 4) * TAU + state.time * 0.03;
    ctx.strokeStyle = "rgba(255, 62, 158, 0.11)";
    ctx.beginPath();
    ctx.arc(0, 0, radius, start, start + 0.19);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPickups() {
  if (!state.pickups.length) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const pickup of state.pickups) {
    const color = pickup.kind === "hull" ? [122, 255, 180] : [100, 245, 255];
    const pulse = 0.85 + 0.15 * Math.sin(state.time * 5 + pickup.phase);
    drawGlow(color, pickup.x, pickup.y, pickup.kind === "hull" ? 24 : 17, 0.55 * pulse);
  }
  ctx.restore();

  for (const pickup of state.pickups) {
    const color = pickup.kind === "hull" ? [122, 255, 180] : [108, 246, 255];
    ctx.save();
    ctx.translate(pickup.x, pickup.y);
    ctx.rotate(state.time * 1.8 + pickup.phase);
    if (pickup.kind === "hull") {
      const s = 7;
      ctx.beginPath();
      ctx.moveTo(-s, -s);
      ctx.lineTo(s, -s);
      ctx.lineTo(s, s);
      ctx.lineTo(-s, s);
      ctx.closePath();
      ctx.fillStyle = rgba(color, 0.3);
      ctx.strokeStyle = rgba(color, 0.95);
      ctx.lineWidth = 1.6;
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#d8ffe9";
      ctx.fillRect(-1.4, -4.5, 2.8, 9);
      ctx.fillRect(-4.5, -1.4, 9, 2.8);
    } else {
      const s = 5.5;
      ctx.beginPath();
      ctx.moveTo(0, -s * 1.4);
      ctx.lineTo(s, 0);
      ctx.lineTo(0, s * 1.4);
      ctx.lineTo(-s, 0);
      ctx.closePath();
      ctx.fillStyle = rgba(color, 0.45);
      ctx.strokeStyle = "#eaffff";
      ctx.lineWidth = 1.2;
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}

function enemyPath(enemy) {
  const r = enemy.r;
  if (enemy.shape === "dart") {
    ctx.moveTo(r * 1.28, 0);
    ctx.lineTo(-r * 0.82, r * 0.78);
    ctx.lineTo(-r * 0.38, 0);
    ctx.lineTo(-r * 0.82, -r * 0.78);
  } else if (enemy.shape === "diamond") {
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.82, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r * 0.82, 0);
  } else if (enemy.shape === "hex") {
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * TAU;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  } else if (enemy.shape === "penta") {
    for (let i = 0; i < 5; i += 1) {
      const angle = (i / 5) * TAU - Math.PI / 2;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  } else {
    ctx.moveTo(r, 0);
    ctx.lineTo(-r * 0.7, r * 0.7);
    ctx.lineTo(-r * 0.36, 0);
    ctx.lineTo(-r * 0.7, -r * 0.7);
  }
  ctx.closePath();
}

function drawEnemies() {
  if (!state.enemies.length) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const enemy of state.enemies) {
    const pulse = 0.8 + 0.2 * Math.sin(state.time * 4 + enemy.spin);
    drawGlow(enemy.color, enemy.x, enemy.y, enemy.r * enemy.glow * pulse, 0.34);
  }
  ctx.restore();

  for (const enemy of state.enemies) {
    const flash = enemy.flash;
    const baseAlpha = 0.92;
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.rotate(enemy.angle + Math.PI / 2);
    ctx.beginPath();
    enemyPath(enemy);
    ctx.fillStyle = flash > 0 ? "rgba(255,255,255,0.86)" : rgba(enemy.color, 0.16);
    ctx.strokeStyle = flash > 0 ? "#ffffff" : rgba(enemy.color, baseAlpha);
    ctx.lineWidth = enemy.type === "brute" ? 2.2 : 1.6;
    ctx.fill();
    ctx.stroke();

    ctx.rotate(enemy.spin + enemy.age * enemy.spinSpeed);
    ctx.beginPath();
    ctx.arc(0, 0, enemy.r * 0.48, 0.35, TAU - 0.35);
    ctx.strokeStyle = flash > 0 ? "rgba(255,255,255,0.9)" : rgba(enemy.color, 0.55);
    ctx.lineWidth = 1;
    ctx.stroke();

    if (enemy.type === "brute") {
      ctx.beginPath();
      ctx.moveTo(-enemy.r * 0.62, 0);
      ctx.lineTo(enemy.r * 0.62, 0);
      ctx.moveTo(0, -enemy.r * 0.62);
      ctx.lineTo(0, enemy.r * 0.62);
      ctx.strokeStyle = rgba(enemy.color, 0.35);
      ctx.stroke();
    }
    ctx.restore();

    if (enemy.maxHp > 2) {
      const width = enemy.r * 2;
      const x = enemy.x - enemy.r;
      const y = enemy.y - enemy.r - 10;
      ctx.fillStyle = "rgba(8, 14, 26, 0.75)";
      ctx.fillRect(x, y, width, 3);
      ctx.fillStyle = rgba(enemy.color, 0.9);
      ctx.fillRect(x, y, width * clamp(enemy.hp / enemy.maxHp, 0, 1), 3);
    }
  }
}

function drawBullets() {
  if (!state.bullets.length) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const bullet of state.bullets) {
    const angle = Math.atan2(bullet.vy, bullet.vx);
    const tailX = bullet.x - Math.cos(angle) * 17;
    const tailY = bullet.y - Math.sin(angle) * 17;
    const gradient = ctx.createLinearGradient(tailX, tailY, bullet.x, bullet.y);
    gradient.addColorStop(0, rgba(bullet.color, 0));
    gradient.addColorStop(1, rgba(bullet.color, 0.88));
    ctx.strokeStyle = gradient;
    ctx.lineWidth = bullet.r * 0.9;
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(bullet.x, bullet.y);
    ctx.stroke();
    drawGlow(bullet.color, bullet.x, bullet.y, 10, 0.8);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.r * 0.55, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawPlayer() {
  const player = state.player;
  if (!player || state.mode === "over" || state.mode === "dying") return;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const point of player.trail) {
    if (point.life <= 0) continue;
    drawGlow([97, 245, 255], point.x, point.y, 13 * point.life + 2, 0.09 * point.life);
  }
  const overdrive = state.overdrive.active > 0;
  drawGlow(overdrive ? [255, 215, 120] : [97, 245, 255], player.x, player.y, overdrive ? 54 : 38, overdrive ? 0.42 : 0.3);
  if (player.invuln > 0 && state.mode !== "menu") {
    const pulse = 0.35 + 0.25 * Math.sin(state.time * 12);
    drawGlow([180, 255, 255], player.x, player.y, 48, pulse * 0.6);
  }
  ctx.restore();

  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.angle);

  if (player.invuln > 0 && state.mode !== "menu") {
    const alpha = 0.35 + 0.35 * Math.sin(state.time * 10);
    ctx.strokeStyle = `rgba(190, 255, 255, ${alpha})`;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(0, 0, 26, -0.4, 2.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 26, 2.9, 5.8);
    ctx.stroke();
  }

  if (overdrive) {
    ctx.strokeStyle = "rgba(255, 220, 130, 0.7)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, TAU);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.moveTo(19, 0);
  ctx.lineTo(-11, 10);
  ctx.lineTo(-6, 0);
  ctx.lineTo(-11, -10);
  ctx.closePath();
  const body = ctx.createLinearGradient(-12, 0, 19, 0);
  body.addColorStop(0, overdrive ? "#ffb85c" : "#167ebd");
  body.addColorStop(0.55, overdrive ? "#ffe7a8" : "#bdfbff");
  body.addColorStop(1, "#ffffff");
  ctx.fillStyle = body;
  ctx.fill();
  ctx.strokeStyle = overdrive ? "rgba(255,235,180,0.95)" : "rgba(217,255,255,0.95)";
  ctx.lineWidth = 1.4;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-4, 0);
  ctx.lineTo(9, 0);
  ctx.strokeStyle = overdrive ? "#ff3e9e" : "#ff3e9e";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(2, 0, 2.4, 0, TAU);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  ctx.restore();
}

function drawParticles() {
  if (!state.particles.length) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const particle of state.particles) {
    const ratio = clamp(particle.life / particle.maxLife, 0, 1);
    const radius = particle.size * (0.4 + 0.6 * ratio) * 2.2;
    drawGlow(particle.color, particle.x, particle.y, radius, 0.7 * ratio);
    if (particle.spark && ratio > 0.45) {
      ctx.strokeStyle = rgba(particle.color, 0.7 * ratio);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(particle.x, particle.y);
      ctx.lineTo(particle.x - particle.vx * 0.018, particle.y - particle.vy * 0.018);
      ctx.stroke();
    } else {
      ctx.fillStyle = `rgba(255,255,255,${0.55 * ratio})`;
      ctx.fillRect(particle.x - 0.8, particle.y - 0.8, 1.6, 1.6);
    }
  }
  ctx.restore();
}

function drawRings() {
  if (!state.rings.length) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const ring of state.rings) {
    const progress = 1 - ring.life / ring.maxLife;
    const eased = 1 - Math.pow(1 - progress, 3);
    const radius = lerp(ring.startRadius, ring.endRadius, eased);
    const alpha = (1 - progress) * 0.8;
    ctx.strokeStyle = rgba(ring.color, alpha);
    ctx.lineWidth = ring.width * (1 - progress) + 0.4;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, radius, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFloaters() {
  if (!state.floaters.length) return;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const floater of state.floaters) {
    const alpha = clamp(floater.life / floater.maxLife, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.font = `700 ${floater.size}px Orbitron, Arial Black, sans-serif`;
    ctx.fillStyle = rgba(floater.color, 0.95);
    ctx.shadowColor = rgba(floater.color, 0.8);
    ctx.shadowBlur = 10;
    ctx.fillText(floater.text, floater.x, floater.y);
  }
  ctx.restore();
}

function drawJoystick() {
  if (!joystick.active || state.mode !== "playing") return;
  const dx = joystick.x - joystick.ox;
  const dy = joystick.y - joystick.oy;
  const length = Math.hypot(dx, dy);
  const max = 52;
  const scale = length > max ? max / length : 1;
  const kx = joystick.ox + dx * scale;
  const ky = joystick.oy + dy * scale;

  ctx.save();
  ctx.strokeStyle = "rgba(97, 245, 255, 0.24)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(joystick.ox, joystick.oy, max, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([2, 7]);
  ctx.strokeStyle = "rgba(97, 245, 255, 0.15)";
  ctx.beginPath();
  ctx.arc(joystick.ox, joystick.oy, max + 10, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.globalCompositeOperation = "lighter";
  drawGlow([97, 245, 255], kx, ky, 26, 0.28);
  ctx.restore();

  ctx.save();
  ctx.fillStyle = "rgba(190, 252, 255, 0.7)";
  ctx.beginPath();
  ctx.arc(kx, ky, 8, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(6, 14, 28, 0.8)";
  ctx.beginPath();
  ctx.arc(kx, ky, 3.4, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawRedFlash() {
  if (state.redFlash <= 0) return;
  const pulse = state.redFlash * 0.5;
  const gradient = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.18, W / 2, H / 2, Math.max(W, H) * 0.72);
  gradient.addColorStop(0, "rgba(255, 40, 80, 0)");
  gradient.addColorStop(0.7, `rgba(255, 32, 70, ${pulse * 0.35})`);
  gradient.addColorStop(1, `rgba(255, 22, 60, ${pulse})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = "#03040a";
  ctx.fillRect(0, 0, W, H);
  if (bgCanvas) ctx.drawImage(bgCanvas, 0, 0, W, H);

  drawStars();
  drawGrid();
  drawArena();

  ctx.save();
  if (state.shake > 0.1) {
    const amount = reduceMotion ? state.shake * 0.25 : state.shake;
    ctx.translate(rand(-amount, amount), rand(-amount, amount));
  }

  drawPickups();
  drawEnemies();
  drawBullets();
  drawPlayer();
  drawParticles();
  drawRings();
  drawFloaters();
  ctx.restore();

  drawJoystick();
  if (fxCanvas) ctx.drawImage(fxCanvas, 0, 0, W, H);
  drawRedFlash();
}

function frame(now) {
  const dt = Math.min(0.036, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

function boot() {
  state.best = readBest();
  resize();
  attachEvents();
  syncSoundUI();
  updateMenuStats();
  showMenu();
  requestAnimationFrame(frame);
  window.setTimeout(() => {
    document.body.classList.remove("booting");
    dom.boot.classList.add("is-done");
    window.setTimeout(() => dom.boot.remove(), 420);
  }, 1500);
}

boot();

window.__RAST__ = {
  state,
  startRun,
  showMenu,
  dash,
  damagePlayer,
  spawnEnemy,
  CONFIG,
};
