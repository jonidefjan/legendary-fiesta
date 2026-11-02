import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { setupRun, enemy, item, fixedRandom, setLevel, ITEMS } from "./helpers.js";
import { state } from "../game/src/state.js";
import { setRandom } from "../game/src/random.js";
import {
  createWave,
  rangedCount,
  rangedSpawnX,
  waveScales,
  RANGED_TYPES,
  ENEMY_TYPES,
} from "../game/src/waves.js";
import { rewardOffer, rearReachOffer, REAR_REACH_OFFERS } from "../game/src/items.js";
import { createBossWave } from "../game/src/boss.js";
import {
  updateEnemies,
  updateProjectiles,
  fireProjectile,
  clearProjectiles,
  activateItem,
  isRearAt,
} from "../game/src/combat.js";

afterEach(() => setRandom(null));

const arena = { width: 800, height: 400 };

// Atirador de teste: parado no fundo, vida e dano conhecidos
function shooter(overrides = {}) {
  return enemy({
    kind: "archer",
    ranged: true,
    projectile: "arrow",
    x: 600,
    hp: 50,
    maxHp: 50,
    dmg: 10,
    xp: 14,
    fragments: 3,
    ...overrides,
  });
}

// ─── Dados e quantidade ───
test("rangedCount por faixa de onda", () => {
  const faixas = [[1, 0], [4, 0], [5, 0], [10, 0], [11, 2], [20, 2], [21, 3], [30, 3], [31, 4], [99, 4]];
  for (const [wave, count] of faixas) assert.equal(rangedCount(wave), count, `onda ${wave}`);
});

test("atiradores ficam fora de ENEMY_TYPES e têm os números da spec", () => {
  assert.ok(ENEMY_TYPES.every((type) => !type.ranged));
  const [archer, mage] = RANGED_TYPES;
  assert.deepEqual(
    [archer.kind, archer.shape, archer.hp, archer.dmg, archer.atkInterval, archer.xp, archer.fragments, archer.size],
    ["archer", "rogue", 22, 7, 2200, 14, 3, 16],
  );
  assert.deepEqual(
    [mage.kind, mage.shape, mage.hp, mage.dmg, mage.atkInterval, mage.xp, mage.fragments, mage.size],
    ["mage", "mage", 28, 9, 2800, 18, 4, 18],
  );
  assert.ok(RANGED_TYPES.every((type) => type.speed === 0 && type.ranged));
});

test("o total de inimigos continua 2 + onda nas ondas comuns e os atiradores ocupam vagas", () => {
  setRandom(() => 0.3);
  for (const wave of [1, 4, 5, 7, 9, 10, 11, 15, 21, 25, 31, 37]) {
    const enemies = createWave(wave, arena);
    assert.equal(enemies.length, 2 + wave, `onda ${wave}`);
    assert.equal(enemies.filter((e) => e.ranged).length, rangedCount(wave), `atiradores da onda ${wave}`);
  }
});

test("arqueiro desde a onda 11, mago desde a 13; sorteio por random()", () => {
  setRandom(() => 0.99);
  assert.equal(createWave(10, arena).filter((e) => e.ranged).length, 0);
  assert.ok(createWave(12, arena).filter((e) => e.ranged).every((e) => e.kind === "archer"));
  assert.ok(createWave(13, arena).filter((e) => e.ranged).every((e) => e.kind === "mage"));
  setRandom(() => 0);
  assert.ok(createWave(13, arena).filter((e) => e.ranged).every((e) => e.kind === "archer"));
});

test("o chefe da onda 10 não tem atirador; da 20 em diante a escolta os inclui", () => {
  for (const r of [0, 0.5, 0.99]) {
    setRandom(() => r);
    assert.equal(createBossWave(10, arena).filter((e) => e.ranged).length, 0);
    assert.equal(createBossWave(20, arena).filter((e) => e.ranged).length, 2);
    assert.equal(createBossWave(30, arena).filter((e) => e.ranged).length, 3);
    assert.equal(createBossWave(40, arena).filter((e) => e.ranged).length, 4);
  }
});

// ─── Escala do late game ───
test("waveScales: igual ao de antes até a onda 10, ×1,15 de vida e ×1,08 de dano depois", () => {
  for (let wave = 1; wave <= 10; wave++) {
    const s = waveScales(wave);
    assert.equal(s.hp, 1 + (wave - 1) * 0.2);
    assert.equal(s.dmg, 1 + (wave - 1) * 0.15);
  }
  const s11 = waveScales(11);
  assert.ok(Math.abs(s11.hp - 3 * 1.15) < 1e-9);
  assert.ok(Math.abs(s11.dmg - 2.5 * 1.08) < 1e-9);
  const s20 = waveScales(20);
  assert.ok(Math.abs(s20.hp - 4.8 * 1.15 ** 10) < 1e-9);
  assert.ok(Math.abs(s20.dmg - 3.85 * 1.08 ** 10) < 1e-9);
  assert.ok(Math.abs(waveScales(20, true).dmg - 3.85 * 0.85 * 1.08 ** 10) < 1e-9);
});

