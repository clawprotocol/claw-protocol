import type { SettlementReceipt } from "./clawCheckoutSettlement";
import {
  invalidateWorkspaceProEntitlementCache,
  markPostProUnlockCelebrate,
} from "../agreement/agreementProFunnelGate";
import { recordKeysConsumedForInboundRef } from "./affiliate/clawOpportunityStore";
import { markOneTimeAgreementUnlock, markSimpleFlowSendUnlocked } from "./simpleFlowSendUnlock";

/** Placeholder until real Key metering posts checkout — keeps Opportunity layer aligned with subscription unlock. */
const CHECKOUT_STUB_KEYS_ATTRIBUTED = 10;

/**
 * Single activation entry: plan unlocks only after the checkout caller confirms payment success
 * (see `clawCheckoutSettlement` for the demo confirmation boundary).
 */
export function finalizeSettlementAndActivatePlan(receipt: SettlementReceipt): void {
  markSimpleFlowSendUnlocked(receipt.agreementId);
  markPostProUnlockCelebrate(receipt.agreementId);
  invalidateWorkspaceProEntitlementCache();
  recordKeysConsumedForInboundRef(CHECKOUT_STUB_KEYS_ATTRIBUTED);
  try {
    sessionStorage.setItem(
      `claw_plan_active_${encodeURIComponent(receipt.agreementId)}`,
      JSON.stringify({
        settlementReceipt: receipt,
        completedAt: Date.now(),
      }),
    );
    sessionStorage.setItem(
      `claw_settlement_receipt_id_${encodeURIComponent(receipt.agreementId)}`,
      receipt.receiptId,
    );
  } catch {
    /* ignore */
  }
}

/** One-time unlock: send/export for this agreement without subscription plan markers. */
export function finalizeSingleAgreementUnlock(receipt: SettlementReceipt): void {
  markOneTimeAgreementUnlock(receipt.agreementId);
  markPostProUnlockCelebrate(receipt.agreementId);
  invalidateWorkspaceProEntitlementCache();
  recordKeysConsumedForInboundRef(CHECKOUT_STUB_KEYS_ATTRIBUTED);
  try {
    sessionStorage.setItem(
      `claw_settlement_receipt_id_${encodeURIComponent(receipt.agreementId)}`,
      receipt.receiptId,
    );
  } catch {
    /* ignore */
  }
}
