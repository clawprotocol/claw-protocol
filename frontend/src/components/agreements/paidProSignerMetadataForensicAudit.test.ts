import { afterEach, describe, expect, it } from "vitest";
import {
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import {
  buildCtaForensicEvaluation,
  collectSignerMetadataFieldLineage,
  collectSignerMetadataForensicMatrix,
} from "./paidProSignerMetadataForensicAudit";
import { clearPaidProPinnedSignerAppliedCorpus } from "./paidProFinalHydratedCorpus";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import { resolveCanonicalFinalPartyManifest } from "./guidedDealCompletion/canonicalFinalPartyManifest";
import { resolvePaidProSignerDetailsGate } from "./signerSetupPartyIdentity";

const BLUE = "Blue Canyon Analytics LLC";
const IRON = "Iron Vale Systems Inc";

function baseLocal() {
  return {
    recipient1Name: BLUE,
    recipient2Name: IRON,
    recipient1Email: "a@test.com",
    recipient2Email: "b@test.com",
    partySignerNames: ["Signer A", "Signer B"],
    partySignerTitles: ["Mgr", "CEO"],
    partyAddresses: ["100 Main St", ""],
  };
}

describe("paidProSignerMetadataForensicAudit", () => {
  afterEach(() => {
    clearAuthoritativeSigningSnapshot();
    clearConsumedPaidProSignerMetadataAuthority();
    clearPaidProPinnedSignerAppliedCorpus();
  });

  it("collects local vs snapshot divergence for signer name", () => {
    const manifest = resolveCanonicalFinalPartyManifest({
      partyCount: 2,
      partySignerNames: ["Signer A", "Signer B"],
      partySignerTitles: ["Mgr", "CEO"],
      recipient1Name: BLUE,
      recipient2Name: IRON,
      recipient1Email: "a@test.com",
      recipient2Email: "b@test.com",
      extraPartyReviewEmails: [],
      draftPartyNames: [BLUE, IRON],
      sendMode: "signature",
      recipientsDeferred: false,
    });
    createAuthoritativeSigningSnapshot({
      corpus: "corpus",
      signerMetadata: {
        partySignerNames: ["Signer A", "Signer B"],
        partySignerTitles: ["Mgr", "CEO"],
        partyAddresses: ["100 Main St", ""],
        recipient1Name: BLUE,
        recipient2Name: IRON,
        recipient1Email: "a@test.com",
        recipient2Email: "b@test.com",
        extraPartyReviewEmails: [],
      },
      partyManifest: manifest,
      signatureBlockModel: { signFirst: true, entries: [] },
    });
    const row = collectSignerMetadataFieldLineage(
      {
        partyIndex: 1,
        local: { ...baseLocal(), partySignerNames: ["Signer A", "Changed"] },
      },
      "signerName",
    );
    expect(row.localValue).toBe("Changed");
    expect(row.snapshotValue).toBe("Signer B");
  });

  it("partyAddress reads from handoff and snapshot when wired", () => {
    const manifest = resolveCanonicalFinalPartyManifest({
      partyCount: 2,
      partySignerNames: ["Signer A", "Signer B"],
      partySignerTitles: ["Mgr", "CEO"],
      recipient1Name: BLUE,
      recipient2Name: IRON,
      recipient1Email: "a@test.com",
      recipient2Email: "b@test.com",
      extraPartyReviewEmails: [],
      draftPartyNames: [BLUE, IRON],
      sendMode: "signature",
      recipientsDeferred: false,
    });
    createAuthoritativeSigningSnapshot({
      corpus: "corpus",
      signerMetadata: {
        partySignerNames: ["Signer A", "Signer B"],
        partySignerTitles: ["Mgr", "CEO"],
        partyAddresses: ["100 Main St", ""],
        recipient1Name: BLUE,
        recipient2Name: IRON,
        recipient1Email: "a@test.com",
        recipient2Email: "b@test.com",
        extraPartyReviewEmails: [],
      },
      partyManifest: manifest,
      signatureBlockModel: { signFirst: true, entries: [] },
    });
    const row = collectSignerMetadataFieldLineage(
      { partyIndex: 0, local: baseLocal() },
      "partyAddress",
    );
    expect(row.localValue).toBe("100 Main St");
    expect(row.snapshotValue).toBe("100 Main St");
  });

  it("authoritativeValue equals local when consumed authority is promoted", () => {
    setConsumedPaidProSignerMetadataAuthority(
      buildLivePaidProSignerMetadataAuthority({
        partyCount: 2,
        recipient1Name: BLUE,
        recipient2Name: IRON,
        recipient1Email: "a@test.com",
        recipient2Email: "b@test.com",
        extraPartyReviewEmails: [],
        partySignerNames: ["Signer A", "Signer B"],
        partySignerTitles: ["Mgr", "CEO"],
        partyAddresses: ["100 Main St", "200 Oak"],
      }),
    );
    const row = collectSignerMetadataFieldLineage(
      { partyIndex: 1, local: baseLocal() },
      "signerName",
    );
    expect(row.localValue).toBe("Signer B");
    expect(row.authoritativeValue).toBe("Signer B");
    expect(row.authoritativeValue).toBe(row.localValue);
  });

  it("matrix covers all five fields for two parties", () => {
    const rows = collectSignerMetadataForensicMatrix({
      local: baseLocal(),
    });
    expect(rows).toHaveLength(10);
    expect(new Set(rows.map((r) => r.field)).size).toBe(5);
  });

  it("buildCtaForensicEvaluation lists gate blockers as missingFields", () => {
    const gate = resolvePaidProSignerDetailsGate({
      partyCount: 2,
      draftPartyNames: [BLUE, IRON],
      partySignerNames: ["", ""],
      recipient1Name: BLUE,
      recipient2Name: IRON,
      recipient1Email: "",
      recipient2Email: "b@test.com",
      extraPartyReviewEmails: [],
    });
    const eval_ = buildCtaForensicEvaluation({
      gate,
      stickyCta: null,
      evaluatedValues: { party0_signerName: null },
    });
    expect(eval_.missingFields.length).toBeGreaterThan(0);
    expect(eval_.sourceOfTruth).toBe("resolvePaidProSignerDetailsGate");
  });
});
