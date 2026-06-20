import { describe, expect, it } from "vitest";
import { countSignatureBlockHeadingsInTail } from "./guidedDealCompletion/signatureRegion";
import { resolveCanonicalFinalPartyManifest } from "./guidedDealCompletion/canonicalFinalPartyManifest";
import { applyPaidProReviewRenderSanitizer } from "./paidProReviewRenderCorpus";
import { enforcePaidProSingleExecutionBlock } from "./paidProExecutionBlockNormalization";
import {
  authorityPartiesToRecipientMetadata,
  recipientMetadataToAuthorityParties,
  type PaidProSignerMetadataParty,
} from "./paidProSignerMetadataAuthority";
import { labeledPartyBlocksForSignerMetadata } from "./labeledPartyBlockParse";
import {
  buildPremiumPostCheckoutLocalRecoveryProDraft,
  PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
} from "./premiumNetworkRecoveryLocalDraft";
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import { resolveUniversalSignerMetadataBySlot } from "./universalSignerMetadataAuthority";
import { hydratePaidProExecutionBlockWithSignerMetadata } from "./hydratePaidProExecutionBlockWithSignerMetadata";
import {
  PAID_PRO_HARDENING_CLIENT,
  PAID_PRO_HARDENING_PROVIDER,
} from "./qa/paidProHardening/paidProHardeningFixtures";

/** Authoritative Test368 tripartite role-to-signer mapping (labeled Party blocks). */
export const TEST368_TRIPARTITE_LABELED_PARTIES_INTAKE = `Create a TRIPARTITE SOFTWARE DEVELOPMENT AND REVENUE SHARING AGREEMENT.

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
Address: 845 Tyrone St., Bentonville, AR 75029

Party 3
Legal Entity: Blue Canyon Analytics LLC
Signer Name: Robert Henderson
Signer Title: Managing Member
Signer Email: Unknown

Purpose: Development and maintenance of a custom freight optimization platform, including analytics dashboard work.

Term: twenty-four (24) months.

Payment: $120,000 in four milestone payments to the applicable Party; $3,000 per month to the applicable Party for analytics services.

Revenue sharing: Red Mesa 50%, Harbor Peak 30%, Blue Canyon 20%.

Each party will keep confidential information received from the other parties confidential and will not disclose it except as required by law. Each party will share licensing revenue per the revenue sharing terms above.

Oklahoma law governs. Electronic execution via LawDog.`;

const TEST368_INTAKE = TEST368_TRIPARTITE_LABELED_PARTIES_INTAKE;

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: false };

function buildTest368Draft() {
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
    TEST368_INTAKE,
    true,
    defaultIntakePartyRoleLabels(),
  );
}

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

function buildTest368ReviewCorpus() {
  const draft = buildTest368Draft();
  const parties = authorityPartiesFromLabeledIntake(TEST368_INTAKE);
  const recovery = buildPremiumPostCheckoutLocalRecoveryProDraft({
    draft,
    rawIntake: TEST368_INTAKE,
    recoverySurface: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
  });
  expect(recovery.ok).toBe(true);
  const enforced = enforcePaidProSingleExecutionBlock(recovery.body, {
    authorityParties: parties,
    intakeText: TEST368_INTAKE,
    draftPartyNames: parties.map((p) => p.partyLegalName),
  });
  const sanitized = applyPaidProReviewRenderSanitizer(enforced.text, parties, {
    intakeText: TEST368_INTAKE,
    draftPartyNames: parties.map((p) => p.partyLegalName),
    acceptedCorpus: enforced.text,
  });
  return { draft, parties, corpus: sanitized.text };
}

