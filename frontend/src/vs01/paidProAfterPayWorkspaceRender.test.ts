/** @vitest-environment jsdom */
/**
 * After-pay Send for signature opens /app/esign/:doc_*?agreement_bridge=1 and
 * creates links, but the existing workspace rejected the painted deal at 1500
 * chars and showed "Could not load this document" / "Loading signing workspace…".
 *
 * Permanent path: hydrate + render the painted body (≥200) on the existing
 * prepare surface so a signer can sign. Every 2–4 party paid session.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgreementDraft } from "../agreement/agreementTypes";
import {
  PAID_SESSION_SIGNATURE_TRACK_MIN_CORPUS_LEN,
  shouldRelaxPaidSessionWorkspaceCorpus,
  vs01PaidSessionWorkspaceHydrateMinCorpusLen,
} from "../components/agreements/paidProPaidSessionLanding";
import { buildAgreementVs01BridgeSession } from "../launch/simpleProduct/agreementToVs01SigningBridge";
import { signingPacketHasVisibleText } from "./vs01CanonicalPageRender";
import { buildVs01SigningPacketModel } from "./buildVs01SigningPacketModel";
import {
  buildPrepareBridgeCorpusGateArgs,
  resolveAgreementCorpusForPrepareHandoff,
  resolvePrepareBridgeSigningCorpus,
} from "./vs01PrepareBridgeCorpus";
import { resolveFinalVs01CorpusOrBlock, VS01_SIGNING_CORPUS_MIN_LEN } from "./vs01SigningCorpus";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";

const PRIYA_DIEGO =
  "SERVICES AGREEMENT\n\nThis Agreement is entered into by Priya Shah of Northline Studio and Diego Alvarez of Harbor Marks LLC to design a logo and brand kit. Payment $2,400 due on signing. Term 30 days. Governing law: Texas.";

const MARCUS_ELENA =
  "SERVICES AGREEMENT\n\nMarcus Thompson of Apex Consulting Group engages Elena Rodriguez of Brightwave Marketing Agency for a strategic marketing campaign. Payment $5,500. Term 8 weeks. Governing law: California.";

const THREE_PARTY =
  "SERVICES AGREEMENT\n\nThis Agreement is entered into by Priya Shah, Diego Alvarez, and Maya Chen for a three-party brand collaboration. Payment $3,000. Term 45 days. Governing law: Texas. Each party will sign. The Service Provider delivers a logo and brand kit.";

const FOUR_PARTY =
  "SERVICES AGREEMENT\n\nThis Agreement is entered into by Priya Shah, Diego Alvarez, Maya Chen, and Jordan Lee for a four-party brand kit. Payment $4,200. Term 60 days. Governing law: Texas. Each party will sign. The Service Provider delivers marks and guidelines.";

const LEFTOVER =
  `${"LEFTOVER LINKS CREATED PACKET — stale review snapshot. ".repeat(40)}\nBy: ________________\nBy: ________________`;

function paintedDraft(id: string, parties: AgreementDraft["parties"], corpus: string): AgreementDraft {
  return {
    id,
    title: "SERVICES AGREEMENT",
    jurisdiction: "Texas",
    parties,
    document_text: corpus,
  } as AgreementDraft;
}

function rolesFromBridge(bridge: ReturnType<typeof buildAgreementVs01BridgeSession>) {
  return buildVs01PrepareSigningRoles({
    agreementId: bridge.agreementId,
    creatorName: bridge.creatorName,
    creatorEmail: bridge.creatorEmail,
    ownerSignerName: bridge.creatorSignerName,
    ownerSignerTitle: bridge.creatorSignerTitle,
    counterparties: bridge.counterparties,
  });
}

function paidSessionBridge(args: {
  id: string;
  docId: string;
  corpus: string;
  parties: AgreementDraft["parties"];
}) {
  return buildAgreementVs01BridgeSession({
    agreementId: args.id,
    vs01DocumentId: args.docId,
    draft: paintedDraft(args.id, args.parties, args.corpus),
    agreementCorpusText: args.corpus,
    senderFirstLawdogHandoff: true,
    allowShortAgreementCorpus: true,
  });
}

describe("after-pay workspace renders painted agreement (not load-error)", () => {
  it("uses the 200-char floor for agreement_bridge hydrate, not 1500", () => {
    expect(PRIYA_DIEGO.length).toBeGreaterThanOrEqual(PAID_SESSION_SIGNATURE_TRACK_MIN_CORPUS_LEN);
    expect(PRIYA_DIEGO.length).toBeLessThan(VS01_SIGNING_CORPUS_MIN_LEN);
    expect(
      vs01PaidSessionWorkspaceHydrateMinCorpusLen({
        agreementBridge: true,
        paidProHandoff: true,
      }),
    ).toBe(PAID_SESSION_SIGNATURE_TRACK_MIN_CORPUS_LEN);
    expect(PRIYA_DIEGO.length).toBeGreaterThanOrEqual(
      vs01PaidSessionWorkspaceHydrateMinCorpusLen({
        agreementBridge: true,
        paidProHandoff: true,
      }),
    );
    expect(PRIYA_DIEGO.length).toBeLessThan(
      vs01PaidSessionWorkspaceHydrateMinCorpusLen({
        agreementBridge: false,
        paidProHandoff: true,
      }),
    );
  });

  it("keeps the painted deal over a leftover 1500-char packet on prepare handoff", () => {
    const bridge = paidSessionBridge({
      id: "ag_after_pay_priya_diego",
      docId: "doc_7a341470449c4cb1aa1983062ab97352",
      corpus: PRIYA_DIEGO,
      parties: [
        {
          name: "Priya Shah of Northline Studio",
          role: "owner",
          email: "priya.shah.qa@example.com",
          signerName: "Priya Shah",
        },
        {
          name: "Diego Alvarez of Harbor Marks LLC",
          role: "signer",
          email: "diego.alvarez.qa@example.com",
          signerName: "Diego Alvarez",
        },
      ],
    });
    expect(bridge.agreementCorpusText).toBe(PRIYA_DIEGO);
    expect(bridge.source).toBe("paid_pro_sender_first");
    expect(
      shouldRelaxPaidSessionWorkspaceCorpus({
        bridge,
        corpusText: PRIYA_DIEGO,
      }),
    ).toBe(true);

    const resolved = resolveAgreementCorpusForPrepareHandoff({
      agreementId: bridge.agreementId,
      draft: null,
      bridge,
      bridgeCorpusText: PRIYA_DIEGO,
    });
    expect(resolved).toBe(PRIYA_DIEGO);
    expect(resolved).not.toContain("LEFTOVER LINKS CREATED");
    expect(LEFTOVER.length).toBeGreaterThanOrEqual(1500);

    const gate = resolvePrepareBridgeSigningCorpus({
      agreementId: bridge.agreementId,
      draft: null,
      bridge,
    });
    expect(gate.allowed).toBe(true);
    expect(gate.corpus).toBe(PRIYA_DIEGO);
    expect(gate.blockReason).not.toBe("corpus_too_short_for_guided_pro");
  });

  it("does not relax a non–paid-session short corpus (1500 gate stays)", () => {
    const short = PRIYA_DIEGO;
    expect(short.length).toBeLessThan(1500);
    const blocked = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: short,
      guidedPro: true,
      premiumComplete: false,
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.blockReason).toBe("corpus_too_short_for_guided_pro");
  });

  it.each([
    {
      count: 2,
      id: "ag_after_pay_priya_diego",
      docId: "doc_after_pay_two",
      corpus: PRIYA_DIEGO,
      parties: [
        {
          name: "Priya Shah of Northline Studio",
          role: "owner" as const,
          email: "priya.shah.qa@example.com",
          signerName: "Priya Shah",
        },
        {
          name: "Diego Alvarez of Harbor Marks LLC",
          role: "signer" as const,
          email: "diego.alvarez.qa@example.com",
          signerName: "Diego Alvarez",
        },
      ],
    },
    {
      count: 2,
      id: "ag_after_pay_marcus_elena",
      docId: "doc_after_pay_marcus",
      corpus: MARCUS_ELENA,
      parties: [
        {
          name: "Marcus Thompson of Apex Consulting Group",
          role: "owner" as const,
          email: "marcus.thompson.qa@example.com",
          signerName: "Marcus Thompson",
        },
        {
          name: "Elena Rodriguez of Brightwave Marketing Agency",
          role: "signer" as const,
          email: "elena.rodriguez.qa@example.com",
          signerName: "Elena Rodriguez",
        },
      ],
    },
    {
      count: 3,
      id: "ag_after_pay_three_party",
      docId: "doc_after_pay_three",
      corpus: THREE_PARTY,
      parties: [
        { name: "Priya Shah", role: "owner" as const, email: "priya.shah.qa@example.com", signerName: "Priya Shah" },
        {
          name: "Diego Alvarez",
          role: "signer" as const,
          email: "diego.alvarez.qa@example.com",
          signerName: "Diego Alvarez",
        },
        { name: "Maya Chen", role: "signer" as const, email: "maya.chen.qa@example.com", signerName: "Maya Chen" },
      ],
    },
    {
      count: 4,
      id: "ag_after_pay_four_party",
      docId: "doc_after_pay_four",
      corpus: FOUR_PARTY,
      parties: [
        { name: "Priya Shah", role: "owner" as const, email: "priya.shah.qa@example.com", signerName: "Priya Shah" },
        {
          name: "Diego Alvarez",
          role: "signer" as const,
          email: "diego.alvarez.qa@example.com",
          signerName: "Diego Alvarez",
        },
        { name: "Maya Chen", role: "signer" as const, email: "maya.chen.qa@example.com", signerName: "Maya Chen" },
        { name: "Jordan Lee", role: "signer" as const, email: "jordan.lee.qa@example.com", signerName: "Jordan Lee" },
      ],
    },
  ])("renders $count-party painted body with signature anchors on the existing packet", (fixture) => {
    expect(fixture.corpus.length).toBeGreaterThanOrEqual(200);
    expect(fixture.corpus.length).toBeLessThan(1500);
    const bridge = paidSessionBridge({
      id: fixture.id,
      docId: fixture.docId,
      corpus: fixture.corpus,
      parties: fixture.parties,
    });
    const roles = rolesFromBridge(bridge);
    expect(roles.length).toBe(fixture.count);

    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: fixture.corpus,
      roles,
      initialsEnabled: false,
      bridge,
      corpusGateArgs: buildPrepareBridgeCorpusGateArgs({
        agreementCorpusText: fixture.corpus,
        bridge,
      }),
    });
    expect(model.diagnostics.corpusGate.allowed).toBe(true);
    expect(signingPacketHasVisibleText(model.pages)).toBe(true);
    expect(model.pages.some((p) => p.flowLines.join(" ").includes("SERVICES AGREEMENT"))).toBe(true);
    expect(model.diagnostics.signatureAnchorCount).toBeGreaterThanOrEqual(fixture.count);
    const signatureFields = model.fields.filter((f) => f.type === "signature" && !f.autoInitials);
    expect(signatureFields.length).toBeGreaterThanOrEqual(fixture.count);
  });

  it("wizard hydrate uses the paid-session floor and falls back to bridge corpus", () => {
    const wizard = readFileSync(join(__dirname, "Vs01Wizard.tsx"), "utf8");
    expect(wizard).toContain("vs01PaidSessionWorkspaceHydrateMinCorpusLen");
    expect(wizard).toContain("hydrateMinLen");
    expect(wizard).toContain("signingCorpus.corpus.trim() || corpus || null");
    expect(wizard).toContain("readDurableAgreementVs01Bridge");
    expect(wizard).toContain("fetchDocumentEsignHandoff");
    expect(wizard).toContain("paidSessionDurablePacket");
    expect(wizard).toContain("completeBridgePreparePacket()");
    const dispatchAt = wizard.indexOf("const delivery = await dispatchSigningInvitesFromHandoff");
    expect(dispatchAt).toBeGreaterThan(0);
    const failAt = wizard.indexOf("if (!delivery.ok || !delivery.packetPersisted)", dispatchAt);
    const markAt = wizard.indexOf("markAgreementPacketPrepared(linkedAgreementId);", dispatchAt);
    expect(failAt).toBeGreaterThan(0);
    expect(markAt).toBeGreaterThan(failAt);
    expect(wizard.slice(failAt, failAt + 280)).toContain("Signing links could not be persisted");
    const prepareSrc = readFileSync(join(__dirname, "StepPrepareSignature.tsx"), "utf8");
    expect(prepareSrc).toContain("shouldAutoDispatchPaidProPrepareContinue");
    expect(wizard).not.toMatch(
      /if \(corpus\.length < VS01_SIGNING_CORPUS_MIN_LEN\) return false;/,
    );
  });

  it("prepare preview gate uses the same paid-session args (not a hard 1500)", () => {
    const src = readFileSync(join(__dirname, "StepPrepareSignature.tsx"), "utf8");
    const loadStart = src.indexOf("if (agreementBridgePlacementCopy) {");
    const loadSlice = src.slice(loadStart, loadStart + 700);
    expect(loadSlice).toContain("buildPrepareBridgeCorpusGateArgs");
    expect(loadSlice).not.toContain("length >= 1500");
  });

  it("Send for review path is unchanged", () => {
    const s = readFileSync(
      join(__dirname, "../launch/simpleProduct/paidProPostRecipientSetupHandoff.ts"),
      "utf8",
    );
    const reviewStart = s.indexOf('if (options.premiumSendIntent === "review")');
    const signatureStart = s.indexOf("const resolvedHandoff = resolvePaidSessionSignatureTrackHandoff");
    expect(reviewStart).toBeGreaterThan(-1);
    expect(signatureStart).toBeGreaterThan(reviewStart);
    const reviewBlock = s.slice(reviewStart, signatureStart);
    expect(reviewBlock).toContain("mintAndPersistReviewLinksForHandoff");
    expect(reviewBlock).not.toContain("tryNavigateGuidedSignatureTrackLocalVs01Esign");
    expect(reviewBlock).not.toContain("relaxPaidSessionCorpusAssert");
  });
});
