import StockfishEngineWorker from "stockfish/bin/stockfish-18-lite-single.js?worker";

type InitRequest = { id: number; type: "init" };
type AnalyzeRequest = {
  id: number;
  type: "analyze";
  fen: string;
  options?: { depth?: number; movetimeMs?: number };
};

type WorkerRequest = InitRequest | AnalyzeRequest;

type Score = { type: "cp" | "mate"; value: number };

type AnalyzeResponse = {
  id: number;
  type: "analyze:ok";
  bestmove: string;
  score: Score;
  principalVariation?: string;
};

type ErrorResponse = { id: number; type: "error"; error: string };
type InitResponse = { id: number; type: "init:ok" };
type WorkerResponse = AnalyzeResponse | ErrorResponse | InitResponse;

type LineWaiter = {
  match: (line: string) => boolean;
  resolve: (line: string) => void;
  reject: (error: Error) => void;
  timeoutId: number;
};

const engineWorker = new StockfishEngineWorker();
const lineWaiters: LineWaiter[] = [];

let initPromise: Promise<void> | null = null;
let latestScore: Score | null = null;
let latestPv: string | undefined;

function postResponse(response: WorkerResponse): void {
  self.postMessage(response);
}

function postCommand(command: string): void {
  engineWorker.postMessage(command);
}

function parseInfoLine(line: string): void {
  if (!line.startsWith("info ")) return;
  const scoreMatch = line.match(/\bscore (cp|mate) (-?\d+)\b/);
  if (scoreMatch) {
    latestScore = { type: scoreMatch[1] as "cp" | "mate", value: Number(scoreMatch[2]) };
  }

  const pvMatch = line.match(/\bpv (.+)$/);
  if (pvMatch) {
    latestPv = pvMatch[1];
  }
}

function onEngineLine(line: string): void {
  parseInfoLine(line);
  const pending = [...lineWaiters];
  for (const waiter of pending) {
    if (!waiter.match(line)) continue;
    clearTimeout(waiter.timeoutId);
    const idx = lineWaiters.indexOf(waiter);
    if (idx >= 0) lineWaiters.splice(idx, 1);
    waiter.resolve(line);
  }
}

engineWorker.onmessage = (event: MessageEvent<unknown>) => {
  const line = typeof event.data === "string" ? event.data : "";
  if (!line) return;
  onEngineLine(line.trim());
};

function waitForLine(match: (line: string) => boolean, timeoutMs: number, timeoutLabel: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const timeoutId = self.setTimeout(() => {
      const idx = lineWaiters.indexOf(waiter);
      if (idx >= 0) lineWaiters.splice(idx, 1);
      reject(new Error(`Timeout esperando "${timeoutLabel}" de Stockfish`));
    }, timeoutMs);

    const waiter: LineWaiter = { match, resolve, reject, timeoutId };
    lineWaiters.push(waiter);
  });
}

async function initEngine(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    postCommand("uci");
    await waitForLine((line) => line === "uciok", 15000, "uciok");

    postCommand("isready");
    await waitForLine((line) => line === "readyok", 15000, "readyok");

    postCommand("ucinewgame");
    postCommand("isready");
    await waitForLine((line) => line === "readyok", 15000, "readyok");
  })();

  try {
    await initPromise;
  } catch (error) {
    initPromise = null;
    throw error;
  }
}

function parseBestMove(line: string): string {
  const parts = line.split(/\s+/);
  return parts[1] ?? "0000";
}

async function analyzePosition(fen: string, options?: { depth?: number; movetimeMs?: number }): Promise<AnalyzeResponse> {
  await initEngine();

  latestScore = null;
  latestPv = undefined;

  const depth = options?.depth;
  const movetimeMs = options?.movetimeMs ?? 1000;

  postCommand("stop");
  postCommand(`position fen ${fen}`);
  if (typeof depth === "number") {
    postCommand(`go depth ${depth}`);
  } else {
    postCommand(`go movetime ${movetimeMs}`);
  }

  const bestmoveLine = await waitForLine((line) => line.startsWith("bestmove "), 30000, "bestmove");
  const bestmove = parseBestMove(bestmoveLine);

  return {
    id: 0,
    type: "analyze:ok",
    bestmove,
    score: latestScore ?? { type: "cp", value: 0 },
    principalVariation: latestPv,
  };
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  try {
    if (msg.type === "init") {
      await initEngine();
      postResponse({ id: msg.id, type: "init:ok" });
      return;
    }

    if (msg.type === "analyze") {
      const result = await analyzePosition(msg.fen, msg.options);
      postResponse({ ...result, id: msg.id });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido del worker";
    postResponse({ id: msg.id, type: "error", error: message });
  }
};

