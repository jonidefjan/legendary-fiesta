// Fase 11c: 11 itens novos (fogo, veneno, linha de trás, Ferradura da Sorte), a evolução
// Ferradura -> Trevo de Ouro e os 2 itens míticos de clique
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  ITEMS,
  setupRun,
  enemy,
  item,
  fixedRandom,
  memoryStorage,
} from "./helpers.js";
import { state, resetRun, resetMeta } from "../game/src/state.js";
import { on } from "../game/src/events.js";
import { setRandom } from "../game/src/random.js";
import {
  activateItem,
  updateEnemies,
  updateClouds,
  processDots,
  enemyAttack,
  applyDot,
  slowFactor,
  arenaClick,
  NEAR_RANGE,
  rearDistance,
  isRearAt,
} from "../game/src/combat.js";
import {
  addItemOrLevel,
  applyPassives,
  ensureTimers,
  effectiveCooldown,
  generateRandomItems,
  levelUpItem,
  mythicOffer,
  pityScreens,
  rewardOffer,
  evolutionProgress,
  getTypeLabel,
  RARITIES,
} from "../game/src/items.js";
import * as meta from "../game/src/meta.js";
import * as save from "../game/src/save.js";
import { tryClick, clickRate, resetClicks, MAX_CLICKS_PER_SECOND } from "../game/src/clicks.js";

const big = (overrides = {}) => enemy({ hp: 1e6, maxHp: 1e6, ...overrides });
const lost = (en) => en.maxHp - en.hp;
const burn = (en) => en.dots.find((d) => d.type === "burning");
const poison = (en) => en.dots.find((d) => d.type === "poison");
const cold = (en) => en.dots.find((d) => d.type === "cold");
const addBurn = (en, stacks) => applyDot(en, "burning", 1, 0, true, { stacks });
const addPoison = (en, stacks, base = 1) =>
  applyDot(en, "poison", 1, 0, true, { maxStacks: Infinity, base, stacks });

// Run pronta com os itens nos níveis dados, sem sorte (nada de crítico nem de chances)
function run(ids, enemies = [big()], levels = {}) {
  setupRun(ids, enemies);
  fixedRandom(0.5);
  for (const [id, level] of Object.entries(levels)) state.itemLevels[id] = level;
  applyPassives();
  ensureTimers();
  resetClicks();
  return state;
}

beforeEach(() => resetClicks());

// ─── Catálogo ───
test("11c: os 14 ids do contrato existem, com tipo, raridade e arte próprios", () => {
  const table = {
    oil_flask: ["relic", "rare"],
    forge_hammer: ["weapon", "epic"],
    ash_mantle: ["armor", "rare"],
    detonating_plague: ["relic", "legendary"],
    venom_flask: ["relic", "rare"],
    serpent_dagger: ["weapon", "uncommon"],
    basilisk_hide: ["armor", "rare"],
    plague_mushroom: ["relic", "uncommon"],
    long_crossbow: ["weapon", "rare"],
    phantom_bow: ["weapon", "legendary"],
    lucky_horseshoe: ["relic", "common"],
    golden_clover: ["relic", "uncommon"],
    elemental_click: ["mythic", "mythic"],
    seismic_finger: ["mythic", "mythic"],
  };
  for (const [id, [type, rarity]] of Object.entries(table)) {
    const it = item(id);
    assert.equal(it.type, type, id);
    assert.equal(it.rarity, rarity, id);
    assert.equal(it.art, undefined, `${id}: usa a arte do próprio id`);
  }
  assert.equal(item("golden_clover").evolvedFrom, "lucky_horseshoe");
  // As formas evoluídas da 11b agora têm arte própria
  assert.equal(item("veterans_blade").art, "veterans_blade");
  assert.equal(item("battle_cuirass").art, "battle_cuirass");
});

// ─── Frasco de Óleo ───
test("Frasco de Óleo: golpe em alvo queimando soma +1 stack por nível (e só em quem queima)", () => {
  for (const [level, extra] of [[1, 1], [3, 3], [5, 5]]) {
    const target = big({ x: 150 });
    run(["rusted_sword", "oil_flask"], [target], { oil_flask: level });
    addBurn(target, 10);
    activateItem(item("rusted_sword"));
    assert.equal(burn(target).stacks, 10 + extra, `N${level}`);
  }
  const cold1 = big({ x: 150 });
  run(["rusted_sword", "oil_flask"], [cold1]);
  activateItem(item("rusted_sword"));
  assert.equal(burn(cold1), undefined, "alvo sem fogo não pega");
});

test("Frasco de Óleo: a Lâmina de Brasa (sem dano) também alimenta o fogo", () => {
  const target = big({ x: 150 });
  run(["ember_blade", "oil_flask"], [target]);
  activateItem(item("ember_blade"));
  assert.equal(burn(target).stacks, 2, "1 da lâmina + 1 do frasco");
});

test("Frasco de Óleo: N3 atrasa 20% quem queima; N5 corta a perda de stacks pela metade", () => {
  const target = big({ x: 150 });
  run(["oil_flask"], [target], { oil_flask: 2 });
  addBurn(target, 10);
  assert.equal(slowFactor(target), 1, "N2: sem lentidão");
  state.itemLevels.oil_flask = 3;
  assert.ok(Math.abs(slowFactor(target) - 0.8) < 1e-9);
  const clean = big();
  assert.equal(slowFactor(clean), 1, "sem queimadura não atrasa");

  // Sem o N5 o alvo perde 1 stack por segundo (10 stacks); com ele, 1 a cada 2 segundos
  for (const [level, left] of [[3, 8], [5, 9]]) {
    const en = big({ x: 150 });
    run(["oil_flask"], [en], { oil_flask: level });
    addBurn(en, 10);
    for (let i = 0; i < 4; i++) processDots(1000); // 3 s de espera, depois 1 por segundo
    assert.equal(burn(en).stacks, left, `N${level}`);
  }
});

// ─── Martelo da Forja ───
test("Martelo da Forja: consome todos os stacks e causa 3 por stack; depois reacende com 2", () => {
  const target = big({ x: 150 });
  run(["forge_hammer"], [target]);
  addBurn(target, 10);
  activateItem(item("forge_hammer"));
  assert.equal(lost(target), 18 + 30, "golpe de 18 + estouro de 3 x 10");
  assert.equal(burn(target).stacks, 2, "reacende com 2 stacks");
  assert.equal(state.runStats.damageByItem.forge_hammer, 48, "todo o dano é do martelo");
  // Sem fogo no alvo não há estouro, só o golpe e os 2 stacks
  const cold1 = big({ x: 150 });
  run(["forge_hammer"], [cold1]);
  activateItem(item("forge_hammer"));
  assert.equal(lost(cold1), 18);
  assert.equal(burn(cold1).stacks, 2);
});

