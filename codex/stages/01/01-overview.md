# Stage 01 — PGN parsing + tablero

## Objetivo
- Parsear un PGN pegado por el usuario.
- Mostrar el tablero y permitir navegar la partida:
  - Inicio / Anterior / Siguiente / Final
- Mostrar metadatos básicos si están (Event, White, Black, Result).

## Recomendación técnica
- `chess.js` para PGN/FEN.
- `react-chessboard` (o alternativa) para render de tablero.
