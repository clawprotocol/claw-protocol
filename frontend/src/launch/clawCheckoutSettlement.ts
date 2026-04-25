/**
 * Demo checkout settlement boundary used after card confirmation in `SimpleCheckoutPage`.
 * Also defines legacy hybrid/stablecoin helpers kept for future rails — they are not wired into the live checkout UI.
 */

import type { PricingCadence } from "./pricingCadenceStorage";

export type SupportedStablecoin = "USDC" | "USDT";

export type SettlementRailKind = "fiat_onramp" | "stablecoin_treasury";

export type SettlementLeg = {
  rail: SettlementRailKind;
  amountUsd: number;
  intentId: string;
  /** Accounting asset after conversion (onramp settles here; treasury receives here). */
  settlementAsset: SupportedStablecoin;
};

export type SettlementReceipt = {
  receiptId: string;
  agreementId: string;
  tierId: string;
  cadence: PricingCadence;
  legs: SettlementLeg[];
  /** Single-asset or combined hybrid. */
  primarySettlementAsset: SupportedStablecoin | "MIXED";
};

export type SettlementConfirmation =
  | { ok: true; receipt: SettlementReceipt }
  | { ok: false; error: string };

/** Demo treasury deposit ref — production: chain-specific address or custody rail id. */
export const CLAW_DEMO_TREASURY_DEPOSIT_REF = "claw_treasury_usdc_demo_7f3a_base";

function delay(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}

function newIntentId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function buildSettlementReceipt(input: {
  agreementId: string;
  tierId: string;
  cadence: PricingCadence;
  legs: SettlementLeg[];
}): SettlementReceipt {
  const assets = new Set(input.legs.map((l) => l.settlementAsset));
  const primarySettlementAsset: SupportedStablecoin | "MIXED" =
    assets.size <= 1 ? (input.legs[0]?.settlementAsset ?? "USDC") : "MIXED";
  return {
    receiptId: newIntentId("rcpt"),
    agreementId: input.agreementId,
    tierId: input.tierId,
    cadence: input.cadence,
    legs: input.legs,
    primarySettlementAsset,
  };
}

// —— Public intent constructors (production: POST /v1/settlement/intents …) ——

export type FiatToCryptoOnrampIntent = {
  kind: "fiat_to_crypto_onramp";
  intentId: string;
  agreementId: string;
  tierId: string;
  cadence: PricingCadence;
  amountUsd: number;
  /** Target stablecoin for treasury credit after onramp conversion. */
  settlementAsset: SupportedStablecoin;
  /** Regulated processor / onramp session handle (hosted fields, redirect URL, etc.). */
  processorSessionRef: string;
};

export function createFiatToCryptoOnrampIntent(params: {
  agreementId: string;
  tierId: string;
  cadence: PricingCadence;
  amountUsd: number;
  settlementAsset?: SupportedStablecoin;
}): FiatToCryptoOnrampIntent {
  return {
    kind: "fiat_to_crypto_onramp",
    intentId: newIntentId("fiat_onr"),
    agreementId: params.agreementId,
    tierId: params.tierId,
    cadence: params.cadence,
    amountUsd: params.amountUsd,
    settlementAsset: params.settlementAsset ?? "USDC",
    processorSessionRef: `demo_onramp_session_${params.agreementId.slice(-6)}`,
  };
}

export type StablecoinTreasuryIntent = {
  kind: "stablecoin_treasury";
  intentId: string;
  agreementId: string;
  tierId: string;
  cadence: PricingCadence;
  amountUsd: number;
  asset: SupportedStablecoin;
  treasuryDepositRef: string;
};

export function createStablecoinTreasuryIntent(params: {
  agreementId: string;
  tierId: string;
  cadence: PricingCadence;
  amountUsd: number;
  asset: SupportedStablecoin;
}): StablecoinTreasuryIntent {
  return {
    kind: "stablecoin_treasury",
    intentId: newIntentId("treasury"),
    agreementId: params.agreementId,
    tierId: params.tierId,
    cadence: params.cadence,
    amountUsd: params.amountUsd,
    asset: params.asset,
    treasuryDepositRef: CLAW_DEMO_TREASURY_DEPOSIT_REF,
  };
}

export type HybridSettlementQuote = {
  quoteId: string;
  agreementId: string;
  tierId: string;
  cadence: PricingCadence;
  invoiceUsd: number;
  mode: "split" | "crypto_first";
  fiatOnrampUsd: number;
  stablecoinTreasuryUsd: number;
};

export function createHybridSettlementQuote(params: {
  agreementId: string;
  tierId: string;
  cadence: PricingCadence;
  invoiceUsd: number;
  mode: "split" | "crypto_first";
  stablecoinSharePct: number;
}): HybridSettlementQuote {
  const pct = Math.max(0, Math.min(100, params.stablecoinSharePct));
  const stablecoinTreasuryUsd =
    params.mode === "split" ? (params.invoiceUsd * pct) / 100 : params.invoiceUsd;
  const fiatOnrampUsd =
    params.mode === "split" ? params.invoiceUsd - stablecoinTreasuryUsd : params.invoiceUsd - stablecoinTreasuryUsd;
  return {
    quoteId: newIntentId("hybrid_q"),
    agreementId: params.agreementId,
    tierId: params.tierId,
    cadence: params.cadence,
    invoiceUsd: params.invoiceUsd,
    mode: params.mode,
    fiatOnrampUsd,
    stablecoinTreasuryUsd,
  };
}

