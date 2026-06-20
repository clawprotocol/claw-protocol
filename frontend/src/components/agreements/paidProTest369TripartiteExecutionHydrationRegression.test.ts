import { afterEach, describe, expect, it } from "vitest";
import { countSignatureBlockHeadingsInTail } from "./guidedDealCompletion/signatureRegion";
import { resolveCanonicalFinalPartyManifest } from "./guidedDealCompletion/canonicalFinalPartyManifest";
import {
  applyPaidProReviewRenderSanitizer,
  resolvePaidProReviewRenderPlain,
} from "./paidProReviewRenderCorpus";
import { enforcePaidProSingleExecutionBlock } from "./paidProExecutionBlockNormalization";
import {
  authorityPartiesFromLabeledPartyIntake,
} from "./paidProSignerMetadataAuthority";
import {
  buildPremiumPostCheckoutLocalRecoveryProDraft,
  PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
} from "./premiumNetworkRecoveryLocalDraft";
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import { resolveUniversalSignerMetadataBySlot } from "./universalSignerMetadataAuthority";
import { buildAgreementPreviewText } from "./agreementPreviewFromDraft";
import { applyPaidProRenderPolish } from "./paidProRenderPolish";
import { parseIntakeToStructuredAgreement } from "./intakeStructuredAgreementModel";
import {
  PAID_PRO_HARDENING_CLIENT,
  PAID_PRO_HARDENING_PROVIDER,
} from "./qa/paidProHardening/paidProHardeningFixtures";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";

export const TEST369_TRIPARTITE_LABELED_PARTIES_INTAKE = `Create a TRIPARTITE SOFTWARE DEVELOPMENT AND REVENUE SHARING AGREEMENT.

Party 1
Legal Entity: Pioneer Freight Solutions LLC
Signer Name: Jennifer Lawson
Signer Title: President
Signer Email: jlawson@pioneerfreight.com

Party 2
Legal Entity: Summit Ridge Technologies LLC
Signer Name: Unknown
Signer Title: Unknown
Signer Email: legal@summitridgetech.com
Address: 2110 Crescent Park Drive, Plano, TX 75024

Party 3
Legal Entity: North Star Data Analytics LLC
Signer Name: Michael Carter
Signer Title: Director of Analytics
Signer Email: Unknown

Purpose: Development and maintenance of a custom freight optimization platform, including analytics dashboard work.

Term: thirty-six (36) months.

Payment: $150,000 in milestone payments to the applicable Party; $4,000 per month to the applicable Party for analytics services.

Revenue sharing: Pioneer 50%, Summit Ridge 30%, North Star 20%.

Each party will keep confidential information received from the other parties confidential and will not disclose it except as required by law.

Texas law governs. Electronic execution via LawDog.`;

const TEST369_INTAKE = TEST369_TRIPARTITE_LABELED_PARTIES_INTAKE;

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: false };

