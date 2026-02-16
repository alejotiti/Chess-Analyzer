# Chess Analyzer (PGN → Stockfish) — 0 backend

Web app estática: pegás un **PGN**, navegás la partida y pedís evaluación de **Stockfish en el navegador** (WASM + Web Worker).

## Requisitos
- Node.js 18+ recomendado

## Dev
```bash
npm install
npm run dev
```

## Estructura de etapas (Codex)
- `codex/CURRENT_STAGE.txt` indica la etapa actual.
- Cada etapa tiene docs en `codex/stages/XX/`.

## Licencias
Stockfish es GPL. Cuando integremos el engine, agregaremos los archivos correspondientes en `LICENSES/` y lo documentaremos.
