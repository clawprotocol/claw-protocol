import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertCanonicalPaidProSignerCtaReason,
  authorityPartiesToRecipientMetadata,
  buildLivePaidProSignerMetadataAuthority,
  buildSnapshotPaidProSignerMetadataAuthority,
  emitPaidProSignerMetadataFieldDiagnostics,
  isLegacyPaidProSignerCtaReason,
  paidProSignerMetadataParity,
  signerMetadataAuthorityDrifted,
} from "./paidProSignerMetadataAuthority";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
  fingerprintSigningSnapshot,
  getAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import { signerMetadataDriftedFromSnapshot } from "./authoritativeSignerHydration";
import { resolveCanonicalFinalPartyManifest } from "./guidedDealCompletion/canonicalFinalPartyManifest";
import { resolvePaidProStickyCta } from "./paidProStickyCta";
import { persistPremiumRecipientHandoff, readPremiumRecipientHandoff } from "./premiumPartyNamesHandoff";

const BLUE = "Blue Canyon Analytics LLC";
const IRON = "Iron Vale Systems Inc";

function ui(overrides: Partial<Parameters<typeof buildLivePaidProSignerMetadataAuthority>[0]> = {}) {
  return {
    partyCount: 2,
    recipient1Name: BLUE,
    recipient2Name: IRON,
    recipient1Email: "a@test.com",
    recipient2Email: "b@test.com",
    extraPartyReviewEmails: [] as string[],
    partySignerNames: ["Signer A", "Signer B"],
    partySignerTitles: ["Mgr", "CEO"],
    partyAddresses: ["100 Main St", "200 Oak Ave"],
    ...overrides,
  };
}

