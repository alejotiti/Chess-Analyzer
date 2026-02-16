Implementá Stage 02.

Requisitos:
- Agregar Stockfish WASM/JS compatible con Vite.
- Crear worker `src/engine/stockfish.worker.ts` y wrapper `src/engine/stockfish.ts`.
- Wrapper con Promises para:
  - init
  - analyzePosition(fen, { depth?: number, movetimeMs?: number })
- analyzePosition resuelve con:
  - bestmove (UCI)
  - score: { type: "cp"|"mate", value: number }
  - principalVariation (si se puede)
- UI todavía puede mostrar resultados en logs.

No metas multi-PV todavía.
