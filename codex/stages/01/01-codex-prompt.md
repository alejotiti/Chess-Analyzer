Implementá Stage 01.

Requisitos:
- Agregar dependencia `chess.js`.
- Al click en "Analizar":
  - Cargar el PGN.
  - Si falla, mostrar error legible en logs.
  - Si ok:
    - Extraer headers y mostrarlos.
    - Generar lista de posiciones (FEN) por ply o move (decidir y documentar).
- UI:
  - Tablero que muestre la posición actual (FEN).
  - Controles: |< < > >|
  - Lista de jugadas (SAN) resaltando la jugada actual.

Aún NO integrar Stockfish.
