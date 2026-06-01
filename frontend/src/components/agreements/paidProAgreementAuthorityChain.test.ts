import { afterEach, describe, expect, it } from "vitest";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  fingerprintPaidProAgreementOperativeBody,
  resolvePaidProUnifiedSurfaceCorpus,
} from "./paidProAgreementAuthorityChain";
import {
  clearPaidProPinnedSignerAppliedCorpus,
  readPaidProPinnedSignerAppliedCorpus,
  setPaidProPinnedSignerAppliedCorpus,
} from "./paidProFinalHydratedCorpus";
import {
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  readConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import {
  assertPaidProSurfaceCorpus,
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProDocumentForSurface,
  getPaidProSourceOfTruth,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";

const BASE = [
  "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
  "",
  "This Agreement is entered into as of March 15, 2026 between Blue Canyon Analytics LLC (\"Client\") and Iron Vale Systems Inc. (\"Service Provider\").",
  "",
  ...Array.from({ length: 18 }, (_, i) => `${i + 1}. Clause ${i + 1}. ${"Terms. ".repeat(12)}`),
  "",
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
  "",
  "CLIENT:",
  "Blue Canyon Analytics LLC",
  "By: __________________________",
  "Name: __________________________",
  "Title: __________________________",
  "",
  "SERVICE PROVIDER:",
  "Iron Vale Systems Inc",
  "By: __________________________",
  "Name: __________________________",
  "Title: __________________________",
].join("\n");

function authority() {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: "Blue Canyon Analytics LLC",
    recipient2Name: "Iron Vale Systems Inc",
    recipient1Email: "client@example.com",
    recipient2Email: "provider@example.com",
    extraPartyReviewEmails: [],
    partySignerNames: ["Anthem H Blanchard", "Ira Vale"],
    partySignerTitles: ["Member", "Member"],
    partyAddresses: ["1027 S Rainbow", "111 Main St"],
  });
}

afterEach(() => {
  clearPaidProSourceOfTruth();
  clearConsumedPaidProSignerMetadataAuthority();
  clearPaidProPinnedSignerAppliedCorpus();
});

describe("paidProAgreementAuthorityChain", () => {
  it("user-edited opening survives hydration and matches review/copy/display", () => {
    const editedOpening =
      'This Agreement is entered into as of March 15, 2026 between Blue Canyon Analytics LLC ("Client") and Iron Vale Systems Inc. ("Service Provider").';
    const body = BASE.replace(
      /This Agreement is entered into[\s\S]*?\("Service Provider"\)\./,
      editedOpening,
    );
    establishPaidProSourceOfTruth({ text: body, source: "server_full_draft" });
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: body,
      authority: authority(),
      intakeRaw: "",
      surface: "test_finalize",
      signatureRegionOnly: true,
      repairRecital: false,
    });
    expect(hydrated.corpus).toContain("March 15, 2026");
    expect(hydrated.corpus).not.toContain("[Effective Date]");
    setPaidProPinnedSignerAppliedCorpus(hydrated.corpus);
    const execHash = hashPaidProCorpus(hydrated.corpus);
    for (const surface of ["review", "copy", "display", "vs01"] as const) {
      const doc = getPaidProDocumentForSurface(surface)!;
      expect(doc.text).toContain("March 15, 2026");
      expect(doc.hash).toBe(execHash);
      expect(() =>
        assertPaidProSurfaceCorpus({
          surface,
          text: doc.text,
          actualSource: doc.source,
          signerMetadataApplied: true,
        }),
      ).not.toThrow();
    }
  });

  it("partial signer metadata does not change agreement body prefix or display SoT", () => {
    establishPaidProSourceOfTruth({ text: BASE, source: "server_full_draft" });
    const before = fingerprintPaidProAgreementOperativeBody(getPaidProSourceOfTruth()!.text);
    setConsumedPaidProSignerMetadataAuthority(
      buildLivePaidProSignerMetadataAuthority({
        partyCount: 2,
        recipient1Name: "Blue Canyon Analytics LLC",
        recipient2Name: "Iron Vale Systems Inc",
        recipient1Email: "",
        recipient2Email: "provider@example.com",
        extraPartyReviewEmails: [],
        partySignerNames: ["I"],
        partySignerTitles: [""],
        partyAddresses: [""],
      }),
    );
    buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: BASE,
      authority: readConsumedPaidProSignerMetadataAuthority()!,
      intakeRaw: "",
      surface: "partial_signer_typing",
      signatureRegionOnly: true,
      repairRecital: false,
    });
    const display = getPaidProDocumentForSurface("display")!;
    expect(display.text).toBe(getPaidProSourceOfTruth()!.text);
    expect(fingerprintPaidProAgreementOperativeBody(display.text)).toBe(before);
  });

  it("completed signer metadata populates execution fields without changing body prefix", () => {
    establishPaidProSourceOfTruth({ text: BASE, source: "server_full_draft" });
    const beforeOperative = fingerprintPaidProAgreementOperativeBody(BASE);
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: BASE,
      authority: authority(),
      intakeRaw: "",
      surface: "signer_complete",
      signatureRegionOnly: true,
      repairRecital: false,
    });
    expect(fingerprintPaidProAgreementOperativeBody(hydrated.corpus)).toBe(beforeOperative);
    expect(hydrated.corpus).toMatch(/Name:\s*Anthem H Blanchard/i);
    expect(hydrated.corpus).toMatch(/Name:\s*Ira Vale/i);
    expect(hydrated.corpus).toContain("March 15, 2026");
  });

  it("review, copy, and display share unified execution corpus hash", () => {
    establishPaidProSourceOfTruth({ text: BASE, source: "server_full_draft" });
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: BASE,
      authority: authority(),
      intakeRaw: "",
      surface: "unified",
      signatureRegionOnly: true,
      repairRecital: false,
    });
    setPaidProPinnedSignerAppliedCorpus(hydrated.corpus);
    const unified = resolvePaidProUnifiedSurfaceCorpus()!;
    const review = getPaidProDocumentForSurface("review")!;
    const copy = getPaidProDocumentForSurface("copy")!;
    const display = getPaidProDocumentForSurface("display")!;
    expect(unified.hash).toBe(review.hash);
    expect(review.hash).toBe(copy.hash);
    expect(copy.hash).toBe(display.hash);
  });

  it("user-approved SoT revision clears execution overlay and preserves new opening", () => {
    establishPaidProSourceOfTruth({ text: BASE, source: "server_full_draft" });
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: BASE,
      authority: authority(),
      intakeRaw: "",
      surface: "pin",
      signatureRegionOnly: true,
      repairRecital: false,
    });
    setPaidProPinnedSignerAppliedCorpus(hydrated.corpus);
    const edited = BASE.replace(
      /March 15, 2026/,
      "April 1, 2026",
    );
    establishPaidProSourceOfTruth({
      text: edited,
      source: "server_full_draft",
      allowShorterOverwrite: true,
    });
    expect(readPaidProPinnedSignerAppliedCorpus()).toBe("");
    expect(getPaidProDocumentForSurface("review")!.text).toContain("April 1, 2026");
  });
});
