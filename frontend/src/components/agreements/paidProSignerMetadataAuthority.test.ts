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
import { prepareReviewEmailPartyRowsForServer } from "../../launch/simpleProduct/reviewEmailPartyRoles";
import type { AgreementDraft } from "../../agreement/agreementTypes";

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

  it("does not let PARTIES AND ROLES steal Lumen's signer contact", () => {
    const lumen = "Lumen Bioinformatics Inc.";
    const thalassa = "Thalassa Data Systems LLC";
    const coastal = "Coastal Meridian Analytics LLC";
    const vanguard = "Vanguard Regulatory Sciences Ltd.";
    const authority = buildLivePaidProSignerMetadataAuthority(
      {
        partyCount: 4,
        recipient1Name: "PARTIES AND ROLES",
        recipient2Name: lumen,
        recipient1Email: "elena.vasquez@lumenbio.com",
        recipient2Email: "marcus.webb@thalassadata.com",
        extraPartyLegalNames: [coastal, vanguard],
        extraPartyReviewEmails: ["priya.nair@coastalmeridian.com", "james.osullivan@vanguardregulatory.co"],
        partySignerNames: ["Dr. Elena Vasquez", "Marcus Webb", "Priya Nair", "James O'Sullivan"],
        partySignerTitles: ["Chief Science Officer", "President", "Vice President of Operations", "Managing Director"],
        partyAddresses: ["", "", "", ""],
      },
      "live_ui",
      {
        preferCompleteUiLegalEntityAuthority: true,
        draftPartyNames: [lumen, thalassa, coastal, vanguard],
      },
    );
    expect(authority.parties.map((party) => party.partyLegalName)).toEqual([
      lumen,
      thalassa,
      coastal,
      vanguard,
    ]);
    expect(authority.parties[0]).toMatchObject({
      signerName: "Dr. Elena Vasquez",
      signerEmail: "elena.vasquez@lumenbio.com",
    });
    expect(authority.parties[1]).toMatchObject({
      signerName: "Marcus Webb",
      signerEmail: "marcus.webb@thalassadata.com",
    });
  });

  it("keeps an added individual draft party when UI slots duplicate Ironvale", () => {
    const harbor = "Harbor Peak Analytics LLC";
    const ironvale = "Ironvale Manufacturing Inc.";
    const authority = buildLivePaidProSignerMetadataAuthority(
      {
        partyCount: 3,
        recipient1Name: harbor,
        recipient2Name: ironvale,
        recipient1Email: "pat.harbor@harbor.test",
        recipient2Email: "sam.ironvale@ironvale.test",
        extraPartyReviewEmails: ["sam.ironvale@ironvale.test"],
        extraPartyLegalNames: [ironvale],
        partySignerNames: ["Pat Harbor", "Sam Ironvale", "Alex Rivera"],
        partySignerTitles: ["", "", ""],
        partyAddresses: ["", "", ""],
      },
      "live_ui",
      {
        preferCompleteUiLegalEntityAuthority: true,
        draftPartyNames: [harbor, ironvale, "Alex Rivera"],
      },
    );
    expect(authority.parties.map((party) => party.partyLegalName)).toEqual([
      harbor,
      ironvale,
      "Alex Rivera",
    ]);
    expect(authority.parties[2]?.signerName).toBe("Alex Rivera");
  });

  it("keeps durable persisted membership when intake still names discarded parties", () => {
    const harbor = "Harbor Peak Analytics LLC";
    const ironvale = "Ironvale Manufacturing Inc.";
    const authority = buildLivePaidProSignerMetadataAuthority(
      ui({
        partyCount: 2,
        recipient1Name: harbor,
        recipient2Name: ironvale,
      }),
      "live_ui",
      {
        intakeText:
          "Harbor Peak Analytics LLC and Ironvale Manufacturing Inc. are the parties. " +
          "Stale Third LLC and Stale Fourth LLC were mentioned in earlier intake text.",
        draftPartyNames: [harbor, ironvale],
        persistedMembershipAuthoritative: true,
      },
    );

    expect(authority.parties.map((party) => party.partyLegalName)).toEqual([harbor, ironvale]);
  });

  it("does not copy a sibling signer onto Advisor when local slots duplicate Ironvale", () => {
    const serverDraft = {
      parties: [
        { id: "p1", name: "Harbor Peak Analytics LLC", role: "Consultant", signerName: "Pat Harbor", email: "pat.harbor@harbor.test" },
        { id: "p2", name: "Ironvale Manufacturing Inc.", role: "Client", signerName: "Sam Ironvale", email: "sam.ironvale@ironvale.test" },
        { id: "p3", name: "Alex Rivera", role: "Advisor", email: "alex.rivera@advisor.test" },
      ],
    } as AgreementDraft;
    const localDraft = {
      parties: [
        { id: "p1", name: "Harbor Peak Analytics LLC", role: "Consultant", signerName: "Pat Harbor", email: "pat.harbor@harbor.test" },
        { id: "p2", name: "Ironvale Manufacturing Inc.", role: "Client", signerName: "Sam Ironvale", email: "sam.ironvale@ironvale.test" },
        { id: "p2-dup", name: "Ironvale Manufacturing Inc.", role: "party", signerName: "Sam Ironvale", email: "sam.ironvale@ironvale.test" },
      ],
    } as AgreementDraft;
    const out = prepareReviewEmailPartyRowsForServer(serverDraft, localDraft);
    expect(out.map((party) => party.name)).toEqual([
      "Harbor Peak Analytics LLC",
      "Ironvale Manufacturing Inc.",
      "Alex Rivera",
    ]);
    expect(out.find((party) => party.name === "Alex Rivera")?.role).toBe("Advisor");
    expect(out.find((party) => party.name === "Alex Rivera")?.signerName).toBeFalsy();
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
