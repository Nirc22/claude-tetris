# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JS Tetris on HTML5 Canvas. No build, no dependencies, no package.json, no tests, no linter. UI strings and README are in Spanish.

## Running

Open `index.html` directly, or serve statically: `python -m http.server 8000` then visit `http://localhost:8000`.

## Architecture

Three files, all logic in `game.js` (loaded as a classic script, `'use strict'`, global state):

- `index.html` defines the DOM that `game.js` looks up by id at load time (`board`, `next-canvas`, `score`, `lines`, `level`, `overlay`, `overlay-title`, `overlay-score`, `restart-btn`, `theme-toggle`). Renaming an id breaks the game.
- `game.js` keeps state in module-level `let` variables (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, ...). `init()` resets all of it and is also the restart handler.
- Board is a `ROWS x COLS` matrix of `0` or color index 1–7. The same index keys `COLORS` and `PIECES` (index 0 is `null` in both). Piece matrices embed their own index as cell value.

Flow: `loop` (rAF) accumulates `dropAccum`, steps the piece down every `dropInterval`, calls `draw()`. Piece landing goes `lockPiece` → `merge` → `clearLines` → `spawn`. `spawn` calls `endGame` if the new piece collides immediately. Pause and game over both cancel the rAF and reuse the same `#overlay`.

Habilidades: `clearLines` suma energía (`cleared`, +1 extra con Tetris) hasta `ENERGY_MAX`. Con la barra llena, `E` abre `#ability-menu` dentro de `#overlay` (estado `choosing`, cancela el rAF; teclas 1–5 / clic eligen, Esc cancela; `P` se ignora). `useAbility` aplica la habilidad, vacía la energía y reanuda. La pieza siguiente es `queue[0]` (`queue` mantiene ≥5 piezas, reemplaza a `next`); `lockPiece` guarda `undoSnapshot` antes de `merge`. Efectos temporales: `previewLeft`/`holdLeft` (en piezas, se decrementan en `spawn`) y `slowLeft` (ms, se decrementa en `loop` y duplica `dropInterval`). `C` = hold (`holdSwap`, una vez por pieza). IDs extra en el DOM: `energy-fill`, `energy-hint`, `queue-canvas`, `hold-canvas`, `hold-section`, `hold-label`, `effects`, `effects-list`, `ability-menu`.

Quirks to know:
- `COLS`/`ROWS`/`BLOCK` must match the `<canvas id="board">` `width`/`height` in `index.html` (`COLS*BLOCK` x `ROWS*BLOCK`). The next-piece canvas assumes a 4x4 grid at 30px.
- Level speed is set in `clearLines`: `max(100, 1000 - (level-1)*90)` ms. `init` hardcodes the initial 1000.
- Rotation (`tryRotate`) is clockwise only, with horizontal kicks `[0,-1,1,-2,2]`; no SRS, no bag randomizer (`randomPiece` is uniform random).
- Scoring: `LINE_SCORES[cleared] * level`; soft drop +1/row, hard drop +2/row.
- Theming: colors are CSS variables in `style.css` (`:root` = dark default, `[data-theme="light"]` overrides). `applyTheme` in `game.js` sets `data-theme`, caches `--grid` into `gridColor` for `drawGrid`, and redraws (rAF is cancelled when paused/game over). Preference persists in `localStorage` key `theme`. The keydown handler ignores keys (except P) when focus is on `#theme-toggle` or `#skin-select`.
- Skins: `<select id="skin-select">` (next to `#theme-toggle`), `localStorage` key `skin` (validated against `SKINS` keys, default `retro`). `SKINS = { retro, neon, pastel, pixel }`; each has `colors` (13 entries, index 0 `null`, same indices as `PIECES`), `draw(context, px, py, color, size)` and optionally `bg` (canvas background, Neon = black) and `grid`. `COLORS` is a `let` pointing at the active skin's palette; `drawBlock` (the only place blocks are painted) wraps `activeSkin.draw` in `save/restore` (so alpha/shadow don't leak). `clearCanvas(context, cv)` replaces `clearRect` and paints the skin `bg`. `applySkin(name)` sets, saves and redraws manually (works while paused/game over); the `change` handler blurs the select.
