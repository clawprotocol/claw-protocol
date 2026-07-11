/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { buildTest336FlattenedProCorpus } from "./paidProTest336FormattingAndSignatureTailRegression.test";
import { computeByteLevelCorpusDiff } from "./paidProPostFreezeCorpusInvariant";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { projectPaidProFrozenSoTDisplayPlain } from "./paidProDisplayPlainAuthority";
import { resolvePaidProAuthoritativeDisplayPlain } from "./paidProAuthoritativeRenderGate";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import { resolveCanonicalPartyIdentitiesFromIntake } from "./canonicalPartyIdentityResolver";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProDocumentForSurface,
  getPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const RED_MESA = "Red Mesa Logistics LLC";
const HARBOR_PEAK = "Harbor Peak Automation LLC";

const TEST336_INTAKE = [
  `Create a services agreement between ${RED_MESA} and ${HARBOR_PEAK}.`,
  `${HARBOR_PEAK} will provide AI workflow consulting.`,
  "12 months. Fixed fee of $48,000 paid monthly. Oklahoma law.",
].join(" ");

function test336Draft(): ParsedDraftShape {
  return {
    title: "Services Agreement",
    jurisdiction: "Oklahoma",
    agreement_family: "services_agreement",
    parties: [
      { name: RED_MESA, role: "Client" },
      { name: HARBOR_PEAK, role: "Service Provider" },
    ],
    purpose: "AI workflow consulting.",
    payment_terms: "Fixed fee of $48,000 paid monthly.",
    duration: "12 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 48000, cadence: "monthly", valid: true },
  };
}

function legalTokenFingerprint(text: string): string {
  return fingerprintAgreementBody(text.replace(/\s+/g, " ").trim());
}

function executionRegion(text: string): string {
  const idx = text.search(/\bIN WITNESS WHEREOF\b/i);
  return idx >= 0 ? text.slice(idx).trim() : "";
}

function establishTest336SoT() {
  const raw = buildTest336FlattenedProCorpus();
  const draft = test336Draft();
  const prepared = preparePaidProServerDocumentForAcceptance(raw, draft, TEST336_INTAKE);
  markPaidProPipelineValidationPassed({ text: prepared.text, source: "server_full_draft" });
  establishPaidProSourceOfTruth({
    text: prepared.text,
    source: "server_full_draft",
    draft,
    intakeText: TEST336_INTAKE,
  });
  return { draft, opts: { draft, intakeText: TEST336_INTAKE } };
}

afterEach(() => {
  clearPaidProSourceOfTruth();
  clearPaidProPostAcceptanceValidatorCache();
});

