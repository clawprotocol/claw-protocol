/**
 * Tests for signer metadata carryover from first Pro-copy screen to final review,
 * and for editing signer metadata on the final review page.
 *
 * Required checks per Anthem's specification:
 * 1) Metadata added/corrected on the FIRST Pro-copy screen is applied on the next page (final review).
 * 2) On the final review page, user can still update signer metadata.
 * 3) On-screen edit of the agreement copy must save and persist.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
  getAuthoritativeSigningSnapshot,
  replaceAuthoritativeSigningSnapshotCorpus,
} from "./authoritativeSigningSnapshot";
import {
  authorityPartiesToLiveSignerMetadataUi,
  authorityPartiesToRecipientMetadata,
  buildCanonicalFinalPartyManifestFromAuthority,
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  readConsumedPaidProSignerMetadataAuthority,
  resolvePaidProPostFinalizeSignerDetailsEditSeed,
  setConsumedPaidProSignerMetadataAuthority,
  type PaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { buildCanonicalSignerManifest } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import {
  clearPaidProPinnedSignerAppliedCorpus,
  setPaidProPinnedSignerAppliedCorpus,
  readPaidProPinnedSignerAppliedCorpus,
} from "./paidProFinalHydratedCorpus";
import {
  writePremiumRecipientHandoffFromAuthorityParties,
  clearPremiumPartyNamesHandoff,
} from "./premiumPartyNamesHandoff";
import { beginPaidProPostFinalizeSignerDetailsReopen } from "./paidProPostFinalizeEditSignerDetails";

const PARTY_1 = "Harbor Pool & Patio LLC";
const PARTY_2 = "Anthem Ventures Inc.";

function buildTestAuthority(overrides?: {
  signerNames?: [string, string];
  emails?: [string, string];
  titles?: [string, string];
  addresses?: [string, string];
}): PaidProSignerMetadataAuthority {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: PARTY_1,
    recipient2Name: PARTY_2,
    recipient1Email: overrides?.emails?.[0] ?? "harbor@example.com",
    recipient2Email: overrides?.emails?.[1] ?? "anthem@example.com",
    extraPartyReviewEmails: [],
    partySignerNames: overrides?.signerNames ?? ["John Harbor", "Jane Anthem"],
    partySignerTitles: overrides?.titles ?? ["Owner", "CEO"],
    partyAddresses: overrides?.addresses ?? [
      "123 Pool St, Phoenix, AZ 85001",
      "456 Venture Ave, Scottsdale, AZ 85251",
    ],
  });
}

function buildTestCorpus(): string {
  return [
    "MASTER SERVICE AGREEMENT",
    "",
    "This Agreement is entered into between:",
    `${PARTY_1} ("Client")`,
    "and",
    `${PARTY_2} ("Provider")`,
    "",
    ...Array.from({ length: 30 }, (_, i) => `Section ${i + 1}. Agreement terms and conditions.`),
    "",
    "IN WITNESS WHEREOF, the parties have executed this Agreement.",
    "",
    "CLIENT:",
    PARTY_1,
    "Name: ________________________________",
    "Title: ________________________________",
    "Email: ________________________________",
    "",
    "PROVIDER:",
    PARTY_2,
    "Name: ________________________________",
    "Title: ________________________________",
    "Email: ________________________________",
  ].join("\n");
}

describe("firstScreenToFinalReviewCarryover", () => {
  afterEach(() => {
    clearAuthoritativeSigningSnapshot();
    clearConsumedPaidProSignerMetadataAuthority();
    clearPaidProPinnedSignerAppliedCorpus();
    clearPremiumPartyNamesHandoff();
  });

  describe("1) Metadata from first Pro-copy screen applies to final review", () => {
    it("signer names from first screen are available in consumed authority for final review", () => {
      const authority = buildTestAuthority({
        signerNames: ["John Harbor", "Jane Anthem"],
      });

      setConsumedPaidProSignerMetadataAuthority(authority);
      writePremiumRecipientHandoffFromAuthorityParties(authority.parties);

      const consumed = readConsumedPaidProSignerMetadataAuthority();
      expect(consumed).not.toBeNull();
      expect(consumed!.parties[0].signerName).toBe("John Harbor");
      expect(consumed!.parties[1].signerName).toBe("Jane Anthem");
    });

    it("signer emails from first screen are available in consumed authority for final review", () => {
      const authority = buildTestAuthority({
        emails: ["john@harborpool.com", "jane@anthem.com"],
      });

      setConsumedPaidProSignerMetadataAuthority(authority);

      const consumed = readConsumedPaidProSignerMetadataAuthority();
      expect(consumed!.parties[0].signerEmail).toBe("john@harborpool.com");
      expect(consumed!.parties[1].signerEmail).toBe("jane@anthem.com");
    });

    it("signer titles from first screen are available in consumed authority for final review", () => {
      const authority = buildTestAuthority({
        titles: ["Managing Member", "President"],
      });

      setConsumedPaidProSignerMetadataAuthority(authority);

      const consumed = readConsumedPaidProSignerMetadataAuthority();
      expect(consumed!.parties[0].signerTitle).toBe("Managing Member");
      expect(consumed!.parties[1].signerTitle).toBe("President");
    });

    it("party legal names from first screen are preserved through carryover", () => {
      const authority = buildTestAuthority();

      setConsumedPaidProSignerMetadataAuthority(authority);

      const consumed = readConsumedPaidProSignerMetadataAuthority();
      expect(consumed!.parties[0].partyLegalName).toBe(PARTY_1);
      expect(consumed!.parties[1].partyLegalName).toBe(PARTY_2);
    });

    it("party addresses from first screen are preserved through carryover", () => {
      const authority = buildTestAuthority({
        addresses: ["789 Main St, Phoenix, AZ", "321 Oak Ave, Tempe, AZ"],
      });

      setConsumedPaidProSignerMetadataAuthority(authority);

      const consumed = readConsumedPaidProSignerMetadataAuthority();
      expect(consumed!.parties[0].partyAddress).toBe("789 Main St, Phoenix, AZ");
      expect(consumed!.parties[1].partyAddress).toBe("321 Oak Ave, Tempe, AZ");
    });

    it("ampersand party names survive carryover without splitting", () => {
      const authority = buildLivePaidProSignerMetadataAuthority({
        partyCount: 2,
        recipient1Name: "Black & Decker Inc.",
        recipient2Name: "Smith & Wesson Holdings LLC",
        recipient1Email: "bd@example.com",
        recipient2Email: "sw@example.com",
        extraPartyReviewEmails: [],
        partySignerNames: ["Bob Black", "Sam Smith"],
        partySignerTitles: ["CEO", "President"],
        partyAddresses: [],
      });

      setConsumedPaidProSignerMetadataAuthority(authority);

      const consumed = readConsumedPaidProSignerMetadataAuthority();
      expect(consumed!.parties[0].partyLegalName).toBe("Black & Decker Inc.");
      expect(consumed!.parties[1].partyLegalName).toBe("Smith & Wesson Holdings LLC");
      expect(consumed!.parties[0].partyLegalName).toContain("&");
      expect(consumed!.parties[1].partyLegalName).toContain("&");
    });

    it("writePremiumRecipientHandoffFromAuthorityParties is called during finalization", () => {
      const intakeSrc = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
      expect(intakeSrc).toContain("writePremiumRecipientHandoffFromAuthorityParties(authority.parties)");
    });

    it("authoritative signing snapshot captures first-screen metadata", () => {
      const authority = buildTestAuthority();
      const corpus = buildTestCorpus();

      setConsumedPaidProSignerMetadataAuthority(authority);
      createAuthoritativeSigningSnapshot({
        corpus,
        signerMetadata: authorityPartiesToRecipientMetadata(authority.parties),
        partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority),
        signatureBlockModel: buildCanonicalSignerManifest({
          identities: [],
          signFirst: true,
        }),
      });

      const snapshot = getAuthoritativeSigningSnapshot();
      expect(snapshot).not.toBeNull();
      expect(snapshot!.signerMetadata.partySignerNames[0]).toBe("John Harbor");
      expect(snapshot!.signerMetadata.partySignerNames[1]).toBe("Jane Anthem");
      expect(snapshot!.signerMetadata.recipient1Email).toBe("harbor@example.com");
      expect(snapshot!.signerMetadata.recipient2Email).toBe("anthem@example.com");
    });
  });

  describe("2) User can update signer metadata on final review page", () => {
    it("resolvePaidProPostFinalizeSignerDetailsEditSeed returns consumed authority for edit", () => {
      const authority = buildTestAuthority();
      setConsumedPaidProSignerMetadataAuthority(authority);

      const seed = resolvePaidProPostFinalizeSignerDetailsEditSeed();
      expect(seed).not.toBeNull();
      expect(seed!.length).toBeGreaterThanOrEqual(2);
      expect(seed![0].signerName).toBe("John Harbor");
      expect(seed![1].signerName).toBe("Jane Anthem");
    });

    it("corrected signer name on final review page updates authority", () => {
      const initialAuthority = buildTestAuthority({
        signerNames: ["John Harbor", "Jane Anthem"],
      });
      setConsumedPaidProSignerMetadataAuthority(initialAuthority);

      const seed = resolvePaidProPostFinalizeSignerDetailsEditSeed();
      const ui = authorityPartiesToLiveSignerMetadataUi(seed!);
      const updatedSignerNames = [...ui.partySignerNames];
      updatedSignerNames[0] = "John Harbor Jr.";

      const correctedAuthority = buildLivePaidProSignerMetadataAuthority({ ...ui, partySignerNames: updatedSignerNames });
      setConsumedPaidProSignerMetadataAuthority(correctedAuthority);

      const consumed = readConsumedPaidProSignerMetadataAuthority();
      expect(consumed!.parties[0].signerName).toBe("John Harbor Jr.");
      expect(consumed!.parties[1].signerName).toBe("Jane Anthem");
    });

    it("corrected email on final review page updates authority", () => {
      const initialAuthority = buildTestAuthority({
        emails: ["old@harbor.com", "old@anthem.com"],
      });
      setConsumedPaidProSignerMetadataAuthority(initialAuthority);

      const seed = resolvePaidProPostFinalizeSignerDetailsEditSeed();
      const ui = authorityPartiesToLiveSignerMetadataUi(seed!);
      ui.recipient1Email = "new@harbor.com";

      const correctedAuthority = buildLivePaidProSignerMetadataAuthority(ui);
      setConsumedPaidProSignerMetadataAuthority(correctedAuthority);

      const consumed = readConsumedPaidProSignerMetadataAuthority();
      expect(consumed!.parties[0].signerEmail).toBe("new@harbor.com");
      expect(consumed!.parties[1].signerEmail).toBe("old@anthem.com");
    });

    it("correcting one party does not lose other party data", () => {
      const initialAuthority = buildTestAuthority({
        signerNames: ["John Harbor", "Jane Anthem"],
        emails: ["john@harbor.com", "jane@anthem.com"],
        titles: ["Owner", "CEO"],
        addresses: ["123 Pool St", "456 Venture Ave"],
      });
      setConsumedPaidProSignerMetadataAuthority(initialAuthority);

      const seed = resolvePaidProPostFinalizeSignerDetailsEditSeed();
      const ui = authorityPartiesToLiveSignerMetadataUi(seed!);
      const updatedSignerNames = [...ui.partySignerNames];
      updatedSignerNames[0] = "John Harbor Corrected";

      const correctedAuthority = buildLivePaidProSignerMetadataAuthority({ ...ui, partySignerNames: updatedSignerNames });
      setConsumedPaidProSignerMetadataAuthority(correctedAuthority);

      const consumed = readConsumedPaidProSignerMetadataAuthority();
      expect(consumed!.parties[0].signerName).toBe("John Harbor Corrected");
      expect(consumed!.parties[1].signerName).toBe("Jane Anthem");
      expect(consumed!.parties[1].signerEmail).toBe("jane@anthem.com");
      expect(consumed!.parties[1].signerTitle).toBe("CEO");
    });

    it("beginPaidProPostFinalizeSignerDetailsReopen clears snapshot for re-edit", () => {
      const authority = buildTestAuthority();
      const corpus = buildTestCorpus();

      setConsumedPaidProSignerMetadataAuthority(authority);
      createAuthoritativeSigningSnapshot({
        corpus,
        signerMetadata: authorityPartiesToRecipientMetadata(authority.parties),
        partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority),
        signatureBlockModel: buildCanonicalSignerManifest({
          identities: [],
          signFirst: true,
        }),
      });
      setPaidProPinnedSignerAppliedCorpus(corpus);

      expect(getAuthoritativeSigningSnapshot()).not.toBeNull();
      expect(readPaidProPinnedSignerAppliedCorpus()).not.toBe("");

      beginPaidProPostFinalizeSignerDetailsReopen();

      expect(getAuthoritativeSigningSnapshot()).toBeNull();
      expect(readPaidProPinnedSignerAppliedCorpus()).toBe("");
    });

    it("re-finalize after edit creates new snapshot with corrected metadata", () => {
      const initialAuthority = buildTestAuthority({
        signerNames: ["John Harbor", "Jane Anthem"],
      });
      const corpus = buildTestCorpus();

      setConsumedPaidProSignerMetadataAuthority(initialAuthority);
      createAuthoritativeSigningSnapshot({
        corpus,
        signerMetadata: authorityPartiesToRecipientMetadata(initialAuthority.parties),
        partyManifest: buildCanonicalFinalPartyManifestFromAuthority(initialAuthority),
        signatureBlockModel: buildCanonicalSignerManifest({
          identities: [],
          signFirst: true,
        }),
      });

      beginPaidProPostFinalizeSignerDetailsReopen();

      const seed = resolvePaidProPostFinalizeSignerDetailsEditSeed();
      expect(seed).not.toBeNull();

      const ui = authorityPartiesToLiveSignerMetadataUi(seed!);
      const updatedSignerNames = [...ui.partySignerNames];
      updatedSignerNames[0] = "John Harbor Corrected";

      const correctedAuthority = buildLivePaidProSignerMetadataAuthority({ ...ui, partySignerNames: updatedSignerNames });
      setConsumedPaidProSignerMetadataAuthority(correctedAuthority);

      createAuthoritativeSigningSnapshot({
        corpus,
        signerMetadata: authorityPartiesToRecipientMetadata(correctedAuthority.parties),
        partyManifest: buildCanonicalFinalPartyManifestFromAuthority(correctedAuthority),
        signatureBlockModel: buildCanonicalSignerManifest({
          identities: [],
          signFirst: true,
        }),
        replaceExisting: true,
      });

      const newSnapshot = getAuthoritativeSigningSnapshot();
      expect(newSnapshot!.signerMetadata.partySignerNames[0]).toBe("John Harbor Corrected");
    });
  });

  describe("3) On-screen edit of agreement copy persists", () => {
    it("replaceAuthoritativeSigningSnapshotCorpus updates corpus while preserving signer metadata", () => {
      const authority = buildTestAuthority();
      const originalCorpus = buildTestCorpus();

      setConsumedPaidProSignerMetadataAuthority(authority);
      createAuthoritativeSigningSnapshot({
        corpus: originalCorpus,
        signerMetadata: authorityPartiesToRecipientMetadata(authority.parties),
        partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority),
        signatureBlockModel: buildCanonicalSignerManifest({
          identities: [],
          signFirst: true,
        }),
      });

      const editedCorpus = originalCorpus.replace(
        "Section 1. Agreement terms and conditions.",
        "Section 1. EDITED: Modified agreement terms.",
      );

      const result = replaceAuthoritativeSigningSnapshotCorpus({
        corpus: editedCorpus,
        surface: "test_plain_edit",
      });

      expect(result).not.toBeNull();
      expect(result!.corpus).toContain("EDITED: Modified agreement terms");
      expect(result!.signerMetadata.partySignerNames[0]).toBe("John Harbor");
      expect(result!.signerMetadata.partySignerNames[1]).toBe("Jane Anthem");
    });

    it("corpus edit does not affect consumed signer metadata authority", () => {
      const authority = buildTestAuthority();
      const originalCorpus = buildTestCorpus();

      setConsumedPaidProSignerMetadataAuthority(authority);
      createAuthoritativeSigningSnapshot({
        corpus: originalCorpus,
        signerMetadata: authorityPartiesToRecipientMetadata(authority.parties),
        partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority),
        signatureBlockModel: buildCanonicalSignerManifest({
          identities: [],
          signFirst: true,
        }),
      });

      const editedCorpus = originalCorpus + "\n\nADDENDUM: New clause added by user.";
      replaceAuthoritativeSigningSnapshotCorpus({
        corpus: editedCorpus,
        surface: "test_addendum",
      });

      const consumed = readConsumedPaidProSignerMetadataAuthority();
      expect(consumed!.parties[0].signerName).toBe("John Harbor");
      expect(consumed!.parties[0].signerEmail).toBe("harbor@example.com");
    });

    it("edited corpus is available through getAuthoritativeSigningSnapshot", () => {
      const authority = buildTestAuthority();
      const originalCorpus = buildTestCorpus();

      createAuthoritativeSigningSnapshot({
        corpus: originalCorpus,
        signerMetadata: authorityPartiesToRecipientMetadata(authority.parties),
        partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority),
        signatureBlockModel: buildCanonicalSignerManifest({
          identities: [],
          signFirst: true,
        }),
      });

      const editedCorpus = originalCorpus.replace(
        "MASTER SERVICE AGREEMENT",
        "CUSTOM SERVICE AGREEMENT",
      );

      replaceAuthoritativeSigningSnapshotCorpus({
        corpus: editedCorpus,
        surface: "test_title_edit",
      });

      const snapshot = getAuthoritativeSigningSnapshot();
      expect(snapshot!.corpus).toContain("CUSTOM SERVICE AGREEMENT");
      expect(snapshot!.corpus).not.toContain("MASTER SERVICE AGREEMENT");
    });
  });

  describe("multi-party (3-4 signers) carryover", () => {
    it("three-party metadata carries over to final review", () => {
      const authority = buildLivePaidProSignerMetadataAuthority({
        partyCount: 3,
        recipient1Name: "Party One LLC",
        recipient2Name: "Party Two Inc.",
        recipient1Email: "p1@example.com",
        recipient2Email: "p2@example.com",
        extraPartyReviewEmails: ["p3@example.com"],
        partySignerNames: ["Signer One", "Signer Two", "Signer Three"],
        partySignerTitles: ["CEO", "President", "Manager"],
        partyAddresses: ["Address 1", "Address 2", "Address 3"],
      });

      setConsumedPaidProSignerMetadataAuthority(authority);

      const consumed = readConsumedPaidProSignerMetadataAuthority();
      expect(consumed!.parties.length).toBe(3);
      expect(consumed!.parties[0].signerName).toBe("Signer One");
      expect(consumed!.parties[1].signerName).toBe("Signer Two");
      expect(consumed!.parties[2].signerName).toBe("Signer Three");
    });

    it("four-party metadata carries over to final review", () => {
      const authority = buildLivePaidProSignerMetadataAuthority({
        partyCount: 4,
        recipient1Name: "Party One LLC",
        recipient2Name: "Party Two Inc.",
        recipient1Email: "p1@example.com",
        recipient2Email: "p2@example.com",
        extraPartyReviewEmails: ["p3@example.com", "p4@example.com"],
        partySignerNames: ["Signer One", "Signer Two", "Signer Three", "Signer Four"],
        partySignerTitles: ["CEO", "President", "Manager", "Director"],
        partyAddresses: ["Addr 1", "Addr 2", "Addr 3", "Addr 4"],
      });

      setConsumedPaidProSignerMetadataAuthority(authority);

      const consumed = readConsumedPaidProSignerMetadataAuthority();
      expect(consumed!.parties.length).toBe(4);
      expect(consumed!.parties[3].signerName).toBe("Signer Four");
      expect(consumed!.parties[3].signerTitle).toBe("Director");
    });
  });

  describe("intake wiring verification", () => {
    it("AgreementBuilderIntake wires finalizePaidProSignerMetadataAndOpenReviewDecision", () => {
      const intakeSrc = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

      expect(intakeSrc).toContain("const finalizePaidProSignerMetadataAndOpenReviewDecision");
      expect(intakeSrc).toContain("writePremiumRecipientHandoffFromAuthorityParties");
      expect(intakeSrc).toContain("setConsumedPaidProSignerMetadataAuthority");
      expect(intakeSrc).toContain("createAuthoritativeSigningSnapshot");
    });

    it("AgreementBuilderIntake wires handleGuidedBackToSignerDetailsFromFinalReview", () => {
      const intakeSrc = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

      expect(intakeSrc).toContain("const handleGuidedBackToSignerDetailsFromFinalReview");
      expect(intakeSrc).toContain("resolvePaidProPostFinalizeSignerDetailsEditSeed");
      expect(intakeSrc).toContain("authorityPartiesToLiveSignerMetadataUi");
      expect(intakeSrc).toContain("beginPaidProPostFinalizeSignerDetailsReopen");
    });

    it("AgreementBuilderIntake wires handleSaveProFinalReviewPlainEdits", () => {
      const intakeSrc = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

      expect(intakeSrc).toContain("const handleSaveProFinalReviewPlainEdits");
      expect(intakeSrc).toContain("commitPaidProUserApprovedRevision");
      expect(intakeSrc).toContain("setPaidProPinnedSignerAppliedCorpus");
    });

    it("SimpleProFinalReviewScreen receives signerSavedMappings prop", () => {
      const intakeSrc = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
      const reviewScreenSrc = readFileSync(join(__dirname, "SimpleProFinalReviewScreen.tsx"), "utf8");

      expect(intakeSrc).toContain("signerSavedMappings={paidProSignerSavedMappings}");
      expect(reviewScreenSrc).toContain("signerSavedMappings");
    });

    it("SimpleProFinalReviewScreen has onBackToSignerDetails prop wired", () => {
      const intakeSrc = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
      const reviewScreenSrc = readFileSync(join(__dirname, "SimpleProFinalReviewScreen.tsx"), "utf8");

      expect(intakeSrc).toContain("onBackToSignerDetails={handleGuidedBackToSignerDetailsFromFinalReview}");
      expect(reviewScreenSrc).toContain("onBackToSignerDetails");
    });

    it("paidProSignerSavedMappings reads from consumed authority", () => {
      const intakeSrc = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

      const mappingsBlock = intakeSrc.indexOf("const paidProSignerSavedMappings = useMemo");
      expect(mappingsBlock).toBeGreaterThan(0);
      
      const blockEnd = intakeSrc.indexOf("}, [", mappingsBlock);
      const blockContent = intakeSrc.slice(mappingsBlock, blockEnd);
      expect(blockContent).toContain("readConsumedPaidProSignerMetadataAuthority");
    });
  });
});