test("Martelo da Forja: N3 consome só metade (o fogo continua); N5 o estouro atinge os vizinhos", () => {
  const target = big({ x: 150 });
  const next = big({ x: 220 });
  const far = big({ x: 600 });
  run(["forge_hammer"], [target, next, far], { forge_hammer: 3 });
  addBurn(target, 10);
  activateItem(item("forge_hammer"));
  assert.equal(lost(target), 18 + 6 + 15, "N3: base 18 + 6 de nível, estouro de 3 x 5");
  assert.equal(burn(target).stacks, 5 + 2);
  assert.equal(lost(next), 0, "N3 não atinge vizinhos");

  const t5 = big({ x: 150 });
  const n5 = big({ x: 220 });
  const f5 = big({ x: 600 });
  run(["forge_hammer"], [t5, n5, f5], { forge_hammer: 5 });
  addBurn(t5, 10);
  activateItem(item("forge_hammer"));
  assert.equal(lost(n5), 15, "vizinho leva o estouro de 3 x 5");
  assert.equal(lost(f5), 0, "longe não leva nada");
});

// ─── Manto de Cinzas ───
test("Manto de Cinzas: inimigo queimando causa -2% por stack, até -40%", () => {
  const dmgOf = (stacks, level = 1) => {
    const en = big({ dmg: 100, x: 150 });
    run(["ash_mantle"], [en], { ash_mantle: level });
    if (stacks) addBurn(en, stacks);
    const hp = state.player.hp;
    enemyAttack(en);
    return hp - state.player.hp;
  };
  assert.equal(dmgOf(0), 100);
  assert.equal(dmgOf(10), 80);
  assert.equal(dmgOf(30), 60, "teto de -40%");
  assert.equal(dmgOf(100), 60);
});

test("Manto de Cinzas: N3 queima o atacante (3 stacks); N5 deixa o herói imune ao fogo dos chefes", () => {
  const e1 = big({ dmg: 10, x: 150 });
  run(["ash_mantle"], [e1], { ash_mantle: 2 });
  enemyAttack(e1);
  assert.equal(burn(e1), undefined, "N2: nada");
  const e3 = big({ dmg: 10, x: 150 });
  run(["ash_mantle"], [e3], { ash_mantle: 3 });
  enemyAttack(e3);
  assert.equal(burn(e3).stacks, 3);

  run(["ash_mantle"], [], { ash_mantle: 4 });
  assert.equal(state.player.fireImmune, false);
  state.itemLevels.ash_mantle = 5;
  applyPassives();
  assert.equal(state.player.fireImmune, true);
});

test("Manto de Cinzas N5: a nova de fogo do chefe não queima o herói", async () => {
  const { createBossWave, updateBosses } = await import("../game/src/boss.js");
  for (const [level, burns] of [[4, true], [5, false]]) {
    run(["ash_mantle"], [], { ash_mantle: level });
    state.player.evasion = 0;
    setRandom(() => 0.9); // Senhor Demônio
    const boss = createBossWave(10, { width: 800, height: 400 }).find((e) => e.isBoss);
    state.enemies = [boss];
    boss.abilityTimer = boss.abilityInterval;
    updateBosses(16);
    setRandom(null);
    assert.equal(!!state.player.dots.find((d) => d.type === "burning"), burns, `N${level}`);
    if (!burns) assert.equal(state.player.hp, state.player.maxHp, "N5: a nova também não causa dano");
    else assert.ok(state.player.hp < state.player.maxHp);
  }
});

// ─── Praga Detonante ───
test("Praga Detonante: a cada 3 s cada envenenado passa 1 stack aos n vizinhos (n = nível)", () => {
  assert.equal(item("detonating_plague").cooldown, 3000);
  assert.equal(effectiveCooldown(item("detonating_plague")), 3000);
  const a = big({ x: 150 });
  const b = big({ x: 200 });
  const c = big({ x: 260 });
  run(["detonating_plague"], [a, b, c]);
  assert.equal(activateItem(item("detonating_plague")), false, "ninguém envenenado: não gasta");
  addPoison(a, 5);
  assert.equal(activateItem(item("detonating_plague")), true);
  assert.equal(poison(b).stacks, 1, "N1: só o vizinho mais perto");
  assert.equal(poison(c), undefined);
  assert.equal(poison(a).stacks, 5, "quem passa não perde stacks");

  // Nível 2: dois vizinhos; nível 3: 2 stacks por passagem
  for (const [level, perNeighbor, neighbors] of [[2, 1, 2], [3, 2, 2]]) {
    const a2 = big({ x: 150 });
    const b2 = big({ x: 200 });
    const c2 = big({ x: 260 });
    run(["detonating_plague"], [a2, b2, c2], { detonating_plague: level });
    addPoison(a2, 5);
    activateItem(item("detonating_plague"));
    const reached = [b2, c2].filter((e) => poison(e));
    assert.equal(reached.length, neighbors, `N${level}`);
    assert.equal(poison(b2).stacks, perNeighbor, `N${level} stacks`);
  }
});

test("Praga Detonante: o tick que passa da vida explode nos vizinhos com o dano acumulado", () => {
  const dying = enemy({ hp: 5, maxHp: 5, x: 150 });
  const next = big({ x: 200 });
  const far = big({ x: 600 });
  run(["detonating_plague"], [dying, next, far]);
  addPoison(dying, 10, 1); // tick = 1 + 10 = 11 > 5 de vida
  processDots(1000);
  assert.ok(dying.hp <= 0);
  assert.equal(lost(next), 33, "o vizinho leva o triplo do tick letal (11 x 3)");
  assert.equal(lost(far), 0, "N1: só 1 vizinho");

  // Sem o item, nada explode
  const d2 = enemy({ hp: 5, maxHp: 5, x: 150 });
  const n2 = big({ x: 200 });
  run([], [d2, n2]);
  addPoison(d2, 10, 1);
  processDots(1000);
  assert.equal(lost(n2), 0);

  // Tick menor que a vida: sem explosão
  const healthy = big({ x: 150 });
  const n3 = big({ x: 200 });
  run(["detonating_plague"], [healthy, n3]);
  addPoison(healthy, 10, 1);
  processDots(1000);
  assert.equal(lost(n3), 0);
});