describe("paidProSignerMetadataAuthority", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
    });
  });

  afterEach(() => {
    clearAuthoritativeSigningSnapshot();
    storage.clear();
    vi.unstubAllGlobals();
  });

  it("sanitizes polluted legal entity prose before persisting authority parties", () => {
    const authority = buildLivePaidProSignerMetadataAuthority(
      ui({
        recipient1Name: "1 Parties. Blue Canyon Analytics LLC",
        recipient2Name: "engages Iron Vale Systems Inc",
      }),
    );
    expect(authority.parties[0]?.partyLegalName).toBe(BLUE);
    expect(authority.parties[1]?.partyLegalName).toBe(IRON);
  });

  it("every field contributes to authority hash", () => {
    const base = buildLivePaidProSignerMetadataAuthority(ui());
    const fields = [
      () => ui({ recipient1Name: "Changed Legal LLC" }),
      () => ui({ recipient1Email: "other@test.com" }),
      () => ui({ partySignerNames: ["X", "Signer B"] }),
      () => ui({ partySignerTitles: ["VP", "CEO"] }),
      () => ui({ partyAddresses: ["999 New Rd", "200 Oak Ave"] }),
    ] as const;
    for (const nextUi of fields) {
      const next = buildLivePaidProSignerMetadataAuthority(nextUi());
      expect(next.hash).not.toBe(base.hash);
    }
  });

  it("legal entity and address edits trigger drift against snapshot", () => {
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
    const meta = authorityPartiesToRecipientMetadata(buildLivePaidProSignerMetadataAuthority(ui()).parties);
    createAuthoritativeSigningSnapshot({
      corpus: "corpus",
      signerMetadata: meta,
      partyManifest: manifest,
      signatureBlockModel: { signFirst: true, entries: [] },
    });
    const snap = getAuthoritativeSigningSnapshot()!;
    expect(
      signerMetadataDriftedFromSnapshot(snap, {
        ...meta,
        recipient1Name: "Other Legal LLC",
      }),
    ).toBe(true);
    expect(
      signerMetadataDriftedFromSnapshot(snap, {
        ...meta,
        partyAddresses: ["999 Main", "200 Oak Ave"],
      }),
    ).toBe(true);
  });

  it("snapshot signing fingerprint changes when any field changes before finalize", () => {
    const manifest = resolveCanonicalFinalPartyManifest({
      partyCount: 2,
      partySignerNames: ["A", "B"],
      partySignerTitles: ["", ""],
      recipient1Name: BLUE,
      recipient2Name: IRON,
      recipient1Email: "a@test.com",
      recipient2Email: "b@test.com",
      extraPartyReviewEmails: [],
      draftPartyNames: [BLUE, IRON],
      sendMode: "signature",
      recipientsDeferred: false,
    });
    const meta1 = authorityPartiesToRecipientMetadata(buildLivePaidProSignerMetadataAuthority(ui()).parties);
    const snap1 = createAuthoritativeSigningSnapshot({
      corpus: "corpus-one",
      signerMetadata: meta1,
      partyManifest: manifest,
      signatureBlockModel: { signFirst: true, entries: [] },
    });
    clearAuthoritativeSigningSnapshot();
    const meta2 = authorityPartiesToRecipientMetadata(
      buildLivePaidProSignerMetadataAuthority(ui({ partySignerTitles: ["CEO", "CEO"] })).parties,
    );
    const snap2 = createAuthoritativeSigningSnapshot({
      corpus: "corpus-two",
      signerMetadata: meta2,
      partyManifest: manifest,
      signatureBlockModel: { signFirst: true, entries: [] },
    });
    expect(fingerprintSigningSnapshot(snap1)).not.toBe(fingerprintSigningSnapshot(snap2));
  });

  it("frozen snapshot hash stable when live UI drifts after finalize", () => {
    const manifest = resolveCanonicalFinalPartyManifest({
      partyCount: 2,
      partySignerNames: ["A", "B"],
      partySignerTitles: ["", ""],
      recipient1Name: BLUE,
      recipient2Name: IRON,
      recipient1Email: "a@test.com",
      recipient2Email: "b@test.com",
      extraPartyReviewEmails: [],
      draftPartyNames: [BLUE, IRON],
      sendMode: "signature",
      recipientsDeferred: false,
    });
    const meta = authorityPartiesToRecipientMetadata(buildLivePaidProSignerMetadataAuthority(ui()).parties);
    const snap = createAuthoritativeSigningSnapshot({
      corpus: "frozen",
      signerMetadata: meta,
      partyManifest: manifest,
      signatureBlockModel: { signFirst: true, entries: [] },
    });
    const fpBefore = fingerprintSigningSnapshot(snap);
    const driftedLive = buildLivePaidProSignerMetadataAuthority(
      ui({ partySignerNames: ["Mutated", "B"], recipient1Email: "x@y.com" }),
    );
    const frozenAuth = buildSnapshotPaidProSignerMetadataAuthority()!;
    expect(signerMetadataAuthorityDrifted(frozenAuth, driftedLive)).toBe(true);
    expect(getAuthoritativeSigningSnapshot()?.hash).toBe(snap.hash);
    expect(fingerprintSigningSnapshot(getAuthoritativeSigningSnapshot()!)).toBe(fpBefore);
  });

  it("partyAddress persists through handoff", () => {
    persistPremiumRecipientHandoff({
      party1: { name: BLUE, partyAddress: "100 Main St" },
      party2: { name: IRON, partyAddress: "200 Oak Ave" },
    });
    const ho = readPremiumRecipientHandoff();
    expect(ho?.party1.partyAddress).toBe("100 Main St");
    expect(ho?.party2.partyAddress).toBe("200 Oak Ave");
  });

  it("canonical sticky CTA never uses legacy paid Pro reasons", () => {
    const state = resolvePaidProStickyCta({
      hasAuthoritativeSigningSnapshot: false,
      signerDetailsComplete: true,
      inlineSignerSetupLatched: true,
      signaturePreparationRequested: false,
      sendSurfaceReady: false,
    });
    expect(isLegacyPaidProSignerCtaReason(state.reason)).toBe(false);
    expect(state.phase).toBe("signer_details_complete");
    expect(
      assertCanonicalPaidProSignerCtaReason({
        reason: "guided_final_review_hidden",
        canonicalSignerFlowActive: true,
      }),
    ).toBe("paid_pro_signer_details_required");
  });

  it("live and snapshot parity when metadata matches", () => {
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
    const live = buildLivePaidProSignerMetadataAuthority(ui());
    const meta = authorityPartiesToRecipientMetadata(live.parties);
    createAuthoritativeSigningSnapshot({
      corpus: "corpus",
      signerMetadata: meta,
      partyManifest: manifest,
      signatureBlockModel: { signFirst: true, entries: [] },
    });
    const snapAuth = buildSnapshotPaidProSignerMetadataAuthority();
    const parity = paidProSignerMetadataParity({ live, snapshot: snapAuth });
    expect(parity.ok).toBe(true);
  });

  it("unified field diagnostics callable for all five fields", () => {
    const fields = [
      "partyLegalName",
      "signerEmail",
      "signerName",
      "signerTitle",
      "partyAddress",
    ] as const;
    for (const field of fields) {
      expect(() =>
        emitPaidProSignerMetadataFieldDiagnostics({
          partyIndex: 0,
          field,
          raw: "x",
          inputEventKind: "change",
          surface: "test",
        }),
      ).not.toThrow();
    }
  });
});
