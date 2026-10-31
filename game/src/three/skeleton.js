// ═══════════════════════════════════════════
//  ESQUELETOS DOS PERSONAGENS (desempenho)
// ═══════════════════════════════════════════
// Só lógica sobre objetos do three, sem importá-lo: roda nos testes do Node.

// O GLTF (e o clone do SkeletonUtils) dá um Skeleton por malha, mas todas as malhas
// de um modelo KayKit usam os mesmos ossos: com dezenas de inimigos eram ~9 texturas
// de ossos por inimigo, recalculadas e reenviadas à GPU. Malhas com os mesmos ossos e
// as mesmas inversas passam a usar o primeiro esqueleto (mesmo resultado na tela).
export function shareSkeleton(model) {
  let first = null;
  model.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    if (!first) {
      first = o.skeleton;
      return;
    }
    const sk = o.skeleton;
    if (sk === first) return;
    const same =
      sk.bones.length === first.bones.length &&
      sk.bones.every((b, i) => b === first.bones[i]) &&
      sk.boneInverses.every((m, i) => m.equals(first.boneInverses[i]));
    if (same) {
      sk.dispose();
      o.skeleton = first;
    }
  });
  return first;
}

// O three recalcula o esqueleto a cada renderer.render(), e o quadro tem vários
// (reflexo, cor + sombra, normais), mas os ossos só mudam uma vez por quadro do jogo.
// frame(): número do quadro atual; o cálculo roda na primeira chamada de cada quadro.
export function updateOncePerFrame(skeleton, frame) {
  const update = skeleton.update;
  let done = null;
  skeleton.update = function () {
    const f = frame();
    if (done === f) return;
    done = f;
    update.call(this);
  };
  return skeleton;
}
