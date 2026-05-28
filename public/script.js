const tg = window.Telegram?.WebApp;
if (tg) { tg.expand(); tg.ready(); }

const loadingScreen = document.getElementById('loading-screen');
const appContainer = document.getElementById('app');
const captchaCanvas = document.getElementById('captcha-canvas');
const puzzlePiece = document.getElementById('puzzle-piece');
const sliderThumb = document.getElementById('slider-thumb');
const sliderFill = document.getElementById('slider-fill');
const refreshBtn = document.getElementById('refresh-btn');
const statusMessage = document.getElementById('status-message');
const successOverlay = document.getElementById('success-overlay');
const particlesContainer = document.getElementById('particles');
const ctx = captchaCanvas.getContext('2d');
const pieceCtx = puzzlePiece.getContext('2d');

const CONFIG = { canvasWidth: 280, canvasHeight: 160, pieceSize: 44, tolerance: 5, maxAttempts: 5 };
let state = { targetX: 0, targetY: 0, currentX: 0, isDragging: false, startX: 0, attempts: 0, solved: false, locked: false };

function init() {
  createParticles();
  setTimeout(() => { loadingScreen.classList.add('hidden'); appContainer.classList.remove('hidden'); generateCaptcha(); }, 1200);
}

function createParticles() {
  for (let i = 0; i < 15; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.width = (3 + Math.random() * 5) + 'px';
    p.style.height = p.style.width;
    p.style.animationDuration = (8 + Math.random() * 12) + 's';
    p.style.animationDelay = Math.random() * 5 + 's';
    particlesContainer.appendChild(p);
  }
}

function generateCaptcha() {
  if (state.locked) return;
  state.targetX = 60 + Math.floor(Math.random() * (CONFIG.canvasWidth - CONFIG.pieceSize - 100));
  state.targetY = 20 + Math.floor(Math.random() * (CONFIG.canvasHeight - CONFIG.pieceSize - 40));
  state.currentX = 0;
  state.solved = false;
  sliderThumb.style.left = '2px';
  sliderFill.style.width = '0px';
  statusMessage.className = 'status-message';
  statusMessage.style.display = 'none';
  drawBackground();
  drawPuzzleHole();
  drawPuzzlePieceCanvas();
  puzzlePiece.style.left = '0px';
  puzzlePiece.style.top = state.targetY + 'px';
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);
  const hue1 = Math.random() * 360;
  const hue2 = (hue1 + 40 + Math.random() * 60) % 360;
  gradient.addColorStop(0, `hsl(${hue1}, 60%, 70%)`);
  gradient.addColorStop(1, `hsl(${hue2}, 60%, 65%)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    ctx.arc(Math.random() * CONFIG.canvasWidth, Math.random() * CONFIG.canvasHeight, 10 + Math.random() * 30, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${Math.random() * 360}, 50%, 60%, 0.3)`;
    ctx.fill();
  }
}

function getPuzzlePath(c, x, y, size) {
  const k = size * 0.25;
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x + size * 0.35, y);
  c.arc(x + size * 0.5, y, k, Math.PI, 0, false);
  c.lineTo(x + size, y);
  c.lineTo(x + size, y + size * 0.35);
  c.arc(x + size, y + size * 0.5, k, -Math.PI / 2, Math.PI / 2, false);
  c.lineTo(x + size, y + size);
  c.lineTo(x, y + size);
  c.lineTo(x, y);
  c.closePath();
}

