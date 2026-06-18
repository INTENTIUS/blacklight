import { useEffect, useState } from "preact/hooks";
import type { Report } from "./types";
import { ReportView } from "./report";

const env = (import.meta as { env?: { VITE_API_BASE?: string; VITE_TURNSTILE_SITEKEY?: string } }).env ?? {};
const API = env.VITE_API_BASE ?? "";
const TURNSTILE_SITEKEY = env.VITE_TURNSTILE_SITEKEY ?? "";
const SAMPLES = ["https://github.com/actions/checkout", "https://github.com/hashicorp/terraform"];

declare global {
  interface Window {
    turnstile?: { getResponse: () => string | undefined };
  }
}

type State =
  | { kind: "idle" }
  | { kind: "scanning"; url: string }
  | { kind: "result"; report: Report }
  | { kind: "error"; msg: string };

export function App() {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [stats, setStats] = useState<{ audits: number; findings: number } | null>(null);

  // Live anonymous counter for the "active" feel — hidden until any audits exist.
  useEffect(() => {
    fetch(`${API}/stats`).then((r) => (r.ok ? r.json() : null)).then(setStats).catch(() => {});
  }, []);

  // Load the Turnstile widget only when a sitekey is configured (prod). Dev /
  // fixture / E2E have none, so this is a no-op and the gate is skipped.
  useEffect(() => {
    if (!TURNSTILE_SITEKEY || document.getElementById("cf-turnstile-script")) return;
    const s = document.createElement("script");
    s.id = "cf-turnstile-script";
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    s.async = true;
    document.head.appendChild(s);
  }, []);

  async function run(target: string) {
    const u = target.trim();
    if (!u) return;
    setUrl(u);
    setState({ kind: "scanning", url: u });
    try {
      const turnstileToken = TURNSTILE_SITEKEY ? window.turnstile?.getResponse() : undefined;
      const res = await fetch(`${API}/audit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: u, turnstileToken }),
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
        {stats && stats.audits > 0 && (
          <p class="stats">{stats.audits.toLocaleString()} repos audited · {stats.findings.toLocaleString()} findings surfaced</p>
        )}
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

      {TURNSTILE_SITEKEY && <div class="cf-turnstile" data-sitekey={TURNSTILE_SITEKEY} style="margin-top:12px" />}

      <p class="trust">read-only · we never store your code · audits CI, IaC &amp; manifests · fetches from github, gitlab &amp; codeberg</p>

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

      <footer class="foot">
        powered by <a href="https://intentius.io/chant/cli/audit/" target="_blank" rel="noreferrer">chant audit</a>
      </footer>
    </div>
  );
}
