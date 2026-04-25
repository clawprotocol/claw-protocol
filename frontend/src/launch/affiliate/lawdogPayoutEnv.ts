/** Client-side payout / explorer hints (no secrets). Mirrors backend `CLAW_*` where useful. */

const env = import.meta.env as Record<string, string | undefined>;

export function lawdogPayoutNetworkSlug(): string {
  return String(env.VITE_LAWDOG_PAYOUT_NETWORK ?? "base").trim() || "base";
}

export function lawdogUsdcContractDisplay(): string {
  return (
    String(env.VITE_LAWDOG_USDC_CONTRACT ?? "").trim() ||
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
  );
}

export function lawdogExplorerTxUrl(txHash: string): string {
  const h = (txHash || "").trim();
  const tpl = String(env.VITE_LAWDOG_EXPLORER_TX_URL ?? "https://basescan.org/tx/{tx_hash}").trim();
  if (!h) return tpl;
  return tpl.replace("{tx_hash}", h);
}
