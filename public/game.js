'use strict';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const scoreValue = document.getElementById('scoreValue');
const highScoreValue = document.getElementById('highScoreValue');
const waveValue = document.getElementById('waveValue');
const livesValue = document.getElementById('livesValue');
const startOverlay = document.getElementById('startOverlay');
const pauseOverlay = document.getElementById('pauseOverlay');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const playerNameInput = document.getElementById('playerName');
const startButton = document.getElementById('startButton');
const restartButton = document.getElementById('restartButton');
const finalScoreText = document.getElementById('finalScoreText');
const gameOverTitle = document.getElementById('gameOverTitle');
const rankingList = document.getElementById('rankingList');
const refreshRanking = document.getElementById('refreshRanking');
const toast = document.getElementById('toast');

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const keys = new Set();

let gameState = 'menu';
let score = 0;
let highScore = Number(localStorage.getItem('neonInvadersHighScore') || 0);
let wave = 1;
let lives = 3;
let lastFrame = 0;
let lastShotAt = 0;
let enemyDirection = 1;
let enemyBaseSpeed = 28;
let enemyShootTimer = 0;
let nextExtraLife = 10000;
let screenShake = 0;
let flashOpacity = 0;
let playerName = localStorage.getItem('neonInvadersPlayer') || '';

const player = {
  x: WIDTH / 2 - 25,
  y: HEIGHT - 62,
  width: 50,
  height: 26,
  speed: 355,
  invulnerable: 0
};

let bullets = [];
let enemyBullets = [];
let enemies = [];
let particles = [];
let stars = [];
let shields = [];

playerNameInput.value = playerName;

function formatScore(value) {
  return Math.max(0, Math.floor(value)).toString().padStart(6, '0');
}

function updateHud() {
  scoreValue.textContent = formatScore(score);
  highScoreValue.textContent = formatScore(highScore);
  waveValue.textContent = String(wave).padStart(2, '0');
  livesValue.textContent = lives > 0 ? '♥ '.repeat(lives).trim() : '—';
}

function random(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createStars() {
  stars = Array.from({ length: 95 }, () => ({
    x: random(0, WIDTH),
    y: random(0, HEIGHT),
    size: random(.6, 2),
    speed: random(7, 30),
    alpha: random(.2, .9)
  }));
}

function createEnemies() {
  enemies = [];
  const rows = 5;
  const columns = 10;
  const spacingX = 64;
  const spacingY = 48;
  const totalWidth = (columns - 1) * spacingX + 42;
  const startX = (WIDTH - totalWidth) / 2;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      enemies.push({
        x: startX + column * spacingX,
        y: 74 + row * spacingY,
        width: 42,
        height: 28,
        row,
        column,
        alive: true,
        phase: Math.random() * Math.PI * 2
      });
    }
  }
}

function createShields() {
  shields = [];
  const shieldWidth = 94;
  const count = 4;
  const gap = (WIDTH - count * shieldWidth) / (count + 1);

  for (let i = 0; i < count; i += 1) {
    const shield = [];
    const x = gap + i * (shieldWidth + gap);
    const y = HEIGHT - 155;
    const cell = 8;

    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 12; col += 1) {
        const archCut = row < 2 && (col < 2 - row || col > 9 + row);
        const centerCut = row >= 3 && col >= 4 && col <= 7;
        if (!archCut && !centerCut) {
          shield.push({ x: x + col * cell, y: y + row * cell, width: cell, height: cell, hp: 2 });
        }
      }
    }
    shields.push(shield);
  }
}

function resetGame() {
  score = 0;
  wave = 1;
  lives = 3;
  nextExtraLife = 10000;
  enemyBaseSpeed = 28;
  player.x = WIDTH / 2 - player.width / 2;
  player.invulnerable = 0;
  bullets = [];
  enemyBullets = [];
  particles = [];
  screenShake = 0;
  flashOpacity = 0;
  createEnemies();
  createShields();
  updateHud();
}

function nextWave() {
  wave += 1;
  enemyBaseSpeed = 28 + (wave - 1) * 7;
  bullets = [];
  enemyBullets = [];
  player.x = WIDTH / 2 - player.width / 2;
  createEnemies();
  if (wave % 3 === 1) createShields();
  updateHud();
  showToast(`Oleada ${wave}: la flota acelera.`);
}

function startGame() {
  playerName = playerNameInput.value.trim().slice(0, 18) || 'Piloto';
  localStorage.setItem('neonInvadersPlayer', playerName);
  playerNameInput.value = playerName;
  resetGame();
  gameState = 'playing';
  startOverlay.classList.remove('active');
  gameOverOverlay.classList.remove('active');
  pauseOverlay.classList.remove('active');
  lastFrame = performance.now();
}

