import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { setupRun, enemy, setLevel, fixedRandom } from "./helpers.js";
import { on } from "../game/src/events.js";
import { state } from "../game/src/state.js";
import { setRandom } from "../game/src/random.js";
import {
  MAX_ON_FIELD,
  SPAWN_BATCH,
  SPAWN_GAP_MS,
  splitSpawn,
  spawnBatchSize,
  waveCleared,
  rigsLeft,
  corpseGone,
  updateSpawnQueue,
  createWave,
  waveScales,
} from "../game/src/waves.js";
import {
  createBossWave,
  updateBosses,
  isReinforcedBoss,
  MAX_SUMMONS,
  MAX_SUMMONS_REINFORCED,
} from "../game/src/boss.js";
import { updateEnemies, applyElementalDamage, applyDot, processDots, enemyAttack, guardMult } from "../game/src/combat.js";

afterEach(() => setRandom(null));

const arena = { width: 800, height: 400 };

// ─── A. Spawn em partes ───
const regulars = (n) => Array.from({ length: n }, (_, i) => enemy({ id: i }));

test("splitSpawn: onda pequena fica intacta, na mesma ordem", () => {
  const list = regulars(MAX_ON_FIELD);
  const { field, queue } = splitSpawn(list);
  assert.equal(queue.length, 0);
  assert.deepEqual(field, list);
});

test("splitSpawn: onda grande tem 30 em campo, o resto na fila, sem perder nem duplicar", () => {
  const list = regulars(50);
  const { field, queue } = splitSpawn(list);
  assert.equal(field.length, MAX_ON_FIELD);
  assert.equal(queue.length, 20);
  assert.deepEqual([...field, ...queue].map((e) => e.id), list.map((e) => e.id));
  assert.equal(new Set([...field, ...queue]).size, 50);
});

test("splitSpawn: chefe e atiradores ficam sempre em campo", () => {
  const list = [
    ...regulars(40),
    enemy({ id: "a", ranged: true }),
    enemy({ id: "b", ranged: true }),
    enemy({ id: "boss", isBoss: true }),
  ];
  const { field, queue } = splitSpawn(list);
  assert.equal(field.length, MAX_ON_FIELD);
  for (const id of ["a", "b", "boss"]) assert.ok(field.some((e) => e.id === id));
  assert.ok(queue.every((e) => !e.ranged && !e.isBoss));
  assert.equal(field.length + queue.length, list.length);
});

test("spawnBatchSize: intervalo, teto do grupo, vagas e fila curta", () => {
  assert.equal(spawnBatchSize(20, 1, SPAWN_GAP_MS - 1), 0);
  assert.equal(spawnBatchSize(20, 1, SPAWN_GAP_MS), SPAWN_BATCH);
  assert.equal(spawnBatchSize(20, MAX_ON_FIELD - 2, SPAWN_GAP_MS), 2);
  assert.equal(spawnBatchSize(3, 1, SPAWN_GAP_MS), 3);
  assert.equal(spawnBatchSize(20, MAX_ON_FIELD, SPAWN_GAP_MS), 0);
  assert.equal(spawnBatchSize(20, MAX_ON_FIELD + 5, SPAWN_GAP_MS), 0);
  assert.equal(spawnBatchSize(0, 0, SPAWN_GAP_MS), 0);
});

test("spawnBatchSize: campo vazio com fila entra na hora, sem esperar o intervalo", () => {
  assert.equal(spawnBatchSize(20, 0, 0), SPAWN_BATCH);
  assert.equal(spawnBatchSize(4, 0, 10), 4);
  assert.equal(spawnBatchSize(0, 0, 0), 0);
  assert.equal(spawnBatchSize(20, 1, 10), 0, "com alguém vivo o intervalo vale");
});

test("corpseGone: só o morto que o visual já soltou", () => {
  assert.equal(corpseGone(enemy({ dead: true, bodyGone: true })), true);
  assert.equal(corpseGone(enemy({ dead: true })), false);
  assert.equal(corpseGone(enemy({ bodyGone: true })), false);
});

test("waveCleared: com fila não conclui, mesmo com todos mortos", () => {
  const dead = [enemy({ dead: true })];
  assert.equal(waveCleared(dead, [enemy()]), false);
  assert.equal(waveCleared(dead, []), true);
  assert.equal(waveCleared([enemy()], []), false);
});

