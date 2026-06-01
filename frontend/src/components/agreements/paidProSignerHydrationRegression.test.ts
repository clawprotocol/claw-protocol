import { afterEach, describe, expect, it } from "vitest";
import {
  buildCanonicalPaidProServicesOpeningRecital,
  PAID_PRO_MUTUAL_CONSULTING_TITLE,
} from "./paidProOpeningRecitalGuard";
import {
  repairCanonicalPartyIdentityInCorpus,
  repairMalformedAgreementOpeningPhrases,
  resolveCanonicalPartyIdentitiesFromIntake,
} from "./canonicalPartyIdentityResolver";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import { resolveCanonicalFinalPartyManifest } from "./guidedDealCompletion/canonicalFinalPartyManifest";
import { authorityPartiesToRecipientMetadata } from "./paidProSignerMetadataAuthority";
import {
  applyPaidProReviewRenderSanitizer,
  stripTrailingLegacyEntitySignatureLines,
} from "./paidProReviewRenderCorpus";
import {
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
  getAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import {
  clearPaidProPinnedSignerAppliedCorpus,
  readPaidProPinnedSignerAppliedCorpus,
} from "./paidProFinalHydratedCorpus";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProDocumentForSurface,
  getPaidProSourceOfTruth,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { resolvePaidProSignerDetailsGate } from "./signerSetupPartyIdentity";

const CLIENT = "Blue Canyon Analytics LLC";
const PROVIDER = "Iron Vale Systems Inc";

const INTAKE = `between ${CLIENT} and ${PROVIDER}`;

function mutualConsultingCorpus(): string {
  const records = resolveCanonicalPartyIdentitiesFromIntake(INTAKE, [CLIENT, PROVIDER])!;
  const opening = buildCanonicalPaidProServicesOpeningRecital(records[0]!, records[1]!);
  return [
    opening.trimEnd(),
    "",
    "1. Scope. Services as described in the Statement of Work.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    "CLIENT:",
    CLIENT,
    "By: __________________________",
    "Name: __________________________",
    "Title: __________________________",
    "",
    "SERVICE PROVIDER:",
    PROVIDER,
    "By: __________________________",
    "Name: __________________________",
    "Title: __________________________",
    "",
    `${CLIENT} Signature: ___________________ Date: ____`,
    `${PROVIDER}. Signature: ___________________ Date: ____`,
  ].join("\n");
}

function signerAuthority() {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: CLIENT,
    recipient2Name: PROVIDER,
    recipient1Email: "client@example.com",
    recipient2Email: "provider@example.com",
    extraPartyReviewEmails: [],
    partySignerNames: ["Avery Client", "Morgan Provider"],
    partySignerTitles: ["Manager", "CEO"],
    partyAddresses: ["100 Main St", "200 Oak Ave"],
  });
}

