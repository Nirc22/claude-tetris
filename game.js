'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#f06292', // + - pink
  '#4db6ac', // U - teal
  '#a1887f', // Y - brown
  '#fff176', // single - light yellow
  '#9575cd', // hollow 3x3 - violet
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[0,8,0],[8,8,8],[0,8,0]],                  // + (pentominó)
  [[9,0,9],[9,9,9],[0,0,0]],                  // U (pentominó)
  [[0,0,0,0],[10,10,10,10],[0,10,0,0],[0,0,0,0]], // Y (pentominó)
  [[11]],                                      // single 1x1 (recompensa)
  [[12,12,12],[12,0,12],[12,12,12]],          // 3x3 hueca (reto)
];

const STANDARD_TYPES = 7;
const SPECIAL_TYPES = [8, 9, 10, 12]; // piezas que aparecen ocasionalmente
const SPECIAL_CHANCE = 0.12;
const SINGLE_TYPE = 11;

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const energyFill = document.getElementById('energy-fill');
const energyHint = document.getElementById('energy-hint');
const queueCanvas = document.getElementById('queue-canvas');
const queueCtx = queueCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');
const holdSection = document.getElementById('hold-section');
const holdLabel = document.getElementById('hold-label');
const effectsSection = document.getElementById('effects');
const effectsList = document.getElementById('effects-list');
const abilityMenu = document.getElementById('ability-menu');

const ENERGY_MAX = 10;
const SLOW_MS = 10000;
const SLOW_FACTOR = 2;
const EFFECT_PIECES = 10;

let gridColor = '#22222e';

function applyTheme(theme) {
  const isLight = theme === 'light';
  document.documentElement.dataset.theme = isLight ? 'light' : 'dark';
  themeToggle.setAttribute('aria-checked', String(isLight));
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim() || gridColor;
  // El rAF está cancelado en pausa/game over: redibujar manualmente
  if (current && queue.length) { draw(); drawNext(); drawHold(); }
}

let board, current, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let queue = [];
let energy = 0, choosing = false;
let previewLeft = 0, slowLeft = 0, holdLeft = 0, held = null, holdUsed = false, undoSnapshot = null;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function makePiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomPiece() {
  if (Math.random() < SPECIAL_CHANCE)
    return makePiece(SPECIAL_TYPES[Math.floor(Math.random() * SPECIAL_TYPES.length)]);
  const type = Math.floor(Math.random() * STANDARD_TYPES) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    // Recompensa tras un Tetris: la siguiente pieza es un 1x1
    if (cleared >= 4) queue[0] = makePiece(SINGLE_TYPE);
    energy = Math.min(ENERGY_MAX, energy + cleared + (cleared >= 4 ? 1 : 0));
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  undoSnapshot = {
    board: board.map(row => [...row]),
    type: current.type,
    queue: [...queue],
    score, lines, level, dropInterval,
    previewLeft, holdLeft, held, holdUsed,
  };
  merge();
  clearLines();
  spawn();
}

function fillQueue() {
  while (queue.length < 5) queue.push(randomPiece());
}

function spawn() {
  current = queue.shift();
  fillQueue();
  holdUsed = false;
  if (previewLeft > 0) previewLeft--;
  if (holdLeft > 0) {
    holdLeft--;
    if (holdLeft === 0) held = null;
  }
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
  drawHold();
  updateHUD();
}

function updateEffects() {
  const items = [];
  if (slowLeft > 0) items.push(`Lento: ${Math.ceil(slowLeft / 1000)}s`);
  if (previewLeft > 0) items.push(`Vista 5: ${previewLeft} piezas`);
  if (holdLeft > 0) items.push(`Hold: ${holdLeft} piezas`);
  effectsList.textContent = items.join('\n');
  effectsSection.classList.toggle('hidden', items.length === 0);
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  const full = energy >= ENERGY_MAX;
  energyFill.style.width = `${(energy / ENERGY_MAX) * 100}%`;
  energyFill.classList.toggle('full', full);
  energyHint.textContent = full ? 'Pulsa E' : `${energy}/${ENERGY_MAX}`;
  queueCanvas.classList.toggle('hidden', previewLeft <= 0);
  holdSection.classList.toggle('hidden', holdLeft <= 0);
  holdLabel.textContent = `HOLD (${holdLeft})`;
  updateEffects();
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  drawShapeCentered(nextCtx, queue[0].shape, 0, NB);

  queueCtx.clearRect(0, 0, queueCanvas.width, queueCanvas.height);
  if (previewLeft > 0)
    for (let i = 1; i <= 4; i++)
      drawShapeCentered(queueCtx, queue[i].shape, (i - 1) * 4, 15);
}