function togglePause() {
  if (gameState === 'playing') {
    gameState = 'paused';
    pauseOverlay.classList.add('active');
  } else if (gameState === 'paused') {
    gameState = 'playing';
    pauseOverlay.classList.remove('active');
    lastFrame = performance.now();
  }
}

function shoot() {
  const now = performance.now();
  if (gameState !== 'playing' || now - lastShotAt < 230 || bullets.length >= 4) return;

  bullets.push({
    x: player.x + player.width / 2 - 2,
    y: player.y - 11,
    width: 4,
    height: 15,
    speed: 540
  });
  lastShotAt = now;
}

function enemyShoot() {
  const living = enemies.filter(enemy => enemy.alive);
  if (!living.length) return;

  const lowestByColumn = new Map();
  for (const enemy of living) {
    const current = lowestByColumn.get(enemy.column);
    if (!current || enemy.y > current.y) lowestByColumn.set(enemy.column, enemy);
  }

  const candidates = [...lowestByColumn.values()];
  const shooter = candidates[Math.floor(Math.random() * candidates.length)];
  enemyBullets.push({
    x: shooter.x + shooter.width / 2 - 3,
    y: shooter.y + shooter.height,
    width: 6,
    height: 15,
    speed: 185 + wave * 13
  });
}

function rectanglesOverlap(a, b) {
  return a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y;
}

function addExplosion(x, y, color, amount = 14) {
  for (let i = 0; i < amount; i += 1) {
    particles.push({
      x,
      y,
      vx: random(-115, 115),
      vy: random(-130, 90),
      life: random(.3, .75),
      maxLife: .75,
      size: random(1.5, 4),
      color
    });
  }
}

function damageShield(bullet) {
  for (const shield of shields) {
    for (let i = shield.length - 1; i >= 0; i -= 1) {
      const cell = shield[i];
      if (rectanglesOverlap(bullet, cell)) {
        cell.hp -= 1;
        addExplosion(bullet.x, bullet.y, '#63f5a1', 4);
        if (cell.hp <= 0) shield.splice(i, 1);
        return true;
      }
    }
  }
  return false;
}

function hitPlayer() {
  if (player.invulnerable > 0) return;

  lives -= 1;
  player.invulnerable = 2.1;
  screenShake = 12;
  flashOpacity = .42;
  addExplosion(player.x + player.width / 2, player.y + player.height / 2, '#ff5d70', 30);
  updateHud();

  if (lives <= 0) endGame('La nave ha sido destruida');
}

function awardPoints(enemy) {
  const pointsByRow = [40, 30, 20, 20, 10];
  score += pointsByRow[enemy.row] * wave;

  if (score > highScore) {
    highScore = score;
    localStorage.setItem('neonInvadersHighScore', String(highScore));
  }

  if (score >= nextExtraLife) {
    lives = Math.min(lives + 1, 5);
    nextExtraLife += 10000;
    showToast('Vida extra obtenida.');
  }

  updateHud();
}

async function endGame(reason) {
  if (gameState === 'gameover') return;
  gameState = 'gameover';
  gameOverTitle.textContent = reason;
  finalScoreText.textContent = `Puntuación final: ${score.toLocaleString('es-ES')} · Oleada ${wave}`;
  gameOverOverlay.classList.add('active');

  try {
    const response = await fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: playerName, score, wave })
    });

    if (!response.ok) throw new Error('No se pudo registrar la puntuación');
    showToast('Puntuación enviada al ranking.');
    await loadRanking();
  } catch (error) {
    console.error(error);
    showToast('No se pudo conectar con el ranking.');
  }
}

