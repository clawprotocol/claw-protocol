/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import { buildVs01SigningPacketModel } from "./buildVs01SigningPacketModel";
import { resolveFinalVs01CorpusOrBlock } from "./vs01SigningCorpus";
import { resolveVs01PreparePacketReadiness } from "./vs01PreparePacketReadiness";
import { signingPacketHasVisibleText } from "./vs01CanonicalPageRender";
import {
  buildPrepareBridgeCorpusGateArgs,
  resolveAgreementCorpusForPrepareHandoff,
  resolvePrepareBridgeSigningCorpus,
} from "./vs01PrepareBridgeCorpus";
import { writeReviewFirstPinnedCorpus } from "../launch/simpleProduct/reviewFirstSendSurface";
import type { AgreementVs01BridgeSession } from "../launch/simpleProduct/agreementToVs01SigningBridge";

const AGREEMENT_ID = "ag_test369_prepare_bridge";

function premiumCorpus(): string {
  return `${"Premium operational clause with detailed duties, milestones, remedies, approvals, and payment mechanics. ".repeat(90)}

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
Acme LLC
By: ______________________
Name: Anthem H Blanchard
Title: Manager
Date: ____________________

SERVICE PROVIDER:
Joe Smith
Signature: _______________
Name: Joe Smith
Date: ____________________`;
}

function roles() {
  return buildVs01PrepareSigningRoles({
    agreementId: AGREEMENT_ID,
    creatorName: "Acme LLC",
    creatorEmail: "owner@example.test",
    ownerSignerName: "Anthem H Blanchard",
    ownerSignerTitle: "Manager",
    counterparties: [{ id: "cp1", name: "Joe Smith", email: "joe@example.test", signerName: "Joe Smith" }],
  });
}

function minimalBridge(): AgreementVs01BridgeSession {
  return {
    vs01DocumentId: "doc_test369",
    agreementId: AGREEMENT_ID,
    agreementTitle: "Consulting Agreement",
    creatorName: "Acme LLC",
    creatorEmail: "owner@example.test",
    creatorSignerName: "Anthem H Blanchard",
    creatorSignerTitle: "Manager",
    counterparties: [{ id: "cp1", name: "Joe Smith", email: "joe@example.test", signerName: "Joe Smith" }],
    targetStep: 2,
    senderFirstLawdogHandoff: true,
    reviewerApprovedCleanHandoff: true,
    agreementBridgeMode: "prepare_signing_packet",
    ownerIsPreparingPacket: true,
  };
}

describe("VS01 prepare bridge corpus (Test369)", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("falls back to pinned review corpus when bridge session omits agreementCorpusText", () => {
    const corpus = premiumCorpus();
    writeReviewFirstPinnedCorpus(AGREEMENT_ID, corpus);
    const resolved = resolveAgreementCorpusForPrepareHandoff({
      agreementId: AGREEMENT_ID,
      draft: null,
      bridgeCorpusText: "",
    });
    expect(resolved).toBe(corpus);
  });

  it("prepare gate args unblock corpus checks for post-review dashboard handoff", () => {
    const corpus = premiumCorpus();
    writeReviewFirstPinnedCorpus(AGREEMENT_ID, corpus);
    const withoutPrepareFlag = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: "",
      guidedPro: true,
      premiumComplete: true,
    });
    expect(withoutPrepareFlag.allowed).toBe(false);

    const withPrepare = resolvePrepareBridgeSigningCorpus({
      agreementId: AGREEMENT_ID,
      draft: null,
      bridge: minimalBridge(),
    });
    expect(withPrepare.allowed).toBe(true);
    expect(withPrepare.corpus.trim().length).toBeGreaterThanOrEqual(1500);
  });

  it("reaches packet-ready with initials disabled on bridge path (signature_only)", () => {
    const corpus = premiumCorpus();
    writeReviewFirstPinnedCorpus(AGREEMENT_ID, corpus);
    const bridge = minimalBridge();
    const signingCorpus = resolvePrepareBridgeSigningCorpus({
      agreementId: AGREEMENT_ID,
      draft: null,
      bridge,
    });
    expect(signingCorpus.allowed).toBe(true);

    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: signingCorpus.corpus,
      roles: roles(),
      initialsEnabled: false,
      bridge,
      corpusGateArgs: buildPrepareBridgeCorpusGateArgs({
        agreementCorpusText: signingCorpus.corpus,
        bridge,
      }),
    });
    expect(model.allowed).toBe(true);
    expect(signingPacketHasVisibleText(model.pages)).toBe(true);
    expect(model.diagnostics.signatureAnchorCount).toBeGreaterThan(0);

    const signatureFields = model.fields.filter((f) => f.type === "signature" && !f.autoInitials);
    const readiness = resolveVs01PreparePacketReadiness({
      corpusGate: model.diagnostics.corpusGate,
      placementCanFinish: signatureFields.length >= roles().length,
      initialsSummary: null,
      canonicalTextRendered: signingPacketHasVisibleText(model.pages),
      canonicalSignatureLinesRendered: Boolean(model.diagnostics.signatureAnchorCount),
    });
    expect(readiness.packetReady).toBe(true);
    expect(readiness.reason).toBeNull();
  });

  it("does not force autoInitialsEveryPage on bridge placement path", () => {
    const src = readFileSync(join(__dirname, "StepPrepareSignature.tsx"), "utf8");
    expect(src).not.toMatch(/setAutoInitialsEveryPage\(true\)/);
    expect(src).toContain("buildPrepareBridgeCorpusGateArgs");
  });

  it("rebuilds witness anchors when prepare roles exceed existing By-line count", () => {
    const corpus = premiumCorpus();
    const threeRoles = buildVs01PrepareSigningRoles({
      agreementId: AGREEMENT_ID,
      creatorName: "Acme LLC",
      creatorEmail: "owner@example.test",
      ownerSignerName: "Anthem H Blanchard",
      ownerSignerTitle: "Manager",
      counterparties: [
        { id: "cp1", name: "Joe Smith", email: "joe@example.test", signerName: "Joe Smith" },
        { id: "cp2", name: "Third Party LLC", email: "third@example.test", signerName: "Third Signer" },
      ],
    });
    expect(threeRoles.length).toBe(3);
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: corpus,
      roles: threeRoles,
      initialsEnabled: false,
      bridge: minimalBridge(),
      corpusGateArgs: buildPrepareBridgeCorpusGateArgs({
        agreementCorpusText: corpus,
        bridge: minimalBridge(),
      }),
    });
    expect(model.diagnostics.signatureAnchorCount).toBeGreaterThanOrEqual(3);
    const signatureFields = model.fields.filter((f) => f.type === "signature" && !f.autoInitials);
    expect(signatureFields.length).toBeGreaterThanOrEqual(3);
    const readiness = resolveVs01PreparePacketReadiness({
      corpusGate: { allowed: true, blockReason: undefined },
      placementCanFinish: signatureFields.length >= threeRoles.length,
      initialsSummary: null,
      canonicalTextRendered: true,
      canonicalSignatureLinesRendered: model.diagnostics.signatureAnchorCount >= threeRoles.length,
    });
    expect(readiness.packetReady).toBe(true);
  });
});