test("Praga Detonante: ao morrer passa metade dos stacks (todos no N5); N5 quebra imunidade", () => {
  const dead = big({ x: 150, hp: 0 });
  const next = big({ x: 200 });
  const other = big({ x: 260 });
  run(["detonating_plague"], [dead, next, other]);
  addPoison(dead, 11);
  updateEnemies(16);
  assert.equal(poison(next).stacks, 5, "metade de 11");
  assert.equal(poison(other), undefined, "N1: só um vizinho");

  const d5 = big({ x: 150, hp: 0 });
  const n5 = big({ x: 200 });
  run(["detonating_plague"], [d5, n5], { detonating_plague: 5 });
  addPoison(d5, 11);
  updateEnemies(16);
  assert.equal(poison(n5).stacks, 11, "N5: todos os stacks");

  const boss = enemy({ immune: "poison", resist: { poison: 1 } });
  run(["detonating_plague"], [boss], { detonating_plague: 4 });
  assert.equal(addPoisonLanded(boss), 0, "N4: imune");
  state.itemLevels.detonating_plague = 5;
  assert.equal(addPoisonLanded(boss), 2, "N5: quebra a imunidade (2 stacks por passagem desde o N3)");
});

function addPoisonLanded(en) {
  // Usa o contágio do próprio item: um envenenado ao lado passa 1 stack
  const src = big({ x: 150 });
  state.enemies = [src, en];
  addPoison(src, 3);
  activateItem(item("detonating_plague"));
  return poison(en)?.stacks || 0;
}

// ─── Frasco de Peçonha ───
test("Frasco de Peçonha: golpe em envenenado soma +1 stack por nível; N3 atrasa 15%", () => {
  for (const [level, extra] of [[1, 1], [3, 3], [5, 5]]) {
    const target = big({ x: 150 });
    run(["rusted_sword", "venom_flask"], [target], { venom_flask: level });
    addPoison(target, 4);
    activateItem(item("rusted_sword"));
    assert.equal(poison(target).stacks, 4 + extra, `N${level}`);
  }
  const t = big();
  run(["venom_flask"], [t], { venom_flask: 2 });
  addPoison(t, 3);
  assert.equal(slowFactor(t), 1);
  state.itemLevels.venom_flask = 3;
  assert.ok(Math.abs(slowFactor(t) - 0.85) < 1e-9);
});

test("Frasco de Peçonha N5: +1 de dano base do veneno por nível", () => {
  const tick = (level) => {
    const en = big({ x: 150 });
    run(["venom_flask"], [en], { venom_flask: level });
    addPoison(en, 4, 1);
    processDots(1000);
    return lost(en);
  };
  assert.equal(tick(1), 1 + 4);
  assert.equal(tick(4), 1 + 4);
  assert.equal(tick(5), 1 + 5 + 4, "base 1 + 5 do nível");
});

// ─── Adaga Serpente ───
test("Adaga Serpente: 1,6 s, 7 de dano, 1 stack por golpe e +1 por nível", () => {
  const it = item("serpent_dagger");
  assert.equal(it.cooldown, 1600);
  assert.equal(it.baseDmg, 7);
  for (const [level, stacks] of [[1, 1], [2, 2], [5, 5]]) {
    const target = big({ x: 150 });
    run(["serpent_dagger"], [target], { serpent_dagger: level });
    activateItem(it);
    assert.equal(poison(target).stacks, stacks, `N${level}`);
    assert.equal(lost(target), 7, "dano direto de 7");
  }
});

test("Adaga Serpente: N3 dano direto +3% por stack; N5 golpe duplo com 20+ stacks", () => {
  const target = big({ x: 150 });
  run(["serpent_dagger"], [target], { serpent_dagger: 3 });
  addPoison(target, 20);
  activateItem(item("serpent_dagger"));
  assert.equal(lost(target), 11, "7 x (1 + 0,03 x 20) = 11,2");
  const capped = big({ x: 150 });
  run(["serpent_dagger"], [capped], { serpent_dagger: 3 });
  addPoison(capped, 200);
  activateItem(item("serpent_dagger"));
  assert.equal(lost(capped), 18, "teto de 50 stacks: 7 x 2,5 = 17,5");

  const hits = (level, stacks) => {
    const en = big({ x: 150 });
    run(["serpent_dagger"], [en], { serpent_dagger: level });
    addPoison(en, stacks);
    let n = 0;
    on("hit", () => n++);
    activateItem(item("serpent_dagger"));
    return n;
  };
  assert.equal(hits(5, 19), 1);
  assert.equal(hits(5, 20), 2);
  assert.equal(hits(4, 30), 1, "o golpe duplo é do N5");
});

// ─── Couro de Basilisco ───
test("Couro de Basilisco: ao ser atingido, o atacante leva 2 stacks por nível", () => {
  for (const [level, stacks] of [[1, 2], [3, 6], [5, 10]]) {
    const en = big({ dmg: 10, x: 150 });
    run(["basilisk_hide"], [en], { basilisk_hide: level });
    enemyAttack(en);
    assert.equal(poison(en).stacks, stacks, `N${level}`);
  }
});

test("Couro de Basilisco: N3 envenenados causam -1% por stack (até -30%); N5 cura por envenenado", () => {
  const dmgOf = (stacks, level) => {
    const en = big({ dmg: 100, x: 150 });
    run(["basilisk_hide"], [en], { basilisk_hide: level });
    if (stacks) addPoison(en, stacks);
    const hp = state.player.hp;
    enemyAttack(en);
    return hp - state.player.hp;
  };
  assert.equal(dmgOf(10, 2), 100, "N2 não enfraquece");
  assert.equal(dmgOf(10, 3), 90);
  assert.equal(dmgOf(50, 3), 70, "teto de -30%");

  const a = big({ x: 150 });
  const b = big({ x: 200 });
  const c = big({ x: 260 });
  run(["basilisk_hide"], [a, b, c], { basilisk_hide: 4 });
  addPoison(a, 2);
  addPoison(b, 2);
  assert.equal(activateItem(item("basilisk_hide")), false, "antes do N5 não tem cura");
  state.itemLevels.basilisk_hide = 5;
  ensureTimers();
  state.player.hp = 50;
  assert.equal(activateItem(item("basilisk_hide")), true);
  assert.equal(state.player.hp, 52, "1 HP por envenenado (2)");
  // Ritmo fixo: Pressa não acelera a cura de 3 s
  state.player.cooldownBonus = 0.5;
  assert.equal(effectiveCooldown(item("basilisk_hide")), 3000);
});

