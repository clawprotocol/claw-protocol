import React, { useState } from "react";

type ProcessResponse = {
  meta: Record<string, any>;
  raw_clauses: string[];
  cleaned_clauses: Record<string, any>[];
  proof_packet: Record<string, any>;
};

type Stage = "idle" | "uploading" | "processing" | "done" | "error";

const API_BASE = "http://127.0.0.1:8000";

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessResponse | null>(null);
  const [role, setRole] = useState<"author" | "verifier" | "judge">("author");

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);
    setError(null);
    setStage("idle");
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);
    setError(null);
    setStage("idle");
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleProcess = async () => {
    if (!file) return;
    setStage("uploading");
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    // you can pass options later (e.g. selected role, flags, etc.)
    const options = {
      role,
      include_audit: true,
      include_timestamp: true,
    };
    formData.append("options", JSON.stringify(options));

    try {
      setStage("processing");
      const res = await fetch(`${API_BASE}/extract`, {
        method: "POST",
        body: formData,
    });
    

      if (!res.ok) {
        const text = await res.text();
        throw new Error(
          `Backend error (${res.status}): ${text || res.statusText}`
        );
      }

      const data = (await res.json()) as ProcessResponse;
      setResult(data);
      setStage("done");
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Unexpected error");
      setStage("error");
    }
  };

  const hasResult = !!result;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <div className="max-w-7xl mx-auto px-4 py-6 md:py-8">
        {/* Header */}
        <header className="mb-6 md:mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
              <span className="text-clawaccent">CLAW</span>{" "}
              <span className="text-slate-200">MVP Console</span>
            </h1>
            <p className="text-sm md:text-base text-slate-400 mt-1 max-w-xl">
              Upload a contract, auto-extract clauses, preview signatures, and
              generate a proof packet — all in one unwalled, neutral interface.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
              <span className="mr-1 h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Demo Mode — Localhost
            </span>
          </div>
        </header>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          {/* Column 1: Upload + Status */}
          <section className="lg:col-span-1 bg-slate-900/70 border border-slate-800/80 rounded-2xl p-4 md:p-5 shadow-lg shadow-black/40 backdrop-blur">
            <h2 className="text-sm font-semibold text-slate-200 mb-3">
              1. Upload & Configure
            </h2>

            {/* Dropzone */}
            <div
              onDrop={onDrop}
              onDragOver={onDragOver}
              className={`border-2 border-dashed rounded-xl px-4 py-6 mb-3 transition-colors cursor-pointer ${
                file
                  ? "border-emerald-500/60 bg-emerald-500/5"
                  : "border-slate-700/80 hover:border-emerald-500/70 hover:bg-slate-800/70"
              }`}
              onClick={() => {
                const input = document.getElementById(
                  "file-input"
                ) as HTMLInputElement | null;
                input?.click();
              }}
            >
              <input
                id="file-input"
                type="file"
                accept=".pdf,.doc,.docx"
                className="hidden"
                onChange={onFileChange}
              />

              {!file ? (
                <div className="text-center text-sm text-slate-400">
                  <div className="mb-2 text-slate-200 font-medium">
                    Drop a contract here, or click to browse
                  </div>
                  <div className="text-xs text-slate-500">
                    PDF / DOC / DOCX • no on-chain write, processing is purely
                    local to your backend
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="text-sm text-slate-100 font-medium truncate">
                    {file.name}
                  </div>
                  <div className="text-xs text-slate-400">
                    {(file.size / 1024 / 1024).toFixed(2)} MB •{" "}
                    {file.type || "application/octet-stream"}
                  </div>
                </div>
              )}
            </div>

            {/* Role selection */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Signing Role (for this run)
              </label>
              <div className="flex gap-2 text-xs">
                {(["author", "verifier", "judge"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`flex-1 rounded-full border px-3 py-1.5 transition-colors ${
                      role === r
                        ? "border-emerald-500 bg-emerald-500/20 text-emerald-100"
                        : "border-slate-700 bg-slate-900/70 text-slate-300 hover:border-emerald-500/60 hover:text-emerald-100"
                    }`}
                  >
                    {r === "author"
                      ? "Author"
                      : r === "verifier"
                      ? "Verifier"
                      : "Judge"}
                  </button>
                ))}
              </div>
            </div>

            {/* Action button */}
            <button
              type="button"
              onClick={handleProcess}
              disabled={!file || stage === "uploading" || stage === "processing"}
              className={`w-full inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                !file
                  ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                  : stage === "processing" || stage === "uploading"
                  ? "bg-emerald-600/80 text-white cursor-wait"
                  : "bg-emerald-500 hover:bg-emerald-400 text-slate-950"
              }`}
            >
              {stage === "uploading" && "Uploading…"}
              {stage === "processing" && "Processing with CLAW…"}
              {stage === "idle" && "Run Full CLAW Pipeline"}
              {stage === "done" && "Re-run Pipeline"}
              {stage === "error" && "Try Again"}
            </button>

            {/* Status */}
            <div className="mt-3 text-xs text-slate-400 space-y-1">
              <div>
                <span className="font-semibold text-slate-300">Status: </span>
                {stage === "idle" && "Waiting for upload…"}
                {stage === "uploading" && "Uploading document to backend…"}
                {stage === "processing" &&
                  "Running extraction, cleaning, signing, and proof generation…"}
                {stage === "done" && "Complete. Results on the right."}
                {stage === "error" && (
                  <span className="text-rose-400">
                    Error encountered. Check details below.
                  </span>
                )}
              </div>

              {error && (
                <div className="rounded-md border border-rose-500/60 bg-rose-500/10 px-2 py-1.5 text-rose-100">
                  <div className="font-medium">Error</div>
                  <div className="text-[11px] leading-snug">{error}</div>
                </div>
              )}
            </div>
          </section>

          {/* Column 2: Clauses */}
          <section className="lg:col-span-1 bg-slate-900/70 border border-slate-800/80 rounded-2xl p-4 md:p-5 shadow-lg shadow-black/40 backdrop-blur flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-200">
                2. Extracted & Structured Clauses
              </h2>
              {hasResult && (
                <span className="text-[11px] text-slate-400">
                  {result?.cleaned_clauses?.length ?? 0} structured •{" "}
                  {result?.raw_clauses?.length ?? 0} raw
                </span>
              )}
            </div>

            {!hasResult ? (
              <div className="flex-1 flex items-center justify-center text-center text-xs text-slate-500 px-4">
                Run the pipeline to see clause extraction. This panel will show
                raw and structured clauses as interpreted by the CLAW engine.
              </div>
            ) : (
              <div className="flex-1 flex flex-col gap-3 overflow-hidden">
                {/* Raw clauses */}
                <div className="border border-slate-800 rounded-xl p-3 bg-slate-950/60 overflow-hidden">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-[11px] font-semibold text-slate-300 uppercase tracking-wide">
                      Raw Clauses
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Directly from extraction step
                    </div>
                  </div>
                  <div className="h-40 overflow-auto space-y-2 text-xs">
                    {result!.raw_clauses && result!.raw_clauses.length > 0 ? (
                      result!.raw_clauses.map((c, idx) => (
                        <div
                          key={idx}
                          className="rounded-lg bg-slate-900/80 border border-slate-800 px-2 py-1.5"
                        >
                          <div className="text-[10px] text-slate-500 mb-0.5">
                            Clause {idx + 1}
                          </div>
                          <div className="whitespace-pre-wrap text-slate-100">
                            {c}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-slate-500">
                        No raw clauses returned.
                      </div>
                    )}
                  </div>
                </div>

                {/* Structured clauses */}
                <div className="border border-slate-800 rounded-xl p-3 bg-slate-950/60 overflow-hidden">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-[11px] font-semibold text-slate-300 uppercase tracking-wide">
                      Structured Clauses
                    </div>
                    <div className="text-[10px] text-slate-500">
                      With type, parties, and risk flags (if available)
                    </div>
                  </div>
                  <div className="h-48 overflow-auto text-xs">
                    {result!.cleaned_clauses &&
                    result!.cleaned_clauses.length > 0 ? (
                      result!.cleaned_clauses.map((clause, idx) => (
                        <div
                          key={idx}
                          className="mb-2 last:mb-0 rounded-lg border border-slate-800 bg-slate-900/80 px-2 py-1.5"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="text-[11px] font-semibold text-slate-200">
                              {clause.title || `Clause ${idx + 1}`}
                            </div>
                            {clause.risk_level && (
                              <span className="text-[10px] rounded-full px-2 py-0.5 bg-slate-800 text-slate-200">
                                Risk: {clause.risk_level}
                              </span>
                            )}
                          </div>
                          {clause.text && (
                            <div className="text-slate-200 mb-1 whitespace-pre-wrap">
                              {clause.text}
                            </div>
                          )}
                          <div className="text-[10px] text-slate-400">
                            {clause.category && (
                              <span className="mr-2">
                                Category: {clause.category}
                              </span>
                            )}
                            {clause.jurisdiction && (
                              <span>Jurisdiction: {clause.jurisdiction}</span>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-slate-500">
                        No structured clauses returned.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Column 3: Signing + Proof */}
          <section className="lg:col-span-1 bg-slate-900/70 border border-slate-800/80 rounded-2xl p-4 md:p-5 shadow-lg shadow-black/40 backdrop-blur flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-200">
                3. Signing & Proof Packet
              </h2>
              {hasResult && (
                <span className="text-[11px] text-emerald-300">
                  Hash-first, chain-optional
                </span>
              )}
            </div>

            {!hasResult ? (
              <div className="flex-1 flex items-center justify-center text-center text-xs text-slate-500 px-4">
                Once the pipeline finishes, this panel will show the document
                hash, signing metadata, and a JSON proof packet you can persist
                to IPFS, Arweave, or Bitcoin via LitVM.
              </div>
            ) : (
              <div className="flex-1 flex flex-col gap-3 overflow-hidden">
                {/* Summary */}
                <div className="border border-slate-800 rounded-xl p-3 bg-slate-950/60">
                  <div className="text-[11px] font-semibold text-slate-300 uppercase tracking-wide mb-1.5">
                    Document Fingerprint
                  </div>
                  <div className="text-[11px] text-slate-400 space-y-1">
                    <div>
                      <span className="font-semibold text-slate-300">
                        Basename:
                      </span>{" "}
                      <span>
                        {(result.meta && (result.meta as any).basename) ||
                          (result.meta && (result.meta as any).filename) ||
                          file?.name ||
                          "Unknown"}
                      </span>
                    </div>
                    <div className="break-all">
                      <span className="font-semibold text-slate-300">
                        SHA-256:
                      </span>{" "}
                      <span>
                        {(result.proof_packet as any)?.document?.hash ||
                          (result.proof_packet as any)?.signing?.document_hash ||
                          "n/a"}
                      </span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-300">
                        Role:
                      </span>{" "}
                      <span>
                        {(result.proof_packet as any)?.signing?.role || role}
                      </span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-300">
                        Created:
                      </span>{" "}
                      <span>
                        {(result.proof_packet as any)?.meta?.created_utc ||
                          new Date().toISOString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Proof JSON */}
                <div className="border border-slate-800 rounded-xl p-3 bg-slate-950/60 flex-1 overflow-hidden">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-[11px] font-semibold text-slate-300 uppercase tracking-wide">
                      Proof Packet (JSON)
                    </div>
                    <button
                      type="button"
                      className="text-[10px] text-emerald-300 hover:text-emerald-200 underline-offset-2 hover:underline"
                      onClick={() => {
                        const blob = new Blob(
                          [prettyJson(result.proof_packet)],
                          { type: "application/json" }
                        );
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        const safeName =
                          (result.meta &&
                            ((result.meta as any).basename ||
                              (result.meta as any).filename)) ||
                          "claw-proof";
                        a.download = `${safeName}.proof.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      Download JSON
                    </button>
                  </div>
                  <div className="h-52 overflow-auto text-[11px] font-mono leading-snug bg-slate-950 rounded-md border border-slate-900 px-2 py-2 text-slate-200">
                    <pre>{prettyJson(result.proof_packet)}</pre>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <footer className="mt-6 text-[11px] text-slate-500 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div>
            CLAW is a neutral coordination layer. This demo does not broadcast
            anything on-chain; it just shows how proofs are formed.
          </div>
          <div className="text-slate-400">
            Ready for{" "}
            <span className="text-emerald-300 font-semibold">
              ETHDenver · Doginal Dogs · G7 Miami
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default App;
