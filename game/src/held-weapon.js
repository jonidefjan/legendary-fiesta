// ═══════════════════════════════════════════
//  ARMA NA MÃO DO HERÓI: do ícone 16×16 para blocos
// ═══════════════════════════════════════════
// Só dados e contas, sem o three: roda nos testes do Node. three/characters.js monta a malha.

import { ART_PALETTE, ITEM_ART } from "./item-art.js";

const VOXEL = 0.07; // lado de um pixel do ícone, nas unidades da mão do modelo
const DEPTH = 0.09; // espessura da arma

// Como cada ícone fica na mão. grip: pixel [coluna, linha] que a mão segura; tip: pixel para
// onde a arma aponta (vira o eixo da lâmina da mão); scale: para o que não tem cabo.
export const HELD_POSES = {
  rusted_sword: { grip: [3, 12], tip: [14, 1] },
  veterans_blade: { grip: [4, 13], tip: [15, 1] },
  ember_blade: { grip: [3, 12], tip: [14, 1] },
  shadow_dagger: { grip: [8, 12], tip: [8, 1] },
  thunder_staff: { grip: [4, 11], tip: [12, 2] },
  frost_bow: { grip: [4, 7], tip: [4, 0] },
  poison_blade: { grip: [3, 13], tip: [14, 2] },
  holy_mace: { grip: [3, 13], tip: [11, 4] },
  blood_scythe: { grip: [3, 12], tip: [9, 6] },
  water_orb: { grip: [8, 15], tip: [8, 0], scale: 0.7 },
  seismic_hammer: { grip: [8, 13], tip: [8, 0] },
  judgment_tome: { grip: [8, 14], tip: [8, 1], scale: 0.7 },
  forge_hammer: { grip: [2, 13], tip: [9, 6] },
  serpent_dagger: { grip: [8, 13], tip: [8, 1] },
  long_crossbow: { grip: [8, 12], tip: [8, 1] },
  phantom_bow: { grip: [7, 8], tip: [2, 2] },
};

// O ícone da primeira arma da lista (formas evoluídas usam a arte do item base)
export function heldArtId(items) {
  const weapon = items.find((i) => i.type === "weapon");
  return weapon ? weapon.art || weapon.id : null;
}

// Giro em z (radianos) que leva o vetor grip → tip ao eixo +Y da mão
export function heldAngle({ grip, tip }) {
  return Math.atan2(tip[0] - grip[0], grip[1] - tip[1]);
}

// As 6 faces de um bloco: normal e os 4 cantos (±1), em sentido anti-horário visto de fora
const FACES = [
  { n: [0, 0, 1], side: null, c: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { n: [0, 0, -1], side: null, c: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
  { n: [1, 0, 0], side: [1, 0], c: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
  { n: [-1, 0, 0], side: [-1, 0], c: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
  { n: [0, 1, 0], side: [0, -1], c: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
  { n: [0, -1, 0], side: [0, 1], c: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
];

// Malha de blocos do ícone, com a mão na origem. As laterais entre dois pixels cheios não
// são geradas. colors traz uma cor (hex) por vértice.
export function heldVoxels(rows, pose, palette = ART_PALETTE) {
  const size = VOXEL * (pose.scale ?? 1);
  const half = size / 2;
  const depth = (DEPTH * (pose.scale ?? 1)) / 2;
  const filled = (col, row) => Boolean(palette[rows[row]?.[col]]);
  const out = { positions: [], normals: [], colors: [], indices: [] };

  rows.forEach((line, row) => {
    for (let col = 0; col < line.length; col++) {
      const color = palette[line[col]];
      if (!color) continue;
      const x = (col - pose.grip[0]) * size;
      const y = (pose.grip[1] - row) * size;
      for (const face of FACES) {
        if (face.side && filled(col + face.side[0], row + face.side[1])) continue;
        const base = out.positions.length / 3;
        for (const [cx, cy, cz] of face.c) {
          out.positions.push(x + cx * half, y + cy * half, cz * depth);
          out.normals.push(...face.n);
          out.colors.push(color);
        }
        out.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
  });
  return out;
}

// Malha da arma pelo id da arte; null sem ícone ou sem pose
export function heldVoxelsFor(artId) {
  const rows = ITEM_ART[artId];
  const pose = HELD_POSES[artId];
  return rows && pose ? heldVoxels(rows, pose) : null;
}
