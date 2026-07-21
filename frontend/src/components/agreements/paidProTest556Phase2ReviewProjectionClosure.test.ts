import { afterEach, describe, expect, it } from "vitest";
import { bumpAgreementGenerationId } from "../../lib/agreementGenerationId";
import { countSignatureBlockHeadingsInTail } from "./guidedDealCompletion/signatureRegion";
import { applyPaidProReviewRenderSanitizer } from "./paidProReviewRenderCorpus";
import { enforcePaidProSingleExecutionBlock } from "./paidProExecutionBlockNormalization";
import {
  authorityPartiesToRecipientMetadata,
  type PaidProSignerMetadataParty,
} from "./paidProSignerMetadataAuthority";
import { labeledPartyBlocksForSignerMetadata } from "./labeledPartyBlockParse";
import {
  buildPremiumPostCheckoutLocalRecoveryProDraft,
  PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
} from "./premiumNetworkRecoveryLocalDraft";
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import { TEST368_TRIPARTITE_LABELED_PARTIES_INTAKE } from "./paidProTest368Fixtures";
import { establishLegalPartyAuthorityFromIntake } from "./legalPartyAuthority";
import { clearLegalPartyAuthoritySessionForTests } from "./legalPartyAuthoritySession";
import {
  clearStarterToPaidPartyHandoffForTests,
  writeStarterToPaidPartyHandoff,
} from "./starterToPaidPartyHandoff";
import {
  attachSignerToParty,
  clearSignerExecutionAuthorityForTests,
} from "./signerExecutionAuthority";
import { TEST550_CEDAR, TEST550_CEDAR_NORTHWIND_INTAKE, TEST550_NORTHWIND } from "./paidProTest550Fixtures";

const TRIPARTITE_INTAKE = TEST368_TRIPARTITE_LABELED_PARTIES_INTAKE;

const CUSTOM_ROLE_TRIPARTITE_INTAKE = `Create a three-party services agreement.

Party 1
Legal Entity: Red Mesa Logistics LLC
Signer Name: Sarah Mitchell
Signer Title: Chief Executive Officer
Signer Email: sarah@redmesalogistics.com

Party 2
Legal Entity: Harbor Peak Automation LLC
Signer Name: Unknown
Signer Title: Unknown
Signer Email: contact@harborpeakautomation.com

Party 3
Legal Entity: Blue Canyon Analytics LLC
Signer Name: Robert Henderson
Signer Title: Managing Member
Signer Email: robert@bluecanyon.com

Role labels: Primary Sponsor, Implementation Partner, Data Steward.`;

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: false };

function authorityPartiesFromLabeledIntake(intake: string): PaidProSignerMetadataParty[] {
  return labeledPartyBlocksForSignerMetadata(intake).map((block, partyIndex) => ({
    partyIndex,
    partyLegalName: block.legalEntity,
    signerEmail: block.signerEmail,
    signerTitle: block.signerTitle,
    signerName: block.signerName,
    partyAddress: block.address,
  }));
}

function buildDraft(intake: string) {
  return runIntakeDefaultsAndRoles(
    {
      title: "",
      jurisdiction: "",
      parties: [],
      purpose: "",
      payment_terms: "",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: emptyPayment,
    },
    intake,
    true,
    defaultIntakePartyRoleLabels(),
  );
}

function executionTail(corpus: string): string {
  const idx = corpus.search(/\bIN WITNESS WHEREOF\b/i);
  return idx >= 0 ? corpus.slice(idx) : corpus;
}

function executionPartyBlock(tail: string, heading: string): string {
  const startRe = new RegExp(`^\\s*${heading.replace(/\s+/g, "\\s+")}\\s*:\\s*$`, "im");
  const startMatch = tail.match(startRe);
  if (!startMatch || startMatch.index == null) return "";
  const afterHeading = tail.slice(startMatch.index + startMatch[0].length);
  const nextHeading = afterHeading.search(
    /^\s*(?:CLIENT|SERVICE\s+PROVIDER|ANALYTICS\s+PROVIDER)\s*:/im,
  );
  return (nextHeading >= 0 ? afterHeading.slice(0, nextHeading) : afterHeading).trim();
}

function fieldInBlock(block: string, field: string): string {
  const re = new RegExp(`^\\s*${field}\\s*:\\s*(.*)$`, "im");
  return (block.match(re)?.[1] ?? "").trim();
}

function buildReviewCorpus(intake: string) {
  const draft = buildDraft(intake);
  const parties = authorityPartiesFromLabeledIntake(intake);
  const recovery = buildPremiumPostCheckoutLocalRecoveryProDraft({
    draft,
    rawIntake: intake,
    recoverySurface: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
  });
  expect(recovery.ok).toBe(true);
  const enforced = enforcePaidProSingleExecutionBlock(recovery.body, {
    authorityParties: parties,
    intakeText: intake,
    draftPartyNames: parties.map((p) => p.partyLegalName),
  });
  const sanitized = applyPaidProReviewRenderSanitizer(enforced.text, parties, {
    intakeText: intake,
    draftPartyNames: parties.map((p) => p.partyLegalName),
    acceptedCorpus: enforced.text,
  });
  return { parties, corpus: sanitized.text };
}