// ─── Cogumelo Pestilento ───
test("Cogumelo Pestilento: a cada 5 s, 2 stacks por nível em quem está perto do herói", () => {
  assert.equal(item("plague_mushroom").cooldown, 5000);
  for (const [level, stacks] of [[1, 2], [2, 4]]) {
    const near = big({ x: 150 });
    const edge = big({ x: 100 + 200 });
    const far = big({ x: 600 });
    run(["plague_mushroom"], [near, edge, far], { plague_mushroom: level });
    activateItem(item("plague_mushroom"));
    assert.equal(poison(near).stacks, stacks, `N${level}`);
    assert.equal(poison(edge).stacks, stacks, "no limite do raio");
    assert.equal(poison(far), undefined, "longe não pega");
    assert.equal(state.clouds.length, 0, "antes do N3 a nuvem não fica");
  }
  run(["plague_mushroom"], []);
  assert.equal(activateItem(item("plague_mushroom")), false);
});

test("Cogumelo Pestilento N3: a nuvem fica 3 s no chão e envenena quem entra (1 stack por nível por segundo)", () => {
  const en = big({ x: 150 });
  const late = big({ x: 600 });
  run(["plague_mushroom"], [en, late], { plague_mushroom: 3 });
  activateItem(item("plague_mushroom"));
  assert.equal(poison(en).stacks, 6);
  assert.equal(state.clouds.length, 1);
  late.x = 250; // entra na nuvem depois
  updateClouds(1000);
  assert.equal(poison(en).stacks, 9);
  assert.equal(poison(late).stacks, 3, "quem entrou leva o stack do segundo");
  updateClouds(1000);
  updateClouds(1000);
  assert.equal(poison(en).stacks, 15, "3 segundos = 3 pulsos");
  assert.equal(state.clouds.length, 0, "a nuvem acabou");
  updateClouds(1000);
  assert.equal(poison(en).stacks, 15);
});

test("Cogumelo Pestilento N5: os stacks dobram em alvos já envenenados", () => {
  const fresh = big({ x: 150 });
  const sick = big({ x: 200 });
  run(["plague_mushroom"], [fresh, sick], { plague_mushroom: 5 });
  addPoison(sick, 4);
  activateItem(item("plague_mushroom"));
  assert.equal(poison(fresh).stacks, 10, "2 x 5");
  assert.equal(poison(sick).stacks, 4 + 20, "dobrado: 2 x 10");
});

// ─── Besta Longa ───
test("Besta Longa: 3 s, atira só no inimigo mais distante, 16 de dano +3 por nível", () => {
  const it = item("long_crossbow");
  assert.equal(it.cooldown, 3000);
  for (const [level, dmg] of [[1, 16], [2, 19]]) {
    const near = big({ x: 150 });
    const mid = big({ x: 400 });
    const far = big({ x: 700 });
    run(["long_crossbow"], [near, mid, far], { long_crossbow: level });
    activateItem(it);
    assert.equal(lost(far), dmg, `N${level}`);
    assert.equal(lost(near), 0);
    assert.equal(lost(mid), 0);
  }
});

test("Besta Longa: N3 atravessa a fila; N5 a linha de trás leva +50%", () => {
  const near = big({ x: 150 });
  const mid = big({ x: 400 });
  const far = big({ x: 700 });
  run(["long_crossbow"], [near, mid, far], { long_crossbow: 3 });
  activateItem(item("long_crossbow"));
  assert.equal(lost(far), 22);
  assert.equal(lost(mid), 22, "atravessou");
  assert.equal(lost(near), 22);

  const n5 = big({ x: 150 });
  const m5 = big({ x: 400 });
  const f5 = big({ x: 700 });
  run(["long_crossbow"], [n5, m5, f5], { long_crossbow: 5 });
  assert.ok(150 - state.player.x <= NEAR_RANGE && 400 - state.player.x > NEAR_RANGE);
  activateItem(item("long_crossbow"));
  assert.equal(lost(f5), 42, "28 x 1,5 na retaguarda");
  assert.equal(lost(m5), 42);
  assert.equal(lost(n5), 28, "perto do herói: sem bônus");
});

// ─── Arco do Caçador Fantasma ───
test("Arco do Caçador Fantasma: acerta todos que ainda não chegaram perto; sem alvo não gasta a recarga", () => {
  const near = big({ x: 150 });
  run(["phantom_bow"], [near]);
  assert.equal(activateItem(item("phantom_bow")), false, "ninguém na retaguarda");
  assert.ok(state.itemTimers.phantom_bow.elapsed >= state.itemTimers.phantom_bow.cooldown);

  const a = big({ x: 400 });
  const b = big({ x: 700 });
  run(["phantom_bow"], [near, a, b]);
  assert.equal(activateItem(item("phantom_bow")), true);
  assert.equal(lost(a), 23);
  assert.equal(lost(b), 23);
  assert.equal(lost(near), 0);
  assert.equal(state.itemTimers.phantom_bow.elapsed, 0, "gastou a recarga");
});

test("Arco do Caçador Fantasma: N3 +1 flecha por alvo; N5 abate na retaguarda devolve 1 s", () => {
  const a = big({ x: 400 });
  const b = big({ x: 700 });
  run(["phantom_bow"], [a, b], { phantom_bow: 3 });
  activateItem(item("phantom_bow"));
  assert.equal(lost(a), 2 * 29, "2 flechas de 23 + 6 do nível");
  assert.equal(lost(b), 2 * 29);

  const k1 = enemy({ hp: 10, maxHp: 10, x: 400 });
  const k2 = enemy({ hp: 10, maxHp: 10, x: 700 });
  const keep = big({ x: 800 });
  run(["phantom_bow"], [k1, k2, keep], { phantom_bow: 5 });
  activateItem(item("phantom_bow"));
  assert.ok(k1.hp <= 0 && k2.hp <= 0);
  assert.equal(state.itemTimers.phantom_bow.elapsed, 2000, "1 s por abate");

  const k3 = enemy({ hp: 10, maxHp: 10, x: 400 });
  run(["phantom_bow"], [k3, big({ x: 700 })], { phantom_bow: 4 });
  activateItem(item("phantom_bow"));
  assert.equal(state.itemTimers.phantom_bow.elapsed, 0, "sem o N5 não devolve");
});

