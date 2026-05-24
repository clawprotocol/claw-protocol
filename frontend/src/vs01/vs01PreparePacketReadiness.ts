import type { FinalVs01CorpusResolution } from "./vs01SigningCorpus";
import type { Vs01SigningPacketInitialsSummary } from "./vs01SigningPacketInitials";

export type Vs01PreparePacketReadiness = {
  packetReady: boolean;
  reason: string | null;
};

export function resolveVs01PreparePacketReadiness(args: {
  corpusGate: Pick<FinalVs01CorpusResolution, "allowed" | "blockReason"> | null;
  placementCanFinish: boolean;
  initialsSummary: Pick<
    Vs01SigningPacketInitialsSummary,
    "complete" | "unsafeInitialsCount" | "unsafeSignatureCount"
  > | null;
  canonicalTextRendered?: boolean;
  canonicalSignatureLinesRendered?: boolean;
  canonicalDomAligned?: boolean;
}): Vs01PreparePacketReadiness {
  if (!args.corpusGate?.allowed) {
    return { packetReady: false, reason: args.corpusGate?.blockReason ?? "corpus_gate_blocked" };
  }
  if (args.canonicalTextRendered === false) {
    return { packetReady: false, reason: "canonical_page_text_not_rendered" };
  }
  if (args.canonicalSignatureLinesRendered === false) {
    return { packetReady: false, reason: "canonical_signature_lines_not_rendered" };
  }
  if (args.canonicalDomAligned === false) {
    return { packetReady: false, reason: "canonical_field_dom_mismatch" };
  }
  if (!args.placementCanFinish) {
    return { packetReady: false, reason: "missing_required_signature_fields" };
  }
  if (!args.initialsSummary?.complete) {
    return { packetReady: false, reason: "initials_validation_incomplete" };
  }
  if (args.initialsSummary.unsafeSignatureCount > 0) {
    return { packetReady: false, reason: "unsafe_signature_fields" };
  }
  if (args.initialsSummary.unsafeInitialsCount > 0) {
    return { packetReady: false, reason: "unsafe_initials_fields" };
  }
  return { packetReady: true, reason: null };
}