test("rigsLeft: no máximo 3 por quadro", () => {
  assert.equal(rigsLeft(0), 3);
  assert.equal(rigsLeft(2), 1);
  assert.equal(rigsLeft(3), 0);
  assert.equal(rigsLeft(9), 0);
});

test("updateSpawnQueue: entra em grupos na borda visível e limpa corpos", () => {
  const field = regulars(MAX_ON_FIELD - 3);
  const gone = enemy({ dead: true, bodyGone: true });
  const sinking = enemy({ dead: true, deathAnim: 0 }); // ainda afundando: fica
  const queue = regulars(20).map((e) => ({ ...e, moving: false }));
  setupRun([], [...field, gone, sinking]);
  state.spawnQueue = queue;
  state.spawnTimer = 0;
  const a = { ...arena, maxX: 700 };
  updateSpawnQueue(SPAWN_GAP_MS - 1, a);
  assert.equal(state.spawnQueue.length, 20);
  updateSpawnQueue(1, a);
  assert.equal(state.spawnQueue.length, 17); // só 3 vagas livres
  assert.ok(!state.enemies.includes(gone));
  assert.ok(state.enemies.includes(sinking));
  for (const e of state.enemies.slice(-3)) {
    assert.ok(e.x <= 700 && e.x >= 660);
    assert.equal(e.moving, true);
  }
  assert.equal(state.spawnTimer, 0);
});

test("updateSpawnQueue: sem render (ninguém marca bodyGone) a fila ainda esvazia e a onda fecha", () => {
  const dead = Array.from({ length: MAX_ON_FIELD }, () => enemy({ dead: true }));
  setupRun([], dead);
  state.spawnQueue = regulars(8);
  state.spawnTimer = 0;
  updateSpawnQueue(0, arena); // campo vazio: entra na hora
  assert.equal(state.spawnQueue.length, 2);
  for (const e of state.enemies) e.dead = true;
  updateSpawnQueue(0, arena);
  assert.equal(state.spawnQueue.length, 0);
  assert.equal(waveCleared(state.enemies, state.spawnQueue), false); // os que entraram ainda vivem
  for (const e of state.enemies) e.dead = true;
  assert.equal(waveCleared(state.enemies, state.spawnQueue), true);
});

test("createWave pequena + splitSpawn: igual a hoje", () => {
  setRandom(() => 0.3);
  const a = createWave(5, arena);
  setRandom(() => 0.3);
  const { field, queue } = splitSpawn(createWave(5, arena));
  assert.equal(queue.length, 0);
  assert.deepEqual(field, a);
});

// ─── B. Chefes reforçados ───
function bossWave(kind, wave = 20) {
  const r = wave >= 20 ? { lich: 0.1, demon: 0.5, bone_knight: 0.9 }[kind] : kind === "lich" ? 0.1 : 0.9;
  setRandom(() => r);
  const list = createBossWave(wave, arena);
  setRandom(null);
  return list;
}
const getBoss = (kind, wave) => bossWave(kind, wave).find((e) => e.isBoss);
const hit = (boss, ratio) => {
  boss.hp = Math.round(boss.maxHp * ratio);
};

test("isReinforcedBoss: só da onda 20 em diante", () => {
  assert.equal(isReinforcedBoss(10), false);
  assert.equal(isReinforcedBoss(19), false);
  assert.equal(isReinforcedBoss(20), true);
});

// Valores absolutos medidos no código de antes da fase 15 (git main), com random fixo
test("onda 10 igual à de hoje (Lich e Demônio); onda 20 com vida x1,5 e dano x1,25", () => {
  for (const kind of ["lich", "demon"]) {
    const b10 = getBoss(kind, 10);
    assert.equal(b10.maxHp, 1176);
    assert.equal(b10.dmg, 28);
    assert.equal(b10.reinforced, false);
  }
  const b20 = getBoss("lich", 20);
  assert.equal(b20.maxHp, 12234); // 8156 (escala atual) x 1,5
  assert.equal(b20.dmg, 125); // 100 x 1,25
});