// ─── Ferradura da Sorte -> Trevo de Ouro ───
function killOne() {
  const en = enemy({ hp: 0, fragments: 1, x: 150 });
  state.enemies = [en];
  updateEnemies(16);
}

test("Ferradura da Sorte: +1 fragmento a cada 10 abates, por nível", () => {
  for (const level of [1, 3]) {
    run(["lucky_horseshoe"], [], { lucky_horseshoe: level });
    state.fragments = 0;
    for (let i = 0; i < 9; i++) killOne();
    assert.equal(state.fragments, 9, "9 abates: só o fragmento de cada inimigo");
    killOne();
    assert.equal(state.fragments, 10 + level, `N${level}: o 10º abate paga ${level}`);
  }
});

test("Ferradura da Sorte evolui em Trevo de Ouro no nível 5 (só dados) e sobe por abates", () => {
  run(["lucky_horseshoe"], []);
  for (let i = 0; i < 3; i++) addItemOrLevel(item("lucky_horseshoe"));
  assert.equal(state.itemLevels.lucky_horseshoe, 4);
  const result = addItemOrLevel(item("lucky_horseshoe"));
  assert.deepEqual(result, { leveled: true, level: 5, evolvedTo: "golden_clover" });
  assert.deepEqual(state.items.map((i) => i.id), ["golden_clover"]);
  assert.equal(state.itemLevels.golden_clover, 5);
  assert.equal(item("golden_clover").rarity, "uncommon");
  assert.deepEqual(evolutionProgress(item("golden_clover")), { kills: 0, need: 20 });
  assert.ok(Math.abs(state.player.critChance - 0.03) < 1e-9, "N5: +3% de crítico");
  // Depois de evoluir, a Ferradura sai do sorteio e o Trevo só entra para quem o tem
  const pool = generateRandomItems(60).map((i) => i.id);
  assert.ok(!pool.includes("lucky_horseshoe"));
  state.fragments = 0;
  for (let i = 0; i < 10; i++) killOne();
  assert.equal(state.fragments, 10 + 5, "o Trevo paga 5 por abate-marco no nível 5");
  for (let i = 0; i < 10; i++) killOne(); // 20 abates no total: sobe de nível
  assert.equal(state.itemLevels.golden_clover, 6);
});

test("Trevo de Ouro: N10 +1 rerrolagem (uma vez); N15 encurta o lendário garantido em 1", () => {
  run(["golden_clover"], [], { golden_clover: 9 });
  state.rerollsLeft = 0;
  levelUpItem(item("golden_clover"));
  assert.equal(state.itemLevels.golden_clover, 10);
  assert.equal(state.rerollsLeft, 1);
  levelUpItem(item("golden_clover"));
  assert.equal(state.rerollsLeft, 1, "só no nível 10");

  state.itemLevels.golden_clover = 14;
  assert.equal(pityScreens(0), 4);
  assert.equal(pityScreens(2), 2);
  state.itemLevels.golden_clover = 15;
  assert.equal(pityScreens(0), 3);
  assert.equal(pityScreens(2), 1, "sorte lendária 2 + Trevo: nunca abaixo de 1");
  assert.equal(pityScreens(2, false), 2, "a loja descreve a melhoria sem os itens");
  assert.equal(meta.describeLevel("luck", 2), "após 2 telas sem lendário", "texto da loja");
});

test("Trevo de Ouro depois do 15: nível 20 paga +1 fragmento e nível 25 dá +3% de crítico", () => {
  run(["golden_clover"], [], { golden_clover: 19 });
  assert.ok(Math.abs(state.player.critChance - 0.03) < 1e-9);
  state.itemLevels.golden_clover = 20;
  applyPassives();
  state.fragments = 0;
  state.kills = 9;
  killOne();
  assert.equal(state.fragments, 1 + 20 + 1, "20 por nível + 1 do marco");
  state.itemLevels.golden_clover = 25;
  applyPassives();
  assert.ok(Math.abs(state.player.critChance - 0.06) < 1e-9);
  state.itemLevels.golden_clover = 35;
  applyPassives();
  assert.ok(Math.abs(state.player.critChance - 0.09) < 1e-9);
});

// ─── Itens míticos: catálogo, loja e oferta ───
beforeEach(() => resetMeta());

test("míticos: raridade própria com cor e nome, fora do sorteio comum", () => {
  assert.ok(RARITIES.mythic.color);
  assert.equal(RARITIES.mythic.label, "Mítico");
  assert.equal(getTypeLabel("mythic"), "Mítico");
  run([], []);
  for (let i = 0; i < 200; i++) {
    const ids = generateRandomItems(12).map((x) => x.id);
    assert.ok(!ids.includes("elemental_click") && !ids.includes("seismic_finger"));
  }
  assert.equal(item("elemental_click").maxLevel, 1);
  assert.equal(ITEMS.filter((i) => i.rarity === "mythic").length, 2);
});

test("loja: cada mítico custa 1000 fragmentos, compra única, e fica no save de progresso", () => {
  resetMeta();
  state.fragments = 999;
  assert.equal(meta.unlockMythic("elemental_click"), false, "sem fragmentos");
  state.fragments = 2500;
  assert.equal(meta.unlockMythic("elemental_click"), true);
  assert.equal(state.fragments, 1500);
  assert.equal(meta.isMythicUnlocked("elemental_click"), true);
  assert.equal(meta.unlockMythic("elemental_click"), false, "não compra duas vezes");
  assert.equal(state.fragments, 1500);
  assert.equal(meta.unlockMythic("rusted_sword"), false, "só os míticos");
  assert.equal(meta.unlockMythic("seismic_finger"), true);
  assert.equal(state.fragments, 500);
  assert.deepEqual(meta.MYTHIC_IDS, ["elemental_click", "seismic_finger"]);
  assert.equal(meta.MYTHIC_COST, 1000);

  const storage = memoryStorage();
  save.setStorage(storage);
  save.saveMeta();
  assert.deepEqual(JSON.parse(storage.data[save.META_KEY]).unlockedItems, ["elemental_click", "seismic_finger"]);
  resetMeta();
  save.loadMeta();
  assert.deepEqual(state.meta.unlockedItems, ["elemental_click", "seismic_finger"]);
  assert.equal(state.fragments, 500);
  save.setStorage(null);
});

