# Stage 02 — Stockfish (WASM) en Web Worker

## Objetivo
- Correr Stockfish en un Web Worker.
- Exponer API interna:
  - init()
  - analyzePosition(fen, options) => { bestmove, score, pv? }

## Requisitos UCI
- uci / isready / ucinewgame
- position fen <FEN>
- go depth N o go movetime MS
- Parse de "info ... score cp ..." y "score mate ..."