/** Demo: decline when card PAN ends with 0002 (mirrors test-card semantics, not “merchant captured”). */
function isDemoOnrampDecline(cardDigitsWithoutSpaces: string): boolean {
  return cardDigitsWithoutSpaces.endsWith("0002") && cardDigitsWithoutSpaces.length >= 15;
}

/**
 * Demo: simulates processor + onramp completion webhook — fiat credited as stablecoin in treasury books.
 */
export async function demoConfirmFiatToCryptoOnrampFromCard(params: {
  intent: FiatToCryptoOnrampIntent;
  cardNumberDigits: string;
}): Promise<SettlementConfirmation> {
  await delay(450);
  if (isDemoOnrampDecline(params.cardNumberDigits)) {
    return { ok: false, error: "Payment failed — try another method." };
  }
  const receipt = buildSettlementReceipt({
    agreementId: params.intent.agreementId,
    tierId: params.intent.tierId,
    cadence: params.intent.cadence,
    legs: [
      {
        rail: "fiat_onramp",
        amountUsd: params.intent.amountUsd,
        intentId: params.intent.intentId,
        settlementAsset: params.intent.settlementAsset,
      },
    ],
  });
  return { ok: true, receipt };
}

/**
 * Demo: Apple / Google Pay — same onramp rail, wallet-funded fiat leg settling to stablecoin.
 */
export async function demoConfirmFiatToCryptoOnrampFromWalletPay(intent: FiatToCryptoOnrampIntent): Promise<SettlementConfirmation> {
  await delay(450);
  const receipt = buildSettlementReceipt({
    agreementId: intent.agreementId,
    tierId: intent.tierId,
    cadence: intent.cadence,
    legs: [
      {
        rail: "fiat_onramp",
        amountUsd: intent.amountUsd,
        intentId: intent.intentId,
        settlementAsset: intent.settlementAsset,
      },
    ],
  });
  return { ok: true, receipt };
}

/**
 * Demo: indexer / treasury watcher observed deposit matching intent.
 */
export async function demoConfirmStablecoinTreasuryWatched(intent: StablecoinTreasuryIntent): Promise<SettlementConfirmation> {
  await delay(900);
  const receipt = buildSettlementReceipt({
    agreementId: intent.agreementId,
    tierId: intent.tierId,
    cadence: intent.cadence,
    legs: [
      {
        rail: "stablecoin_treasury",
        amountUsd: intent.amountUsd,
        intentId: intent.intentId,
        settlementAsset: intent.asset,
      },
    ],
  });
  return { ok: true, receipt };
}

/**
 * Hybrid split: both rails must satisfy their quoted portions before a single receipt is issued.
 * Demo runs sequential onramp + treasury confirmations (production: parallel webhooks until threshold).
 */
export async function demoExecuteHybridSplitSettlement(params: {
  quote: HybridSettlementQuote;
  stablecoinAsset: SupportedStablecoin;
}): Promise<SettlementConfirmation> {
  await delay(350);
  if (params.quote.fiatOnrampUsd <= 0 && params.quote.stablecoinTreasuryUsd <= 0) {
    return { ok: false, error: "Invalid settlement split." };
  }
  await delay(350);
  const legs: SettlementLeg[] = [];
  if (params.quote.stablecoinTreasuryUsd > 0) {
    legs.push({
      rail: "stablecoin_treasury",
      amountUsd: params.quote.stablecoinTreasuryUsd,
      intentId: newIntentId("treasury"),
      settlementAsset: params.stablecoinAsset,
    });
  }
  if (params.quote.fiatOnrampUsd > 0) {
    legs.push({
      rail: "fiat_onramp",
      amountUsd: params.quote.fiatOnrampUsd,
      intentId: newIntentId("fiat_onr"),
      settlementAsset: "USDC",
    });
  }
  const sum = legs.reduce((s, l) => s + l.amountUsd, 0);
  if (Math.abs(sum - params.quote.invoiceUsd) > 0.01) {
    return { ok: false, error: "Settlement portions do not match invoice." };
  }
  const receipt = buildSettlementReceipt({
    agreementId: params.quote.agreementId,
    tierId: params.quote.tierId,
    cadence: params.quote.cadence,
    legs,
  });
  return { ok: true, receipt };
}

/**
 * Crypto-primary path: full invoice satisfied on treasury; optional remainder handled by separate fiat intent in UI.
 */
export async function demoFinalizeHybridCryptoPrimaryTreasury(params: {
  intent: StablecoinTreasuryIntent;
}): Promise<SettlementConfirmation> {
  return demoConfirmStablecoinTreasuryWatched(params.intent);
}

/**
 * Card covers full invoice (user chose fiat fallback) — single onramp leg for entire amount.
 */
export async function demoExecuteFullInvoiceFiatOnramp(params: {
  agreementId: string;
  tierId: string;
  cadence: PricingCadence;
  amountUsd: number;
  cardNumberDigits: string;
}): Promise<SettlementConfirmation> {
  const intent = createFiatToCryptoOnrampIntent({
    agreementId: params.agreementId,
    tierId: params.tierId,
    cadence: params.cadence,
    amountUsd: params.amountUsd,
  });
  return demoConfirmFiatToCryptoOnrampFromCard({
    intent,
    cardNumberDigits: params.cardNumberDigits,
  });
}