test("chefe da onda 20 tem vida e dano da nova escala", () => {
  setRandom(() => 0.1); // Lich
  const boss = createBossWave(20, arena).find((e) => e.isBoss);
  const s = waveScales(20);
  assert.equal(boss.maxHp, Math.round(35 * s.hp * 12));
  assert.equal(boss.dmg, Math.round(6 * s.dmg * 2));
  assert.ok(boss.maxHp > Math.round(35 * 4.8 * 12), "maior que sem o late game");
  assert.ok(boss.dmg > Math.round(6 * 3.85 * 2));
});

// ─── Posição ───
test("rangedSpawnX: visível, na linha de trás e até 45 px mais perto a cada atirador", () => {
  const casos = [
    { width: 800, maxX: 700 },
    { width: 360, maxX: 330, mobile: true },
    { width: 360, maxX: 260, mobile: true },
    { width: 800 },
  ];
  for (const a of casos) {
    const playerX = a.width * 0.22;
    const rightX = a.maxX ?? a.width * 0.9;
    for (const count of [1, 2, 3, 4]) {
      let prev = Infinity;
      for (let i = 0; i < count; i++) {
        const x = rangedSpawnX(i, count, a);
        assert.ok(x <= (a.maxX ?? Infinity), `visível ${JSON.stringify(a)}`);
        assert.ok(x > playerX);
        assert.ok(isRearAt(x, playerX, rightX), `linha de trás ${JSON.stringify(a)} i=${i}/${count}`);
        if (i > 0) assert.ok(prev - x <= 45 + 1e-9 && prev - x >= 0);
        prev = x;
      }
    }
  }
  // Celular estreito com o herói em playerX real: os 4 atiradores na frente dele e na retaguarda
  for (const playerX of [79.2, 120]) {
    const a = { width: 360, maxX: 330, mobile: true, playerX };
    for (let i = 0; i < 4; i++) {
      const x = rangedSpawnX(i, 4, a);
      assert.ok(x > playerX && x <= 330 && isRearAt(x, playerX, 330), `playerX ${playerX} i=${i}: ${x}`);
    }
  }
  assert.equal(rangedSpawnX(0, 2, { width: 800 }), 720);
  assert.equal(rangedSpawnX(1, 2, { width: 800 }), 675);
});

test("atirador nasce parado e não muda de x em updateEnemies", () => {
  setRandom(() => 0.3);
  const [en] = createWave(13, { ...arena, maxX: 700 }).filter((e) => e.ranged);
  assert.equal(en.moving, false);
  assert.equal(en.speed, 0);
  setupRun([], [en]);
  const x = en.x;
  for (let i = 0; i < 200; i++) updateEnemies(50);
  assert.equal(en.x, x);
});

// ─── Projéteis ───
test("o disparo só cria o projétil; o dano vem na chegada", () => {
  const sh = shooter({ atkTimer: 2199 });
  setupRun([], [sh]);
  const hp = state.player.hp;
  updateEnemies(10);
  assert.equal(state.projectiles.length, 1);
  assert.equal(state.player.hp, hp, "sem dano no disparo");
  assert.ok(sh.attackAnim > 0);
  updateProjectiles(100);
  assert.equal(state.player.hp, hp, "ainda em voo");
  updateProjectiles(2000);
  assert.equal(state.player.hp, hp - 10);
  assert.equal(state.projectiles.length, 0);
});

test("a flecha é mais rápida que a orbe", () => {
  const archer = shooter();
  const mage = shooter({ projectile: "orb", kind: "mage" });
  setupRun([], [archer, mage]);
  fireProjectile(archer);
  fireProjectile(mage);
  updateProjectiles(200);
  const [arrow, orb] = state.projectiles;
  assert.ok(arrow.x < orb.x);
});

test("esquiva e bloqueio são resolvidos no impacto", () => {
  const sh = shooter();
  setupRun([], [sh]);
  fixedRandom(0.5);
  const hp = state.player.hp;
  state.player.blocksLeft = 1;
  fireProjectile(sh);
  updateProjectiles(100);
  assert.equal(state.player.blocksLeft, 1, "o escudo só gasta na chegada");
  updateProjectiles(2000);
  assert.equal(state.player.hp, hp, "bloqueado na chegada");
  assert.equal(state.player.blocksLeft, 0);

  state.player.evasion = 1;
  fireProjectile(sh);
  updateProjectiles(2000);
  assert.equal(state.player.hp, hp, "esquivado na chegada");
});