test("save de progresso antigo (sem itens liberados) carrega sem erro e vazio", () => {
  const storage = memoryStorage({
    [save.META_KEY]: JSON.stringify({ fragments: 77, upgrades: { might: 2 }, best: { wave: 5, score: 100 }, bossesBeaten: 1 }),
  });
  save.setStorage(storage);
  resetMeta();
  save.loadMeta();
  assert.deepEqual(state.meta.unlockedItems, []);
  assert.equal(state.fragments, 77);
  assert.equal(state.meta.upgrades.might, 2);
  assert.equal(meta.isMythicUnlocked("seismic_finger"), false);
  // Lixo no campo novo também não quebra
  storage.setItem(save.META_KEY, JSON.stringify({ fragments: 1, unlockedItems: "x" }));
  save.loadMeta();
  assert.deepEqual(state.meta.unlockedItems, []);
  save.setStorage(null);
});

test("oferta: nada sem liberar; liberado vira carta garantida; só um por run", () => {
  run([], []);
  assert.equal(mythicOffer(), null, "nada liberado");

  state.meta.unlockedItems = ["seismic_finger"];
  assert.equal(mythicOffer().id, "seismic_finger");

  // Os dois liberados: sorteia um por run e mantém a escolha
  state.mythicChoice = null;
  state.meta.unlockedItems = ["elemental_click", "seismic_finger"];
  setRandom(() => 0.99);
  assert.equal(mythicOffer().id, "seismic_finger");
  setRandom(() => 0);
  assert.equal(mythicOffer().id, "seismic_finger", "a escolha da run não muda ao chamar de novo");
  state.mythicChoice = null;
  assert.equal(mythicOffer().id, "elemental_click");
  setRandom(null);

  // Depois de pegar um, o outro nunca mais aparece
  state.items = [item("elemental_click")];
  assert.equal(mythicOffer(), null);
  state.mythicChoice = "seismic_finger";
  assert.equal(mythicOffer(), null);
});

test("oferta: a carta extra da onda 1 fica no fim e sobrevive à rerrolagem", () => {
  run([], []);
  state.meta.unlockedItems = ["elemental_click"];
  state.rerollsLeft = 2;
  const extra = mythicOffer();
  const offer = rewardOffer(3, { extra });
  assert.equal(offer.options.length, 4);
  assert.equal(offer.options[3].id, "elemental_click");
  const again = offer.reroll();
  assert.equal(again.length, 4);
  assert.equal(again[3].id, "elemental_click");
  assert.equal(state.rerollsLeft, 1);
  // Sem mítico a recompensa continua com a quantidade normal
  assert.equal(rewardOffer(3).options.length, 3);
});

test("a escolha do mítico vai na run salva e volta ao continuar", () => {
  run(["rusted_sword"], []);
  const storage = memoryStorage();
  save.setStorage(storage);
  state.meta.unlockedItems = ["elemental_click", "seismic_finger"];
  state.mythicChoice = "seismic_finger";
  save.saveRun();
  assert.equal(JSON.parse(storage.data[save.RUN_KEY]).mythicChoice, "seismic_finger");
  resetRun();
  assert.equal(state.mythicChoice, null);
  assert.equal(save.loadRun(), true);
  assert.equal(state.mythicChoice, "seismic_finger");
  // Run antiga, sem o campo
  const data = JSON.parse(storage.data[save.RUN_KEY]);
  delete data.mythicChoice;
  storage.setItem(save.RUN_KEY, JSON.stringify(data));
  assert.equal(save.loadRun(), true);
  assert.equal(state.mythicChoice, null);
  // Um mítico equipado volta pelo id
  state.items = [item("seismic_finger")];
  save.saveRun();
  resetRun();
  save.loadRun();
  assert.deepEqual(state.items.map((i) => i.id), ["seismic_finger"]);
  save.setStorage(null);
});

// ─── Itens míticos: limitador de cliques ───
test("limitador: 8 cliques por segundo numa janela deslizante, o excedente é ignorado", () => {
  assert.equal(MAX_CLICKS_PER_SECOND, 8);
  const ok = [];
  for (let i = 0; i < 10; i++) ok.push(tryClick(i * 10)); // 10 cliques em 90 ms
  assert.deepEqual(ok, [true, true, true, true, true, true, true, true, false, false]);
  assert.equal(clickRate(95), 8);
  assert.equal(tryClick(999), false, "ainda dentro de 1 s do primeiro clique");
  assert.equal(tryClick(1000), true, "o clique de 0 ms saiu da janela");
  assert.equal(tryClick(1001), false);
  // Janela deslizante: o clique de 10 ms sai em 1010, o de 20 ms em 1020...
  assert.equal(clickRate(1010), 7);
  assert.equal(tryClick(1010), true);
  assert.equal(clickRate(1075), 2, "os de 20 a 70 ms já saíram; sobram os de 1000 e 1010");
  resetClicks();
  assert.equal(clickRate(0), 0);
});

test("limitador: cliques espaçados nunca são cortados", () => {
  for (let i = 0; i < 40; i++) assert.equal(tryClick(i * 125), true, `clique ${i}`);
  assert.equal(clickRate(40 * 125), 7, "um clique sai da janela quando completa 1 s inteiro");
});

test("clique: só com a run rodando, sem pausa e com um item mítico; fora disso não gasta a janela", () => {
  const en = big({ x: 300 });
  run([], [en]);
  assert.equal(arenaClick(0), false, "sem item mítico");
  assert.equal(clickRate(0), 0);

  run(["seismic_finger"], [en]);
  state.isPaused = true;
  assert.equal(arenaClick(0), false, "pausado");
  state.isPaused = false;
  state.running = false;
  assert.equal(arenaClick(0), false, "run encerrada");
  assert.equal(clickRate(0), 0, "nada disso consumiu a janela");
  state.running = true;
  assert.equal(arenaClick(0), true);
  assert.equal(clickRate(0), 1);
});

// ─── Itens míticos: efeitos ───
test("Dedo Sísmico: cada clique causa 1 de dano físico em todos os vivos, creditado ao item", () => {
  const a = big({ x: 300 });
  const b = big({ x: 500 });
  const dead = big({ x: 400, dead: true });
  run(["seismic_finger"], [a, b, dead]);
  assert.equal(arenaClick(0), true);
  assert.equal(lost(a), 1);
  assert.equal(lost(b), 1);
  assert.equal(lost(dead), 0, "morto não apanha");
  assert.equal(state.runStats.damageByItem.seismic_finger, 2);
  assert.equal(state.runStats.totalDamage, 2);
  assert.equal(state.runStats.itemUses.seismic_finger, 1);
  assert.equal(arenaClick(1000), true);
  assert.equal(lost(a), 2);
});