test("onda 10: mesma sequência de random() e mesmo resultado de antes", () => {
  const run = (seq) => {
    let i = 0;
    let calls = 0;
    setRandom(() => {
      calls++;
      return seq[i++ % seq.length];
    });
    const list = createBossWave(10, arena);
    return { calls, list: list.map((e) => `${e.kind}:${e.maxHp}:${e.dmg}`) };
  };
  const a = run([0.3, 0.7, 0.1, 0.9, 0.5, 0.2, 0.8, 0.4]);
  assert.equal(a.calls, 23);
  assert.deepEqual(a.list, ["skeleton:98:14", "skeleton:98:14", "skeleton:98:14", "warrior:154:33", "lich:1176:28"]);
  const b = run([0.8, 0.6, 0.35, 0.15, 0.95, 0.05, 0.55, 0.65]);
  assert.equal(b.calls, 20);
  assert.deepEqual(b.list, ["rogue:70:19", "skeleton:98:14", "warrior:154:33", "demon:1176:28"]);
});

test("fases disparam uma vez cada, e golpe que cruza as duas dispara as duas", () => {
  const boss = getBoss("demon");
  setupRun([], [boss]);
  hit(boss, 0.7);
  updateBosses(1);
  assert.equal(boss.phasesDone, 0);
  hit(boss, 0.6);
  updateBosses(1);
  updateBosses(1);
  assert.equal(boss.phasesDone, 1);
  hit(boss, 0.5);
  updateBosses(1);
  assert.equal(boss.phasesDone, 1);
  const b2 = getBoss("demon");
  setupRun([], [b2]);
  hit(b2, 0.2); // cruza 66% e 33% de uma vez: a fúria vem antes e a fase 1 espera o Taunt
  updateBosses(800);
  updateBosses(800);
  updateBosses(800);
  assert.equal(b2.phasesDone, 2);
});

test("fúria em 33% toca enrage antes; a fase seguinte espera 700 ms e depois dispara", () => {
  const boss = getBoss("demon");
  setupRun([], [boss]);
  state.player.hp = state.player.maxHp = 1e6; // a nova não pode matar o herói no teste
  hit(boss, 0.5);
  updateBosses(1);
  assert.equal(boss.phasesDone, 1);
  hit(boss, 0.3);
  updateBosses(1);
  assert.equal(boss.enraged, true);
  assert.equal(boss.castKind, "enrage");
  assert.equal(boss.phasesDone, 1, "a fase espera o Taunt");
  updateBosses(600);
  assert.equal(boss.phasesDone, 1);
  assert.equal(boss.castKind, "enrage");
  updateBosses(200);
  assert.equal(boss.phasesDone, 2, "depois da espera a fase dispara");
  assert.equal(boss.castKind, "nova");
  // Chefe morto não dispara nada, nem a espera
  const dead = getBoss("demon");
  setupRun([], [dead]);
  dead.hp = 0;
  updateBosses(2000);
  assert.equal(dead.phasesDone, 0);
  assert.ok(!dead.enraged);
});

test("chefe congelado espera a fase; onda 10 não tem fases", () => {
  const boss = getBoss("lich");
  setupRun([], [boss]);
  boss.frozen = 1000;
  hit(boss, 0.5);
  updateBosses(1);
  assert.equal(boss.phasesDone, 0);
  boss.frozen = 0;
  updateBosses(1);
  assert.equal(boss.phasesDone, 1);
  const b10 = getBoss("lich", 10);
  setupRun([], [b10]);
  hit(b10, 0.2);
  updateBosses(1);
  assert.equal(b10.phasesDone, 0);
  assert.ok(!b10.shootsBolts);
});

test("Lich: limite de invocados 10 x 6, 4 por fase, fúria só no reforçado", () => {
  const boss = getBoss("lich");
  setupRun([], [boss]);
  hit(boss, 0.6);
  updateBosses(1);
  assert.equal(state.enemies.filter((e) => e.summoned).length, 4);
  for (let i = 0; i < 10; i++) updateBosses(boss.abilityInterval);
  assert.equal(state.enemies.filter((e) => e.summoned && !e.dead).length, MAX_SUMMONS_REINFORCED);
  hit(boss, 0.3);
  updateBosses(1);
  assert.equal(boss.enraged, true);
  const b10 = getBoss("lich", 10);
  setupRun([], [b10]);
  for (let i = 0; i < 10; i++) updateBosses(b10.abilityInterval);
  assert.equal(state.enemies.filter((e) => e.summoned && !e.dead).length, MAX_SUMMONS);
  hit(b10, 0.1);
  updateBosses(1);
  assert.equal(b10.enraged, false);
});