test("projéteis são limpos ao fim da onda e quando o herói morre", () => {
  const sh = shooter();
  setupRun([], [sh]);
  fireProjectile(sh);
  clearProjectiles();
  assert.equal(state.projectiles.length, 0);
  updateProjectiles(5000);
  assert.equal(state.player.hp, state.player.maxHp);

  state.player.hp = 5;
  fireProjectile(sh);
  fireProjectile(sh);
  updateProjectiles(5000);
  assert.equal(state.running, false);
  assert.equal(state.projectiles.length, 0);
  fireProjectile(sh);
  updateProjectiles(10);
  assert.equal(state.projectiles.length, 0, "run parada limpa tudo");
});

test("atirador morto com o projétil em voo: acerta uma vez, sem XP duplicado nem erro", () => {
  const sh = shooter({ hp: 1 });
  setupRun([], [sh]);
  fireProjectile(sh);
  sh.hp = 0;
  updateEnemies(16); // marca a morte e paga XP e fragmentos uma vez
  assert.equal(sh.dead, true);
  const { kills, score, fragments } = state;
  const hp = state.player.hp;
  assert.doesNotThrow(() => updateProjectiles(5000));
  assert.equal(state.player.hp, hp - 10);
  updateEnemies(16);
  assert.deepEqual([state.kills, state.score, state.fragments], [kills, score, fragments]);
});

test("atirador morto: o parry do Escudo de Ferro não o atinge", () => {
  const sh = shooter({ hp: 1 });
  setupRun(["iron_shield"], [sh]);
  setLevel("iron_shield", 3);
  fixedRandom(0);
  state.player.blocksLeft = 1;
  fireProjectile(sh);
  sh.hp = 0;
  sh.dead = true;
  assert.doesNotThrow(() => updateProjectiles(5000));
  assert.equal(state.player.blocksLeft, 0, "bloqueou");
  assert.equal(sh.hp, 0, "sem parry em cadáver");
});

test("atirador morto: reflexo, veneno e fogo no atacante não fazem nada", () => {
  const sh = shooter({ hp: 1 });
  setupRun(["chainmail", "basilisk_hide", "dragonscale"], [sh]);
  for (const id of ["chainmail", "basilisk_hide", "dragonscale"]) setLevel(id, 5);
  fixedRandom(0);
  fireProjectile(sh);
  sh.hp = 0;
  sh.dead = true;
  assert.doesNotThrow(() => updateProjectiles(5000));
  assert.ok(state.player.hp < state.player.maxHp, "o golpe acertou");
  assert.equal(sh.dots.length, 0, "sem veneno nem fogo");
  assert.equal(sh.hp, 0);
  assert.equal(state.projectiles.length, 0, "sem reflexo a caminho");
});

// ─── Cota de Malha ───
test("Cota de Malha: o dano volta como projétil e só entra na chegada ao atirador", () => {
  const sh = shooter();
  setupRun(["chainmail"], [sh]);
  setLevel("chainmail", 3);
  fixedRandom(0);
  fireProjectile(sh);
  updateProjectiles(5000); // chega no herói
  assert.ok(state.player.hp < state.player.maxHp, "o herói levou o golpe");
  assert.equal(state.projectiles.length, 1);
  const back = state.projectiles[0];
  assert.equal(back.reflected, true);
  assert.equal(back.target, sh);
  assert.ok(back.damage > 0);
  assert.equal(sh.hp, 50, "ainda em voo");
  const damage = back.damage;
  updateProjectiles(5000);
  assert.equal(sh.hp, 50 - damage);
  assert.equal(state.projectiles.length, 0);
});

test("Cota de Malha: se o atirador morreu, o reflexo some sem efeito", () => {
  const sh = shooter();
  setupRun(["chainmail"], [sh]);
  setLevel("chainmail", 3);
  fixedRandom(0);
  fireProjectile(sh);
  updateProjectiles(5000);
  sh.hp = 0;
  sh.dead = true;
  const kills = state.kills;
  assert.doesNotThrow(() => updateProjectiles(5000));
  assert.equal(sh.hp, 0);
  assert.equal(state.projectiles.length, 0);
  assert.equal(state.kills, kills);
});

