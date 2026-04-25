import { clawAgreementHeaders } from "../agreement/agreementOrgHeaders";
import { apiUrl, errorMessageFromResponse, logClawClientWarning, resolveApiBase } from "../lib/clawApi";

export type ProofExportScope = "user_all" | "folder" | "record";

export type CreateExportResult = {
  ok: boolean;
  export_id?: string;
  download_url?: string;
  error?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Absolute URL for API path (dev: localhost:8000; prod: same-origin or env base). */
export function absoluteApiPath(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const base = resolveApiBase().replace(/\/$/, "");
  return base ? `${base}${p}` : p;
}

export async function createDataExport(scope: ProofExportScope, scopeRef?: string | null): Promise<CreateExportResult> {
  const url = apiUrl("/v1/proof/exports");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        ...clawAgreementHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scope,
        scope_ref: scopeRef?.trim() || null,
      }),
    });
    if (!res.ok) {
      const msg = await errorMessageFromResponse(res, "Could not start export.");
      return { ok: false, error: msg };
    }
    const j = (await res.json()) as { ok?: boolean; export?: { export_id?: string; download_url?: string } };
    const eid = j.export?.export_id;
    if (!eid) return { ok: false, error: "Invalid export response." };
    return { ok: true, export_id: eid, download_url: j.export?.download_url };
  } catch (e) {
    logClawClientWarning("export.create", { error: String(e), url });
    return { ok: false, error: "Network error starting export." };
  }
}

export async function fetchExportJob(exportId: string): Promise<{
  ok: boolean;
  status?: string;
  error?: string;
}> {
  const url = apiUrl(`/v1/proof/exports/${encodeURIComponent(exportId)}`);
  try {
    const res = await fetch(url, { headers: clawAgreementHeaders() });
    if (!res.ok) {
      return { ok: false, error: await errorMessageFromResponse(res, "Could not load export.") };
    }
    const j = (await res.json()) as { ok?: boolean; export?: { status?: string } };
    return { ok: true, status: j.export?.status };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function downloadExportZipToFile(exportId: string): Promise<{ ok: boolean; error?: string }> {
  const url = apiUrl(`/v1/proof/exports/${encodeURIComponent(exportId)}/download`);
  try {
    const res = await fetch(url, { headers: clawAgreementHeaders() });
    if (!res.ok) {
      if (res.status === 409) {
        return { ok: false, error: "Export still preparing. Try again in a moment." };
      }
      return { ok: false, error: await errorMessageFromResponse(res, "Download failed.") };
    }
    const blob = await res.blob();
    const dl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = dl;
    a.download = `lawdog-export-${exportId.slice(0, 12)}.zip`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(dl), 60_000);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Starts export job, polls until ready, then downloads zip.
 * Works with current backend (synchronous-ready jobs).
 */
export async function runWorkspaceExportFlow(
  scope: ProofExportScope,
  scopeRef?: string | null,
  options?: { maxWaitMs?: number },
): Promise<{ ok: boolean; error?: string }> {
  const created = await createDataExport(scope, scopeRef);
  if (!created.ok || !created.export_id) return { ok: false, error: created.error };

  const maxWait = options?.maxWaitMs ?? 45_000;
  const t0 = Date.now();
  let lastStatus = "queued";
  while (Date.now() - t0 < maxWait) {
    const st = await fetchExportJob(created.export_id);
    if (!st.ok) return { ok: false, error: st.error };
    lastStatus = st.status || lastStatus;
    if (lastStatus === "ready") {
      return downloadExportZipToFile(created.export_id);
    }
    await sleep(800);
  }
  return { ok: false, error: "Export is taking longer than expected. Try again shortly." };
}

export function openReceiptProofBundleDownload(receiptId: string): void {
  const path = `/v1/proof/receipt/${encodeURIComponent(receiptId)}/export`;
  const href = absoluteApiPath(path);
  window.open(href, "_blank", "noopener,noreferrer");
}