describe("paidPro test368 tripartite execution block regression", () => {
  it("canonical manifest preserves slot-locked party-to-signer mapping", () => {
    const draft = buildTest368Draft();
    const partyNames = draft.parties.map((p) => p.name);

    const manifest = resolveCanonicalFinalPartyManifest({
      partyCount: 3,
      draftPartyNames: partyNames,
      intakeText: TEST368_INTAKE,
      recipient1Name: "Red Mesa Logistics LLC",
      recipient2Name: "Harbor Peak Automation LLC",
      recipient1Email: "sarah@redmesalogistics.com",
      recipient2Email: "contact@harborpeakautomation.com",
      extraPartyReviewEmails: [],
      partySignerNames: ["Sarah Mitchell", "", "Robert Henderson"],
      partySignerTitles: ["Chief Executive Officer", "", "Managing Member"],
      sendMode: "signature",
      recipientsDeferred: false,
    });

    expect(manifest.parties).toHaveLength(3);
    expect(manifest.parties[0]).toMatchObject({
      roleLabel: "Client",
      partyName: "Red Mesa Logistics LLC",
      signerName: "Sarah Mitchell",
      signerTitle: "Chief Executive Officer",
      email: "sarah@redmesalogistics.com",
    });
    expect(manifest.parties[1]).toMatchObject({
      roleLabel: "Service Provider",
      partyName: "Harbor Peak Automation LLC",
      signerName: null,
      signerTitle: null,
      email: "contact@harborpeakautomation.com",
    });
    expect(manifest.parties[2]).toMatchObject({
      roleLabel: "Analytics Provider",
      partyName: "Blue Canyon Analytics LLC",
      signerName: "Robert Henderson",
      signerTitle: "Managing Member",
    });
  });

  it("signer metadata slots preserve slot-locked party-to-signer mapping", () => {
    const draft = buildTest368Draft();
    const partyNames = draft.parties.map((p) => p.name);
    const slots = resolveUniversalSignerMetadataBySlot({
      legalEntities: partyNames,
      intakeText: TEST368_INTAKE,
      draftParties: draft.parties.map((p) => ({
        name: p.name,
        signerName: null,
        signerTitle: null,
      })),
    });

    expect(slots).toHaveLength(3);
    expect(slots[0]).toMatchObject({
      entity: "Red Mesa Logistics LLC",
      signerName: "Sarah Mitchell",
      signerTitle: "Chief Executive Officer",
    });
    expect(slots[1]).toMatchObject({
      entity: "Harbor Peak Automation LLC",
      signerName: "",
      signerTitle: "",
    });
    expect(slots[2]).toMatchObject({
      entity: "Blue Canyon Analytics LLC",
      signerName: "Robert Henderson",
      signerTitle: "Managing Member",
    });
  });

  it("review render execution block preserves slot-locked party-to-signer mapping", () => {
    const { corpus } = buildTest368ReviewCorpus();
    const tail = executionTail(corpus);

    expect((corpus.match(/\bIN WITNESS WHEREOF\b/gi) || []).length).toBe(1);
    expect(countSignatureBlockHeadingsInTail(corpus)).toBe(3);

    const client = executionPartyBlock(tail, "CLIENT");
    const serviceProvider = executionPartyBlock(tail, "SERVICE PROVIDER");
    const analytics = executionPartyBlock(tail, "ANALYTICS PROVIDER");

    expect(client).toMatch(/^Red Mesa Logistics LLC/m);
    expect(fieldInBlock(client, "Name")).toBe("Sarah Mitchell");
    expect(fieldInBlock(client, "Title")).toBe("Chief Executive Officer");
    expect(client).not.toMatch(/Email for Notice:/i);
    expect(client).not.toMatch(/845 Tyrone St/i);

    expect(serviceProvider).toMatch(/^Harbor Peak Automation LLC/m);
    expect(serviceProvider).not.toMatch(/Robert Henderson/i);
    expect(fieldInBlock(serviceProvider, "Name")).not.toMatch(/Robert Henderson/i);
    expect(fieldInBlock(serviceProvider, "Title")).not.toMatch(/Managing Member/i);
    expect(serviceProvider).not.toMatch(/Email for Notice:/i);
    expect(serviceProvider).not.toMatch(/Address for Notice:/i);

    expect(analytics).toMatch(/^Blue Canyon Analytics LLC/m);
    expect(fieldInBlock(analytics, "Name")).toBe("Robert Henderson");
    expect(fieldInBlock(analytics, "Title")).toBe("Managing Member");
    expect(analytics).not.toMatch(/contact@harborpeakautomation\.com/i);
    expect(analytics).not.toMatch(/845 Tyrone St/i);
  });

  it("signer hydration preserves slot-locked mapping and metadata round-trip keeps party 3 legal name", () => {
    const { parties, corpus } = buildTest368ReviewCorpus();
    const meta = authorityPartiesToRecipientMetadata(parties);
    const roundTrip = recipientMetadataToAuthorityParties(meta);

    expect(roundTrip[2]?.partyLegalName).toBe("Blue Canyon Analytics LLC");
    expect(roundTrip[1]?.signerName).toBe("");
    expect(roundTrip[2]?.signerName).toBe("Robert Henderson");

    const hydrated = hydratePaidProExecutionBlockWithSignerMetadata(corpus, meta, {
      intakeText: TEST368_INTAKE,
      draftPartyNames: parties.map((p) => p.partyLegalName),
      acceptedCorpus: corpus,
    }).corpus;

    const tail = executionTail(hydrated);
    const serviceProvider = executionPartyBlock(tail, "SERVICE PROVIDER");
    const analytics = executionPartyBlock(tail, "ANALYTICS PROVIDER");

    expect(serviceProvider).not.toMatch(/Robert Henderson/i);
    expect(fieldInBlock(analytics, "Name")).toBe("Robert Henderson");
    expect(fieldInBlock(analytics, "Title")).toBe("Managing Member");
    expect(serviceProvider).not.toMatch(/Email for Notice:/i);
    expect(serviceProvider).not.toMatch(/Address for Notice:/i);
  });

  it("does not collapse tripartite execution to only CLIENT and SERVICE PROVIDER", () => {
    const parties = authorityPartiesFromLabeledIntake(TEST368_INTAKE);
    const recovery = buildPremiumPostCheckoutLocalRecoveryProDraft({
      draft: buildTest368Draft(),
      rawIntake: TEST368_INTAKE,
      recoverySurface: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(recovery.ok).toBe(true);

    const normalized = enforcePaidProSingleExecutionBlock(recovery.body, {
      authorityParties: parties,
      intakeText: TEST368_INTAKE,
      draftPartyNames: parties.map((p) => p.partyLegalName),
    }).text;

    expect(countSignatureBlockHeadingsInTail(normalized)).toBe(3);
    expect(executionTail(normalized)).toMatch(/ANALYTICS PROVIDER:/i);
    expect(executionTail(normalized)).toMatch(/Blue Canyon Analytics LLC/i);
  });

  it("two-party control: existing paid pro execution blocks still render CLIENT and SERVICE PROVIDER only", () => {
    const twoPartyBody = [
      "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
      "",
      `This Agreement is between ${PAID_PRO_HARDENING_CLIENT} ("Client") and ${PAID_PRO_HARDENING_PROVIDER} ("Service Provider").`,
      "",
      "1. SCOPE. Provider delivers services.",
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      "CLIENT:",
      PAID_PRO_HARDENING_CLIENT,
      "By: __________________________",
      "Name: __________________________",
      "Title: __________________________",
      "",
      "SERVICE PROVIDER:",
      PAID_PRO_HARDENING_PROVIDER,
      "By: __________________________",
      "Name: __________________________",
      "Title: __________________________",
    ].join("\n");

    const parties: PaidProSignerMetadataParty[] = [
      {
        partyIndex: 0,
        partyLegalName: PAID_PRO_HARDENING_CLIENT,
        signerEmail: "client@example.com",
        signerName: "Avery Client",
        signerTitle: "Manager",
        partyAddress: "",
      },
      {
        partyIndex: 1,
        partyLegalName: PAID_PRO_HARDENING_PROVIDER,
        signerEmail: "provider@example.com",
        signerName: "Pat Provider",
        signerTitle: "CEO",
        partyAddress: "",
      },
    ];

    const normalized = enforcePaidProSingleExecutionBlock(twoPartyBody, {
      authorityParties: parties,
    }).text;

    expect(countSignatureBlockHeadingsInTail(normalized)).toBe(2);
    expect((normalized.match(/\bIN WITNESS WHEREOF\b/gi) || []).length).toBe(1);
    const tail = executionTail(normalized);
    expect(tail).toMatch(/CLIENT:/i);
    expect(tail).toMatch(/SERVICE PROVIDER:/i);
    expect(tail).not.toMatch(/ANALYTICS PROVIDER:/i);
  });
});