function update(dt) {
  for (const star of stars) {
    star.y += star.speed * dt;
    if (star.y > HEIGHT) {
      star.y = -2;
      star.x = random(0, WIDTH);
    }
  }

  if (gameState !== 'playing') return;

  const moveLeft = keys.has('ArrowLeft') || keys.has('KeyA');
  const moveRight = keys.has('ArrowRight') || keys.has('KeyD');

  if (moveLeft) player.x -= player.speed * dt;
  if (moveRight) player.x += player.speed * dt;
  player.x = clamp(player.x, 12, WIDTH - player.width - 12);

  if (keys.has('Space')) shoot();
  player.invulnerable = Math.max(0, player.invulnerable - dt);
  screenShake = Math.max(0, screenShake - dt * 28);
  flashOpacity = Math.max(0, flashOpacity - dt * 1.8);

  bullets.forEach(bullet => { bullet.y -= bullet.speed * dt; });
  enemyBullets.forEach(bullet => { bullet.y += bullet.speed * dt; });
  bullets = bullets.filter(bullet => bullet.y + bullet.height > 0);
  enemyBullets = enemyBullets.filter(bullet => bullet.y < HEIGHT + 20);

  const livingEnemies = enemies.filter(enemy => enemy.alive);
  const speedMultiplier = 1 + (1 - livingEnemies.length / 50) * 2.4;
  const movement = enemyDirection * enemyBaseSpeed * speedMultiplier * dt;
  let needsDrop = false;

  for (const enemy of livingEnemies) {
    enemy.x += movement;
    enemy.phase += dt * 5;
    if (enemy.x < 18 || enemy.x + enemy.width > WIDTH - 18) needsDrop = true;
  }

  if (needsDrop) {
    enemyDirection *= -1;
    for (const enemy of livingEnemies) {
      enemy.x += enemyDirection * 7;
      enemy.y += 18;
      if (enemy.y + enemy.height >= player.y - 4) {
        endGame('La defensa orbital ha caído');
        break;
      }
    }
  }

  enemyShootTimer -= dt;
  if (enemyShootTimer <= 0) {
    enemyShoot();
    enemyShootTimer = random(.45, 1.2) / Math.min(2.1, 1 + wave * .09);
  }

  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    const bullet = bullets[i];
    if (damageShield(bullet)) {
      bullets.splice(i, 1);
      continue;
    }

    const enemy = enemies.find(candidate => candidate.alive && rectanglesOverlap(bullet, candidate));
    if (enemy) {
      enemy.alive = false;
      bullets.splice(i, 1);
      awardPoints(enemy);
      addExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, enemy.row < 2 ? '#ff4fd8' : '#6af7ff', 18);
    }
  }

  for (let i = enemyBullets.length - 1; i >= 0; i -= 1) {
    const bullet = enemyBullets[i];

    if (damageShield(bullet)) {
      enemyBullets.splice(i, 1);
      continue;
    }

    if (rectanglesOverlap(bullet, player)) {
      enemyBullets.splice(i, 1);
      hitPlayer();
    }
  }

  if (enemies.every(enemy => !enemy.alive)) nextWave();

  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i];
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 150 * dt;
    particle.life -= dt;
    if (particle.life <= 0) particles.splice(i, 1);
  }
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  gradient.addColorStop(0, '#060a1d');
  gradient.addColorStop(.55, '#030612');
  gradient.addColorStop(1, '#02030a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.save();
  for (const star of stars) {
    ctx.globalAlpha = star.alpha;
    ctx.fillStyle = star.size > 1.4 ? '#9afaff' : '#ffffff';
    ctx.fillRect(star.x, star.y, star.size, star.size);
  }
  ctx.restore();

  ctx.strokeStyle = 'rgba(76, 237, 255, .055)';
  ctx.lineWidth = 1;
  for (let y = 0; y < HEIGHT; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
  }

  const horizon = ctx.createLinearGradient(0, HEIGHT - 120, 0, HEIGHT);
  horizon.addColorStop(0, 'rgba(13, 222, 236, 0)');
  horizon.addColorStop(1, 'rgba(13, 222, 236, .07)');
  ctx.fillStyle = horizon;
  ctx.fillRect(0, HEIGHT - 120, WIDTH, 120);

  ctx.strokeStyle = 'rgba(106, 247, 255, .25)';
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(20, HEIGHT - 28);
  ctx.lineTo(WIDTH - 20, HEIGHT - 28);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawPlayer() {
  if (player.invulnerable > 0 && Math.floor(player.invulnerable * 10) % 2 === 0) return;

  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.shadowBlur = 20;
  ctx.shadowColor = '#6af7ff';
  ctx.fillStyle = '#6af7ff';
  ctx.beginPath();
  ctx.moveTo(player.width / 2, 0);
  ctx.lineTo(player.width, player.height);
  ctx.lineTo(player.width * .68, player.height * .78);
  ctx.lineTo(player.width * .58, player.height);
  ctx.lineTo(player.width * .42, player.height);
  ctx.lineTo(player.width * .32, player.height * .78);
  ctx.lineTo(0, player.height);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 14;
  ctx.shadowColor = '#ff4fd8';
  ctx.fillStyle = '#ff4fd8';
  ctx.fillRect(player.width * .42, player.height - 1, player.width * .16, random(8, 15));

  ctx.shadowBlur = 0;
  ctx.fillStyle = '#06101e';
  ctx.beginPath();
  ctx.arc(player.width / 2, player.height * .48, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawEnemy(enemy) {
  const pulse = Math.sin(enemy.phase) * 1.5;
  const color = enemy.row < 2 ? '#ff4fd8' : enemy.row < 4 ? '#6af7ff' : '#ffe66d';

  ctx.save();
  ctx.translate(enemy.x, enemy.y + pulse);
  ctx.shadowBlur = 14;
  ctx.shadowColor = color;
  ctx.fillStyle = color;

  const pixel = 4;
  const pattern = enemy.row < 2 ? [
    '00100100',
    '00011000',
    '01111110',
    '11011011',
    '11111111',
    '01000010',
    '10100101'
  ] : enemy.row < 4 ? [
    '00011000',
    '00111100',
    '01111110',
    '11011011',
    '11111111',
    '00100100',
    '01000010'
  ] : [
    '00111100',
    '01111110',
    '11111111',
    '11011011',
    '11111111',
    '01011010',
    '10100101'
  ];

  pattern.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      if (cell === '1') ctx.fillRect(x * pixel + 5, y * pixel, pixel, pixel);
    });
  });
  ctx.restore();
}

