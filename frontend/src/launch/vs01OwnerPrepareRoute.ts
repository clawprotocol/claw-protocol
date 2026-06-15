import { findVs01CanonicalPacketPortableByAgreementId } from "../vs01/vs01CanonicalPacketSeed";
import { readPaidProVs01PostSignHandoff } from "../vs01/vs01PaidProPostSignHandoff";
import { readAgreementVs01BridgeSession } from "./simpleProduct/agreementToVs01SigningBridge";

/** Canonical owner VS01 prepare surface (field placement / send signing links). */
export function buildVs01OwnerPrepareEsignPath(documentId: string): string {
  const did = documentId.trim();
  return `/app/esign/${encodeURIComponent(did)}?agreement_bridge=1`;
}

/**
 * Resume owner prepare when bridge seed already exists in session, handoff, or portable packet.
 * Read-only — does not mutate VS01 packet generation.
 */
export function resolveVs01OwnerPrepareEsignRoute(agreementId: string): string | null {
  const id = agreementId.trim();
  if (!id) return null;

  const bridge = readAgreementVs01BridgeSession();
  if (bridge?.agreementId === id && bridge.vs01DocumentId?.trim()) {
    return buildVs01OwnerPrepareEsignPath(bridge.vs01DocumentId);
  }

  const handoff = readPaidProVs01PostSignHandoff(id);
  if (handoff?.vs01DocumentId?.trim()) {
    return buildVs01OwnerPrepareEsignPath(handoff.vs01DocumentId);
  }

  const portable = findVs01CanonicalPacketPortableByAgreementId(id);
  if (portable?.seed.documentId?.trim()) {
    return buildVs01OwnerPrepareEsignPath(portable.seed.documentId);
  }

  return null;
}
