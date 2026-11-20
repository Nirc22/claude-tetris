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

Records: la carga termina en `showStart()` (no `init()`): arranca el estado, cancela el rAF, `started=false` y muestra `#overlay` con título TETRIS, `#records` y botón "Jugar" (`restartBtn`; `init` lo vuelve a "Reiniciar" y oculta `#records`/`#name-entry`). Con `started=false` el keydown solo atiende Enter (si no hay botón enfocado) para jugar. `localStorage`: `records` (top 5 `{name, score, lines, level, date}`, saneado en `loadRecords`) y `recordStats` (`{bestCombo, maxLines}`); ambos se borran con `#reset-records-btn` (`confirm`). `clearLines` lleva `combo`/`comboMax` (locks consecutivos con líneas; se resetean en `init`). `endGame` actualiza `recordStats` siempre y, si `rankFor` da posición, muestra `#name-entry` (`#name-input` maxlength 12, `#save-name-btn`; Enter o botón → `submitName`) con fila provisional `(tú)` (`pendingRecord`); la fila de la partida se resalta con `.me` (`savedIdx`). El keydown global ignora todo con foco en `#name-input`. IDs extra: `name-entry`, `name-input`, `save-name-btn`, `records`, `records-list`, `records-extra`, `reset-records-btn`. Nombres siempre con `textContent`.

Quirks to know:
- `COLS`/`ROWS`/`BLOCK` must match the `<canvas id="board">` `width`/`height` in `index.html` (`COLS*BLOCK` x `ROWS*BLOCK`). The next-piece canvas assumes a 4x4 grid at 30px.
- Level speed is set in `clearLines`: `max(100, 1000 - (level-1)*90)` ms. `init` hardcodes the initial 1000.
- Rotation (`tryRotate`) is clockwise only, with horizontal kicks `[0,-1,1,-2,2]`; no SRS, no bag randomizer (`randomPiece` is uniform random).
- Scoring: `LINE_SCORES[cleared] * level`; soft drop +1/row, hard drop +2/row.
- Theming: colors are CSS variables in `style.css` (`:root` = dark default, `[data-theme="light"]` overrides). `applyTheme` in `game.js` sets `data-theme`, caches `--grid` into `gridColor` for `drawGrid`, and redraws (rAF is cancelled when paused/game over). Preference persists in `localStorage` key `theme`. The keydown handler ignores keys (except P) when focus is on `#theme-toggle`.
