/**
 * DEV-ONLY: one-click “payment success” for create-flow checkout (premium post-return testing).
 *
 * Production: `import.meta.env.PROD` is true in `vite build` output — this function returns false and
 * must never enable bypass logic in shipped bundles.
 *
 * Local (Vite dev server): bypass is ON by default so “Send for Signature” stitches into the existing
 * `applyConfirmedSettlement` → `premiumCompletion=1` journey without filling card fields.
 * Opt out: `VITE_ENABLE_DEV_PAYMENT_BYPASS=0` in `.env.local` to exercise the demo card form path.
 */
export type DevPaymentBypassEnv = {
  readonly PROD: boolean;
  readonly DEV: boolean;
  readonly VITE_ENABLE_DEV_PAYMENT_BYPASS?: string;
};

export function isDevCreateFlowPaymentBypassEnabled(env?: DevPaymentBypassEnv): boolean {
  const e = env ?? (import.meta.env as DevPaymentBypassEnv);
  if (e.PROD) return false;
  if (!e.DEV) return false;
  if (e.VITE_ENABLE_DEV_PAYMENT_BYPASS === "0") return false;
  return true;
}