test("carta extra lendária (phantom_bow) não mexe no pity", () => {
  setupRun(["rusted_sword"]);
  state.rewardsSinceLegendary = 2;
  const offer = rewardOffer(3, { extra: item("phantom_bow") });
  const drawn = offer.options.slice(0, -1);
  assert.equal(offer.options.at(-1).id, "phantom_bow");
  assert.ok(!drawn.some((i) => i.id === "phantom_bow"));
  const legendary = drawn.some((i) => i.rarity === "legendary");
  assert.equal(state.rewardsSinceLegendary, legendary ? 0 : 3, "só o sorteio normal conta");
  // com o pity cheio o sorteio normal garante o lendário e zera, com a extra lendária fora da conta
  setupRun(["rusted_sword"]);
  state.rewardsSinceLegendary = 4;
  const full = rewardOffer(3, { extra: item("phantom_bow") });
  assert.equal(state.rewardsSinceLegendary, 0);
  assert.ok(full.options.slice(0, -1).some((i) => i.rarity === "legendary"));
});

test("Cota de Malha: no corpo a corpo o reflexo continua imediato", () => {
  const melee = enemy({ x: 150, hp: 50, maxHp: 50, dmg: 10, atkTimer: 1999 });
  setupRun(["chainmail"], [melee]);
  setLevel("chainmail", 3);
  fixedRandom(0);
  updateEnemies(10);
  assert.equal(state.projectiles.length, 0);
  assert.ok(melee.hp < 50, "dano devolvido na hora");
});

// ─── A onda precisa terminar ───
test("qualquer arma alcança um atirador sozinho e a onda termina", () => {
  const weapons = ITEMS.filter((it) => it.type === "weapon");
  assert.ok(weapons.length > 10);
  for (const weapon of weapons) {
    const sh = shooter({ x: 700, hp: 100000, maxHp: 100000 });
    setupRun([weapon.id], [sh]);
    state.arenaRight = 760;
    const used = activateItem(item(weapon.id));
    assert.ok(used, `${weapon.id} atacou`);
    assert.ok(sh.hp < 100000 || sh.dots.length > 0, `${weapon.id} alcançou o atirador`);
  }
  const sh = shooter({ x: 700, hp: 1 });
  setupRun(["rusted_sword"], [sh]);
  activateItem(item("rusted_sword"));
  updateEnemies(16);
  assert.ok(state.enemies.every((e) => e.dead), "a onda pode terminar");
});

// ─── Carta extra da recompensa da onda 10 ───
const REAR_CARDS = ["long_crossbow", "phantom_bow", "judgment_tome"];

test("onda 10 sem item de fundo: oferta é uma das três e seismic_finger nunca sai", () => {
  const seen = new Set();
  for (const r of [0, 0.4, 0.7, 0.999]) {
    setupRun(["rusted_sword"]);
    state.wave = 10;
    fixedRandom(r);
    const offer = rearReachOffer();
    assert.ok(REAR_CARDS.includes(offer.id));
    seen.add(offer.id);
  }
  assert.equal(seen.size, 3);
  assert.ok(!REAR_REACH_OFFERS.includes("seismic_finger"));
});

test("com qualquer um dos quatro itens, ou em outra onda, não há oferta", () => {
  for (const id of ["long_crossbow", "phantom_bow", "judgment_tome", "seismic_finger"]) {
    setupRun(["rusted_sword", id]);
    state.wave = 10;
    assert.equal(rearReachOffer(), null, id);
  }
  for (const wave of [1, 9, 11, 20]) {
    setupRun(["rusted_sword"]);
    state.wave = wave;
    assert.equal(rearReachOffer(), null, `onda ${wave}`);
  }
});

test("a carta extra não duplica, nem depois de rerrolar, e não mexe no pity", () => {
  for (let n = 0; n < 40; n++) {
    setupRun(["rusted_sword"]);
    state.wave = 10;
    state.rerollsLeft = 3;
    state.rewardsSinceLegendary = 1;
    const extra = rearReachOffer();
    const offer = rewardOffer(3, { boss: true, extra });
    for (let r = 0; r < 3; r++) {
      const ids = offer.options.map((i) => i.id);
      assert.equal(new Set(ids).size, ids.length, "sem cartas iguais");
      assert.equal(ids.at(-1), extra.id, "extra no fim");
      if (r < 2) offer.reroll();
    }
    assert.equal(state.rewardsSinceLegendary, 0, "o lendário do chefe zera o pity");
  }
  // sem lendário no chefe-less: a extra não conta
  setupRun(["rusted_sword"]);
  state.rewardsSinceLegendary = 0;
  const base = rewardOffer(3, { extra: item("long_crossbow") });
  const hadLegendary = base.options.slice(0, -1).some((i) => i.rarity === "legendary");
  assert.equal(state.rewardsSinceLegendary, hadLegendary ? 0 : 1);
});
