import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  isBossWave,
  createBossWave,
  updateBosses,
  MAX_SUMMONS,
} from "../game/src/boss.js";
import { setRandom } from "../game/src/random.js";
import { setupRun } from "./helpers.js";
import { state } from "../game/src/state.js";

const arena = { width: 800, height: 400 };

afterEach(() => setRandom(null));

// Onda de chefe com o chefe pedido (random < 0.5 = Lich, senão Demônio)
function bossWave(kind, wave = 10) {
  setRandom(() => (kind === "lich" ? 0.1 : 0.9));
  const enemies = createBossWave(wave, arena);
  setRandom(null);
  return enemies;
}

test("ondas de chefe são múltiplas de 10", () => {
  assert.ok(isBossWave(10));
  assert.ok(isBossWave(20));
  assert.ok(!isBossWave(9));
  assert.ok(!isBossWave(11));
  assert.ok(!isBossWave(0));
});

test("onda de chefe tem um chefe e 2 a 4 escoltas", () => {
  for (const r of [0, 0.5, 0.99]) {
    setRandom(() => r);
    const enemies = createBossWave(10, arena);
    const bosses = enemies.filter((e) => e.isBoss);
    assert.equal(bosses.length, 1);
    const escort = enemies.length - 1;
    assert.ok(escort >= 2 && escort <= 4);
  }
});

test("o sorteio usa random() e os dois chefes aparecem", () => {
  const names = new Set();
  for (const r of [0.1, 0.9]) {
    setRandom(() => r);
    names.add(createBossWave(10, arena).find((e) => e.isBoss).name);
  }
  assert.deepEqual([...names].sort(), ["Lich", "Senhor Demônio"]);
});

test("chefe é grande, forte e cresce com a onda", () => {
  const b10 = bossWave("lich", 10).find((e) => e.isBoss);
  const b20 = bossWave("lich", 20).find((e) => e.isBoss);
  assert.equal(b10.size, 30);
  assert.equal(b10.shape, "mage");
  assert.equal(b10.resist.ice, 0.5);
  assert.equal(b10.resist.holy, -0.3);
  assert.ok(b10.maxHp > 12 * 35);
  assert.ok(b20.maxHp > b10.maxHp && b20.dmg > b10.dmg);
  const demon = bossWave("demon").find((e) => e.isBoss);
  assert.equal(demon.shape, "demonlord");
  assert.equal(demon.resist.fire, 0.6);
  assert.equal(demon.resist.water, -0.3);
});

test("updateBosses não faz nada sem chefe vivo", () => {
  const minion = { name: "m", hp: 10, maxHp: 10, dead: false, x: 300, y: 200 };
  const state = setupRun([], [minion]);
  updateBosses(100000);
  assert.equal(state.enemies.length, 1);
  assert.equal(state.player.hp, state.player.maxHp);
  const [boss] = bossWave("lich").filter((e) => e.isBoss);
  boss.dead = true;
  state.enemies = [boss];
  updateBosses(100000);
  assert.equal(state.enemies.length, 1);
});

test("Lich invoca 2 esqueletos e respeita o limite", () => {
  const boss = bossWave("lich").find((e) => e.isBoss);
  const state = setupRun([], [boss]);
  updateBosses(boss.abilityInterval - 1);
  assert.equal(state.enemies.length, 1);
  updateBosses(1);
  assert.equal(state.enemies.filter((e) => e.summoned).length, 2);
  for (let i = 0; i < 10; i++) updateBosses(boss.abilityInterval);
  assert.equal(state.enemies.filter((e) => e.summoned && !e.dead).length, MAX_SUMMONS);
});

test("nova de fogo fere o herói e aplica queimadura", () => {
  const boss = bossWave("demon").find((e) => e.isBoss);
  const state = setupRun([], [boss]);
  const before = state.player.hp;
  updateBosses(boss.abilityInterval);
  assert.ok(state.player.hp < before);
  assert.ok(state.player.dots.some((d) => d.type === "burning"));
});

test("Senhor Demônio enfurece abaixo de 33% de vida", () => {
  const boss = bossWave("demon").find((e) => e.isBoss);
  const state = setupRun([], [boss]);
  const interval = boss.atkInterval;
  updateBosses(10);
  assert.ok(!boss.enraged);
  boss.hp = Math.floor(boss.maxHp * 0.3);
  updateBosses(10);
  assert.ok(boss.enraged);
  assert.ok(boss.atkInterval < interval);
  assert.ok(state.enemies.includes(boss));
});

test("Nova de Fogo: o Parry reflete no próprio chefe e o bloqueio evita a queimadura", () => {
  const enemies = bossWave("demon");
  const demonWave = enemies.find((e) => e.isBoss);
  setupRun(["iron_shield"], enemies);
  demonWave.abilityTimer = demonWave.abilityInterval;
  const hpBefore = demonWave.hp;
  state.player.nextBlockActive = true;
  updateBosses(1);
  assert.equal(state.player.hp, state.player.maxHp, "ataque bloqueado");
  assert.ok(demonWave.hp < hpBefore, "reflexo acerta o chefe");
  assert.equal(state.player.dots.length, 0, "sem queimadura no bloqueio");
  assert.equal(demonWave.name, "Senhor Demônio");
});

test("chefe congelado não conjura nem avança a recarga das habilidades", () => {
  const lich = bossWave("lich").find((e) => e.isBoss);
  setupRun([], [lich]);
  lich.frozen = 1000;
  updateBosses(lich.abilityInterval * 2);
  assert.equal(state.enemies.filter((e) => e.summoned).length, 0);
  assert.equal(lich.abilityTimer, 0);

  const demon = bossWave("demon").find((e) => e.isBoss);
  setupRun([], [demon]);
  demon.frozen = 1000;
  updateBosses(demon.abilityInterval * 2);
  assert.equal(state.player.hp, state.player.maxHp);
  assert.equal(state.player.dots.length, 0);
});

test("esquivar da Nova de Fogo também evita a queimadura", () => {
  const demon = bossWave("demon").find((e) => e.isBoss);
  setupRun(["shadow_cloak"], [demon]);
  state.player.evasion = 1;
  demon.abilityTimer = demon.abilityInterval;
  updateBosses(1);
  assert.equal(state.player.hp, state.player.maxHp);
  assert.equal(state.player.dots.length, 0);
});