describe("TEST587 — frozen SoT display-surface corpus parity", () => {
  it("A — TEST336 +146 diff was notice hydration in preparePaidProFrozenDisplayPlain (removed)", () => {
    const { opts } = establishTest336SoT();
    const sot = getPaidProSourceOfTruthText();
    const review = resolvePaidProReviewRenderPlain(opts);
    const diff = computeByteLevelCorpusDiff(sot, review);
    expect(diff.identical).toBe(true);
    expect(review.length - sot.length).toBe(0);
    expect(review).not.toMatch(/Attention:\s*Authorized Signer/i);
  });

  it("B — legal-token parity between frozen SoT and review", () => {
    const { opts } = establishTest336SoT();
    const sot = getPaidProSourceOfTruthText();
    const review = resolvePaidProReviewRenderPlain(opts);
    expect(legalTokenFingerprint(review)).toBe(legalTokenFingerprint(sot));
  });

  it("C — competing draft/server/fallback corpora cannot replace frozen SoT on review", () => {
    const { draft, opts } = establishTest336SoT();
    const sotHash = getPaidProSourceOfTruth()!.hash;
    const poisonedDraft = {
      ...draft,
      premium_server_full_document_text: "COMPETING SERVER CORPUS ".repeat(80),
      premium_full_document_text: "LOCAL FALLBACK CORPUS ".repeat(80),
      purpose: "STALE AGREEMENT BODY ".repeat(40),
    };
    const review = resolvePaidProReviewRenderPlain({ ...opts, draft: poisonedDraft });
    expect(hashPaidProCorpus(review)).toBe(sotHash);
    expect(review).not.toMatch(/COMPETING SERVER CORPUS/i);
    expect(review).not.toMatch(/LOCAL FALLBACK CORPUS/i);
  });

  it("D — parties, payment, governing law, and execution language preserved", () => {
    const { opts } = establishTest336SoT();
    const sot = getPaidProSourceOfTruthText();
    const review = resolvePaidProReviewRenderPlain(opts);
    for (const marker of [
      RED_MESA,
      HARBOR_PEAK,
      "$48,000",
      "Oklahoma",
      "IN WITNESS WHEREOF",
      "Counterparts",
    ]) {
      expect(sot).toContain(marker);
      expect(review).toContain(marker);
    }
  });

  it("E — no substantive clause deletion on review", () => {
    const { opts } = establishTest336SoT();
    const sot = getPaidProSourceOfTruthText();
    const review = resolvePaidProReviewRenderPlain(opts);
    for (const section of ["1. Services", "2. Payment", "11.7 Governing Law", "11.8 Counterparts"]) {
      expect(sot).toMatch(new RegExp(section.replace(".", "\\.")));
      expect(review).toMatch(new RegExp(section.replace(".", "\\.")));
    }
  });

  it("G — display projection idempotent", () => {
    const { opts } = establishTest336SoT();
    const sot = getPaidProSourceOfTruthText();
    const once = projectPaidProFrozenSoTDisplayPlain(sot);
    const twice = projectPaidProFrozenSoTDisplayPlain(once);
    expect(twice).toBe(once);
    expect(resolvePaidProReviewRenderPlain(opts)).toBe(once);
  });

  it("H — review render does not mutate stored frozen SoT", () => {
    const { opts } = establishTest336SoT();
    const before = getPaidProSourceOfTruth()!;
    resolvePaidProReviewRenderPlain(opts);
    const after = getPaidProSourceOfTruth()!;
    expect(after.hash).toBe(before.hash);
    expect(after.text).toBe(before.text);
  });

  it("I — review and signature-preparation surfaces match", () => {
    const { opts } = establishTest336SoT();
    const review = resolvePaidProReviewRenderPlain(opts);
    const signerSetup = getPaidProDocumentForSurface("signer_setup", opts)!.text;
    expect(hashPaidProCorpus(signerSetup)).toBe(hashPaidProCorpus(review));
  });

  it("L — execution region hash parity preserved from TEST586", () => {
    const { opts } = establishTest336SoT();
    const sot = getPaidProSourceOfTruthText();
    const review = resolvePaidProReviewRenderPlain(opts);
    expect(hashPaidProCorpus(executionRegion(review))).toBe(hashPaidProCorpus(executionRegion(sot)));
  });

  it("N — already-formatted frozen corpus has no drift on repeat render", () => {
    const { opts } = establishTest336SoT();
    const first = resolvePaidProAuthoritativeDisplayPlain(opts);
    const second = resolvePaidProReviewRenderPlain(opts);
    expect(second).toBe(first);
  });

  it("P — revision creates new frozen SoT; review follows only after successful freeze", () => {
    const { opts } = establishTest336SoT();
    const firstHash = getPaidProSourceOfTruth()!.hash;
    const edited = getPaidProSourceOfTruthText().replace("twelve months", "eighteen months");
    establishPaidProSourceOfTruth({
      text: edited,
      source: "server_full_draft",
      draft: opts.draft!,
      intakeText: TEST336_INTAKE,
      allowShorterOverwrite: true,
    });
    const secondHash = getPaidProSourceOfTruth()!.hash;
    expect(secondHash).not.toBe(firstHash);
    const review = resolvePaidProReviewRenderPlain(opts);
    expect(review).toContain("eighteen months");
    expect(hashPaidProCorpus(review)).toBe(secondHash);
  });

  it("Q — display-rendered text is not persisted as authoritative corpus", () => {
    const { opts } = establishTest336SoT();
    const sotBefore = getPaidProSourceOfTruthText();
    resolvePaidProReviewRenderPlain(opts);
    resolvePaidProAuthoritativeDisplayPlain(opts);
    expect(getPaidProSourceOfTruthText()).toBe(sotBefore);
  });
});

describe("TEST587 — four-party parity spot check", () => {
  it("K — four-party identities preserved through review projection", () => {
    const intake = [
      "Agreement among Alpha Labs LLC, Beta Consulting LLC, Gamma Systems LLC, and Delta Holdings LLC.",
      "Alpha Labs LLC: Alice Alpha, CEO",
      "Beta Consulting LLC: Bob Beta, Partner",
    ].join("\n");
    const parties = [
      "Alpha Labs LLC",
      "Beta Consulting LLC",
      "Gamma Systems LLC",
      "Delta Holdings LLC",
    ];
    const records = resolveCanonicalPartyIdentitiesFromIntake(intake, parties);
    const body = [
      "FOUR PARTY AGREEMENT",
      "",
      parties.join(", "),
      "",
      "1. Scope.",
      "",
      "10. Notices.",
      parties.map((p) => `If to ${p}:\n${p}\nprovided during signer setup.`).join("\n\n"),
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      ...records.map((r) => `${r.fullLegalName.toUpperCase()}\nBy: ___\nName: ___\nTitle: ___\nDate: ___`),
    ].join("\n");
    const draft: ParsedDraftShape = {
      title: "Four Party Agreement",
      jurisdiction: "Delaware",
      parties: records.map((r) => ({ name: r.fullLegalName, role: r.roleLabel })),
      purpose: "Multi-party services.",
      payment_terms: "",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: { amount: null, cadence: null, valid: false },
    };
    markPaidProPipelineValidationPassed({ text: body, source: "server_full_draft" });
    establishPaidProSourceOfTruth({ text: body, source: "server_full_draft", draft, intakeText: intake });
    const review = resolvePaidProReviewRenderPlain({ draft, intakeText: intake });
    const sot = getPaidProSourceOfTruthText();
    expect(legalTokenFingerprint(review)).toBe(legalTokenFingerprint(sot));
    for (const rec of records) {
      expect(review.toLowerCase()).toContain(rec.fullLegalName.toLowerCase());
    }
  });
});
