import React, { useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { stockfish } from "../engine/stockfish";
import type { AnalyzeResult } from "../engine/stockfish";

type LogEntry = { ts: number; level: "info" | "error"; message: string };
type HeaderInfo = { Event: string; White: string; Black: string; Result: string };
type EvalStatus = "idle" | "analyzing" | "error";
type EvalState = {
  status: EvalStatus;
  scoreLabel: string;
  bestmove: string;
  principalVariation: string;
  barPercent: number;
  errorMessage: string;
};

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

function formatEngineScore(result: AnalyzeResult): string {
  if (result.score.type === "mate") {
    const sign = result.score.value < 0 ? "-" : "";
    return `${sign}M#${Math.abs(result.score.value)}`;
  }

  const pawns = result.score.value / 100;
  const sign = pawns > 0 ? "+" : "";
  return `${sign}${pawns.toFixed(2)}`;
}

function scoreToBarPercent(result: AnalyzeResult): number {
  const cp = result.score.type === "cp" ? result.score.value : result.score.value > 0 ? 600 : -600;
  const clamped = Math.max(-600, Math.min(600, cp));
  return ((clamped + 600) / 1200) * 100;
}

const INITIAL_EVAL_STATE: EvalState = {
  status: "idle",
  scoreLabel: "-",
  bestmove: "-",
  principalVariation: "-",
  barPercent: 50,
  errorMessage: "",
};

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
  const [engineInitDone, setEngineInitDone] = useState<boolean>(false);
  const [evaluation, setEvaluation] = useState<EvalState>(INITIAL_EVAL_STATE);
  const [logs, setLogs] = useState<LogEntry[]>([
    { ts: Date.now(), level: "info", message: "Listo. Pegá un PGN y apretá Analizar." },
  ]);
  const analysisVersionRef = useRef<number>(0);

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

  function onPositionChange(nextPly: number): void {
    setCurrentPly(nextPly);
    analysisVersionRef.current += 1;
    setEvaluation((prev) => {
      if (prev.status !== "analyzing") return prev;
      return { ...prev, status: "idle" };
    });
  }

  async function evaluateCurrentPosition(): Promise<void> {
    const requestVersion = ++analysisVersionRef.current;
    const fenAtRequest = currentFen;
    setEvaluation((prev) => ({ ...prev, status: "analyzing", errorMessage: "" }));

    try {
      if (!engineInitDone) {
        pushLog("info", "Inicializando Stockfish (uci/isready)...");
        await stockfish.init();
        setEngineInitDone(true);
        pushLog("info", "Stockfish listo.");
      }

      pushLog("info", `Analizando FEN actual (ply ${currentPly})...`);
      const result = await stockfish.analyzePosition(fenAtRequest, { depth: 12 });
      if (requestVersion !== analysisVersionRef.current) {
        pushLog("info", "Resultado obsoleto descartado por cambio de jugada.");
        return;
      }

      const scoreLabel = formatEngineScore(result);
      const principalVariation = result.principalVariation ?? "-";
      const barPercent = scoreToBarPercent(result);

      setEvaluation({
        status: "idle",
        scoreLabel,
        bestmove: result.bestmove,
        principalVariation,
        barPercent,
        errorMessage: "",
      });
      pushLog("info", `Evaluación: ${scoreLabel} | bestmove: ${result.bestmove}`);
    } catch (error) {
      if (requestVersion !== analysisVersionRef.current) return;
      const message = error instanceof Error ? error.message : "Fallo al analizar posición";
      setEvaluation((prev) => ({ ...prev, status: "error", errorMessage: message }));
      pushLog("error", `Engine: ${message}`);
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
    setCurrentPly(finalPly);
    analysisVersionRef.current += 1;
    setEvaluation(INITIAL_EVAL_STATE);

    pushLog("info", `PGN cargado correctamente (${parsedMoves.length} ply).`);
    pushLog(
      "info",
      `Headers: ${parsedHeaders.White ?? "-"} vs ${parsedHeaders.Black ?? "-"} (${parsedHeaders.Result ?? "-"})`
    );
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
            <button className="btn" onClick={() => void onAnalyze()}>
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
            <button className="btn secondary" onClick={() => onPositionChange(0)} disabled={currentPly === 0}>
              |&lt;
            </button>
            <button
              className="btn secondary"
              onClick={() => onPositionChange(Math.max(0, currentPly - 1))}
              disabled={currentPly === 0}
            >
              &lt;
            </button>
            <button
              className="btn secondary"
              onClick={() => onPositionChange(Math.min(positions.length - 1, currentPly + 1))}
              disabled={currentPly >= positions.length - 1}
            >
              &gt;
            </button>
            <button
              className="btn secondary"
              onClick={() => onPositionChange(positions.length - 1)}
              disabled={currentPly >= positions.length - 1}
            >
              &gt;|
            </button>
            <button
              className="btn secondary"
              onClick={() => void evaluateCurrentPosition()}
              disabled={evaluation.status === "analyzing"}
            >
              Evaluar posición actual
            </button>
          </div>
          <p className="muted">Ply actual: {currentPly} / {Math.max(positions.length - 1, 0)}</p>
          <p className="muted">FEN: {currentFen}</p>
        </section>

        <section className="card evalCard">
          <h2>Evaluación</h2>
          <div className="evalRow">
            <span className="muted">Estado</span>
            <strong>{evaluation.status}</strong>
          </div>
          <div className="evalRow">
            <span className="muted">Score</span>
            <strong>{evaluation.scoreLabel}</strong>
          </div>
          <div className="evalRow">
            <span className="muted">Best move</span>
            <strong>{evaluation.bestmove}</strong>
          </div>
          <div className="evalRow">
            <span className="muted">PV</span>
            <strong className="monoText">{evaluation.principalVariation}</strong>
          </div>
          <div className="evalBar">
            <div className="evalBarFill" style={{ width: `${evaluation.barPercent}%` }} />
          </div>
          {evaluation.status === "error" ? <p className="errorText">{evaluation.errorMessage}</p> : null}
          <p className="muted">Barra clamped a cp +/-600.</p>
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
                  onClick={() => onPositionChange(index + 1)}
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
