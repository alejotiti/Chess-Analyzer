import React, { useMemo, useState } from "react";

type LogEntry = { ts: number; level: "info" | "error"; message: string };

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString();
}

export function App(): JSX.Element {
  const [pgn, setPgn] = useState<string>("");
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

  function onAnalyze() {
    const trimmed = pgn.trim();
    if (!trimmed) {
      pushLog("error", "No hay PGN. Pegá un PGN primero.");
      return;
    }
    pushLog("info", "PGN recibido. (Stage 00: todavía no parseamos ni evaluamos.)");
    pushLog("info", `Longitud: ${trimmed.length} chars`);
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
            <button className="btn" onClick={onAnalyze}>
              Analizar
            </button>
            <button className="btn secondary" onClick={() => setPgn("")}>
              Limpiar
            </button>
          </div>
        </section>

        <section className="card">
          <h2>Tablero</h2>
          <div className="boardPlaceholder" aria-label="Tablero placeholder">
            <div className="boardPlaceholderInner">Placeholder</div>
          </div>
          <p className="muted">
            Stage 01: acá va el tablero real + navegación de jugadas.
          </p>
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
