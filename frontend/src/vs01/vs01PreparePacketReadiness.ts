import type { FinalVs01CorpusResolution } from "./vs01SigningCorpus";
import type { Vs01SigningPacketInitialsSummary } from "./vs01SigningPacketInitials";

export type Vs01PreparePacketReadiness = {
  packetReady: boolean;
  reason: string | null;
};

/** Safe QA/debug label for packet blockers — no corpus or signer PII. */
export function formatVs01PacketReadyDebugLabel(reason: string | null): string | null {
  if (!reason) return null;
  switch (reason) {
    case "corpus_gate_blocked":
    case "blocked_short_preview":
      return "corpus_gate_blocked";
    case "canonical_page_text_not_rendered":
      return "canonical_text_not_rendered";
    case "canonical_signature_lines_not_rendered":
      return "canonical_signature_lines_missing";
    case "missing_required_signature_fields":
      return "signature_fields_incomplete";
    case "initials_validation_incomplete":
      return "initials_incomplete";
    case "unsafe_signature_fields":
      return "signature_overlap_body_text";
    case "unsafe_initials_fields":
      return "initials_overlap_or_oob";
    default:
      return reason.length <= 48 ? reason : "packet_validation_blocked";
  }
}

export function resolveVs01PreparePacketReadiness(args: {
  corpusGate: Pick<FinalVs01CorpusResolution, "allowed" | "blockReason"> | null;
  placementCanFinish: boolean;
  initialsSummary: Pick<
    Vs01SigningPacketInitialsSummary,
    "complete" | "unsafeInitialsCount" | "unsafeSignatureCount"
  > | null;
  canonicalTextRendered?: boolean;
  canonicalSignatureLinesRendered?: boolean;
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