function drawPuzzleHole() {
  getPuzzlePath(ctx, state.targetX, state.targetY, CONFIG.pieceSize);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawPuzzlePieceCanvas() {
  const size = CONFIG.pieceSize;
  const k = size * 0.25;
  puzzlePiece.width = size + k;
  puzzlePiece.height = size + k;
  puzzlePiece.style.width = (size + k) + 'px';
  puzzlePiece.style.height = (size + k) + 'px';
  pieceCtx.clearRect(0, 0, size + k, size + k);
  pieceCtx.save();
  getPuzzlePath(pieceCtx, 0, 0, size);
  pieceCtx.clip();
  pieceCtx.drawImage(captchaCanvas, state.targetX, state.targetY, size, size, 0, 0, size, size);
  pieceCtx.restore();
  getPuzzlePath(pieceCtx, 0, 0, size);
  pieceCtx.strokeStyle = 'rgba(255,255,255,0.9)';
  pieceCtx.lineWidth = 2;
  pieceCtx.stroke();
  puzzlePiece.style.top = state.targetY + 'px';
  puzzlePiece.style.left = '0px';
}

const maxSlide = 280 - 40 - 4;

function onDragStart(e) {
  if (state.solved || state.locked) return;
  e.preventDefault();
  state.isDragging = true;
  state.startX = getClientX(e) - state.currentX;
  sliderThumb.style.transition = 'none';
  sliderFill.style.transition = 'none';
  puzzlePiece.style.transition = 'none';
}

function onDragMove(e) {
  if (!state.isDragging) return;
  e.preventDefault();
  let newX = Math.max(0, Math.min(getClientX(e) - state.startX, maxSlide));
  state.currentX = newX;
  sliderThumb.style.left = (newX + 2) + 'px';
  sliderFill.style.width = (newX + 20) + 'px';
  puzzlePiece.style.left = ((newX / maxSlide) * (CONFIG.canvasWidth - CONFIG.pieceSize)) + 'px';
}

function onDragEnd() {
  if (!state.isDragging) return;
  state.isDragging = false;
  const pieceX = (state.currentX / maxSlide) * (CONFIG.canvasWidth - CONFIG.pieceSize);
  Math.abs(pieceX - state.targetX) <= CONFIG.tolerance ? onSuccess() : onFail();
}

function getClientX(e) { return e.touches ? e.touches[0].clientX : e.clientX; }

function onSuccess() {
  state.solved = true;
  showStatus('✓ Puzzle solved!', 'success');
  sliderFill.style.background = 'linear-gradient(90deg, #66bb6a, #43a047)';
  setTimeout(() => successOverlay.classList.remove('hidden'), 600);
  setTimeout(() => { if (tg) { tg.sendData('captcha_success'); setTimeout(() => tg.close(), 1000); } }, 1500);
}

function onFail() {
  state.attempts++;
  if (state.attempts >= CONFIG.maxAttempts) { state.locked = true; showStatus('Too many attempts. Please try again later.', 'error'); return; }
  showStatus(`Incorrect. ${CONFIG.maxAttempts - state.attempts} attempts left.`, 'error');
  const card = document.querySelector('.card');
  card.classList.add('shake');
  setTimeout(() => card.classList.remove('shake'), 500);
  sliderThumb.style.transition = 'left 0.4s ease';
  sliderFill.style.transition = 'width 0.4s ease';
  puzzlePiece.style.transition = 'left 0.4s ease';
  sliderThumb.style.left = '2px';
  sliderFill.style.width = '0px';
  puzzlePiece.style.left = '0px';
  state.currentX = 0;
  setTimeout(() => generateCaptcha(), 800);
}

function showStatus(msg, type) { statusMessage.textContent = msg; statusMessage.className = `status-message ${type}`; statusMessage.style.display = 'block'; }

sliderThumb.addEventListener('mousedown', onDragStart);
document.addEventListener('mousemove', onDragMove);
document.addEventListener('mouseup', onDragEnd);
sliderThumb.addEventListener('touchstart', onDragStart, { passive: false });
document.addEventListener('touchmove', onDragMove, { passive: false });
document.addEventListener('touchend', onDragEnd);
refreshBtn.addEventListener('click', () => { refreshBtn.style.transform = 'rotate(360deg)'; setTimeout(() => { refreshBtn.style.transform = ''; generateCaptcha(); }, 300); });

init();
