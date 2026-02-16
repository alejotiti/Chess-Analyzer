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

## Deploy (GitHub Pages)
- Este repo incluye workflow en `.github/workflows/deploy-pages.yml`.
- El build usa base path `/Chess-Analyzer/` en `vite.config.ts`.
- URL esperada de Pages: `https://alejotiti.github.io/Chess-Analyzer/`.

## Licencias
- `LICENSES/chess.js.txt` (BSD-2-Clause, chess.js).
- `LICENSES/stockfish.txt` (GPL-3.0, Stockfish.js/Stockfish).
- Verificar compatibilidad de distribución si se redistribuye el bundle con motor GPL.
