# legendary-fiesta

Two things live in this repository:

- **Portfolio** (`index.html`): the personal site of Jonatas Mattos, at [jm77os.com.br](https://jm77os.com.br). English and Portuguese (pt-BR), light and dark themes.
- **Reliquary** (`game/`): a browser auto-battler with a 3D pixel-art look. Play it at [jm77os.com.br/game/](https://jm77os.com.br/game/).

Everything is vanilla JavaScript, HTML and CSS. There is no build step and no runtime dependency to install.

## Reliquary

- Pick a starting weapon, then fight wave after wave; the hero attacks on its own.
- After each wave choose 1 of 3 items (weapons, armor, relics). Pick one you already own to level it up, to level 5.
- 31 items with stacking burn and poison, cold and freeze, chain lightning, area damage, lifesteal and more. Common items evolve at level 5 and keep growing with kills.
- A boss every 10 waves (Lich or Demon Lord), then endless mode.
- Guaranteed legendary after a streak of reward screens without one.
- Permanent upgrades bought with fragments between runs.
- Auto-save, English and Portuguese, desktop and phone layouts (portrait and landscape).
- 3D renderer on Three.js with a pixel-art pipeline; 16x16 item icons drawn in code.

## Run locally

Serve the repo root with any static server, then open `/game/` (or `/` for the portfolio):

```
npx http-server -p 8766
```

Open `http://localhost:8766/game/`.

## Tests

```
npm test
```

Runs the `node:test` suite in `tests/`. No install needed. After changing items, run `npm run docs:items` to regenerate `docs/items.md`; a test fails if it is out of date.

## Layout

```
index.html        portfolio
game/             Reliquary
  src/            game logic (ES modules); src/three/ is the renderer
  assets/         items.json and 3D models
  locales/        en and pt-BR texts
  vendor/three/   vendored Three.js 0.170
  dev/            review pages (item art, environment)
tests/            node:test suite
scripts/          items-doc.mjs (generates docs/items.md)
docs/             game.md, items.md, archive/
```

## Documentation

- [docs/game.md](docs/game.md): how the game works, architecture, adding items, known limits.
- [docs/items.md](docs/items.md): every item (generated).

## Credits and licenses

- **Repository code**: MIT, see [LICENSE](LICENSE).
- **3D models**: KayKit Adventurers and Skeletons packs by Kay Lousberg ([kaylousberg.com](https://www.kaylousberg.com)), CC0. Licenses in `game/assets/models/` (`LICENSE-KayKit-Adventurers.txt`, `LICENSE-KayKit-Skeletons.txt`).
- **Three.js** 0.170: MIT, license in `game/vendor/three/LICENSE`.
- **Fonts**: Pixelify Sans and Tiny5, SIL Open Font License, loaded from Google Fonts.
- **Item art**: drawn in code (`game/src/item-art.js`), part of this repository.