// Dibuja una forma centrada en una cuadrícula de 4x4 celdas, desplazada rowOffset filas
function drawShapeCentered(context, shape, rowOffset, size) {
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = rowOffset + Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(context, offX + c, offY + r, shape[r][c], size);
}

function drawHold() {
  holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
  if (held) drawShapeCentered(holdCtx, PIECES[held], 0, 30);
}

function holdSwap() {
  if (holdLeft <= 0 || holdUsed) return;
  const prevCurrent = current;
  const prevHeld = held;
  const incoming = prevHeld ? makePiece(prevHeld) : queue[0];
  if (collide(incoming.shape, incoming.x, incoming.y)) return;
  if (!prevHeld) { queue.shift(); fillQueue(); }
  held = prevCurrent.type;
  current = incoming;
  holdUsed = true;
  drawNext();
  drawHold();
}

function openAbilityMenu() {
  if (paused || gameOver || choosing || energy < ENERGY_MAX) return;
  choosing = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'HABILIDAD';
  overlayScore.textContent = '';
  restartBtn.classList.add('hidden');
  abilityMenu.querySelector('[data-ability="4"]').disabled = !undoSnapshot;
  abilityMenu.classList.remove('hidden');
  overlay.classList.remove('hidden');
}

function closeAbilityMenu() {
  if (!choosing) return;
  choosing = false;
  if (abilityMenu.contains(document.activeElement)) document.activeElement.blur();
  abilityMenu.classList.add('hidden');
  restartBtn.classList.remove('hidden');
  overlay.classList.add('hidden');
  lastTime = performance.now();
  animId = requestAnimationFrame(loop);
}

function useAbility(n) {
  if (!choosing) return;
  switch (n) {
    case 1:
      previewLeft = EFFECT_PIECES;
      break;
    case 2: {
      const types = [1, 2, 3, 4, 5, 6, 7].filter(t => t !== current.type);
      for (let i = types.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [types[i], types[j]] = [types[j], types[i]];
      }
      const piece = types.map(makePiece).find(p => !collide(p.shape, p.x, p.y));
      if (piece) current = piece;
      break;
    }
    case 3:
      slowLeft = SLOW_MS;
      break;
    case 4:
      if (!undoSnapshot) return;
      ({ score, lines, level, dropInterval, previewLeft, holdLeft, held, holdUsed } = undoSnapshot);
      board = undoSnapshot.board;
      queue = undoSnapshot.queue;
      current = makePiece(undoSnapshot.type);
      undoSnapshot = null;
      break;
    case 5:
      holdLeft = EFFECT_PIECES;
      break;
    default:
      return;
  }
  energy = 0;
  updateHUD();
  drawNext();
  drawHold();
  closeAbilityMenu();
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver || choosing) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  if (gameOver || paused || choosing) return;
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (slowLeft > 0) {
    slowLeft = Math.max(0, slowLeft - dt);
    updateEffects();
  }
  if (dropAccum >= dropInterval * (slowLeft > 0 ? SLOW_FACTOR : 1)) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  // endGame pudo ejecutarse en este mismo frame: cancelAnimationFrame no
  // detiene el frame en curso, así que no hay que reprogramar el bucle.
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  energy = 0;
  choosing = false;
  previewLeft = 0;
  slowLeft = 0;
  holdLeft = 0;
  held = null;
  holdUsed = false;
  undoSnapshot = null;
  queue = [];
  fillQueue();
  abilityMenu.classList.add('hidden');
  restartBtn.classList.remove('hidden');
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  // El switch de tema usa Space/Enter nativamente; no debe disparar hard drop
  if (e.target === themeToggle && e.code !== 'KeyP') return;
  if (choosing) {
    const m = e.code.match(/^(?:Digit|Numpad)([1-5])$/);
    if (m) useAbility(Number(m[1]));
    else if (e.code === 'Escape') closeAbilityMenu();
    return;
  }
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'KeyE':
      openAbilityMenu();
      return;
    case 'KeyC':
      holdSwap();
      break;
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

abilityMenu.addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.cancel) closeAbilityMenu();
  else useAbility(Number(btn.dataset.ability));
});

themeToggle.addEventListener('click', e => {
  const theme = themeToggle.getAttribute('aria-checked') === 'true' ? 'dark' : 'light';
  applyTheme(theme);
  try { localStorage.setItem('theme', theme); } catch (_) {}
  if (e.detail > 0) themeToggle.blur(); // clic de ratón: devolver el teclado al juego
});

let savedTheme = 'dark';
try { savedTheme = localStorage.getItem('theme') === 'light' ? 'light' : 'dark'; } catch (_) {}
applyTheme(savedTheme);

init();
