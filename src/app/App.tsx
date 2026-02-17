import React, { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import type { AnalyzeResult } from "../engine/stockfish";
import { Badge, Button, Card, Select } from "../ui";

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

type AnalysisMode = "depth" | "movetime";
type ThemeMode = "dark" | "light";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const PIECE_TO_GLYPH: Record<string, string> = {
  p: "\u265F",
  r: "\u265C",
  n: "\u265E",
  b: "\u265D",
  q: "\u265B",
  k: "\u265A",
  P: "\u2659",
  R: "\u2656",
  N: "\u2658",
  B: "\u2657",
  Q: "\u2655",
  K: "\u2654",
};

const INITIAL_EVAL_STATE: EvalState = {
  status: "idle",
  scoreLabel: "-",
  bestmove: "-",
  principalVariation: "-",
  barPercent: 50,
  errorMessage: "",
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString();
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

function evalBadgeTone(status: EvalStatus): "neutral" | "success" | "danger" {
  if (status === "error") return "danger";
  if (status === "analyzing") return "success";
  return "neutral";
}

function normalizeTheme(input: string | null): ThemeMode {
  return input === "light" ? "light" : "dark";
}

export function App(): JSX.Element {
  const [pgn, setPgn] = useState<string>("");
  const [headers, setHeaders] = useState<HeaderInfo>({ Event: "-", White: "-", Black: "-", Result: "-" });
  const [moves, setMoves] = useState<string[]>([]);
  const [positions, setPositions] = useState<string[]>([new Chess().fen()]);
  const [currentPly, setCurrentPly] = useState<number>(0);
  const [engineInitDone, setEngineInitDone] = useState<boolean>(false);
  const [evaluation, setEvaluation] = useState<EvalState>(INITIAL_EVAL_STATE);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("depth");
  const [depthSetting, setDepthSetting] = useState<number>(12);
  const [movetimeSetting, setMovetimeSetting] = useState<number>(500);
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [logs, setLogs] = useState<LogEntry[]>([
    { ts: Date.now(), level: "info", message: "Listo. Pegá un PGN y apretá Analizar." },
  ]);

  const analysisVersionRef = useRef<number>(0);
  const engineModuleRef = useRef<Promise<typeof import("../engine/stockfish")> | null>(null);

  const currentFen = positions[currentPly] ?? START_FEN;
  const boardCells = useMemo(() => fenToCells(currentFen), [currentFen]);
  const hasGameLoaded = moves.length > 0;

  useEffect(() => {
    if (typeof window === "undefined") return;
    setTheme(normalizeTheme(window.localStorage.getItem("chess_analyzer_theme")));
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("chess_analyzer_theme", theme);
    }
  }, [theme]);

  function pushLog(level: LogEntry["level"], message: string): void {
    setLogs((prev) => [...prev, { ts: Date.now(), level, message }]);
  }

  const logText = useMemo(() => {
    return logs
      .slice(-200)
      .map((item) => `[${formatTime(item.ts)}] ${item.level.toUpperCase()}: ${item.message}`)
      .join("\n");
  }, [logs]);

  async function getEngineModule() {
    if (!engineModuleRef.current) {
      pushLog("info", "Cargando módulo de engine on-demand...");
      engineModuleRef.current = import("../engine/stockfish");
    }
    return engineModuleRef.current;
  }

  function onPositionChange(nextPly: number): void {
    setCurrentPly(nextPly);
    analysisVersionRef.current += 1;
    setEvaluation((prev) => (prev.status === "analyzing" ? { ...prev, status: "idle" } : prev));
  }

  async function evaluateCurrentPosition(): Promise<void> {
    const requestVersion = ++analysisVersionRef.current;
    const fenAtRequest = currentFen;
    setEvaluation((prev) => ({ ...prev, status: "analyzing", errorMessage: "" }));

    try {
      const engineModule = await getEngineModule();
      const stockfish = engineModule.getStockfish();

      if (!engineInitDone) {
        pushLog("info", "Inicializando Stockfish (uci/isready)...");
        await stockfish.init();
        setEngineInitDone(true);
        pushLog("info", "Stockfish listo.");
      }

      const options = analysisMode === "depth" ? { depth: depthSetting } : { movetimeMs: movetimeSetting };
      const modeMsg =
        analysisMode === "depth"
          ? `Analizando con depth ${depthSetting}...`
          : `Analizando con movetime ${movetimeSetting}ms...`;
      pushLog("info", modeMsg);

      const result = await stockfish.analyzePosition(fenAtRequest, options);
      if (requestVersion !== analysisVersionRef.current) {
        pushLog("info", "Resultado obsoleto descartado por cambio de jugada.");
        return;
      }

      const scoreLabel = formatEngineScore(result);
      setEvaluation({
        status: "idle",
        scoreLabel,
        bestmove: result.bestmove,
        principalVariation: result.principalVariation ?? "-",
        barPercent: scoreToBarPercent(result),
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

  function onAnalyze(): void {
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
    const parsedPositions = [replay.fen()];

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
    setCurrentPly(parsedPositions.length - 1);
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
          <p className="muted">PGN + Stockfish en navegador | Stage 06 product polish</p>
        </div>
        <Button variant="secondary" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          Tema: {theme === "dark" ? "Dark" : "Light"}
        </Button>
      </header>

      <main className="grid">
        <Card className="pgnCard">
          <h2>PGN</h2>
          <textarea
            value={pgn}
            onChange={(e) => setPgn(e.target.value)}
            placeholder="Pegá acá el PGN..."
            className="textarea"
            spellCheck={false}
          />
          <div className="row">
            <Button onClick={onAnalyze}>Analizar</Button>
            <Button variant="secondary" onClick={() => setPgn("")}>Limpiar</Button>
          </div>

          <div className="settingsPanel">
            <h3>Settings de análisis</h3>
            <div className="row settingsRow">
              <label className="settingLabel" htmlFor="mode">Modo</label>
              <Select
                id="mode"
                value={analysisMode}
                onChange={(e) => setAnalysisMode(e.target.value as AnalysisMode)}
                options={[
                  { label: "Depth", value: "depth" },
                  { label: "Movetime", value: "movetime" },
                ]}
              />

              {analysisMode === "depth" ? (
                <>
                  <label className="settingLabel" htmlFor="depth">Depth</label>
                  <Select
                    id="depth"
                    value={depthSetting}
                    onChange={(e) => setDepthSetting(Number(e.target.value))}
                    options={[
                      { label: "8", value: 8 },
                      { label: "12", value: 12 },
                      { label: "16", value: 16 },
                    ]}
                  />
                </>
              ) : (
                <>
                  <label className="settingLabel" htmlFor="movetime">Movetime</label>
                  <Select
                    id="movetime"
                    value={movetimeSetting}
                    onChange={(e) => setMovetimeSetting(Number(e.target.value))}
                    options={[
                      { label: "200 ms", value: 200 },
                      { label: "500 ms", value: 500 },
                      { label: "1000 ms", value: 1000 },
                    ]}
                  />
                </>
              )}
            </div>
          </div>
        </Card>

        <Card className="boardCard">
          <h2>Tablero</h2>
          <div className="metaGrid">
            <div className="metaItem"><span className="muted">Event</span><strong>{headers.Event}</strong></div>
            <div className="metaItem"><span className="muted">White</span><strong>{headers.White}</strong></div>
            <div className="metaItem"><span className="muted">Black</span><strong>{headers.Black}</strong></div>
            <div className="metaItem"><span className="muted">Result</span><strong>{headers.Result}</strong></div>
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
            <Button variant="secondary" onClick={() => onPositionChange(0)} disabled={currentPly === 0}>|&lt;</Button>
            <Button variant="secondary" onClick={() => onPositionChange(Math.max(0, currentPly - 1))} disabled={currentPly === 0}>
              &lt;
            </Button>
            <Button
              variant="secondary"
              onClick={() => onPositionChange(Math.min(positions.length - 1, currentPly + 1))}
              disabled={currentPly >= positions.length - 1}
            >
              &gt;
            </Button>
            <Button
              variant="secondary"
              onClick={() => onPositionChange(positions.length - 1)}
              disabled={currentPly >= positions.length - 1}
            >
              &gt;|
            </Button>
            <Button variant="secondary" onClick={() => void evaluateCurrentPosition()} disabled={evaluation.status === "analyzing"}>
              Evaluar posición actual
            </Button>
          </div>

          <p className="muted">Ply actual: {currentPly} / {Math.max(positions.length - 1, 0)}</p>
          <p className="muted">FEN: {currentFen}</p>
        </Card>

        <Card className="analysisPanel">
          <h2>Panel de análisis</h2>
          <div className="evalStateRow">
            <span className="muted">Estado</span>
            <Badge tone={evalBadgeTone(evaluation.status)}>{evaluation.status}</Badge>
          </div>
          {evaluation.status === "analyzing" ? <p className="statusLoading">Analizando posición...</p> : null}

          <div className="analysisSplit">
            <div className="evalGauge" aria-label="Evaluation gauge">
              <span className="gaugeLabelTop">White</span>
              <div className="evalGaugeTrack">
                <div className="evalGaugeFill" style={{ height: `${evaluation.barPercent}%` }} />
              </div>
              <span className="gaugeLabelBottom">Black</span>
            </div>

            <div className="analysisDetails">
              <div className="evalRow"><span className="muted">Score</span><strong>{evaluation.scoreLabel}</strong></div>
              <div className="evalRow"><span className="muted">Best move</span><strong>{evaluation.bestmove}</strong></div>
              <div className="evalRow"><span className="muted">PV</span><strong className="monoText">{evaluation.principalVariation}</strong></div>
            </div>
          </div>

          {evaluation.status === "error" ? <p className="errorText">{evaluation.errorMessage}</p> : null}
          <p className="muted">Barra vertical animada (clamped a cp +/-600).</p>
        </Card>

        <Card className="moves">
          <h2>Jugadas (SAN)</h2>
          {!hasGameLoaded ? (
            <div className="emptyState">Empty state: cargá un PGN para ver la lista de jugadas.</div>
          ) : (
            <div className="moveList">
              {moves.map((san, index) => (
                <Button
                  key={`${index}-${san}`}
                  variant="secondary"
                  className={`moveBtn ${currentPly === index + 1 ? "active" : ""}`}
                  onClick={() => onPositionChange(index + 1)}
                >
                  {index + 1}. {san}
                </Button>
              ))}
            </div>
          )}
        </Card>

        <Card className="logs">
          <h2>Logs</h2>
          <pre className="pre">{logText}</pre>
        </Card>
      </main>
    </div>
  );
}
