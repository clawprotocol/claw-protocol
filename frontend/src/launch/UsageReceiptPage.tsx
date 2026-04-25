import { useEffect, useState } from "react";
import { AppShell } from "./AppShell";
import { useLaunchNav } from "./LaunchNavContext";
import { fetchUsageBundle, fetchUsageReceipt, verifyUsageBundle } from "./receiptApi";

export function UsageReceiptPage(props: { usageId: string }) {
  const { usageId } = props;
  const { navigate } = useLaunchNav();
  const [receipt, setReceipt] = useState<Record<string, unknown> | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadBusy, setLoadBusy] = useState(true);
  const [verifyOk, setVerifyOk] = useState<boolean | null>(null);
  const [verifyDetail, setVerifyDetail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      setLoadBusy(true);
      setLoadError(null);
      const { data: r, error } = await fetchUsageReceipt(usageId);
      if (error) setLoadError(error);
      if (r?.usage_receipt) setReceipt(r.usage_receipt as Record<string, unknown>);
      else setReceipt(null);
      if (r?.receipt_hash_sha256) setHash(r.receipt_hash_sha256);
      else setHash(null);
      setLoadBusy(false);
    })();
  }, [usageId]);

  const runVerify = async () => {
    setBusy(true);
    setVerifyOk(null);
    setVerifyDetail(null);
    try {
      const { data: bundle, error: bundleErr } = await fetchUsageBundle(usageId);
      if (bundleErr || !bundle) {
        setVerifyOk(false);
        setVerifyDetail(bundleErr || "No bundle returned");
        return;
      }
      const res = await verifyUsageBundle(bundle);
      setVerifyOk(Boolean(res.ok));
      setVerifyDetail(
        (res.errors && res.errors.length ? res.errors.join("; ") : null) || JSON.stringify(res.checks ?? {})
      );
    } finally {
      setBusy(false);
    }
  };

  const copyJson = () => {
    if (!receipt) return;
    void navigator.clipboard.writeText(JSON.stringify(receipt, null, 2));
  };

  return (
    <AppShell
      title="Usage receipt"
      subtitle="Human-readable confirmation of a metered action. Technical details stay one click away."
    >
      <div className="vs01-card vs01-card--envelope space-y-4">
        {loadBusy ? (
          <p className="text-sm text-slate-400" role="status">
            Loading receipt…
          </p>
        ) : null}
        {loadError ? (
          <div className="rounded-lg border border-rose-800/40 bg-rose-950/25 px-4 py-3 text-sm text-rose-100" role="alert">
            <p className="font-medium">We couldn’t load this receipt.</p>
            <p className="mt-1 text-rose-100/90">{loadError}</p>
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary vs01-btn--compact mt-3"
              onClick={() => navigate("/app/billing")}
            >
              Billing &amp; plan
            </button>
          </div>
        ) : null}
        {!loadError && receipt ? (
          <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 px-4 py-3">
            <p className="text-sm font-medium text-emerald-100">Receipt recorded</p>
            <p className="mt-1 text-xs text-emerald-200/80">
              This usage event has a canonical receipt and can be bundled with payment proofs for offline verification.
            </p>
          </div>
        ) : null}

        {hash ? (
          <p className="text-xs text-slate-400">
            Receipt hash{" "}
            <code className="break-all text-slate-300">{hash}</code>
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button type="button" className="vs01-btn vs01-btn--primary" disabled={busy} onClick={() => void runVerify()}>
            {busy ? "Verifying…" : "Run verification check"}
          </button>
          <button type="button" className="vs01-btn vs01-btn--secondary" disabled={!receipt} onClick={copyJson}>
            Copy receipt JSON
          </button>
        </div>

        {verifyOk != null ? (
          <p className={`text-sm ${verifyOk ? "text-emerald-300" : "text-rose-300"}`}>
            {verifyOk ? "Verification: OK (bundle hashes matched)" : "Verification: issues detected"}
            {verifyDetail ? (
              <span className="mt-2 block text-xs text-slate-400">{verifyDetail}</span>
            ) : null}
          </p>
        ) : null}

        <details className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-300">
          <summary className="cursor-pointer font-medium text-slate-200">Technical details</summary>
          <pre className="mt-3 max-h-96 overflow-auto text-xs">
            {receipt ? JSON.stringify(receipt, null, 2) : "—"}
          </pre>
        </details>
      </div>
    </AppShell>
  );
}
