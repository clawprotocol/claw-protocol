/**
 * Resolve the same authoritative corpus Prepare used — recipient must not render starter PDF alone.
 */

import { readAgreementVs01BridgeSession } from "../launch/simpleProduct/agreementToVs01SigningBridge";
import { readGuidedVs01SigningHandoffSession } from "../components/agreements/guidedDealCompletion/guidedVs01SigningHandoffSession";
import { fingerprintAgreementBody } from "../components/agreements/guidedDealCompletion/guidedSigningPacketVersion";
import { resolveFinalVs01CorpusOrBlock } from "./vs01SigningCorpus";
import {
  buildVs01CanonicalPacketSeed,
  loadVs01CanonicalPacketPortable,
  loadVs01CanonicalPacketSeed,
  logVs01CanonicalPacketSeedUse,
  type Vs01CanonicalPacketPortableV1,
  type Vs01CanonicalPacketSeedV1,
} from "./vs01CanonicalPacketSeed";
import { buildVs01SigningPacketModel, type Vs01SigningPacketModel } from "./buildVs01SigningPacketModel";
import type { Vs01PrepareSigningRole } from "./vs01SignerFieldAssignment";

export type ResolvedRecipientCanonicalPacket = {
  seed: Vs01CanonicalPacketSeedV1;
  model: Vs01SigningPacketModel;
  corpusHash: string;
  seedSource: "portable_packet" | "stored_seed" | "bridge_session" | "guided_handoff_session";
};

export function resolveRecipientCanonicalSigningPacket(args: {
  documentId: string;
  agreementId: string | null;
  roles: readonly Vs01PrepareSigningRole[];
  freeBaselinePlain?: string | null;
  /** When set (e.g. from portable packet), overrides default initials placement. */
  initialsEnabled?: boolean | null;
  /** Authoritative prepare/send portable packet when already in memory or storage. */
  portablePacket?: Vs01CanonicalPacketPortableV1 | null;
}): ResolvedRecipientCanonicalPacket | null {
  const documentId = args.documentId.trim();
  const agreementId = (args.agreementId ?? "").trim();
  if (!documentId || !agreementId || args.roles.length < 2) return null;

  const tryBuild = (
    corpusPlain: string,
    source: ResolvedRecipientCanonicalPacket["seedSource"],
  ): ResolvedRecipientCanonicalPacket | null => {
    const gate = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: corpusPlain,
      guidedPro: true,
      premiumComplete: corpusPlain.length >= 1500,
      freeBaselinePlain: args.freeBaselinePlain ?? null,
    });
    if (!gate.allowed) return null;
    const corpus = gate.corpus.trim();
    const seed =
      buildVs01CanonicalPacketSeed({ documentId, agreementId, corpusPlain: corpus }) ??
      null;
    if (!seed) return null;
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: corpus,
      roles: args.roles,
      initialsEnabled: args.initialsEnabled !== false,
      corpusGateArgs: { freeBaselinePlain: args.freeBaselinePlain ?? null },
    });
    if (!model.allowed) return null;
    logVs01CanonicalPacketSeedUse({
      documentId,
      agreementId,
      corpusHash: seed.corpusHash,
      source,
      renderMode: "canonical",
    });
    return { seed, model, corpusHash: seed.corpusHash, seedSource: source };
  };

  const portable =
    args.portablePacket ??
    loadVs01CanonicalPacketPortable(documentId);
  if (portable && portable.seed.agreementId === agreementId) {
    const fromPortable = tryBuild(portable.seed.corpusPlain, "portable_packet");
    if (fromPortable) return fromPortable;
  }

  const stored = loadVs01CanonicalPacketSeed(documentId);
  if (stored && stored.agreementId === agreementId) {
    const fromStored = tryBuild(stored.corpusPlain, "stored_seed");
    if (fromStored) return fromStored;
  }

  const bridge = readAgreementVs01BridgeSession();
  if (bridge?.vs01DocumentId.trim() === documentId && bridge.agreementId.trim() === agreementId) {
    const fromBridge = tryBuild(bridge.agreementCorpusText ?? "", "bridge_session");
    if (fromBridge) return fromBridge;
  }

  const handoff = readGuidedVs01SigningHandoffSession();
  if (handoff?.corpusText.trim()) {
    const fromHandoff = tryBuild(handoff.corpusText, "guided_handoff_session");
    if (fromHandoff) return fromHandoff;
  }

  return null;
}

/** Hard guard: seeded canonical packet must match prepare corpus hash. */
export function assertRecipientCorpusMatchesPrepareSeed(args: {
  prepareCorpusPlain: string;
  recipientCorpusPlain: string;
}): boolean {
  const a = fingerprintAgreementBody(args.prepareCorpusPlain);
  const b = fingerprintAgreementBody(args.recipientCorpusPlain);
  return a !== "empty" && a === b;
}
