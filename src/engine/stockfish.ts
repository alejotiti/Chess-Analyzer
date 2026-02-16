export type EngineScore = { type: "cp" | "mate"; value: number };

export type AnalyzeOptions = {
  depth?: number;
  movetimeMs?: number;
};

export type AnalyzeResult = {
  bestmove: string;
  score: EngineScore;
  principalVariation?: string;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

type RequestMessage =
  | { id: number; type: "init" }
  | { id: number; type: "analyze"; fen: string; options?: AnalyzeOptions };

type ResponseMessage =
  | { id: number; type: "init:ok" }
  | { id: number; type: "analyze:ok"; bestmove: string; score: EngineScore; principalVariation?: string }
  | { id: number; type: "error"; error: string };

class StockfishClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private queue: Promise<unknown> = Promise.resolve();
  private initDone = false;

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;

    this.worker = new Worker(new URL("./stockfish.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent<ResponseMessage>) => {
      const msg = event.data;
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);

      if (msg.type === "error") {
        pending.reject(new Error(msg.error));
        return;
      }

      if (msg.type === "init:ok") {
        pending.resolve(undefined);
        return;
      }

      pending.resolve({
        bestmove: msg.bestmove,
        score: msg.score,
        principalVariation: msg.principalVariation,
      } satisfies AnalyzeResult);
    };

    return this.worker;
  }

  private request(message: RequestMessage): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      const worker = this.ensureWorker();
      this.pending.set(message.id, { resolve, reject });
      worker.postMessage(message);
    });
  }

  async init(): Promise<void> {
    if (this.initDone) return;
    const id = this.nextId++;
    await this.request({ id, type: "init" });
    this.initDone = true;
  }

  async analyzePosition(fen: string, options?: AnalyzeOptions): Promise<AnalyzeResult> {
    await this.init();

    const task = this.queue.catch(() => undefined).then(async () => {
      const id = this.nextId++;
      return this.request({ id, type: "analyze", fen, options });
    });
    this.queue = task.then(() => undefined, () => undefined);

    return task as Promise<AnalyzeResult>;
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.initDone = false;
    for (const [, pending] of this.pending) {
      pending.reject(new Error("Stockfish client cerrado"));
    }
    this.pending.clear();
  }
}

let stockfishSingleton: StockfishClient | null = null;

export function getStockfish(): StockfishClient {
  if (!stockfishSingleton) stockfishSingleton = new StockfishClient();
  return stockfishSingleton;
}
