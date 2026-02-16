import React, { useMemo, useState } from "react";
import { Chess } from "chess.js";
import { stockfish } from "../engine/stockfish";

type LogEntry = { ts: number; level: "info" | "error"; message: string };
type HeaderInfo = { Event: string; White: string; Black: string; Result: string };

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const PIECE_TO_GLYPH: Record<string, string> = {
  p: "♟",
  r: "♜",
  n: "♞",
  b: "♝",
  q: "♛",
  k: "♚",
  P: "♙",
  R: "♖",
  N: "♘",
  B: "♗",
  Q: "♕",
  K: "♔",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString();
}

function fenToCells(fen: string): string[] {
  const [boardPart] = fen.split(" ");
  const rows = boardPart.split("/");
  const cells: string[] = [];

  for (const row of rows) {
    for (const char of row) {
      if (char >= "1" && char <= "8") {
        for (let i = 0; i < Number(char); i += 1) cells.push(".");
      } else {
        cells.push(char);
      }
    }
  }

  return cells;
}

export function App(): JSX.Element {
  const [pgn, setPgn] = useState<string>("");
  const [headers, setHeaders] = useState<HeaderInfo>({
    Event: "-",
    White: "-",
    Black: "-",
    Result: "-",
  });
  const [moves, setMoves] = useState<string[]>([]);
  const [positions, setPositions] = useState<string[]>([new Chess().fen()]);
  const [currentPly, setCurrentPly] = useState<number>(0);
  const [isEngineBusy, setIsEngineBusy] = useState<boolean>(false);
  const [engineInitDone, setEngineInitDone] = useState<boolean>(false);
  const [logs, setLogs] = useState<LogEntry[]>([
    { ts: Date.now(), level: "info", message: "Listo. Pegá un PGN y apretá Analizar." },
  ]);

  function pushLog(level: LogEntry["level"], message: string) {
    setLogs((prev) => [...prev, { ts: Date.now(), level, message }]);
  }

  const logText = useMemo(() => {
    return logs
      .slice(-200)
      .map((l) => `[${formatTime(l.ts)}] ${l.level.toUpperCase()}: ${l.message}`)
      .join("\n");
  }, [logs]);

  const currentFen = positions[currentPly] ?? START_FEN;
  const boardCells = useMemo(() => fenToCells(currentFen), [currentFen]);

  async function runEngineAnalysis(fen: string, reason: string): Promise<void> {
    setIsEngineBusy(true);
    try {
      if (!engineInitDone) {
        pushLog("info", "Inicializando Stockfish (uci/isready)...");
        await stockfish.init();
        setEngineInitDone(true);
        pushLog("info", "Stockfish listo.");
      }

      pushLog("info", `Analizando (${reason})...`);
      const result = await stockfish.analyzePosition(fen, { depth: 12 });
      const scoreText = result.score.type === "mate" ? `mate ${result.score.value}` : `cp ${result.score.value}`;
      pushLog("info", `bestmove: ${result.bestmove} | score: ${scoreText}`);
      if (result.principalVariation) {
        pushLog("info", `pv: ${result.principalVariation}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Fallo al analizar posición";
      pushLog("error", message);
    } finally {
      setIsEngineBusy(false);
    }
  }

  async function onAnalyze() {
    const trimmed = pgn.trim();
    if (!trimmed) {
      pushLog("error", "No hay PGN. Pegá un PGN primero.");
      return;
    }

    const parsed = new Chess();
    try {
      parsed.loadPgn(trimmed);
    } catch (error) {
      const message = error instanceof Error ? error.message : "PGN inválido";
      pushLog("error", `No se pudo parsear el PGN: ${message}`);
      return;
    }

    const parsedHeaders = parsed.header();
    const parsedMoves = parsed.history();
    const replay = new Chess();
    const parsedPositions = [replay.fen()]; // Elegimos navegar por ply: una posición por SAN.

    for (const san of parsedMoves) {
      const result = replay.move(san);
      if (!result) {
        pushLog("error", `No se pudo reproducir la jugada SAN: ${san}`);
        return;
      }
      parsedPositions.push(replay.fen());
    }

    setHeaders({
      Event: parsedHeaders.Event ?? "-",
      White: parsedHeaders.White ?? "-",
      Black: parsedHeaders.Black ?? "-",
      Result: parsedHeaders.Result ?? "-",
    });
    setMoves(parsedMoves);
    setPositions(parsedPositions);
    const finalPly = parsedPositions.length - 1;
    const finalFen = parsedPositions[finalPly];
    setCurrentPly(finalPly);

    pushLog("info", `PGN cargado correctamente (${parsedMoves.length} ply).`);
    pushLog(
      "info",
      `Headers: ${parsedHeaders.White ?? "-"} vs ${parsedHeaders.Black ?? "-"} (${parsedHeaders.Result ?? "-"})`
    );
    await runEngineAnalysis(finalFen, "posición final del PGN");
  }

  return (
    <div className="page">
      <header className="header">
        <div>
          <h1>Chess Analyzer</h1>
          <p className="muted">0 backend • PGN → evaluación con Stockfish (WASM) • por etapas</p>
        </div>
      </header>

      <main className="grid">
        <section className="card">
          <h2>PGN</h2>
          <textarea
            value={pgn}
            onChange={(e) => setPgn(e.target.value)}
            placeholder="Pegá acá el PGN..."
            className="textarea"
            spellCheck={false}
          />
          <div className="row">
            <button className="btn" onClick={() => void onAnalyze()} disabled={isEngineBusy}>
              Analizar
            </button>
            <button className="btn secondary" onClick={() => setPgn("")}>
              Limpiar
            </button>
          </div>
        </section>

        <section className="card">
          <h2>Tablero</h2>
          <div className="metaGrid">
            <div className="metaItem">
              <span className="muted">Event</span>
              <strong>{headers.Event}</strong>
            </div>
            <div className="metaItem">
              <span className="muted">White</span>
              <strong>{headers.White}</strong>
            </div>
            <div className="metaItem">
              <span className="muted">Black</span>
              <strong>{headers.Black}</strong>
            </div>
            <div className="metaItem">
              <span className="muted">Result</span>
              <strong>{headers.Result}</strong>
            </div>
          </div>

          <div className="board" aria-label="Tablero">
            {boardCells.map((piece, index) => {
              const file = index % 8;
              const rank = Math.floor(index / 8);
              const dark = (file + rank) % 2 === 1;
              return (
                <div key={index} className={`square ${dark ? "dark" : "light"}`}>
                  <span className="piece">{PIECE_TO_GLYPH[piece] ?? ""}</span>
                </div>
              );
            })}
          </div>

          <div className="row controls">
            <button className="btn secondary" onClick={() => setCurrentPly(0)} disabled={currentPly === 0}>
              |&lt;
            </button>
            <button
              className="btn secondary"
              onClick={() => setCurrentPly((prev) => Math.max(0, prev - 1))}
              disabled={currentPly === 0}
            >
              &lt;
            </button>
            <button
              className="btn secondary"
              onClick={() => setCurrentPly((prev) => Math.min(positions.length - 1, prev + 1))}
              disabled={currentPly >= positions.length - 1}
            >
              &gt;
            </button>
            <button
              className="btn secondary"
              onClick={() => setCurrentPly(positions.length - 1)}
              disabled={currentPly >= positions.length - 1}
            >
              &gt;|
            </button>
            <button className="btn secondary" onClick={() => void runEngineAnalysis(currentFen, "FEN actual")} disabled={isEngineBusy}>
              Engine FEN
            </button>
          </div>
          <p className="muted">Ply actual: {currentPly} / {Math.max(positions.length - 1, 0)}</p>
          <p className="muted">FEN: {currentFen}</p>
        </section>

        <section className="card moves">
          <h2>Jugadas (SAN)</h2>
          <p className="muted">Navegación por ply: cada SAN equivale a una posición.</p>
          <div className="moveList">
            {moves.length === 0 ? (
              <div className="muted">Todavía no hay jugadas cargadas.</div>
            ) : (
              moves.map((san, index) => (
                <button
                  key={`${index}-${san}`}
                  className={`moveBtn ${currentPly === index + 1 ? "active" : ""}`}
                  onClick={() => setCurrentPly(index + 1)}
                >
                  {index + 1}. {san}
                </button>
              ))
            )}
          </div>
        </section>

        <section className="card logs">
          <h2>Logs</h2>
          <pre className="pre">{logText}</pre>
        </section>
      </main>

      <footer className="footer muted">
        Etapa actual: <code>codex/CURRENT_STAGE.txt</code>
      </footer>
    </div>
  );
}
