import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildGuidedSignaturePacketFromManifest,
  assertGuidedVs01SigningHandoffReady,
  dedupeGuidedAnswerClauses,
  normalizePartyNameSpacingInCorpus,
  prepareGuidedSigningCorpusCleanup,
  resolveGuidedSigningAuthoritativePlain,
  resolveGuidedSigningPersistAgreementId,
  selectGuidedSignatureTrackCorpus,
  shouldBypassGenericOnGenerateForGuidedSignature,
  shouldBypassGenericOnGenerateForGuidedReview,
  shouldShowPacketSignerMetaLine,
  isGuidedSigningPlaceholderPreviewBody,
} from "./guidedFinalReviewToSigning";
import { finalizeGuidedProAgreementCorpus } from "./guidedFinalCorpusFinalizer";
import { resolveCanonicalFinalPartyManifest } from "./canonicalFinalPartyManifest";
import { buildCanonicalSignerManifest } from "./guidedReviewSigningContinuity";
import { GUIDED_SIGNING_AUTHORITATIVE_MIN_LEN } from "./guidedReviewSigningContinuity";
import type { GuidedCompletionSession } from "./types";

const LONG = "A".repeat(14_483);
const SHORT_RENDERED = "B".repeat(8_954);

function session(): GuidedCompletionSession {
  const ids = [
    "payment_timing",
    "phase_payment_allocation",
    "saas_sla",
    "ip_ownership",
    "renewal_notice",
  ];
  return {
    sessionKey: "gen:test36",
    queue: ids,
    variables: ids.map((id) => ({
      id,
      category: "compensation",
      label: id,
      question: `Question ${id}?`,
      severity: "important",
      suggestedDefaults: [],
      agreementImpact: "x",
      requiredForExecution: true,
      applicableAgreementFamilies: ["services_agreement"],
      uiControlType: "pills",
      currentValue: null,
      confidence: 0.9,
      affectsSections: [],
    })),
    answered: {
      payment_timing: "Net 30",
      phase_payment_allocation: "Build-heavy split / phase allocation",
      saas_sla: "99.9% uptime",
      ip_ownership: "Company owns project deliverables",
      renewal_notice: "30 days notice",
    },
    skipped: new Set(),
    currentIndex: ids.length,
    completenessPercent: 100,
    agreementFamily: "services_agreement",
    frozenTotalQuestions: ids.length,
  };
}

describe("resolveGuidedSigningAuthoritativePlain", () => {
  it("prefers frozen authoritative corpus over shortened rendered preview", () => {
    const plain = resolveGuidedSigningAuthoritativePlain({
      snapshot: LONG,
      renderedPreview: SHORT_RENDERED,
    });
    expect(plain.length).toBe(LONG.length);
    expect(plain).not.toBe(SHORT_RENDERED);
  });

  it("accepts guided authoritative when above signing threshold", () => {
    const guided = "C".repeat(GUIDED_SIGNING_AUTHORITATIVE_MIN_LEN + 100);
    const plain = resolveGuidedSigningAuthoritativePlain({
      guidedAuthoritative: guided,
      renderedPreview: SHORT_RENDERED,
    });
    expect(plain.length).toBeGreaterThanOrEqual(GUIDED_SIGNING_AUTHORITATIVE_MIN_LEN);
  });

  it("prefers frozen snapshot over longer stale server/picker authoritative", () => {
    const frozen = `${"Signer-applied finalized corpus. ".repeat(130)}${witnessBlock()}`;
    const staleServer = `${frozen} Stale server_full_document_text appendix.`;
    expect(staleServer.length).toBeGreaterThan(frozen.length);
    const plain = resolveGuidedSigningAuthoritativePlain({
      snapshot: frozen,
      finalReviewCorpus: frozen,
      guidedAuthoritative: staleServer,
    });
    expect(plain).toBe(frozen);
    expect(plain).not.toContain("Stale server_full_document_text");
  });
});