test("Lich: shootsBolts só depois da fase 1 e o projétil sai enquanto ele anda", () => {
  const boss = getBoss("lich");
  setupRun([], [boss]);
  assert.ok(!boss.shootsBolts);
  hit(boss, 0.6);
  updateBosses(1);
  assert.equal(boss.shootsBolts, true);
  assert.ok(!boss.ranged);
  boss.x = 600;
  boss.moving = true;
  boss.atkTimer = 0;
  state.projectiles.length = 0;
  updateEnemies(boss.atkInterval);
  assert.equal(state.projectiles.length, 1);
  assert.equal(state.projectiles[0].kind, "orb");
  assert.ok(boss.x < 600 && boss.moving);
  assert.equal(state.player.hp, state.player.maxHp); // o dano vem na chegada
});

test("Demônio: nova nas fases e ritmo mais rápido, uma só por fase", () => {
  const boss = getBoss("demon");
  setupRun([], [boss]);
  const atk = boss.atkInterval;
  const ab = boss.abilityInterval;
  state.player.hp = state.player.maxHp = 1e6;
  const abilities = [];
  on("bossAbility", (p) => abilities.push(p.kind));
  hit(boss, 0.6);
  boss.abilityTimer = ab - 1; // quase na hora da nova normal
  const before = state.player.hp;
  updateBosses(2);
  assert.equal(boss.atkInterval, Math.round(atk * 0.9));
  assert.equal(boss.abilityInterval, Math.round(ab * 0.85));
  assert.ok(state.player.hp < before);
  assert.deepEqual(abilities, ["nova"], "só uma nova no quadro");
  // Segunda fase (33%): fúria primeiro, depois a fase e o ritmo de novo
  hit(boss, 0.3);
  abilities.length = 0;
  updateBosses(1);
  updateBosses(800);
  assert.equal(boss.phasesDone, 2);
  assert.deepEqual(abilities, ["enrage", "nova"]);
  assert.equal(boss.abilityInterval, Math.round(Math.round(Math.round(ab * 0.85) * 0.75) * 0.85));
});

// ─── C. Cavaleiro de Ossos ───
test("onda 10 nunca sorteia o Cavaleiro; onda 20 sorteia os 3", () => {
  for (const r of [0, 0.3, 0.49, 0.5, 0.9, 0.999]) {
    setRandom(() => r);
    const boss = createBossWave(10, arena).find((e) => e.isBoss);
    assert.equal(boss.kind, r < 0.5 ? "lich" : "demon");
  }
  const kinds = new Set();
  for (const r of [0.1, 0.5, 0.9, 0.999]) {
    setRandom(() => r);
    kinds.add(createBossWave(20, arena).find((e) => e.isBoss).kind);
  }
  assert.deepEqual([...kinds].sort(), ["bone_knight", "demon", "lich"]);
});

test("Cavaleiro: reforçado e guarda 0,6 / 0,7 / 0,8 por fase", () => {
  const boss = getBoss("bone_knight");
  setupRun([], [boss]);
  assert.equal(boss.reinforced, true);
  updateBosses(boss.abilityInterval);
  assert.equal(boss.guardMs, 3000);
  assert.equal(boss.guardReduction, 0.6);
  hit(boss, 0.6);
  updateBosses(1);
  assert.equal(boss.guardReduction, 0.7);
  assert.equal(boss.guardMs, 3000);
  hit(boss, 0.3);
  updateBosses(1);
  assert.equal(boss.enraged, true);
  assert.equal(boss.guardReduction, 0.7, "a fase 2 espera o Taunt");
  updateBosses(800);
  assert.equal(boss.guardReduction, 0.8);
  assert.equal(boss.guardMs, 3000);
});

test("guarda reduz golpe e dano contínuo, e acaba com o tempo", () => {
  const boss = getBoss("bone_knight");
  setupRun([], [boss]);
  boss.resist = { physical: 0, poison: 0 };
  boss.immune = null;
  boss.hp = boss.maxHp = 100000;
  const dmg = (n = 100) => {
    const h = boss.hp;
    applyElementalDamage(boss, n, "physical", "player");
    return h - boss.hp;
  };
  assert.equal(dmg(), 100);
  boss.guardMs = 3000;
  boss.guardReduction = 0.6;
  assert.equal(dmg(), 40);
  assert.equal(dmg(1), 1, "o piso de 1 do golpe continua");
  // DoT: sem guarda 10 stacks x 5 = 50 por tick; com guarda 0,6 = 20
  const tick = () => {
    boss.dots = [];
    applyDot(boss, "poison", 5, 1, false, { stacks: 10, sourceId: null });
    const h = boss.hp;
    processDots(1000);
    return h - boss.hp;
  };
  boss.guardMs = 0;
  const plain = tick();
  assert.ok(plain > 0);
  boss.guardMs = 3000;
  assert.equal(tick(), Math.round(plain * 0.4));
  boss.guardMs = 3000;
  boss.guardReduction = 0.8;
  assert.equal(tick(), Math.round(plain * 0.2));
  // Tick pequeno nunca vira 0 sob guarda
  boss.dots = [{ type: "poison", damage: 0, base: 1, stacks: 1, tickTimer: 0, ms: 5000, sourceId: null }];
  const h2 = boss.hp;
  processDots(1000);
  assert.ok(h2 - boss.hp >= 1);
  updateBosses(3000);
  assert.equal(boss.guardMs, 0);
  assert.equal(dmg(), 100);
  assert.ok(Number.isFinite(boss.hp));
});

