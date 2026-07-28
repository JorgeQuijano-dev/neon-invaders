# Neon Invaders

Juego web inspirado en los clásicos de invasores espaciales. Incluye:

- Frontend en HTML, CSS y JavaScript puro.
- Juego Canvas a 60 FPS.
- Controles de teclado y táctiles.
- Oleadas, vidas, escudos, partículas y dificultad progresiva.
- Backend Node.js sin dependencias externas.
- API REST para puntuaciones.
- Ranking persistente en `data/scores.json`.
- Diseño responsive para escritorio y móvil.

## Requisitos

- Node.js 18 o superior.

## Ejecutar

```bash
npm start
```

Después abre:

```text
http://localhost:3000
```

## Desarrollo

```bash
npm run dev
```

## Comprobar sintaxis

```bash
npm run check
```

## API

### Estado del servidor

```http
GET /api/health
```

### Ranking

```http
GET /api/scores
```

### Guardar puntuación

```http
POST /api/scores
Content-Type: application/json

{
  "name": "Piloto",
  "score": 12500,
  "wave": 4
}
```

## Estructura

```text
space-invaders-web/
├── data/
│   └── scores.json
├── public/
│   ├── game.js
│   ├── index.html
│   └── styles.css
├── package.json
├── README.md
└── server.js
```

## Docker

```bash
docker build -t neon-invaders .
docker run --rm -p 3000:3000 neon-invaders
```
