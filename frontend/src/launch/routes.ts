export type AppSection =
  | { kind: "dashboard" }
  | { kind: "simpleCreate" }
  | { kind: "simpleReady"; agreementId: string }
  | { kind: "simpleCheckout"; agreementId: string }
  | { kind: "simpleSend"; agreementId: string }
  | { kind: "simpleDone"; agreementId: string }
  | { kind: "ownerProposalReview"; agreementId: string }
  | { kind: "ownerAgreementView"; agreementId: string }
  | { kind: "ownerSignedAgreementView"; agreementId: string }
  | { kind: "ownerSigningStatus"; agreementId: string }
  | { kind: "simpleVerification"; agreementId: string }
  | { kind: "quickSend" }
  | { kind: "agreements"; sub: "list" | "new" | { id: string } }
  | { kind: "esign"; sub: "new" | { id: string } }
  | { kind: "billing" }
  | { kind: "affiliate" }
  | { kind: "settings" }
  | { kind: "signatures" }
  | { kind: "opportunity" }
  | { kind: "agreementMemory" }
  | { kind: "integrations" }
  | { kind: "fieldReview"; analysisId: string }
  | { kind: "receipt"; id: string }
  | { kind: "advancedWorkProduct" }
  | { kind: "affiliatePayoutOps" }
  | { kind: "opsGrowth" }
  | { kind: "opsPaidFunnel" }
  | { kind: "opsStarterProRefine" }
  | { kind: "genesisReferral" }
  | { kind: "opsGenesisReferral" }
  | { kind: "adminConsole" };

/** Operator Founder HQ — canonical path is `/app/admin`; aliases for bookmarks and ops links. */
const ADMIN_CONSOLE_PATHS = new Set(["/app/admin", "/app/founder", "/founder", "/admin"]);

export function matchAppPath(pathname: string): AppSection | null {
  const p = (pathname.replace(/\/$/, "") || "/").split("?")[0];
  if (p === "/dashboard") return { kind: "dashboard" };
  if (ADMIN_CONSOLE_PATHS.has(p)) return { kind: "adminConsole" };
  if (!p.startsWith("/app")) return null;
  if (p === "/app") return { kind: "dashboard" };
  if (p === "/app/billing") return { kind: "billing" };
  if (p === "/app/affiliate") return { kind: "affiliate" };
  if (p === "/app/settings") return { kind: "settings" };
  if (p === "/app/signatures") return { kind: "signatures" };
  if (p === "/app/opportunity") return { kind: "opportunity" };
  if (p === "/app/agreement-memory") return { kind: "agreementMemory" };
  if (p === "/app/integrations") return { kind: "integrations" };
  if (p === "/app/work-product") return { kind: "advancedWorkProduct" };
  if (p === "/app/ops/affiliate-payouts") return { kind: "affiliatePayoutOps" };
  if (p === "/app/ops/growth") return { kind: "opsGrowth" };
  if (p === "/app/ops/paid-funnel") return { kind: "opsPaidFunnel" };
  if (p === "/app/ops/starter-pro-refine") return { kind: "opsStarterProRefine" };
  if (p === "/app/genesis-referral") return { kind: "genesisReferral" };
  if (p === "/app/ops/genesis-referral") return { kind: "opsGenesisReferral" };
  if (p === "/app/create") return { kind: "simpleCreate" };
  if (p === "/app/quick") return { kind: "quickSend" };

  const readyM = /^\/app\/ready\/([^/]+)$/.exec(p);
  if (readyM) return { kind: "simpleReady", agreementId: decodeURIComponent(readyM[1]) };

  const checkoutM = /^\/app\/checkout\/([^/]+)$/.exec(p);
  if (checkoutM) return { kind: "simpleCheckout", agreementId: decodeURIComponent(checkoutM[1]) };

  const sendM = /^\/app\/send\/([^/]+)$/.exec(p);
  if (sendM) return { kind: "simpleSend", agreementId: decodeURIComponent(sendM[1]) };

  const doneM = /^\/app\/done\/([^/]+)$/.exec(p);
  if (doneM) return { kind: "simpleDone", agreementId: decodeURIComponent(doneM[1]) };

  const reviewChangesM = /^\/app\/review-changes\/([^/]+)$/.exec(p);
  if (reviewChangesM) {
    return { kind: "ownerProposalReview", agreementId: decodeURIComponent(reviewChangesM[1]) };
  }

  const verM = /^\/app\/verification\/([^/]+)$/.exec(p);
  if (verM) return { kind: "simpleVerification", agreementId: decodeURIComponent(verM[1]) };

  if (p === "/app/agreements" || p === "/app/agreements/") return { kind: "agreements", sub: "list" };
  if (p === "/app/agreements/new") return { kind: "agreements", sub: "new" };
  const agreementViewM = /^\/app\/agreements\/([^/]+)\/view$/.exec(p);
  if (agreementViewM) {
    return { kind: "ownerAgreementView", agreementId: decodeURIComponent(agreementViewM[1]) };
  }

  const signedViewM = /^\/app\/agreements\/([^/]+)\/view-signed$/.exec(p);
  if (signedViewM) {
    return { kind: "ownerSignedAgreementView", agreementId: decodeURIComponent(signedViewM[1]) };
  }

  const signingStatusM = /^\/app\/signing-status\/([^/]+)$/.exec(p);
  if (signingStatusM) {
    return { kind: "ownerSigningStatus", agreementId: decodeURIComponent(signingStatusM[1]) };
  }

  const am = /^\/app\/agreements\/([^/]+)$/.exec(p);
  if (am) return { kind: "agreements", sub: { id: decodeURIComponent(am[1]) } };

  if (p === "/app/esign" || p === "/app/esign/new") return { kind: "esign", sub: "new" };
  const em = /^\/app\/esign\/([^/]+)$/.exec(p);
  if (em) return { kind: "esign", sub: { id: decodeURIComponent(em[1]) } };

  const rm = /^\/app\/receipts\/([^/]+)$/.exec(p);
  if (rm) return { kind: "receipt", id: decodeURIComponent(rm[1]) };

  const fr = /^\/app\/field-review\/([^/]+)$/.exec(p);
  if (fr) return { kind: "fieldReview", analysisId: decodeURIComponent(fr[1]) };

  return null;
}
