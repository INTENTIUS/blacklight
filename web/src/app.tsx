import { useState } from "preact/hooks";
import type { Report } from "./types";
import { ReportView } from "./report";

const API = (import.meta as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE ?? "";
const SAMPLES = ["https://github.com/actions/checkout", "https://github.com/hashicorp/terraform"];

type State =
  | { kind: "idle" }
  | { kind: "scanning"; url: string }
  | { kind: "result"; report: Report }
  | { kind: "error"; msg: string };

export function App() {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function run(target: string) {
    const u = target.trim();
    if (!u) return;
    setUrl(u);
    setState({ kind: "scanning", url: u });
    try {
      const res = await fetch(`${API}/audit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: u }),
      });
      const body = await res.json();
      if (!res.ok) {
        setState({ kind: "error", msg: body?.error ?? `Audit failed (${res.status})` });
        return;
      }
      setState({ kind: "result", report: body as Report });
    } catch (e) {
      setState({ kind: "error", msg: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <div class="app">
      <header>
        <h1>blacklight</h1>
        <p class="tag">Paste a repo URL. See what's hiding in your infra.</p>
      </header>

      <form
        class="bar"
        onSubmit={(e) => {
          e.preventDefault();
          void run(url);
        }}
      >
        <input
          type="url"
          placeholder="https://github.com/owner/repo"
          value={url}
          onInput={(e) => setUrl((e.target as HTMLInputElement).value)}
          disabled={state.kind === "scanning"}
        />
        <button type="submit" disabled={state.kind === "scanning"}>
          {state.kind === "scanning" ? "scanning…" : "audit"}
        </button>
      </form>

      <p class="trust">read-only · we never store your code · github / gitlab / codeberg only</p>

      {state.kind === "idle" && (
        <p class="samples">
          try a sample:{" "}
          {SAMPLES.map((s, i) => (
            <>
              {i > 0 && " · "}
              <a href="#" onClick={(e) => { e.preventDefault(); void run(s); }}>{s.replace("https://github.com/", "")}</a>
            </>
          ))}
        </p>
      )}

      {state.kind === "scanning" && (
        <div class="scanning"><span class="spinner" /> fetching {state.url} · running checks…</div>
      )}

      {state.kind === "error" && (
        <div class="error">⚠ {state.msg}</div>
      )}

      {state.kind === "result" && state.report.counts.total === 0 && (
        <div class="clean">✓ Clean — no findings across {state.report.scanned} file{state.report.scanned === 1 ? "" : "s"}.</div>
      )}

      {state.kind === "result" && state.report.counts.total > 0 && <ReportView report={state.report} />}
    </div>
  );
}
