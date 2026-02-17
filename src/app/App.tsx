import React, { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import type { AnalyzeResult, AnalyzeOptions, EngineScore } from "../engine/stockfish";
import { classifyMove, type MoveClassification, type MateScore, type EvalInput } from "../analysis/classifyMove";
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

type ParsedPly = {
  plyIndex: number;
  san: string;
  uci: string;
  from: string;
  to: string;
  sideToMove: "w" | "b";
};

type ClassifiedPly = {
  plyIndex: number;
  from: string;
  to: string;
  san?: string;
  uci?: string;
  evalBefore: EvalInput;
  bestEvalAfter: EvalInput;
  playedEvalAfter: EvalInput;
  deltaCp: number;
  classification: MoveClassification;
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

const CLASSIFICATION_TO_ASSET: Record<MoveClassification, string> = {
  BLUNDER: "assets/move-classification/blunder.png",
  MISTAKE: "assets/move-classification/mistake.png",
  INACCURACY: "assets/move-classification/inaccuracy.png",
  GOOD: "assets/move-classification/good.png",
  EXCELLENT: "assets/move-classification/excellent.png",
  BEST: "assets/move-classification/best.png",
  BRILLIANT: "assets/move-classification/brilliant.png",
};

const PIECE_VALUE: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

const CLASSIFICATION_ORDER: MoveClassification[] = [
  "BLUNDER",
  "MISTAKE",
  "INACCURACY",
  "GOOD",
  "EXCELLENT",
  "BEST",
  "BRILLIANT",
];

function pieceAsset(pieceCode: string): string {
  return `${import.meta.env.BASE_URL}${PIECE_TO_ASSET[pieceCode]}`;
}

function classificationAsset(classification: MoveClassification): string {
  return `${import.meta.env.BASE_URL}${CLASSIFICATION_TO_ASSET[classification]}`;
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

function normalizeEngineScore(score: EngineScore): EvalInput {
  if (score.type === "cp") return score.value;
  return { type: "mate", value: score.value } satisfies MateScore;
}

function formatEvalInput(score: EvalInput): string {
  if (typeof score === "number") {
    const pawns = score / 100;
    const sign = pawns > 0 ? "+" : "";
    return `${sign}${pawns.toFixed(2)}`;
  }

  const sign = score.value < 0 ? "-" : "";
  return `${sign}M#${Math.abs(score.value)}`;
}

function formatEngineScore(result: AnalyzeResult): string {
  return formatEvalInput(normalizeEngineScore(result.score));
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

function squareToIndex(square: string): number {
  const file = square.charCodeAt(0) - "a".charCodeAt(0);
  const rank = Number(square[1]);
  const row = 8 - rank;
  return row * 8 + file;
}

function parseUciMove(uci: string): { from: string; to: string; promotion?: string } | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length === 5 ? uci[4] : undefined;
  return { from, to, promotion };
}

function materialBalanceWhite(fen: string): number {
  const chess = new Chess(fen);
  const board = chess.board();
  let white = 0;
  let black = 0;

  for (const row of board) {
    for (const piece of row) {
      if (!piece) continue;
      const value = PIECE_VALUE[piece.type] ?? 0;
      if (piece.color === "w") white += value;
      else black += value;
    }
  }

  return white - black;
}

export function App(): JSX.Element {
  const [pgn, setPgn] = useState<string>("");
  const [headers, setHeaders] = useState<HeaderInfo>({ Event: "-", White: "-", Black: "-", Result: "-" });
  const [moves, setMoves] = useState<string[]>([]);
  const [positions, setPositions] = useState<string[]>([new Chess().fen()]);
  const [classifiedPlies, setClassifiedPlies] = useState<ClassifiedPly[]>([]);
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

  const evalVersionRef = useRef<number>(0);
  const classificationVersionRef = useRef<number>(0);
  const engineModuleRef = useRef<Promise<typeof import("../engine/stockfish")> | null>(null);

  const currentFen = positions[currentPly] ?? START_FEN;
  const boardCells = useMemo(() => fenToCells(currentFen), [currentFen]);
  const hasGameLoaded = moves.length > 0;

  const classifiedByPly = useMemo(() => {
    const map = new Map<number, ClassifiedPly>();
    for (const item of classifiedPlies) map.set(item.plyIndex, item);
    return map;
  }, [classifiedPlies]);

  const currentClassification = classifiedByPly.get(currentPly) ?? null;
  const overlaySquareIndex = currentClassification ? squareToIndex(currentClassification.to) : -1;

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

  function getAnalyzeOptions(): AnalyzeOptions {
    return analysisMode === "depth" ? { depth: depthSetting } : { movetimeMs: movetimeSetting };
  }

  function onPositionChange(nextPly: number): void {
    setCurrentPly(nextPly);
    evalVersionRef.current += 1;
    setEvaluation((prev) => (prev.status === "analyzing" ? { ...prev, status: "idle" } : prev));
  }

  async function evaluateCurrentPosition(): Promise<void> {
    const requestVersion = ++evalVersionRef.current;
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

      const options = getAnalyzeOptions();
      const modeMsg =
        analysisMode === "depth"
          ? `Analizando con depth ${depthSetting}...`
          : `Analizando con movetime ${movetimeSetting}ms...`;
      pushLog("info", modeMsg);

      const result = await stockfish.analyzePosition(fenAtRequest, options);
      if (requestVersion !== evalVersionRef.current) {
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
      if (requestVersion !== evalVersionRef.current) return;
      const message = error instanceof Error ? error.message : "Fallo al analizar posicion";
      setEvaluation((prev) => ({ ...prev, status: "error", errorMessage: message }));
      pushLog("error", `Engine: ${message}`);
    }
  }

  async function analyzeMoveClassifications(nextPlies: ParsedPly[], nextPositions: string[]): Promise<void> {
    if (nextPlies.length === 0) {
      setClassifiedPlies([]);
      return;
    }

    const requestVersion = ++classificationVersionRef.current;

    try {
      const engineModule = await getEngineModule();
      const stockfish = engineModule.getStockfish();

      if (!engineInitDone) {
        pushLog("info", "Inicializando Stockfish (uci/isready)...");
        await stockfish.init();
        setEngineInitDone(true);
        pushLog("info", "Stockfish listo.");
      }

      const options = getAnalyzeOptions();
      const output: ClassifiedPly[] = [];
      pushLog("info", `Clasificando ${nextPlies.length} jugadas...`);

      for (let i = 0; i < nextPlies.length; i += 1) {
        if (requestVersion !== classificationVersionRef.current) return;

        const ply = nextPlies[i];
        const beforeFen = nextPositions[ply.plyIndex - 1];
        const playedAfterFen = nextPositions[ply.plyIndex];

        const beforeResult = await stockfish.analyzePosition(beforeFen, options);
        const playedAfterResult = await stockfish.analyzePosition(playedAfterFen, options);

        const bestMoveParsed = parseUciMove(beforeResult.bestmove);
        let bestAfterScore: EvalInput = normalizeEngineScore(playedAfterResult.score);

        if (bestMoveParsed) {
          const bestLineBoard = new Chess(beforeFen);
          const bestMoveApplied = bestLineBoard.move(bestMoveParsed);
          if (bestMoveApplied) {
            const bestAfterFen = bestLineBoard.fen();
            const bestAfterResult = await stockfish.analyzePosition(bestAfterFen, options);
            bestAfterScore = normalizeEngineScore(bestAfterResult.score);
          }
        }

        const beforeMaterialWhite = materialBalanceWhite(beforeFen);
        const afterMaterialWhite = materialBalanceWhite(playedAfterFen);
        const materialDeltaWhite = afterMaterialWhite - beforeMaterialWhite;
        const materialChangeCp = ply.sideToMove === "w" ? materialDeltaWhite : -materialDeltaWhite;

        const allowsMate =
          playedAfterResult.score.type === "mate" && playedAfterResult.score.value > 0;

        const evalBefore = normalizeEngineScore(beforeResult.score);
        const playedEvalAfter = normalizeEngineScore(playedAfterResult.score);

        const { classification, deltaCp } = classifyMove({
          evalBefore,
          bestEvalAfter: bestAfterScore,
          playedEvalAfter,
          sideToMove: ply.sideToMove,
          allowsMate,
          isSacrifice: materialChangeCp <= -100,
          materialChangeCp,
        });

        output.push({
          plyIndex: ply.plyIndex,
          from: ply.from,
          to: ply.to,
          san: ply.san,
          uci: ply.uci,
          evalBefore,
          bestEvalAfter: bestAfterScore,
          playedEvalAfter,
          deltaCp,
          classification,
        });
      }

      if (requestVersion !== classificationVersionRef.current) return;
      setClassifiedPlies(output);
      pushLog("info", `Clasificacion completada (${output.length} ply).`);
    } catch (error) {
      if (requestVersion !== classificationVersionRef.current) return;
      const message = error instanceof Error ? error.message : "Fallo al clasificar jugadas";
      pushLog("error", `Clasificacion: ${message}`);
    }
  }

  async function onAnalyze(): Promise<void> {
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
    const nextPlies: ParsedPly[] = [];

    for (let i = 0; i < parsedMoves.length; i += 1) {
      const san = parsedMoves[i];
      const sideToMove = (replay.fen().split(" ")[1] as "w" | "b") ?? "w";
      const result = replay.move(san);
      if (!result) {
        pushLog("error", `No se pudo reproducir la jugada SAN: ${san}`);
        return;
      }
      parsedPositions.push(replay.fen());
      nextPlies.push({
        plyIndex: i + 1,
        san: result.san,
        uci: `${result.from}${result.to}${result.promotion ?? ""}`,
        from: result.from,
        to: result.to,
        sideToMove,
      });
    }

    setHeaders({
      Event: parsedHeaders.Event ?? "-",
      White: parsedHeaders.White ?? "-",
      Black: parsedHeaders.Black ?? "-",
      Result: parsedHeaders.Result ?? "-",
    });
    setMoves(parsedMoves);
    setClassifiedPlies([]);
    setPositions(parsedPositions);
    setCurrentPly(parsedPositions.length - 1);
    setEvaluation(INITIAL_EVAL_STATE);

    pushLog("info", `PGN cargado correctamente (${parsedMoves.length} ply).`);

    void analyzeMoveClassifications(nextPlies, parsedPositions);
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
                  {currentClassification && index === overlaySquareIndex ? (
                    <img
                      className="classificationOverlay"
                      src={classificationAsset(currentClassification.classification)}
                      alt={currentClassification.classification.toLowerCase()}
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
            <Button onClick={() => void onAnalyze()}>Cargar PGN</Button>
            <Button variant="secondary" onClick={() => setPgn("")}>Limpiar</Button>
          </div>
          <div className="row compactRow">
            <Badge tone={evalBadgeTone(evaluation.status)}>{evaluation.status}</Badge>
            <span className="metaValue">Score: {evaluation.scoreLabel}</span>
            <span className="metaValue">Best: {evaluation.bestmove}</span>
            {currentClassification ? (
              <span className="metaValue">Class: {currentClassification.classification}</span>
            ) : null}
          </div>
          <div className="row compactRow classificationLegend">
            {CLASSIFICATION_ORDER.map((item) => (
              <span className="legendItem" key={item} title={item}>
                <img className="legendIcon" src={classificationAsset(item)} alt={item.toLowerCase()} />
                <span>{item}</span>
              </span>
            ))}
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
          <Button
            variant="secondary"
            aria-label="Ir al inicio"
            onClick={() => onPositionChange(0)}
            disabled={currentPly === 0}
          >
            <svg aria-hidden="true" className="navIcon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M6.07001 22H5.94001C4.34001 22 4.01001 21.67 4.01001 20.07V3.94C4.01001 2.34 4.34001 2.01 5.94001 2.01H6.07001C7.67001 2.01 8.00001 2.34 8.00001 3.94V20.07C8.00001 21.67 7.67001 22 6.07001 22ZM19.93 21.13L19.86 21.2C18.73 22.33 18.26 22.33 17.13 21.2L10.73 14.83C9.00001 13.06 9.00001 10.93 10.73 9.16L17.13 2.79C18.26 1.66 18.73 1.66 19.86 2.79L19.93 2.86C21.06 3.99 21.06 4.46 19.93 5.59L13.56 11.99L19.93 18.39C21.06 19.52 21.06 19.99 19.93 21.12V21.13Z" />
            </svg>
          </Button>
          <Button
            variant="secondary"
            aria-label="Retroceder jugada"
            onClick={() => onPositionChange(Math.max(0, currentPly - 1))}
            disabled={currentPly === 0}
          >
            <svg aria-hidden="true" className="navIcon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M16.27 21.13L16.2 21.2C15.07 22.33 14.6 22.33 13.47 21.2L7.06996 14.83C5.33996 13.06 5.33996 10.93 7.06996 9.16L13.47 2.79C14.6 1.66 15.07 1.66 16.2 2.79L16.27 2.86C17.4 3.99 17.4 4.46 16.27 5.59L9.89996 11.99L16.27 18.39C17.4 19.52 17.4 19.99 16.27 21.12V21.13Z" />
            </svg>
          </Button>
          <Button
            variant="secondary"
            aria-label="Adelantar jugada"
            onClick={() => onPositionChange(Math.min(positions.length - 1, currentPly + 1))}
            disabled={currentPly >= positions.length - 1}
          >
            <svg aria-hidden="true" className="navIcon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M7.73007 2.87L7.80007 2.8C8.93007 1.67 9.40007 1.67 10.5301 2.8L16.9301 9.17C18.6601 10.94 18.6601 13.07 16.9301 14.84L10.5301 21.21C9.40007 22.34 8.93007 22.34 7.80007 21.21L7.73007 21.14C6.60007 20.01 6.60007 19.54 7.73007 18.41L14.1001 12.01L7.73007 5.61C6.60007 4.48 6.60007 4.01 7.73007 2.88V2.87Z" />
            </svg>
          </Button>
          <Button
            variant="secondary"
            aria-label="Ir al final"
            onClick={() => onPositionChange(positions.length - 1)}
            disabled={currentPly >= positions.length - 1}
          >
            <svg aria-hidden="true" className="navIcon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.9299 2H18.0599C19.6599 2 19.9899 2.33 19.9899 3.93V20.06C19.9899 21.66 19.6599 21.99 18.0599 21.99H17.9299C16.3299 21.99 15.9999 21.66 15.9999 20.06V3.93C15.9999 2.33 16.3299 2 17.9299 2ZM4.06991 2.87L4.13991 2.8C5.26991 1.67 5.73991 1.67 6.86991 2.8L13.2699 9.17C14.9999 10.94 14.9999 13.07 13.2699 14.84L6.86991 21.21C5.73991 22.34 5.26991 22.34 4.13991 21.21L4.06991 21.14C2.93991 20.01 2.93991 19.54 4.06991 18.41L10.4399 12.01L4.06991 5.61C2.93991 4.48 2.93991 4.01 4.06991 2.88V2.87Z" />
            </svg>
          </Button>
        </div>
      </aside>
    </div>
  );
}