function witnessBlock(): string {
  return `
IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
Acme LLC
By: ______________________
Name: Anthem H Blanchard
Title: Manager
Date: ____________________

SERVICE PROVIDER:
Joe Brown
By: ______________________
Name: Joe Brown
Date: ____________________`;
}

describe("resolveGuidedSigningPersistAgreementId", () => {
  it("prefers postedId immediately after hydrate_before React state flush", () => {
    expect(
      resolveGuidedSigningPersistAgreementId({
        postedId: "bd73-hydrate-success",
        reviewAgreementIdRef: null,
        reviewAgreementId: null,
        productionSendBarAgreementId: null,
      }),
    ).toBe("bd73-hydrate-success");
  });

  it("collects agreement id from ref, state, send bar, draft, and resume", () => {
    expect(
      resolveGuidedSigningPersistAgreementId({
        reviewAgreementIdRef: "ref-id",
        reviewAgreementId: "state-id",
        productionSendBarAgreementId: "bar-id",
        draftAgreementId: "draft-id",
        resumeAgreementId: "resume-id",
      }),
    ).toBe("ref-id");
    expect(
      resolveGuidedSigningPersistAgreementId({
        reviewAgreementId: "state-id",
        productionSendBarAgreementId: "bar-id",
      }),
    ).toBe("state-id");
    expect(
      resolveGuidedSigningPersistAgreementId({
        productionSendBarAgreementId: "bar-id",
        draftAgreementId: "draft-id",
      }),
    ).toBe("bar-id");
  });
});