test("Dedo Sísmico: 20 cliques no mesmo segundo causam só 8 de dano", () => {
  const a = big({ x: 300 });
  run(["seismic_finger"], [a]);
  let used = 0;
  for (let i = 0; i < 20; i++) if (arenaClick(i * 10)) used++;
  assert.equal(used, 8);
  assert.equal(lost(a), 8);
});

test("Dedo Sísmico: sem inimigos vivos o clique não faz nada", () => {
  run(["seismic_finger"], []);
  assert.equal(arenaClick(0), false);
});

test("Clique Elemental: 1 stack de fogo, veneno ou frio (sorteado) num inimigo aleatório", () => {
  const picks = (r1, r2) => {
    const a = big({ x: 300 });
    const b = big({ x: 500 });
    run(["elemental_click"], [a, b]);
    const seq = [r1, r2];
    setRandom(() => seq.shift() ?? 0.5);
    assert.equal(arenaClick(0), true);
    setRandom(null);
    return { a, b };
  };
  let { a, b } = picks(0, 0); // inimigo 0, fogo
  assert.equal(burn(a).stacks, 1);
  assert.equal(a.dots.length, 1);
  assert.equal(b.dots.length, 0);
  ({ a, b } = picks(0.9, 0.5)); // inimigo 1, veneno
  assert.equal(poison(b).stacks, 1);
  assert.equal(a.dots.length, 0);
  ({ a, b } = picks(0, 0.99)); // inimigo 0, frio
  assert.equal(cold(a).stacks, 1);
  assert.equal(state.runStats.itemUses.elemental_click, 1);
});

test("Clique Elemental: respeita resistência e imunidade de chefe", () => {
  const boss = enemy({ hp: 1e6, maxHp: 1e6, x: 300, immune: "fire", resist: { fire: 1, poison: 0.8 } });
  run(["elemental_click"], [boss]);
  let t = 0;
  // 10 cliques de fogo: imune, nada entra
  setRandom(() => 0);
  for (let i = 0; i < 10; i++) arenaClick(t++ * 200);
  assert.equal(burn(boss), undefined, "imune ao fogo");
  // Veneno com 80% de resistência: 1 stack a cada 5 cliques
  setRandom(() => 0.5);
  for (let i = 0; i < 10; i++) arenaClick(t++ * 200);
  setRandom(null);
  assert.equal(poison(boss).stacks, 2, "1 em cada 5");
});

test("Clique Elemental: o cliques dá o crédito do dano de fogo e veneno ao item", () => {
  const a = big({ x: 300 });
  run(["elemental_click"], [a]);
  setRandom(() => 0);
  arenaClick(0);
  setRandom(null);
  processDots(1000);
  assert.equal(state.runStats.damageByItem.elemental_click, 1, "1 stack de fogo = 1 de dano no tick");
});

test("os dois míticos juntos nunca existem numa run: o segundo some da oferta", () => {
  run([], []);
  state.meta.unlockedItems = ["elemental_click", "seismic_finger"];
  const first = mythicOffer();
  addItemOrLevel(first);
  assert.equal(mythicOffer(), null);
  assert.equal(state.items.filter((i) => i.rarity === "mythic").length, 1);
});

// ─── Revisão da 11c ───
test("veneno repassado: o dano base não cresce com o bônus de dano a cada passagem", () => {
  const a = big({ x: 150 });
  const b = big({ x: 200 });
  const c = big({ x: 260 });
  run(["detonating_plague"], [a, b, c], { detonating_plague: 2 });
  state.player.damageBonus = 0.5; // Força: o multiplicador permanente vale 1,5
  addPoison(a, 5, 1);
  for (let i = 0; i < 12; i++) activateItem(item("detonating_plague"));
  for (const en of [b, c]) {
    assert.equal(poison(en).rawBase, 1, "base bruta constante");
    assert.equal(poison(en).base, 1.5, "base = 1 x 1,5, sem multiplicar de novo");
  }
  // O mesmo na passagem pela morte
  const dead = big({ x: 150, hp: 0 });
  const next = big({ x: 200 });
  run(["detonating_plague"], [dead, next]);
  state.player.damageBonus = 0.5;
  addPoison(dead, 8, 1);
  updateEnemies(16);
  assert.equal(poison(next).base, 1.5);
  assert.equal(poison(next).rawBase, 1);
});

test("linha de trás relativa à arena: vale em telas de 360, 412, 800 e 1280 px", () => {
  for (const width of [360, 412, 800, 1280]) {
    const heroX = width * 0.22;
    const dist = rearDistance(heroX, width);
    assert.ok(dist > 0 && dist < width, `${width}: distância ${dist}`);
    // Quem acabou de entrar na fila (celular começa em 0,84 da largura, desktop em 0,6) é da retaguarda
    const start = Math.min(width * 0.6 * (width < 600 ? 1.4 : 1), width - 40);
    assert.ok(isRearAt(start, heroX, width), `${width}: a fila inicial está atrás`);
    // Quem está no corpo a corpo (80 px) nunca é
    assert.equal(isRearAt(heroX + 80, heroX, width), false, `${width}: corpo a corpo`);
  }
  // No desktop fica perto dos 200 px de antes
  assert.ok(Math.abs(rearDistance(0.22 * 800, 800) - 200) < 40);
  assert.ok(rearDistance(0.22 * 360, 360) < 110, "celular: bem menos que 200");
});

test("Arco Fantasma num celular: com a arena de 360 px o inimigo a 170 px já está na retaguarda", () => {
  const en = big({ x: 100 + 170 });
  run(["phantom_bow"], [en]);
  assert.equal(activateItem(item("phantom_bow")), false, "sem arena medida: 170 px ainda é perto");
  state.arenaRight = 100 + 280; // arena estreita
  try {
    assert.equal(activateItem(item("phantom_bow")), true);
  } finally {
    state.arenaRight = null;
  }
});

