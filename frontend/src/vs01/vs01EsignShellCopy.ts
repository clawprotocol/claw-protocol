import type { AgreementVs01BridgeSession } from "../launch/simpleProduct/agreementToVs01SigningBridge";
import { readPaidProAgreementBridgeSkipMarker } from "../launch/simpleProduct/agreementToVs01SigningBridge";

export type Vs01EsignShellCopyVariant = "normal" | "bridge_reviewer_approved" | "bridge_sender_first";

export type Vs01EsignShellNavVariant = "full" | "esign_bridge_focused";

export type Vs01EsignShellCopyBundle = {
  title: string;
  subtitle: string;
  agreementBridgeEffective: boolean;
  copyVariant: Vs01EsignShellCopyVariant;
  navVariant: Vs01EsignShellNavVariant;
};

export function parseAgreementBridgeQuery(search: string | null | undefined): boolean {
  const raw = search?.startsWith("?") ? search.slice(1) : search || "";
  return new URLSearchParams(raw).get("agreement_bridge") === "1";
}

/**
 * App shell hero + nav for `/app/esign/:documentId` (ClawProductApp). Bridge UX when entering from
 * paid Pro agreement VS01 seed (`agreement_bridge=1` and/or skip marker + session).
 *
 * When `vs01Step` >= 4 (receipt/done), completion-specific copy replaces the setup framing.
 */
export function resolveVs01EsignShellCopy(args: {
  search: string | null | undefined;
  seedDocumentId: string;
  bridge: AgreementVs01BridgeSession | null;
  vs01Step?: number;
}): Vs01EsignShellCopyBundle {
  const seed = args.seedDocumentId.trim();
  const agreementBridgeQuery = parseAgreementBridgeQuery(args.search);
  const bridge = args.bridge;
  const bridgeMatches = Boolean(bridge && bridge.vs01DocumentId.trim() === seed);
  const marker =
    typeof window !== "undefined" && seed ? readPaidProAgreementBridgeSkipMarker(seed) : false;
  const agreementBridgeEffective = agreementBridgeQuery || Boolean(marker) || bridgeMatches;

  if (!agreementBridgeEffective) {
    return {
      title: "Continue your document",
      subtitle: "Same path as Quick — you confirm before anything goes out.",
      agreementBridgeEffective: false,
      copyVariant: "normal",
      navVariant: "full",
    };
  }

  const step = args.vs01Step ?? 0;

  if (step >= 4) {
    return {
      title: "E-signing package ready",
      subtitle:
        "Share the signing link with the recipient. Your proof record is being prepared.",
      agreementBridgeEffective: true,
      copyVariant: "bridge_reviewer_approved",
      navVariant: "esign_bridge_focused",
    };
  }

  const reviewer = Boolean(bridgeMatches && bridge?.reviewerApprovedCleanHandoff);
  if (reviewer) {
    return {
      title: "Prepare for e-signing",
      subtitle:
        "Place required signature fields, then continue to signing. Your reviewer already approved this draft.",
      agreementBridgeEffective: true,
      copyVariant: "bridge_reviewer_approved",
      navVariant: "esign_bridge_focused",
    };
  }

  return {
    title: "Prepare for e-signing",
    subtitle:
      "Place required signature fields, then continue to signing. Signer details from your LawDog send apply to this packet.",
    agreementBridgeEffective: true,
    copyVariant: "bridge_sender_first",
    navVariant: "esign_bridge_focused",
  };
}

/** Dev / QA: `localStorage.lawdogVs01CopyDiag = "1"` */
export function logVs01CopyContext(payload: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const on =
    Boolean(typeof import.meta !== "undefined" && import.meta.env?.DEV) ||
    window.localStorage?.getItem("lawdogVs01CopyDiag") === "1";
  if (!on) return;
  // eslint-disable-next-line no-console
  console.info("[vs01-copy-context]", payload);
}
