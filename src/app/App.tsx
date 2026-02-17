import React, { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import type { AnalyzeResult } from "../engine/stockfish";
import { Badge, Button, Select } from "../ui";

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

type MovePair = {
  number: number;
  white: string;
  black: string;
  whitePly: number;
  blackPly: number;
};

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const PIECE_TO_ASSET: Record<string, string> = {
  p: "assets/pieces-basic-svg/pawn-b.png",
  r: "assets/pieces-basic-svg/rook-b.png",
  n: "assets/pieces-basic-svg/knight-b.png",
  b: "assets/pieces-basic-svg/bishop-b.png",
  q: "assets/pieces-basic-svg/queen-b.png",
  k: "assets/pieces-basic-svg/king-b.png",
  P: "assets/pieces-basic-svg/pawn-w.png",
  R: "assets/pieces-basic-svg/rook-w.png",
  N: "assets/pieces-basic-svg/knight-w.png",
  B: "assets/pieces-basic-svg/bishop-w.png",
  Q: "assets/pieces-basic-svg/queen-w.png",
  K: "assets/pieces-basic-svg/king-w.png",
};

function pieceAsset(pieceCode: string): string {
  return `${import.meta.env.BASE_URL}${PIECE_TO_ASSET[pieceCode]}`;
}

const INITIAL_EVAL_STATE: EvalState = {
  status: "idle",
  scoreLabel: "-",
  bestmove: "-",
  principalVariation: "-",
  barPercent: 50,
  errorMessage: "",
};

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
  return ((-clamped + 600) / 1200) * 100;
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
    { ts: Date.now(), level: "info", message: "Listo. Pega un PGN y apreta Analizar." },
  ]);

  const analysisVersionRef = useRef<number>(0);
  const engineModuleRef = useRef<Promise<typeof import("../engine/stockfish")> | null>(null);

  const currentFen = positions[currentPly] ?? START_FEN;
  const boardCells = useMemo(() => fenToCells(currentFen), [currentFen]);
  const hasGameLoaded = moves.length > 0;

  const movePairs = useMemo<MovePair[]>(() => {
    const pairs: MovePair[] = [];
    for (let i = 0; i < moves.length; i += 2) {
      pairs.push({
        number: i / 2 + 1,
        white: moves[i] ?? "",
        black: moves[i + 1] ?? "",
        whitePly: i + 1,
        blackPly: i + 2,
      });
    }
    return pairs;
  }, [moves]);

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

  async function getEngineModule() {
    if (!engineModuleRef.current) {
      pushLog("info", "Cargando modulo de engine on-demand...");
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
      pushLog("info", `Evaluacion: ${scoreLabel} | bestmove: ${result.bestmove}`);
    } catch (error) {
      if (requestVersion !== analysisVersionRef.current) return;
      const message = error instanceof Error ? error.message : "Fallo al analizar posicion";
      setEvaluation((prev) => ({ ...prev, status: "error", errorMessage: message }));
      pushLog("error", `Engine: ${message}`);
    }
  }

  function onAnalyze(): void {
    const trimmed = pgn.trim();
    if (!trimmed) {
      pushLog("error", "No hay PGN. Pega un PGN primero.");
      return;
    }

    const parsed = new Chess();
    try {
      parsed.loadPgn(trimmed);
    } catch (error) {
      const message = error instanceof Error ? error.message : "PGN invalido";
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
  }

  useEffect(() => {
    if (!hasGameLoaded) return;
    void evaluateCurrentPosition();
    // Trigger engine evaluation on every move change.
  }, [currentPly, hasGameLoaded]);

  return (
    <div className="reviewShell">
      <section className="boardZone">
        <div className="boardTopStrip">
          <div className="playerTag">{headers.Black !== "-" ? headers.Black : "Jugador negras"}</div>
          <div className="clockTag">9:59</div>
        </div>

        <div className="boardSurface" aria-label="Tablero">
          <div className="leftEvalRail">
            <div className="leftEvalFill" style={{ height: `${evaluation.barPercent}%` }} />
          </div>
          <div className="boardGrid">
            {boardCells.map((piece, index) => {
              const file = index % 8;
              const rank = Math.floor(index / 8);
              const dark = (file + rank) % 2 === 1;
              return (
                <div key={index} className={`square ${dark ? "dark" : "light"}`}>
                  {piece !== "." ? (
                    <img
                      className="pieceImg"
                      src={pieceAsset(piece)}
                      alt={`piece-${piece}`}
                      loading="eager"
                      decoding="async"
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="boardBottomStrip">
          <div className="playerTag">{headers.White !== "-" ? headers.White : "Jugador blancas"}</div>
          <div className="clockTag">9:59</div>
        </div>
      </section>

      <aside className="reviewPanel">
        <div className="reviewHeader">
          <strong>Revision de partida</strong>
          <Button variant="secondary" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>Tema</Button>
        </div>

        <div className="reviewIntro">
          <textarea
            value={pgn}
            onChange={(e) => setPgn(e.target.value)}
            placeholder="Pega aca el PGN..."
            className="pgnInput"
            spellCheck={false}
          />
          <div className="row compactRow">
            <Button onClick={onAnalyze}>Cargar PGN</Button>
            <Button variant="secondary" onClick={() => setPgn("")}>Limpiar</Button>
          </div>
          <div className="row compactRow">
            <Badge tone={evalBadgeTone(evaluation.status)}>{evaluation.status}</Badge>
            <span className="metaValue">Score: {evaluation.scoreLabel}</span>
            <span className="metaValue">Best: {evaluation.bestmove}</span>
          </div>
          <div className="row compactRow">
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
            ) : (
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
            )}
          </div>
        </div>

        <div className="movesPanel">
          {movePairs.length === 0 ? (
            <div className="emptyState">Pega un PGN para ver la lista de jugadas.</div>
          ) : (
            movePairs.map((pair) => (
              <div className="moveRow" key={pair.number}>
                <span className="moveNo">{pair.number}.</span>
                <button
                  className={`moveCell ${currentPly === pair.whitePly ? "active" : ""}`}
                  onClick={() => onPositionChange(pair.whitePly)}
                >
                  {pair.white || "-"}
                </button>
                <button
                  className={`moveCell ${currentPly === pair.blackPly ? "active" : ""}`}
                  onClick={() => onPositionChange(pair.blackPly)}
                  disabled={!pair.black}
                >
                  {pair.black || "-"}
                </button>
              </div>
            ))
          )}
        </div>

        <div className="analysisGraph">
          <div className="analysisMarker" style={{ left: `${evaluation.barPercent}%` }} />
        </div>

        <div className="controlDock">
          <Button variant="secondary" onClick={() => onPositionChange(0)} disabled={currentPly === 0}>|&lt;</Button>
          <Button variant="secondary" onClick={() => onPositionChange(Math.max(0, currentPly - 1))} disabled={currentPly === 0}>
            &lt;
          </Button>
          <Button
            variant="secondary"
            onClick={() => onPositionChange(Math.min(positions.length - 1, currentPly + 1))}
            disabled={currentPly >= positions.length - 1}
          >
            ▶
          </Button>
          <Button
            variant="secondary"
            onClick={() => onPositionChange(positions.length - 1)}
            disabled={currentPly >= positions.length - 1}
          >
            &gt;|
          </Button>
        </div>
      </aside>
    </div>
  );
}


