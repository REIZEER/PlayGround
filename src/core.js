export const TAU = Math.PI * 2;

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const lerp = (a, b, t) => a + (b - a) * t;

export const rand = (min, max) => min + Math.random() * (max - min);

export const randInt = (min, max) => Math.floor(rand(min, max + 1));

export const pick = (items, rng = Math.random) => items[Math.floor(rng() * items.length)];

export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

export const distSq = (ax, ay, bx, by) => {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
};

export const angleDiff = (target, current) => {
  let delta = (target - current) % TAU;
  if (delta > Math.PI) delta -= TAU;
  if (delta < -Math.PI) delta += TAU;
  return delta;
};

export const formatScore = (value) => Math.max(0, Math.floor(value)).toLocaleString("en-US");

export const formatTime = (seconds) => {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

export const comboMultiplier = (combo) => 1 + Math.min(9, Math.floor(Math.max(0, combo) / 5));

export const hullStatus = (hull, maxHull) => {
  if (hull <= 1) return "CRITICAL";
  if (hull < maxHull) return "DAMAGED";
  return "STABLE";
};

export const difficultyFor = (wave) => {
  const w = Math.max(1, Math.floor(wave));
  return {
    spawnInterval: Math.max(0.28, 0.92 - w * 0.052),
    maxEnemies: 10 + w * 3,
    speedScale: 1 + Math.min(1.05, (w - 1) * 0.055),
    hpBonus: Math.floor((w - 1) / 4),
    burst: Math.min(9, 2 + Math.floor(w / 2)),
  };
};

export const ENEMY_TYPES = ["dart", "haunt", "splitter", "brute"];

export const enemyWeightsFor = (wave) => {
  const w = Math.max(1, Math.floor(wave));
  return [
    ["dart", 52],
    ["haunt", w >= 2 ? 28 : 18],
    ["splitter", w >= 3 ? 18 : 6],
    ["brute", w >= 5 ? 10 + Math.min(14, w) : 0],
  ].filter(([, weight]) => weight > 0);
};

export const enemyTypeFor = (wave, rng = Math.random) => {
  const weights = enemyWeightsFor(wave);
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [type, weight] of weights) {
    roll -= weight;
    if (roll <= 0) return type;
  }
  return weights[weights.length - 1][0];
};

const WAVE_TITLES = [
  "SIGNAL RISING",
  "STATIC BLOOM",
  "GHOST PACKET",
  "CARRIER WAVE",
  "RED SHIFT",
  "PHASE STORM",
  "DEAD CHANNEL",
  "SIGNAL COLLAPSE",
];

export const waveTitle = (wave) => WAVE_TITLES[(Math.max(1, Math.floor(wave)) - 1) % WAVE_TITLES.length];

export const rankFor = (best) => {
  if (best >= 100000) return "LEGEND";
  if (best >= 60000) return "VOID ACE";
  if (best >= 30000) return "OPERATOR";
  if (best >= 12000) return "RUNNER";
  if (best >= 4000) return "SCOUT";
  return "RECRUIT";
};

export const formatRank = (best) => rankFor(Math.max(0, Math.floor(best)));