describe("paidProSignerHydrationRegression", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
    clearAuthoritativeSigningSnapshot();
    clearPaidProPinnedSignerAppliedCorpus();
  });

  it("post-signer hydration preserves by and between opening recital", () => {
    const corpus = mutualConsultingCorpus();
    const records = resolveCanonicalPartyIdentitiesFromIntake(INTAKE, [CLIENT, PROVIDER])!;
    const partyRepair = repairCanonicalPartyIdentityInCorpus(corpus, records, { intakeRaw: INTAKE });
    expect(partyRepair.text).toMatch(/by and between/i);
    expect(partyRepair.text).not.toMatch(/Effective Date This Agreement is between/i);

    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: partyRepair.text,
      authority: signerAuthority(),
      intakeRaw: INTAKE,
      surface: "regression_hydrate",
      signatureRegionOnly: true,
      repairRecital: false,
    });
    expect(hydrated.rejected).toBe(false);
    expect(hydrated.corpus).toMatch(/by and between/i);
    expect(hydrated.corpus).toMatch(/collectively as the ["']Parties/i);
    expect(hydrated.corpus).not.toMatch(/Effective Date This Agreement is between/i);
  });

  it("repairMalformedAgreementOpeningPhrases fixes fused Effective Date This Agreement is between", () => {
    const broken = [
      PAID_PRO_MUTUAL_CONSULTING_TITLE,
      "",
      `This Mutual Consulting and Implementation Agreement (this "Agreement") is entered into as of the Effective Date This Agreement is between ${CLIENT} ("Client") and ${PROVIDER} ("Service Provider").`,
      "",
      "1. Scope.",
    ].join("\n");
    const { text } = repairMalformedAgreementOpeningPhrases(broken);
    expect(text).toMatch(/Effective Date by and between/i);
    expect(text).not.toMatch(/Effective Date This Agreement is between/i);
  });

  it("strips trailing Entity Signature Date lines from review copy and export surfaces", () => {
    const corpus = mutualConsultingCorpus();
    establishPaidProSourceOfTruth({ text: corpus, source: "server_full_draft" });
    setConsumedPaidProSignerMetadataAuthority(signerAuthority());
    const stripped = stripTrailingLegacyEntitySignatureLines(corpus);
    expect(stripped.removed).toBe(2);
    expect(stripped.text).not.toMatch(/Signature:\s*_{2,}\s*Date:\s*_{2,}/i);

    const sanitized = applyPaidProReviewRenderSanitizer(corpus, signerAuthority().parties).text;
    expect(sanitized).not.toMatch(new RegExp(`${CLIENT.replace(/\./g, "\\.")}\\s+Signature:`));
    expect(sanitized).not.toMatch(new RegExp(`${PROVIDER.replace(/\./g, "\\.")}\\s+Signature:`));

    const review = resolvePaidProReviewRenderPlain();
    const copy = getPaidProDocumentForSurface("copy")!.text;
    const display = getPaidProDocumentForSurface("display")!.text;
    const finalized = getPaidProDocumentForSurface("finalized")!.text;
    for (const surface of [review, copy, display, finalized]) {
      expect(surface).not.toMatch(/(?:LLC|Inc\.?)\s+Signature:\s*_/i);
    }
  });

  it("typing one Party 2 signer character does not mutate paid Pro authority stores", () => {
    const corpus = mutualConsultingCorpus();
    const record = establishPaidProSourceOfTruth({ text: corpus, source: "server_full_draft" });
    const manifest = resolveCanonicalFinalPartyManifest({
      partyCount: 2,
      partySignerNames: ["Avery Client", ""],
      partySignerTitles: ["Manager", ""],
      recipient1Name: CLIENT,
      recipient2Name: PROVIDER,
      recipient1Email: "client@example.com",
      recipient2Email: "",
      extraPartyReviewEmails: [],
      draftPartyNames: [CLIENT, PROVIDER],
      sendMode: "signature",
      recipientsDeferred: false,
    });
    const meta = authorityPartiesToRecipientMetadata(
      buildLivePaidProSignerMetadataAuthority({
        partyCount: 2,
        recipient1Name: CLIENT,
        recipient2Name: PROVIDER,
        recipient1Email: "client@example.com",
        recipient2Email: "",
        extraPartyReviewEmails: [],
        partySignerNames: ["Avery Client", ""],
        partySignerTitles: ["Manager", ""],
        partyAddresses: ["", ""],
      }).parties,
    );
    createAuthoritativeSigningSnapshot({
      corpus,
      signerMetadata: meta,
      partyManifest: manifest,
      signatureBlockModel: { signFirst: true, entries: [] },
    });
    const sotHashBefore = record.hash;
    const pinBefore = readPaidProPinnedSignerAppliedCorpus();
    const snapBefore = getAuthoritativeSigningSnapshot()?.hash ?? "";
    const reviewBefore = resolvePaidProReviewRenderPlain();

    resolvePaidProSignerDetailsGate({
      partyCount: 2,
      draftPartyNames: [CLIENT, PROVIDER],
      partySignerNames: ["Avery Client", "M"],
      recipient1Name: CLIENT,
      recipient2Name: PROVIDER,
      recipient1Email: "client@example.com",
      recipient2Email: "",
      extraPartyReviewEmails: [],
    });

    expect(getPaidProSourceOfTruth()?.hash).toBe(sotHashBefore);
    expect(hashPaidProCorpus(getPaidProSourceOfTruth()?.text ?? "")).toBe(sotHashBefore);
    expect(readPaidProPinnedSignerAppliedCorpus()).toBe(pinBefore);
    expect(getAuthoritativeSigningSnapshot()?.hash).toBe(snapBefore);
    expect(resolvePaidProReviewRenderPlain()).toBe(reviewBefore);
  });
});