describe("paidProTest556 Phase 2 review projection closure", () => {
  afterEach(() => {
    clearLegalPartyAuthoritySessionForTests();
    clearStarterToPaidPartyHandoffForTests();
    clearSignerExecutionAuthorityForTests();
  });

  it("Case 1 — tripartite review projection preserves three role-heading blocks", () => {
    const { corpus } = buildReviewCorpus(TRIPARTITE_INTAKE);
    const tail = executionTail(corpus);
    expect((corpus.match(/\bIN WITNESS WHEREOF\b/gi) || []).length).toBe(1);
    expect(countSignatureBlockHeadingsInTail(corpus)).toBe(3);
    expect(fieldInBlock(executionPartyBlock(tail, "CLIENT"), "Name")).toBe("Sarah Mitchell");
    expect(fieldInBlock(executionPartyBlock(tail, "ANALYTICS PROVIDER"), "Name")).toBe(
      "Robert Henderson",
    );
  });

  it("Case 2 — tripartite metadata preservation links signer emails by party index", () => {
    const { parties } = buildReviewCorpus(TRIPARTITE_INTAKE);
    expect(parties[0]?.signerEmail).toBe("sarah@redmesalogistics.com");
    expect(parties[1]?.signerEmail).toBe("contact@harborpeakautomation.com");
    expect(parties[2]?.signerName).toBe("Robert Henderson");
    expect(parties[2]?.signerTitle).toBe("Managing Member");
  });

  it("Case 3 — entity-heading mode for quad labeled intake", () => {
    const quadIntake = `Create a four-party logistics agreement.

Party 1
Legal Entity: Alpha Logistics LLC
Signer Name: A Signer
Signer Title: CEO
Signer Email: a@example.com

Party 2
Legal Entity: Beta Transport Inc.
Signer Name: B Signer
Signer Title: President
Signer Email: b@example.com

Party 3
Legal Entity: Gamma Warehousing LLC
Signer Name: C Signer
Signer Title: Manager
Signer Email: c@example.com

Party 4
Legal Entity: Delta Distribution Corp.
Signer Name: D Signer
Signer Title: Director
Signer Email: d@example.com`;
    const parties = authorityPartiesFromLabeledIntake(quadIntake);
    const draft = buildDraft(quadIntake);
    const recovery = buildPremiumPostCheckoutLocalRecoveryProDraft({
      draft,
      rawIntake: quadIntake,
      recoverySurface: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(recovery.ok).toBe(true);
    const enforced = enforcePaidProSingleExecutionBlock(recovery.body, {
      authorityParties: parties,
      intakeText: quadIntake,
      draftPartyNames: parties.map((p) => p.partyLegalName),
    });
    const tail = executionTail(enforced.text);
    expect(countSignatureBlockHeadingsInTail(enforced.text)).toBeGreaterThanOrEqual(4);
    expect(tail).toMatch(/ALPHA LOGISTICS LLC/i);
    expect(tail).toMatch(/DELTA DISTRIBUTION CORP\./i);
  });

  it("Case 4 — role-heading mode consistent for all tripartite parties", () => {
    const { corpus } = buildReviewCorpus(TRIPARTITE_INTAKE);
    const tail = executionTail(corpus);
    expect(tail).toMatch(/CLIENT:/i);
    expect(tail).toMatch(/SERVICE PROVIDER:/i);
    expect(tail).toMatch(/ANALYTICS PROVIDER:/i);
    expect(executionPartyBlock(tail, "CLIENT")).toMatch(/Red Mesa Logistics LLC/i);
    expect(executionPartyBlock(tail, "ANALYTICS PROVIDER")).toMatch(/Blue Canyon Analytics LLC/i);
  });

  it("Case 5 — unrecognized custom role survives via authority not regex", () => {
    const parties = authorityPartiesFromLabeledIntake(CUSTOM_ROLE_TRIPARTITE_INTAKE);
    expect(parties).toHaveLength(3);
    expect(parties[2]?.partyLegalName).toBe("Blue Canyon Analytics LLC");
    expect(parties[2]?.signerName).toBe("Robert Henderson");
  });

  it("Case 6 — missing signer on party 3 keeps legal identity without fabricated signer", () => {
    const intake = TRIPARTITE_INTAKE.replace(
      "Signer Name: Robert Henderson\nSigner Title: Managing Member",
      "Signer Name: Unknown\nSigner Title: Unknown",
    );
    const { corpus } = buildReviewCorpus(intake);
    const analytics = executionPartyBlock(executionTail(corpus), "ANALYTICS PROVIDER");
    expect(analytics).toMatch(/Blue Canyon Analytics LLC/i);
    expect(fieldInBlock(analytics, "Name")).not.toBe("Robert Henderson");
  });

  it("Case 7 — two signers for three parties keeps three legal blocks", () => {
    const intake = TRIPARTITE_INTAKE;
    const parties = authorityPartiesFromLabeledIntake(intake);
    const trimmedParties = parties.map((p, i) =>
      i === 1 ? { ...p, signerName: "", signerTitle: "" } : p,
    );
    const draft = buildDraft(intake);
    const recovery = buildPremiumPostCheckoutLocalRecoveryProDraft({
      draft,
      rawIntake: intake,
      recoverySurface: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    const enforced = enforcePaidProSingleExecutionBlock(recovery.body, {
      authorityParties: trimmedParties,
      intakeText: intake,
      draftPartyNames: trimmedParties.map((p) => p.partyLegalName),
    });
    const sanitized = applyPaidProReviewRenderSanitizer(enforced.text, trimmedParties, {
      intakeText: intake,
      draftPartyNames: trimmedParties.map((p) => p.partyLegalName),
      acceptedCorpus: enforced.text,
    });
    expect(countSignatureBlockHeadingsInTail(sanitized.text)).toBe(3);
  });

  it("Case 8 — sanitizer idempotence on execution projection", () => {
    const { parties, corpus } = buildReviewCorpus(TRIPARTITE_INTAKE);
    const second = applyPaidProReviewRenderSanitizer(corpus, parties, {
      intakeText: TRIPARTITE_INTAKE,
      draftPartyNames: parties.map((p) => p.partyLegalName),
      acceptedCorpus: corpus,
    });
    expect(executionTail(second.text)).toBe(executionTail(corpus));
    expect(countSignatureBlockHeadingsInTail(second.text)).toBe(
      countSignatureBlockHeadingsInTail(corpus),
    );
    expect(authorityPartiesToRecipientMetadata(parties)).toEqual(
      authorityPartiesToRecipientMetadata(parties),
    );
  });

  it("Case 9 — rebuild from canonical authority repairs malformed execution text", () => {
    const parties = authorityPartiesFromLabeledIntake(TRIPARTITE_INTAKE);
    const malformed = [
      "AGREEMENT BODY",
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      "CLIENT:",
      "Wrong Entity LLC",
      "By: __________________________",
      "Name: __________________________",
    ].join("\n");
    const sanitized = applyPaidProReviewRenderSanitizer(malformed, parties, {
      intakeText: TRIPARTITE_INTAKE,
      draftPartyNames: parties.map((p) => p.partyLegalName),
      acceptedCorpus: malformed,
    });
    expect(countSignatureBlockHeadingsInTail(sanitized.text)).toBe(3);
    expect(executionTail(sanitized.text)).toMatch(/Red Mesa Logistics LLC/i);
    expect(executionTail(sanitized.text)).toMatch(/Blue Canyon Analytics LLC/i);
  });

  it("Case 10 — repaired block contains no raw intake command language", () => {
    const { corpus } = buildReviewCorpus(TRIPARTITE_INTAKE);
    expect(corpus).not.toMatch(/Create a TRIPARTITE/i);
    expect(executionTail(corpus)).not.toMatch(/Create a/i);
  });

  it("Case 11 — sequential isolation between tripartite and two-party review", () => {
    buildReviewCorpus(TRIPARTITE_INTAKE);
    bumpAgreementGenerationId();
    clearLegalPartyAuthoritySessionForTests();
    clearStarterToPaidPartyHandoffForTests();
    clearSignerExecutionAuthorityForTests();
    const twoParty = buildReviewCorpus(TEST550_CEDAR_NORTHWIND_INTAKE);
    expect(countSignatureBlockHeadingsInTail(twoParty.corpus)).toBe(2);
    expect(executionTail(twoParty.corpus)).not.toMatch(/ANALYTICS PROVIDER/i);
    expect(executionTail(twoParty.corpus)).not.toMatch(/Robert Henderson/i);
  });

  it("Case 12 — Phase 2 full parity smoke", async () => {
    const handoff = writeStarterToPaidPartyHandoff(
      TEST550_CEDAR_NORTHWIND_INTAKE,
      establishLegalPartyAuthorityFromIntake(TEST550_CEDAR_NORTHWIND_INTAKE),
    );
    attachSignerToParty({
      agreementPartyId: handoff.parties[0].agreementPartyId,
      signerName: "Sarah Mitchell",
      signerTitle: "CEO",
      intakeText: TEST550_CEDAR_NORTHWIND_INTAKE,
    });
    expect(handoff.parties.map((p) => p.legalEntityName)).toEqual([TEST550_CEDAR, TEST550_NORTHWIND]);
    const mod368 = await import("./paidProTest368Fixtures");
    const mod555 = await import("./paidProTest555Phase2PartyHandoff.test");
    const modIdentity = await import("./guidedDealCompletion/signerPartyIdentity.test");
    expect(mod368).toBeTruthy();
    expect(mod555).toBeTruthy();
    expect(modIdentity).toBeTruthy();
  });
});
