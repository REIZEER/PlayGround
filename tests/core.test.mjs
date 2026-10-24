import test from "node:test";
import assert from "node:assert/strict";
import {
  angleDiff,
  clamp,
  comboMultiplier,
  difficultyFor,
  dist,
  enemyTypeFor,
  formatRank,
  formatScore,
  formatTime,
  hullStatus,
  lerp,
  rand,
  rankFor,
  waveTitle,
  ENEMY_TYPES,
} from "../src/core.js";

test("clamp keeps values inside the bounds", () => {
  assert.equal(clamp(-4, 0, 10), 0);
  assert.equal(clamp(4, 0, 10), 4);
  assert.equal(clamp(14, 0, 10), 10);
});

test("lerp and distance helpers are stable", () => {
  assert.equal(lerp(0, 10, 0.25), 2.5);
  assert.equal(dist(0, 0, 3, 4), 5);
  assert.ok(Number.isNaN(rand(0, 0)) || rand(0, 0) === 0);
});

test("angleDiff wraps to the shortest signed arc", () => {
  assert.ok(Math.abs(angleDiff(Math.PI * 1.9, -Math.PI * 0.05) + Math.PI * 0.05) < 1e-9);
  assert.ok(Math.abs(angleDiff(-0.1, 0.1) + 0.2) < 1e-9);
});

test("score formatting never produces negative display", () => {
  assert.equal(formatScore(1234.9), "1,234");
  assert.equal(formatScore(-9), "0");
});

test("time formatting is mm:ss", () => {
  assert.equal(formatTime(0), "0:00");
  assert.equal(formatTime(65.8), "1:05");
  assert.equal(formatTime(-5), "0:00");
});

test("combo multiplier scales and caps", () => {
  assert.equal(comboMultiplier(0), 1);
  assert.equal(comboMultiplier(4), 1);
  assert.equal(comboMultiplier(5), 2);
  assert.equal(comboMultiplier(45), 10);
  assert.equal(comboMultiplier(500), 10);
});

test("hull status reflects damage", () => {
  assert.equal(hullStatus(3, 3), "STABLE");
  assert.equal(hullStatus(2, 3), "DAMAGED");
  assert.equal(hullStatus(1, 3), "CRITICAL");
});

test("difficulty ramps and clamps", () => {
  const first = difficultyFor(1);
  const tenth = difficultyFor(10);
  const absurd = difficultyFor(500);
  assert.ok(tenth.spawnInterval < first.spawnInterval);
  assert.ok(tenth.maxEnemies > first.maxEnemies);
  assert.ok(tenth.speedScale > first.speedScale);
  assert.ok(absurd.spawnInterval >= 0.28);
  assert.ok(absurd.speedScale <= 2.05);
  assert.equal(difficultyFor(0).maxEnemies, difficultyFor(1).maxEnemies);
});

test("early waves only spawn simple enemies, later waves unlock all", () => {
  const seen = new Set();
  for (let i = 0; i < 200; i += 1) seen.add(enemyTypeFor(1, Math.random));
  assert.deepEqual([...seen].sort(), ["dart", "haunt", "splitter"]);
  assert.ok(!seen.has("brute"));

  const late = new Set();
  for (let i = 0; i < 1000; i += 1) late.add(enemyTypeFor(8, Math.random));
  for (const type of ENEMY_TYPES) assert.ok(late.has(type));
});

test("every enemy roll returns a known type", () => {
  for (const wave of [1, 2, 3, 5, 12, 40]) {
    for (const roll of [0, 0.01, 0.25, 0.5, 0.75, 0.999, 1]) {
      const type = enemyTypeFor(wave, () => Math.min(0.999999, roll));
      assert.ok(ENEMY_TYPES.includes(type));
    }
  }
});

test("wave titles cycle", () => {
  assert.equal(waveTitle(1), "SIGNAL RISING");
  assert.equal(waveTitle(2), "STATIC BLOOM");
  assert.equal(waveTitle(9), "SIGNAL RISING");
});

test("ranks climb with best score", () => {
  assert.equal(formatRank(-1), "RECRUIT");
  assert.equal(rankFor(5000), "SCOUT");
  assert.equal(rankFor(15000), "RUNNER");
  assert.equal(rankFor(1000000), "LEGEND");
});