test("guardMult: 1 sem guarda, teto de 0,8, e o parry só muda com guarda", () => {
  assert.equal(guardMult({}), 1);
  assert.equal(guardMult({ guardMs: 0, guardReduction: 0.6 }), 1);
  assert.ok(Math.abs(guardMult({ guardMs: 10, guardReduction: 0.6 }) - 0.4) < 1e-9);
  assert.ok(Math.abs(guardMult({ guardMs: 10, guardReduction: 0.95 }) - 0.2) < 1e-9);
});

function parryLoss(setup) {
  const attacker = enemy({ dmg: 100, hp: 100000, maxHp: 100000, x: 150 });
  setupRun(["iron_shield"], [attacker]);
  setLevel("iron_shield", 3); // Aparo
  state.player.blocksLeft = 1;
  setup(attacker);
  const before = attacker.hp;
  enemyAttack(attacker);
  return before - attacker.hp;
}

test("Parry: igual ao de antes sem guarda (mesmo com Julgamento); reduzido com guarda", () => {
  const plain = parryLoss(() => {});
  assert.ok(plain > 0);
  assert.equal(parryLoss((a) => (a.judged = { ms: 5000, bonus: 1 })), plain, "Julgamento não mexe no parry");
  const guarded = parryLoss((a) => {
    a.guardMs = 3000;
    a.guardReduction = 0.6;
  });
  assert.ok(Math.abs(guarded - plain * 0.4) <= 1, `${guarded} vs ${plain}`);
});

test("Cota de Malha e espinhos respeitam a guarda", () => {
  const reflectLoss = (guard) => {
    const attacker = enemy({ dmg: 20, hp: 100000, maxHp: 100000 });
    setupRun(["chainmail"], [attacker]);
    setLevel("chainmail", 3);
    if (guard) Object.assign(attacker, { guardMs: 3000, guardReduction: 0.6 });
    fixedRandom(0);
    const before = attacker.hp;
    enemyAttack(attacker);
    return before - attacker.hp;
  };
  assert.equal(reflectLoss(false), 7);
  assert.equal(reflectLoss(true), 3); // 7 x 0,4 = 2,8
  const thornLoss = (guard) => {
    const attacker = enemy({ hp: 100000, maxHp: 100000, x: 150 });
    setupRun(["thorn_mail"], [attacker]);
    if (guard) Object.assign(attacker, { guardMs: 3000, guardReduction: 0.6 });
    const before = attacker.hp;
    enemyAttack(enemy({ x: 180 }));
    return before - attacker.hp;
  };
  const plain = thornLoss(false);
  assert.ok(plain > 1);
  assert.ok(thornLoss(true) < plain);
});

test("congelado não levanta guarda nova, mas a guarda atual desce", () => {
  const boss = getBoss("bone_knight");
  setupRun([], [boss]);
  boss.frozen = 100000;
  updateBosses(boss.abilityInterval * 2);
  assert.ok(!(boss.guardMs > 0));
  boss.guardMs = 3000;
  updateBosses(1000);
  assert.equal(boss.guardMs, 2000);
});

test("limite de rigs por quadro e barra de vida de quem espera: lógica pura", () => {
  // characters.js usa rigsLeft(rigsCreated) antes de cada clone; o resto depende de three e
  // não roda aqui (ver relatório)
  let created = 0;
  let built = 0;
  for (let i = 0; i < 30; i++) {
    if (rigsLeft(created) > 0) {
      created++;
      built++;
    }
  }
  assert.equal(built, 3);
  created = 0; // novo quadro
  assert.equal(rigsLeft(created), 3);
});