function buildTest369Draft() {
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
    TEST369_INTAKE,
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

function buildTest369AcceptedCorpus() {
  const draft = buildTest369Draft();
  const parties = authorityPartiesFromLabeledPartyIntake(TEST369_INTAKE);
  const recovery = buildPremiumPostCheckoutLocalRecoveryProDraft({
    draft,
    rawIntake: TEST369_INTAKE,
    recoverySurface: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
  });
  expect(recovery.ok).toBe(true);
  const enforced = enforcePaidProSingleExecutionBlock(recovery.body, {
    authorityParties: parties,
    intakeText: TEST369_INTAKE,
    draftPartyNames: parties.map((p) => p.partyLegalName),
  });
  const polished = applyPaidProRenderPolish(enforced.text, TEST369_INTAKE, parties.map((p) => p.partyLegalName), {
    surface: "test369_accept",
  });
  const sanitized = applyPaidProReviewRenderSanitizer(polished.text, parties, {
    intakeText: TEST369_INTAKE,
    draftPartyNames: parties.map((p) => p.partyLegalName),
    acceptedCorpus: polished.text,
  });
  return { draft, parties, corpus: sanitized.text };
}

describe("paidPro test369 tripartite execution hydration regression", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
  });

  it("canonical party manifest count is 3 with slot-locked mapping", () => {
    const draft = buildTest369Draft();
    const partyNames = draft.parties.map((p) => p.name);

    const manifest = resolveCanonicalFinalPartyManifest({
      partyCount: 3,
      draftPartyNames: partyNames,
      intakeText: TEST369_INTAKE,
      recipient1Name: "Pioneer Freight Solutions LLC",
      recipient2Name: "Summit Ridge Technologies LLC",
      recipient1Email: "jlawson@pioneerfreight.com",
      recipient2Email: "legal@summitridgetech.com",
      extraPartyReviewEmails: [],
      partySignerNames: ["Jennifer Lawson", "", "Michael Carter"],
      partySignerTitles: ["President", "", "Director of Analytics"],
      sendMode: "signature",
      recipientsDeferred: false,
    });

    expect(manifest.parties).toHaveLength(3);
    expect(manifest.parties[0]?.partyName).toBe("Pioneer Freight Solutions LLC");
    expect(manifest.parties[1]?.partyName).toBe("Summit Ridge Technologies LLC");
    expect(manifest.parties[2]?.partyName).toBe("North Star Data Analytics LLC");
    expect(manifest.parties[2]?.roleLabel).toBe("Analytics Provider");
  });

  it("signer metadata slots are 3 with partial signer names from labeled intake", () => {
    const draft = buildTest369Draft();
    const partyNames = draft.parties.map((p) => p.name);
    const slots = resolveUniversalSignerMetadataBySlot({
      legalEntities: partyNames,
      intakeText: TEST369_INTAKE,
      draftParties: draft.parties.map((p) => ({
        name: p.name,
        signerName: null,
        signerTitle: null,
      })),
    });

    expect(slots).toHaveLength(3);
    expect(slots[0]?.signerName).toBe("Jennifer Lawson");
    expect(slots[0]?.signerTitle).toBe("President");
    expect(slots[1]?.signerName).toBe("");
    expect(slots[2]?.signerName).toBe("Michael Carter");
    expect(slots[2]?.signerTitle).toBe("Director of Analytics");
  });

  it("Pro execution block hydrates known metadata by slot with ANALYTICS PROVIDER heading", () => {
    const { draft, parties, corpus: acceptedCorpus } = buildTest369AcceptedCorpus();
    establishPaidProSourceOfTruth({ text: acceptedCorpus });

    const sanitized = applyPaidProReviewRenderSanitizer(acceptedCorpus, parties, {
      intakeText: TEST369_INTAKE,
      draftPartyNames: parties.map((p) => p.partyLegalName),
      acceptedCorpus,
    }).text;

    const reviewPlain = resolvePaidProReviewRenderPlain({
      draft,
      intakeText: TEST369_INTAKE,
      deferSignerMetadataRepair: true,
    });

    const corpus = reviewPlain.length >= sanitized.length ? reviewPlain : sanitized;
    const tail = executionTail(corpus);

    expect((corpus.match(/\bIN WITNESS WHEREOF\b/gi) || []).length).toBe(1);
    expect(countSignatureBlockHeadingsInTail(corpus)).toBe(3);
    expect(tail).toMatch(/CLIENT:/i);
    expect(tail).toMatch(/SERVICE PROVIDER:/i);
    expect(tail).toMatch(/ANALYTICS PROVIDER:/i);
    expect(tail).not.toMatch(/^\s*PARTY\s+3\s*:/im);

    const client = executionPartyBlock(tail, "CLIENT");
    const serviceProvider = executionPartyBlock(tail, "SERVICE PROVIDER");
    const analytics = executionPartyBlock(tail, "ANALYTICS PROVIDER");

    expect(client).toMatch(/^Pioneer Freight Solutions LLC/m);
    expect(fieldInBlock(client, "Name")).toBe("Jennifer Lawson");
    expect(fieldInBlock(client, "Title")).toBe("President");
    expect(client).not.toMatch(/Email for Notice:/i);
    expect(client).not.toMatch(/2110 Crescent Park Drive/i);
    expect(client).not.toMatch(/Michael Carter/i);

    expect(serviceProvider).toMatch(/^Summit Ridge Technologies LLC/m);
    expect(serviceProvider).not.toMatch(/Michael Carter/i);
    expect(fieldInBlock(serviceProvider, "Name")).not.toMatch(/Michael Carter/i);
    expect(serviceProvider).not.toMatch(/Email for Notice:/i);
    expect(serviceProvider).not.toMatch(/Address for Notice:/i);

    expect(analytics).toMatch(/^North Star Data Analytics LLC/m);
    expect(fieldInBlock(analytics, "Name")).toBe("Michael Carter");
    expect(fieldInBlock(analytics, "Title")).toBe("Director of Analytics");
    expect(analytics).not.toMatch(/legal@summitridgetech\.com/i);
    expect(analytics).not.toMatch(/2110 Crescent Park Drive/i);
  });

  it("intake signer emails remain in authority and execution block stays notice-contact-free", () => {
    const { draft, parties, corpus } = buildTest369AcceptedCorpus();
    const tail = executionTail(corpus);
    expect(tail).not.toMatch(/Email for Notice:/i);
    expect(tail).not.toMatch(/Address for Notice:/i);
    expect(parties[0]?.signerEmail).toBe("jlawson@pioneerfreight.com");
    expect(parties[1]?.signerEmail).toBe("legal@summitridgetech.com");
    establishPaidProSourceOfTruth({ text: corpus });
    const reviewPlain = resolvePaidProReviewRenderPlain({
      draft,
      intakeText: TEST369_INTAKE,
      deferSignerMetadataRepair: true,
    });
    expect(reviewPlain).not.toMatch(/Email for Notice:/i);
    expect(reviewPlain).not.toMatch(/Address for Notice:/i);
    expect(executionTail(reviewPlain)).not.toMatch(/jlawson@pioneerfreight\.com/i);
    expect(executionTail(reviewPlain)).not.toMatch(/legal@summitridgetech\.com/i);
  });

  it("free starter governing law contains Texas", () => {
    const structured = parseIntakeToStructuredAgreement(TEST369_INTAKE);
    expect(structured.governing_law).toMatch(/Texas/i);

    const draft = buildTest369Draft();
    expect(draft.jurisdiction).toMatch(/Texas/i);

    const starter = buildAgreementPreviewText(draft, {
      starterPreview: true,
      intakeText: TEST369_INTAKE,
    });
    expect(starter).toMatch(/Texas/i);
    expect(starter).not.toMatch(/To be agreed by the parties unless otherwise agreed/i);
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

    const normalized = enforcePaidProSingleExecutionBlock(twoPartyBody, {
      authorityParties: [
        { partyLegalName: PAID_PRO_HARDENING_CLIENT },
        { partyLegalName: PAID_PRO_HARDENING_PROVIDER },
      ],
    }).text;

    expect(countSignatureBlockHeadingsInTail(normalized)).toBe(2);
    expect((normalized.match(/\bIN WITNESS WHEREOF\b/gi) || []).length).toBe(1);
    const tail = executionTail(normalized);
    expect(tail).toMatch(/CLIENT:/i);
    expect(tail).toMatch(/SERVICE PROVIDER:/i);
    expect(tail).not.toMatch(/ANALYTICS PROVIDER:/i);
  });
});