test("Martelo da Forja: alvo que o próprio golpe matou mantém os stacks; N5 ainda estoura nos vizinhos", () => {
  const dying = enemy({ hp: 5, maxHp: 5, x: 150 });
  const next = big({ x: 220 });
  run(["forge_hammer"], [dying, next], { forge_hammer: 5 });
  addBurn(dying, 10);
  activateItem(item("forge_hammer"));
  assert.ok(dying.hp <= 0);
  assert.equal(burn(dying).stacks, 10, "stacks intactos para o Coração de Brasa");
  assert.equal(lost(next), 15, "o estouro dos vizinhos usa a metade (5 x 3)");
  const d2 = enemy({ hp: 5, maxHp: 5, x: 150 });
  const n2 = big({ x: 220 });
  run(["forge_hammer"], [d2, n2], { forge_hammer: 3 });
  addBurn(d2, 10);
  activateItem(item("forge_hammer"));
  assert.equal(burn(d2).stacks, 10);
  assert.equal(lost(n2), 0, "antes do N5 não há estouro nos vizinhos");
});

test("Frascos não somam stacks em alvo que o mesmo golpe acabou de matar", () => {
  const dying = enemy({ hp: 5, maxHp: 5, x: 150 });
  run(["rusted_sword", "oil_flask", "venom_flask"], [dying]);
  addBurn(dying, 10);
  addPoison(dying, 10);
  activateItem(item("rusted_sword"));
  assert.ok(dying.hp <= 0);
  assert.equal(burn(dying).stacks, 10);
  assert.equal(poison(dying).stacks, 10);
});

test("Manto das Sombras: o contra-ataque nunca escolhe o Arco Fantasma", () => {
  const en = big({ x: 150 });
  run(["shadow_cloak", "phantom_bow", "rusted_sword"], [en], { shadow_cloak: 3 });
  state.player.evasion = 1;
  state.itemTimers.phantom_bow.elapsed = state.itemTimers.phantom_bow.cooldown; // o mais perto de pronto
  state.itemTimers.rusted_sword.elapsed = 0;
  enemyAttack(en);
  assert.ok(state.runStats.damageByItem.rusted_sword > 0, "a espada contra-atacou");
  assert.equal(state.runStats.damageByItem.phantom_bow, undefined);
});

test("Cogumelo Pestilento: a nuvem no chão repetida pelo Eco leva a escala do Eco", () => {
  const en = big({ x: 150 });
  run(["plague_mushroom", "echo_stone"], [en], { plague_mushroom: 5, echo_stone: 1 });
  state.player.lastActivated = "plague_mushroom";
  activateItem(item("echo_stone"));
  assert.equal(state.clouds.length, 1);
  assert.equal(state.clouds[0].stacks, 3, "5 x 50% = 3 (arredondado)");
});

// ─── Balanço: +30% no nível 1, Botas, Lâmina de Brasa e espera da queimadura ───
test("laço: a queimadura segura os stacks por 3 s e só então perde max(1, stacks ÷ 10) por segundo", () => {
  const en = big({ x: 150, atkInterval: 1e9 });
  run([], [en]);
  addBurn(en, 30);
  const seen = [];
  for (let t = 0; t < 6; t++) {
    processDots(1000);
    seen.push(burn(en).stacks);
  }
  // 1 s, 2 s: segura; 3 s em diante: 30 → 27 → 25 → 23 → 21
  assert.deepEqual(seen.slice(0, 2), [30, 30]);
  assert.equal(seen[2], 27, "o 3º tick já perde 3 (30 ÷ 10)");
  assert.equal(seen[3], 25, "27 → perde 2");
  assert.ok(seen[5] < seen[3]);
});

test("laço: stack novo de fogo reinicia a espera de 3 s", () => {
  const en = big({ x: 150, atkInterval: 1e9 });
  run([], [en]);
  addBurn(en, 20);
  processDots(1000);
  processDots(1000);
  addBurn(en, 1); // 2 s depois: recomeça a contar
  assert.equal(burn(en).idle, 0);
  processDots(1000);
  processDots(1000);
  assert.equal(burn(en).stacks, 21, "4 s desde o primeiro, 2 s desde o último: nada perdido");
  processDots(1000);
  assert.equal(burn(en).stacks, 19, "3 s sem stacks novos: perde 2 (21 ÷ 10)");
});

test("laço: vindo de qualquer fonte, o stack novo zera a espera (Ember Blade, Frasco)", () => {
  const en = big({ x: 150, atkInterval: 1e9 });
  run(["ember_blade"], [en]);
  activateItem(item("ember_blade"));
  processDots(1000);
  processDots(1000);
  activateItem(item("ember_blade")); // outro golpe aos 2 s
  processDots(1000);
  processDots(1000);
  assert.equal(burn(en).stacks, 2, "2 s desde o último golpe: ainda segura");
});

test("o veneno nunca perde stacks, por mais tempo que passe", () => {
  const en = big({ x: 150, atkInterval: 1e9 });
  run([], [en]);
  addPoison(en, 7);
  for (let i = 0; i < 30; i++) processDots(1000);
  assert.equal(poison(en).stacks, 7);
});

test("Botas da Velocidade: +10% e +4% por nível (N5 = 26%)", () => {
  const it = item("speed_boots");
  const fx = it.effects.find((e) => e.type === "stats");
  assert.equal(fx.weaponSpeed, 0.1);
  assert.equal(fx.weaponSpeedPerLevel, 0.04);
  run(["speed_boots"], [], { speed_boots: 5 });
  assert.ok(Math.abs(state.player.weaponSpeed - 0.26) < 1e-9);
});

test("Lâmina de Brasa: 12 de dano de fogo +3 por nível e ainda queima 1 stack por nível", () => {
  const it = item("ember_blade");
  assert.equal(it.baseDmg, 12);
  assert.equal(it.baseDmgPerLevel, 3);
  for (const [level, dmg] of [[1, 12], [3, 18], [5, 24]]) {
    const en = big({ x: 150 });
    run(["ember_blade"], [en], { ember_blade: level });
    activateItem(it);
    assert.equal(lost(en), dmg, `N${level}`);
    assert.equal(burn(en).stacks, level);
    assert.equal(state.runStats.damageByItem.ember_blade, dmg);
  }
});

test("balanço: os valores do nível 1 subiram 30% e os míticos ficaram em 1", () => {
  const base = (id) => item(id).baseDmg;
  assert.deepEqual(
    ["rusted_sword", "shadow_dagger", "thunder_staff", "frost_bow", "poison_blade", "holy_mace", "blood_scythe", "water_orb", "seismic_hammer", "judgment_tome"].map(base),
    [10, 12, 29, 22, 13, 23, 26, 20, 18, 12],
  );
  assert.equal(item("elemental_click").effects[0].stacks, 1);
  assert.equal(item("seismic_finger").effects[0].damage, 1);
});