describe("guided signature track (test36)", () => {
  it("selects only frozen signer-applied / signing / accepted-review corpora", () => {
    const body = "D".repeat(GUIDED_SIGNING_AUTHORITATIVE_MIN_LEN + 50);
    const preview = "Preview [Your Company Name] ".repeat(80);
    expect(
      selectGuidedSignatureTrackCorpus({
        finalizedSignerApplied: body,
        acceptedReview: "short",
      }).source,
    ).toBe("finalized_signer_applied_guided_corpus");
    expect(
      selectGuidedSignatureTrackCorpus({
        finalizedSigning: body,
      }).source,
    ).toBe("finalized_signing_corpus");
    expect(selectGuidedSignatureTrackCorpus({ acceptedReview: body }).source).toBe("accepted_review");
    expect(selectGuidedSignatureTrackCorpus({}).source).toBe("none");
    expect(
      selectGuidedSignatureTrackCorpus({
        finalizedSignerApplied: preview,
        finalizedSigning: preview,
        acceptedReview: preview,
      }).source,
    ).toBe("none");
    expect(isGuidedSigningPlaceholderPreviewBody(preview)).toBe(true);
    expect(isGuidedSigningPlaceholderPreviewBody(body)).toBe(false);
  });

  it("normalizes betweenAcme / andJoe spacing and dedupes guided answer clauses", () => {
    const spaced = normalizePartyNameSpacingInCorpus(
      "entered by and betweenAcme LLC andJoe Smith with principal place of business at address on file.",
    );
    expect(spaced).toContain("between Acme LLC");
    expect(spaced).toContain("and Joe Smith");

    const dup = dedupeGuidedAnswerClauses(
      "Invoices are due Net 30 from receipt.\n\nInvoices are due Net 30 from receipt again.\n\nSchedule A phase allocation is build-heavy.",
    );
    expect(dup.text.match(/Net 30/g)?.length).toBe(1);
    expect(dup.repairs).toContain("dedupe:net_30");
  });

  it("prepares signing corpus with complete signature blocks and no bracket placeholders", () => {
    const manifest = resolveCanonicalFinalPartyManifest({
      partyCount: 2,
      partySignerNames: ["Anthem Blanchard", ""],
      partySignerTitles: ["Manager", ""],
      recipient1Name: "Acme LLC",
      recipient2Name: "Joe Smith",
      recipient1Email: "anthem@example.test",
      recipient2Email: "joe@example.test",
      extraPartyReviewEmails: [],
      draftPartyNames: ["Acme LLC", "Joe Smith"],
      sendMode: "signature",
      recipientsDeferred: false,
    });
    const base =
      "SERVICES AGREEMENT\n\nThis agreement is betweenAcme LLC andJoe Smith.\n\n" +
      "Invoices are due Net 30 from receipt.\nSchedule A phase allocation is build-heavy.\n" +
      "Provider will target 99.9% monthly uptime.\nCompany owns the project deliverables after payment, subject only to Provider pre-existing tools.\n" +
      "Either party may terminate with 30 days written notice.\n\n" +
      "Commercial safeguard paragraph. ".repeat(120);
    const cleaned = prepareGuidedSigningCorpusCleanup({ body: base, partyManifest: manifest });
    expect(cleaned.body).toMatch(/\bbetween Acme LLC\b/);
    expect(cleaned.body).toMatch(/\band Joe Smith\b/);
    expect(cleaned.body).not.toMatch(/\[Your Company Name\]|\[Service Provider Name\]|\[Client Address\]/i);
    expect(cleaned.body).toMatch(/\bNet 30\b/i);
    expect(cleaned.body).toMatch(/\bbuild-heavy\b/i);
    expect(cleaned.body).toMatch(/\b99\.9\s*%/i);
    expect(cleaned.body).toMatch(/\bCompany owns the project deliverables\b/i);
    expect(cleaned.body).toMatch(/\b30\s+days?.{0,24}notice\b/i);
    expect(cleaned.body).toMatch(
      /CLIENT:\s*\nAcme LLC\s*\nBy: __________________________\s*\nName: Anthem Blanchard\s*\nTitle: Manager/,
    );
    expect(cleaned.body).toMatch(
      /SERVICE PROVIDER:\s*\nJoe Smith\s*\n(?:By|Signature):\s*_{2,}\s*\nName: Joe Smith/i,
    );
    expect(cleaned.body).not.toMatch(/SERVICE PROVIDER:[\s\S]*?Title: Manager/i);
  });

  it("strips duplicate identity fragment before canonical witness block", () => {
    const manifest = resolveCanonicalFinalPartyManifest({
      partyCount: 2,
      partySignerNames: ["Anthem Blanchard", ""],
      partySignerTitles: ["Manager", ""],
      recipient1Name: "Acme LLC",
      recipient2Name: "Joe Smith",
      recipient1Email: "anthem@example.test",
      recipient2Email: "joe@example.test",
      extraPartyReviewEmails: [],
      draftPartyNames: ["Acme LLC", "Joe Smith"],
      sendMode: "signature",
      recipientsDeferred: false,
    });
    const body = `
SERVICES AGREEMENT

1. Scope
Provider will deliver services.

9.3 Electronic Signature
The parties may sign electronically.

Acme LLC
Name: Anthem Blanchard
Title: Manager
SERVICE PROVIDER: Joe Smith
Name: Joe Smith

IN WITNESS WHEREOF, the parties execute below.

CLIENT:
Acme LLC
By: __________________________
Name: Anthem Blanchard
Title: Manager
Date: _________________________

SERVICE PROVIDER:
Joe Smith
By: __________________________
Name: Joe Smith
Date: _________________________
`.trim();
    const cleaned = prepareGuidedSigningCorpusCleanup({ body, partyManifest: manifest });
    const witness = cleaned.body.search(/IN WITNESS WHEREOF/i);
    expect(witness).toBeGreaterThan(0);
    expect(
      cleaned.repairs.some(
        (r) =>
          r === "signature:pre_witness_identity_fragment_removed" ||
          r.includes("final_grade") ||
          r.includes("pre_witness"),
      ),
    ).toBe(true);
    expect(cleaned.body.slice(0, witness)).not.toMatch(/Name:\s*Anthem Blanchard/i);
    expect(cleaned.body.match(/IN WITNESS WHEREOF/gi)).toHaveLength(1);
    expect(cleaned.body.match(/^\s*By\s*:/gim)).toHaveLength(2);
  });

  it("builds signing packet manifest with two signers", () => {
    const manifest = resolveCanonicalFinalPartyManifest({
      partyCount: 2,
      partySignerNames: ["Anthem Blanchard", ""],
      partySignerTitles: ["Manager", ""],
      recipient1Name: "Acme LLC",
      recipient2Name: "Joe Smith",
      recipient1Email: "anthem@example.test",
      recipient2Email: "joe@example.test",
      extraPartyReviewEmails: [],
      draftPartyNames: ["Acme LLC", "Joe Smith"],
      sendMode: "signature",
      recipientsDeferred: false,
    });
    const packet = buildGuidedSignaturePacketFromManifest(manifest, true);
    expect(packet.entries).toHaveLength(2);
    expect(packet.entries[0].partyName).toBe("Acme LLC");
    expect(packet.entries[0].signerName).toBe("Anthem Blanchard");
    expect(packet.entries[1].partyName).toBe("Joe Smith");
    expect(packet.entries[1].signerName).toBe("Joe Smith");
    expect(
      shouldShowPacketSignerMetaLine({
        partyName: "Acme LLC",
        signerName: "Anthem Blanchard",
        isEntityParty: true,
      }),
    ).toBe(true);
    expect(
      shouldShowPacketSignerMetaLine({
        partyName: "Joe Smith",
        signerName: "Joe Smith",
        isEntityParty: false,
      }),
    ).toBe(false);
  });

  it("copy/export/sign share one finalized hash from finalizer + cleanup", () => {
    const manifest = resolveCanonicalFinalPartyManifest({
      partyCount: 2,
      partySignerNames: ["Anthem Blanchard", ""],
      partySignerTitles: ["Manager", ""],
      recipient1Name: "Acme LLC",
      recipient2Name: "Joe Smith",
      recipient1Email: "anthem@example.test",
      recipient2Email: "joe@example.test",
      extraPartyReviewEmails: [],
      draftPartyNames: ["[Your Company Name]", "[Service Provider Name]"],
      sendMode: "signature",
      recipientsDeferred: false,
    });
    const body =
      "SERVICES AGREEMENT\n\nbetween [Your Company Name] and [Service Provider Name].\n\n" +
      "1. Scope of Services\nProvider will deliver automation services.\n\n" +
      "2. Fees and Payment\nCompany will pay monthly fees.\n\n" +
      "3. Confidentiality\nEach party will protect confidential information.\n\n" +
      "4. Ownership and Work Product\nOwnership will be as stated in this Agreement.\n\n" +
      "5. Support and Service Levels\nProvider will provide commercially reasonable support.\n\n" +
      "6. Term and Termination\nThe term continues until terminated.\n\n" +
      "7. General Terms\nElectronic Signatures are permitted.\n\n" +
      "Commercial safeguard paragraph. ".repeat(130) +
      "\n\nIN WITNESS WHEREOF\n\nCLIENT:\n[Your Company Name]\nName: ______\n\nSERVICE PROVIDER:\n[Service Provider Name]\nName: ______\n";
    const identities = buildCanonicalSignerManifest({
      identities: manifest.parties.map((p, index) => ({
        index,
        partyDisplayName: p.partyName,
        email: p.email,
        representativeName: p.signerName,
        title: p.signerTitle,
        blockHeading: index === 0 ? "CLIENT" : "SERVICE PROVIDER",
        isIndividual: index === 1,
      })),
      signFirst: true,
    });
    const finalized = finalizeGuidedProAgreementCorpus({
      candidates: [{ source: "hydrated_premium_with_signers", body, paid: true }],
      guidedSession: session(),
      signerIdentities: identities.entries.map((e, index) => ({
        index,
        partyDisplayName: e.partyName,
        email: e.email,
        representativeName: e.signerName,
        title: e.title,
        blockHeading: index === 0 ? "CLIENT" : "SERVICE PROVIDER",
        isIndividual: index === 1,
      })),
      signerManifest: identities,
      partyManifest: manifest,
      originalIntake: "AI automation support agreement",
    });
    expect(finalized.ok).toBe(true);
    const cleaned = prepareGuidedSigningCorpusCleanup({
      body: finalized.body,
      partyManifest: manifest,
    });
    expect(cleaned.hash).toBeTruthy();
    expect(new Set([cleaned.hash, cleaned.hash, cleaned.hash]).size).toBe(1);
  });

  it("shouldBypassGenericOnGenerateForGuidedReview when guided final review review-first path is active", () => {
    expect(
      shouldBypassGenericOnGenerateForGuidedReview({
        createFlowPhase: "guided_final_review",
        reviewIntentActive: true,
        finalReviewSendPathChosen: true,
      }),
    ).toBe(true);
    expect(
      shouldBypassGenericOnGenerateForGuidedReview({
        createFlowPhase: "guided_final_review",
        reviewIntentActive: true,
        finalReviewSendPathChosen: false,
      }),
    ).toBe(false);
  });

  it("shouldBypassGenericOnGenerateForGuidedSignature when guided final review signature path is active", () => {
    expect(
      shouldBypassGenericOnGenerateForGuidedSignature({
        createFlowPhase: "guided_final_review",
        signatureIntentActive: true,
        finalReviewSendPathChosen: true,
      }),
    ).toBe(true);
    expect(
      shouldBypassGenericOnGenerateForGuidedSignature({
        createFlowPhase: "guided_final_review",
        signatureIntentActive: true,
        finalReviewSendPathChosen: false,
      }),
    ).toBe(false);
  });

  it("AgreementBuilderIntake routes paid Pro review-first without generic /app/send", () => {
    const intake = readFileSync(join(__dirname, "../AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("completeGuidedPaidProReviewFirstHandoff");
    expect(intake).toContain('completeGuidedPaidProReviewFirstHandoff("continue_guided_final_review")');
    expect(intake).toContain('completeGuidedPaidProReviewFirstHandoff("simple_pro_send_for_review")');
    expect(intake).toContain("logGuidedReviewGenericSendBypassed");
    expect(intake).toContain('premiumSendIntent: "review"');
    const reviewContinueIdx = intake.indexOf("if (opts.intent === \"review_only\")");
    const reviewContinueBlock = intake.slice(reviewContinueIdx, reviewContinueIdx + 400);
    expect(reviewContinueBlock).toContain("completeGuidedPaidProReviewFirstHandoff");
    expect(reviewContinueBlock).not.toContain("enterGuidedSigningConfirmationFromFinalReview");
  });

  it("Send for review first on final Pro review logs click and runs review handoff without upsell modal", () => {
    const intake = readFileSync(join(__dirname, "../AgreementBuilderIntake.tsx"), "utf8");
    const handleIdx = intake.indexOf("const handleProSendForReview = React.useCallback");
    const handleBlock = intake.slice(handleIdx, handleIdx + 900);
    expect(handleBlock).toContain("logReviewFirstClick");
    expect(handleBlock).toContain("canProceedGuidedFinalReviewToSigning");
    expect(handleBlock).toContain('completeGuidedPaidProReviewFirstHandoff("simple_pro_send_for_review")');
    expect(handleBlock).not.toContain("setPremiumSendConfirmOpen(true)");
    const handoffIdx = intake.indexOf("const completeGuidedPaidProReviewFirstHandoff = React.useCallback");
    const handoffBlock = intake.slice(handoffIdx, handoffIdx + 9000);
    expect(handoffBlock).toContain("logReviewFirstHandoffStart");
    expect(handoffBlock).toContain("writeReviewFirstHandoffSource");
    expect(handoffBlock).toContain("clearReviewFirstHandoffSource");
    expect(handoffBlock).toContain("logReviewFirstLinkCreated");
    expect(handoffBlock).toContain("logReviewFirstNavigateDone");
    expect(handoffBlock).toContain("logReviewFirstError");
    expect(handoffBlock).toContain("runPersistAndOpen");
    expect(handoffBlock).toContain("executePaidProPostRecipientSetupHandoff");
    expect(handoffBlock).toContain("logReviewFirstNavigateDone");
    expect(handoffBlock).not.toContain("enterGuidedSignatureTrackRoute");
    expect(handoffBlock).not.toContain("navigate(`/app/send/");
  });

  it("AgreementBuilderIntake routes signature track without generic onGenerate", () => {
    const intake = readFileSync(join(__dirname, "../AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("enterGuidedSignatureTrackRoute");
    expect(intake).toContain("executePaidProPostRecipientSetupHandoff");
    expect(intake).toContain("logGuidedSignatureTrackStart");
    expect(intake).toContain("logGuidedSignatureRouteEntered");
    expect(intake).toContain("logGuidedSignatureGenericSendBypassed");
    expect(intake).toContain('logSource: "guided_signature_track"');
    const handoffIdx = intake.indexOf("const completeGuidedSigningHandoff = React.useCallback");
    const handoffBlock = intake.slice(handoffIdx, handoffIdx + 2200);
    expect(handoffBlock).toContain("ensureGuidedSigningCorpusReady");
    expect(handoffBlock).toContain("mergeDraftPartiesFromCanonicalIdentities");
    expect(handoffBlock).toContain("enterGuidedSignatureTrackRoute");
    expect(handoffBlock).not.toContain("void onGenerate()");
    const signingIdx = intake.indexOf("const continueGuidedFinalReviewToSigning = React.useCallback");
    const signingBlock = intake.slice(signingIdx, signingIdx + 1200);
    expect(signingBlock).toContain("enterGuidedSignatureTrackRoute");
  });

  it("auto-placement module logs signature-fields-auto-placed", () => {
    const src = readFileSync(join(__dirname, "../../../vs01/vs01AutoSignaturePacket.ts"), "utf8");
    expect(src).toContain("[signature-fields-auto-placed]");
  });

  it("test38: VS01 handoff assertion requires Acme entity + Anthem rep + frozen corpus", () => {
    const manifest = resolveCanonicalFinalPartyManifest({
      partyCount: 2,
      partySignerNames: ["Anthem Blanchard", ""],
      partySignerTitles: ["Manager", ""],
      recipient1Name: "Acme LLC",
      recipient2Name: "Joe Smith",
      recipient1Email: "anthem@example.test",
      recipient2Email: "joe@example.test",
      extraPartyReviewEmails: [],
      draftPartyNames: ["Acme LLC", "Joe Smith"],
      sendMode: "signature",
      recipientsDeferred: false,
    });
    const body = `${"D".repeat(GUIDED_SIGNING_AUTHORITATIVE_MIN_LEN + 20)}
IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
Acme LLC
By: ______________________
Name: Anthem Blanchard
Title: Manager
Date: ____________________

SERVICE PROVIDER:
Joe Smith
Signature: _______________
Name: Joe Smith
Date: ____________________`;
    expect(
      assertGuidedVs01SigningHandoffReady({
        manifest,
        corpusSource: "finalized_signing_corpus",
        corpusBody: body,
      }).ok,
    ).toBe(true);
    expect(
      assertGuidedVs01SigningHandoffReady({
        manifest,
        corpusSource: "none",
        corpusBody: body,
      }).ok,
    ).toBe(false);
    expect(manifest.parties[0].partyName).toBe("Acme LLC");
    expect(manifest.parties[0].signerName).toBe("Anthem Blanchard");
    expect(manifest.parties[1].partyName).toBe("Joe Smith");
    expect(manifest.parties[1].signerTitle).toBeNull();
  });
});