function drawBullets() {
  ctx.save();
  ctx.shadowBlur = 14;
  ctx.shadowColor = '#6af7ff';
  ctx.fillStyle = '#baffff';
  bullets.forEach(bullet => ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height));

  ctx.shadowColor = '#ff5d70';
  ctx.fillStyle = '#ff5d70';
  enemyBullets.forEach(bullet => {
    ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
    ctx.fillRect(bullet.x - 3, bullet.y + 4, bullet.width + 6, 3);
  });
  ctx.restore();
}

function drawShields() {
  ctx.save();
  ctx.shadowBlur = 8;
  ctx.shadowColor = '#63f5a1';
  shields.forEach(shield => {
    shield.forEach(cell => {
      ctx.fillStyle = cell.hp === 2 ? '#63f5a1' : '#2c9f6d';
      ctx.fillRect(cell.x, cell.y, cell.width - 1, cell.height - 1);
    });
  });
  ctx.restore();
}

function drawParticles() {
  ctx.save();
  for (const particle of particles) {
    ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
  }
  ctx.restore();
}

function draw() {
  ctx.save();
  if (screenShake > 0) ctx.translate(random(-screenShake, screenShake), random(-screenShake, screenShake));

  drawBackground();
  drawShields();
  enemies.filter(enemy => enemy.alive).forEach(drawEnemy);
  drawBullets();
  drawPlayer();
  drawParticles();

  if (flashOpacity > 0) {
    ctx.fillStyle = `rgba(255, 93, 112, ${flashOpacity})`;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
  ctx.restore();
}

function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastFrame) / 1000 || 0, .033);
  lastFrame = timestamp;
  update(dt);
  draw();
  requestAnimationFrame(gameLoop);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove('visible'), 2500);
}

async function loadRanking() {
  rankingList.innerHTML = '<li class="ranking-empty">Recibiendo transmisión...</li>';

  try {
    const response = await fetch('/api/scores', { cache: 'no-store' });
    if (!response.ok) throw new Error('Ranking no disponible');
    const { scores } = await response.json();

    if (!scores.length) {
      rankingList.innerHTML = '<li class="ranking-empty">Todavía no hay puntuaciones. Sé el primero.</li>';
      return;
    }

    rankingList.innerHTML = scores.map(entry => `
      <li class="ranking-item">
        <div>
          <span class="ranking-name">${escapeHtml(entry.name)}</span>
          <span class="ranking-meta">OLEADA ${String(entry.wave).padStart(2, '0')}</span>
        </div>
        <strong class="ranking-score">${formatScore(entry.score)}</strong>
      </li>
    `).join('');
  } catch (error) {
    console.error(error);
    rankingList.innerHTML = '<li class="ranking-empty">Sin conexión con el ranking.</li>';
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function bindHoldButton(element, code) {
  const press = event => {
    event.preventDefault();
    keys.add(code);
    if (code === 'Space') shoot();
  };
  const release = event => {
    event.preventDefault();
    keys.delete(code);
  };

  element.addEventListener('pointerdown', press);
  element.addEventListener('pointerup', release);
  element.addEventListener('pointercancel', release);
  element.addEventListener('pointerleave', release);
}

window.addEventListener('keydown', event => {
  if (['ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();

  if (event.code === 'KeyP' && !event.repeat && ['playing', 'paused'].includes(gameState)) {
    togglePause();
    return;
  }

  if (event.code === 'Enter' && gameState === 'menu') startGame();
  if (event.code === 'Enter' && gameState === 'gameover') startGame();
  keys.add(event.code);
});

window.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', () => {
  keys.clear();
  if (gameState === 'playing') togglePause();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && gameState === 'playing') togglePause();
});

startButton.addEventListener('click', startGame);
restartButton.addEventListener('click', startGame);
refreshRanking.addEventListener('click', loadRanking);
playerNameInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') startGame();
});

bindHoldButton(document.getElementById('moveLeft'), 'ArrowLeft');
bindHoldButton(document.getElementById('moveRight'), 'ArrowRight');
bindHoldButton(document.getElementById('shootButton'), 'Space');

createStars();
createEnemies();
createShields();
updateHud();
loadRanking();
requestAnimationFrame(gameLoop);
