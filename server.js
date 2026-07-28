'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const Database = require('better-sqlite3');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'scores.sqlite');
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS scores (id TEXT PRIMARY KEY, name TEXT NOT NULL, score INTEGER NOT NULL, wave INTEGER NOT NULL, createdAt TEXT NOT NULL)`);
const MAX_BODY_SIZE = 16 * 1024;
const scoreRequests = new Map();
const RATE_LIMIT_MS = 30000;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(payload));
}

function readScores() {
  return db.prepare('SELECT * FROM scores ORDER BY score DESC, createdAt ASC LIMIT 100').all();
}

function writeScore(score) {
  db.prepare(`INSERT INTO scores (id, name, score, wave, createdAt) VALUES (@id, @name, @score, @wave, @createdAt)`).run(score);
}

function sanitizeName(value) {
  return String(value ?? '')
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .trim()
    .slice(0, 18);
}

function collectJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';

    req.on('data', chunk => {
      data += chunk;
      if (Buffer.byteLength(data) > MAX_BODY_SIZE) {
        reject(Object.assign(new Error('Payload demasiado grande'), { statusCode: 413 }));
        req.destroy();
      }
    });

    req.on('end', () => {
      if (!data) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(data));
      } catch {
        reject(Object.assign(new Error('JSON no válido'), { statusCode: 400 }));
      }
    });

    req.on('error', reject);
  });
}

function handleGetScores(res) {
  const scores = readScores()
    .sort((a, b) => b.score - a.score || new Date(a.createdAt) - new Date(b.createdAt))
    .slice(0, 10);

  sendJson(res, 200, { scores });
}

async function handlePostScore(req, res) {
  try {
    const clientIp = req.socket.remoteAddress || 'unknown';
    const lastRequest = scoreRequests.get(clientIp) || 0;
    if (Date.now() - lastRequest < RATE_LIMIT_MS) {
      sendJson(res, 429, { error: 'Demasiados intentos. Espera unos segundos.' });
      return;
    }
    scoreRequests.set(clientIp, Date.now());
    const body = await collectJsonBody(req);
    const name = sanitizeName(body.name) || 'Piloto';
    const score = Number(body.score);
    const wave = Number(body.wave);

    if (!Number.isInteger(score) || score < 0 || score > 10_000_000) {
      sendJson(res, 400, { error: 'La puntuación no es válida.' });
      return;
    }

    if (!Number.isInteger(wave) || wave < 1 || wave > 999) {
      sendJson(res, 400, { error: 'La oleada no es válida.' });
      return;
    }

    const newScore = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      score,
      wave,
      createdAt: new Date().toISOString()
    };

    writeScore(newScore);

    // Limpieza: conservar solo los 100 mejores resultados.
    db.prepare(`DELETE FROM scores WHERE id NOT IN (SELECT id FROM scores ORDER BY score DESC, createdAt ASC LIMIT 100)`).run();

    sendJson(res, 201, { score: newScore });
  } catch (error) {
    if (!res.headersSent) {
      sendJson(res, error.statusCode || 500, {
        error: error.statusCode ? error.message : 'No se pudo guardar la puntuación.'
      });
    }
  }
}

function serveStaticFile(req, res, pathname) {
  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  const decodedPath = decodeURIComponent(requestedPath);
  const absolutePath = path.normalize(path.join(PUBLIC_DIR, decodedPath));

  if (!absolutePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: 'Acceso denegado.' });
    return;
  }

  fs.stat(absolutePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      const fallback = path.join(PUBLIC_DIR, 'index.html');
      fs.readFile(fallback, (fallbackError, data) => {
        if (fallbackError) {
          sendJson(res, 404, { error: 'Recurso no encontrado.' });
          return;
        }
        res.writeHead(200, {
          'Content-Type': mimeTypes['.html'],
          'Cache-Control': 'no-cache',
          'X-Content-Type-Options': 'nosniff'
        });
        res.end(data);
      });
      return;
    }

    fs.readFile(absolutePath, (readError, data) => {
      if (readError) {
        sendJson(res, 500, { error: 'No se pudo leer el recurso.' });
        return;
      }

      const extension = path.extname(absolutePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': mimeTypes[extension] || 'application/octet-stream',
        'Cache-Control': extension === '.html' ? 'no-cache' : 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff'
      });
      res.end(data);
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/api/health') {
    sendJson(res, 200, { ok: true, service: 'space-invaders-web' });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/scores') {
    handleGetScores(res);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/scores') {
    await handlePostScore(req, res);
    return;
  }

  if (!['GET', 'HEAD'].includes(req.method)) {
    sendJson(res, 405, { error: 'Método no permitido.' });
    return;
  }

  serveStaticFile(req, res, url.pathname);
});

server.listen(PORT, HOST, () => {
  ensureDataFile();
  console.log(`Space Invaders disponible en http://localhost:${PORT}`);
});

function shutdown(signal) {
  console.log(`\n${signal}: cerrando servidor...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
