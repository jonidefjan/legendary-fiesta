import { test } from "node:test";
import assert from "node:assert/strict";
import { setupRun, item, enemy, fixedRandom, memoryStorage } from "./helpers.js";
import { state, resetRun } from "../game/src/state.js";
import {
  activateItem,
  processDots,
  updateEnemies,
  applyElementalDamage,
  applyDot,
} from "../game/src/combat.js";
import * as save from "../game/src/save.js";
import {
  favoriteWeapon,
  shareText,
  runResult,
  formatDuration,
  imageFileName,
  SHARE_URL,
} from "../game/src/share.js";
import { DICTS } from "../game/src/i18n.js";

const dmg = () => state.runStats.damageByItem;

test("golpe direto credita o dano à arma e ao total", () => {
  const target = enemy();
  setupRun(["rusted_sword"], [target]);
  fixedRandom(0.99); // sem crítico
  activateItem(item("rusted_sword"));
  const dealt = 1000 - target.hp;
  assert.ok(dealt > 0);
  assert.equal(dmg().rusted_sword, dealt);
  assert.equal(state.runStats.totalDamage, dealt);
});

test("tick de queimadura é creditado à arma que aplicou, mesmo depois do golpe", () => {
  const target = enemy();
  setupRun(["ember_blade"], [target]);
  fixedRandom(0);
  activateItem(item("ember_blade"));
  assert.equal(dmg().ember_blade, undefined, "a lâmina não causa dano direto");
  const hp = target.hp;
  processDots(1000);
  assert.equal(dmg().ember_blade, hp - target.hp);
  assert.ok(dmg().ember_blade > 0);
});

test("queimadura espalhada pelo Coração de Brasa é creditada à arma original", () => {
  const dead = enemy({ hp: 1000, x: 200 });
  const near = enemy({ x: 240 });
  setupRun(["ember_blade", "ember_heart"], [dead, near]);
  fixedRandom(0);
  state.enemies = [dead];
  activateItem(item("ember_blade"));
  state.enemies = [dead, near];
  dead.hp = 0;
  updateEnemies(16);
  const burn = near.dots.find((d) => d.type === "burning");
  assert.equal(burn.sourceId, "ember_blade");
  const hp = near.hp;
  processDots(1000);
  assert.equal(dmg().ember_blade, hp - near.hp);
  assert.ok(hp - near.hp > 0);
  assert.equal(dmg().ember_heart, undefined, "o relicário não leva o crédito");
});

test("respingo e acerto em todos creditam à arma que os causou", () => {
  const main = enemy({ x: 200 });
  const side = enemy({ x: 230 });
  setupRun(["seismic_hammer"], [main, side]);
  fixedRandom(0.99);
  activateItem(item("seismic_hammer"));
  const total = 2000 - main.hp - side.hp;
  assert.ok(side.hp < 1000, "o vizinho levou respingo");
  assert.equal(dmg().seismic_hammer, total);

  const a = enemy({ x: 200 });
  const b = enemy({ x: 400 });
  setupRun(["judgment_tome"], [a, b]);
  fixedRandom(0.99);
  activateItem(item("judgment_tome"));
  assert.ok(b.hp < 1000, "atingiu todos");
  assert.equal(dmg().judgment_tome, 2000 - a.hp - b.hp);
});

test("corrente de raios credita à arma", () => {
  const a = enemy({ x: 200 });
  const b = enemy({ x: 400 });
  setupRun(["thunder_staff"], [a, b]);
  fixedRandom(0.99);
  activateItem(item("thunder_staff"));
  assert.ok(b.hp < 1000);
  assert.equal(dmg().thunder_staff, 2000 - a.hp - b.hp);
});

test("explosão e espinhos creditam ao próprio item; reflexo não entra", () => {
  const near = enemy({ x: 120 });
  setupRun(["blast_core"], [near]);
  activateItem(item("blast_core"));
  assert.equal(dmg().blast_core, 1000 - near.hp);

  const en = enemy({ x: 120 });
  setupRun(["thorn_mail"], [en]);
  applyElementalDamage(en, 20, "physical", "thorns", false, "thorn_mail");
  assert.equal(dmg().thorn_mail, 20);

  const target = enemy();
  setupRun(["rusted_sword"], [target]);
  applyElementalDamage(target, 20, "physical", "reflect");
  assert.deepEqual(dmg(), {});
  assert.equal(state.runStats.totalDamage, 0);
});

test("dano contínuo no herói não é creditado a nenhum item", () => {
  setupRun(["rusted_sword"]);
  applyDot(state.player, "burning", 5, 3, true, { sourceId: "rusted_sword" });
  processDots(1000);
  assert.deepEqual(dmg(), {});
});

test("arma favorita: só armas contam, vence o maior dano; sem dano é null", () => {
  setupRun(["rusted_sword", "thorn_mail", "ember_blade"]);
  assert.equal(favoriteWeapon({}), null);
  assert.equal(favoriteWeapon({ thorn_mail: 999 }), null, "armadura não é arma");
  assert.equal(favoriteWeapon({ rusted_sword: 0 }), null);
  assert.equal(favoriteWeapon({ nao_existe: 50 }), null);
  assert.deepEqual(
    favoriteWeapon({ rusted_sword: 40, thorn_mail: 500, ember_blade: 90 }),
    { id: "ember_blade", damage: 90 },
  );
  state.runStats.damageByItem = { rusted_sword: 7 };
  assert.deepEqual(runResult().favorite, { id: "rusted_sword", damage: 7 });
});

test("o dano por item é salvo e carregado; save antigo começa vazio; run nova zera", () => {
  const storage = memoryStorage();
  save.setStorage(storage);
  setupRun(["rusted_sword"]);
  state.runStats.totalDamage = 321;
  state.runStats.damageByItem = { rusted_sword: 300, thorn_mail: 21 };
  save.saveRun();

  resetRun();
  assert.deepEqual(state.runStats.damageByItem, {}, "run nova zera");
  save.loadMeta();
  assert.equal(save.loadRun(), true);
  assert.deepEqual(state.runStats.damageByItem, { rusted_sword: 300, thorn_mail: 21 });
  assert.equal(state.runStats.totalDamage, 321);

  const old = JSON.parse(storage.data[save.RUN_KEY]);
  delete old.damageByItem;
  delete old.totalDamage;
  storage.data[save.RUN_KEY] = JSON.stringify(old);
  resetRun();
  assert.equal(save.loadRun(), true);
  assert.deepEqual(state.runStats.damageByItem, {});
});

test("texto de compartilhar nos dois idiomas, com o link", () => {
  const result = { wave: 7, score: 1234 };
  assert.equal(
    shareText(result, "en"),
    "I reached wave 7 in Reliquary with 1234 points ⚔ https://jm77os.com.br/game/",
  );
  assert.equal(
    shareText(result, "pt-BR"),
    "Cheguei à onda 7 no Reliquary com 1234 pontos ⚔ https://jm77os.com.br/game/",
  );
  assert.equal(SHARE_URL, "https://jm77os.com.br/game/");
  assert.ok(shareText(result, "xx").includes("wave 7"), "idioma desconhecido cai no inglês");
  assert.ok(DICTS.en["share.button"] && DICTS["pt-BR"]["share.button"]);
});

test("share.js importa em node e as partes puras funcionam", () => {
  assert.equal(formatDuration(65000), "1m 5s");
  assert.equal(formatDuration(9000), "9s");
  assert.equal(imageFileName({ wave: 12 }), "reliquary-wave-12.png");
});
