import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  entitiesMatchForSignerMetadata,
  extractSignerMetadataFromIntake,
  extractSignerMetadataFromIntakeNaturalLanguage,
  hydrateSignerMetadataArraysNonDestructive,
  mergeSignerMetadataIntoDraftParties,
  resolveUniversalSignerMetadataBySlot,
  resetSignerMetadataLossDetectionBaseline,
} from "./universalSignerMetadataAuthority";
import { runPaidProSignerMetadataAuthoritySeed } from "./paidProSignerMetadataSeed";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import { persistPremiumRecipientHandoff } from "./premiumPartyNamesHandoff";

const BLUE = "Blue Canyon Analytics LLC";
const IRON = "Iron Vale Systems Inc";

describe("universalSignerMetadataAuthority", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    resetSignerMetadataLossDetectionBaseline();
    vi.stubEnv("VITE_PAID_PRO_SIGNER_METADATA_DEBUG", "1");
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
    vi.unstubAllEnvs();
  });

  it("matches entity names across suffix and punctuation variants", () => {
    expect(entitiesMatchForSignerMetadata("Iron Vale Systems Inc", "Iron Vale Systems Inc.")).toBe(true);
    expect(entitiesMatchForSignerMetadata("Blue Canyon Analytics LLC", "Blue Canyon Analytics, LLC")).toBe(
      true,
    );
    expect(entitiesMatchForSignerMetadata(BLUE, IRON)).toBe(false);
  });

  it("extracts natural-language signer instructions per entity", () => {
    const intake = [
      `Signer for ${BLUE} is Anthem H Blanchard, Manager.`,
      `Jim Summit, CEO, will sign for ${IRON}.`,
    ].join("\n");
    const hits = extractSignerMetadataFromIntakeNaturalLanguage(intake);
    expect(hits.some((h) => h.entity.includes("Blue Canyon") && h.signerName === "Anthem H Blanchard")).toBe(
      true,
    );
    expect(hits.some((h) => h.entity.includes("Iron Vale") && h.signerName === "Jim Summit")).toBe(true);
  });

  it("resolves multiple entities with different signers from intake", () => {
    const intake = `Signer for ${BLUE} is Alice One, VP.\nSigner for ${IRON} is Bob Two, Director.`;
    const resolved = resolveUniversalSignerMetadataBySlot({
      legalEntities: [BLUE, IRON],
      intakeText: intake,
    });
    expect(resolved[0]?.signerName).toBe("Alice One");
    expect(resolved[0]?.signerTitle).toBe("VP");
    expect(resolved[1]?.signerName).toBe("Bob Two");
    expect(resolved[1]?.signerTitle).toBe("Director");
  });

  it("preserves user UI overrides during hydration", () => {
    const resolved = resolveUniversalSignerMetadataBySlot({
      legalEntities: [BLUE, IRON],
      intakeText: `Signer for ${IRON} is From Intake, CEO`,
      uiSignerNames: ["User Kept Name", ""],
      uiSignerTitles: ["", ""],
    });
    const out = hydrateSignerMetadataArraysNonDestructive({
      currentNames: ["User Kept Name", ""],
      currentTitles: ["", ""],
      resolved,
      stage: "test_user_override",
    });
    expect(out.names[0]).toBe("User Kept Name");
    expect(out.names[1]).toBe("From Intake");
    expect(out.preservedUserEdits).toBe(true);
  });

  it("hydrates from draft party fields when intake is silent", () => {
    const resolved = resolveUniversalSignerMetadataBySlot({
      legalEntities: [BLUE, IRON],
      draftParties: [
        { name: BLUE, signerName: "Draft Signer A", signerTitle: "Mgr" },
        { name: IRON, signerName: "Draft Signer B", signerTitle: "CEO" },
      ],
    });
    expect(resolved[0]?.signerName).toBe("Draft Signer A");
    expect(resolved[1]?.signerTitle).toBe("CEO");
  });

  it("reads persisted handoff signer metadata on review-link path", () => {
    persistPremiumRecipientHandoff({
      party1: { name: BLUE, email: "a@test.com", role: "party", signerName: "Handoff A", signerTitle: "T1" },
      party2: { name: IRON, email: "b@test.com", role: "party", signerName: "Handoff B", signerTitle: "T2" },
    });
    const resolved = resolveUniversalSignerMetadataBySlot({
      legalEntities: [BLUE, IRON],
      handoff: {
        v: 2,
        savedAt: Date.now(),
        party1: {
          name: BLUE,
          email: "a@test.com",
          role: "party",
          signerName: "Handoff A",
          signerTitle: "T1",
        },
        party2: {
          name: IRON,
          email: "b@test.com",
          role: "party",
          signerName: "Handoff B",
          signerTitle: "T2",
        },
      },
    });
    expect(resolved[0]?.signerName).toBe("Handoff A");
    expect(resolved[1]?.signerName).toBe("Handoff B");
  });

  it("authoritative snapshot outranks intake inference", () => {
    createAuthoritativeSigningSnapshot({
      corpus: "x".repeat(600),
      signerMetadata: {
        recipient1Name: BLUE,
        recipient2Name: IRON,
        recipient1Email: "a@test.com",
        recipient2Email: "b@test.com",
        extraPartyReviewEmails: [],
        partyAddresses: [],
        partySignerNames: ["Snapshot A", "Snapshot B"],
        partySignerTitles: ["SA", "SB"],
      },
      partyManifest: {
        parties: [
          {
            index: 0,
            role: "client",
            partyName: BLUE,
            email: "a@test.com",
            signerName: "Snapshot A",
            signerTitle: "SA",
            roleLabel: "Client",
            signerKind: "entity_representative",
            isSenderSide: true,
            isIndividual: false,
          },
          {
            index: 1,
            role: "service_provider",
            partyName: IRON,
            email: "b@test.com",
            signerName: "Snapshot B",
            signerTitle: "SB",
            roleLabel: "Service Provider",
            signerKind: "entity_representative",
            isSenderSide: false,
            isIndividual: false,
          },
        ],
      },
      signatureBlockModel: { signFirst: true, entries: [] },
    });
    const resolved = resolveUniversalSignerMetadataBySlot({
      legalEntities: [BLUE, IRON],
      intakeText: `Signer for ${BLUE} is Intake Only, CEO`,
    });
    expect(resolved[0]?.signerName).toBe("Snapshot A");
    expect(resolved[0]?.source).toBe("authoritative_snapshot");
  });

  it("mergeSignerMetadataIntoDraftParties is non-destructive for existing draft values", () => {
    const draft = {
      parties: [
        { name: BLUE, signerName: "Existing A", signerTitle: "Keep" },
        { name: IRON, signerName: "", signerTitle: "" },
      ],
    };
    const merged = mergeSignerMetadataIntoDraftParties(draft, [
      { entity: BLUE, signerName: "Intake A", signerTitle: "X", source: "intake_natural_language", authorityRank: 6 },
      { entity: IRON, signerName: "New B", signerTitle: "CEO", source: "intake_natural_language", authorityRank: 6 },
    ]);
    expect(merged.parties![0].signerName).toBe("Existing A");
    expect(merged.parties![1].signerName).toBe("New B");
  });

  it("runPaidProSignerMetadataAuthoritySeed fills empty UI from intake", () => {
    const seed = runPaidProSignerMetadataAuthoritySeed({
      stage: "sot_adoption",
      legalEntities: [BLUE, IRON],
      intakeText: `Authorized signer for ${BLUE} is Pat Lee, Member.`,
      uiSignerNames: ["", ""],
      uiSignerTitles: ["", ""],
      draft: {
        title: "MSA",
        parties: [{ name: BLUE, role: "party" }, { name: IRON, role: "party" }],
      } as Parameters<typeof runPaidProSignerMetadataAuthoritySeed>[0]["draft"],
    });
    expect(seed.uiChanged).toBe(true);
    expect(seed.names[0]).toBe("Pat Lee");
    expect(seed.draftChanged).toBe(true);
    expect((seed.draft?.parties?.[0] as { signerName?: string })?.signerName).toBe("Pat Lee");
  });

  it("extractSignerMetadataFromIntake logs structured extract shape", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    extractSignerMetadataFromIntake(`Signer for ${IRON} is Sam Rivera, President.`);
    expect(spy).toHaveBeenCalledWith(
      "[signer-metadata-intake-extract]",
      expect.objectContaining({
        extractedNames: expect.arrayContaining(["Sam Rivera"]),
        matchedEntities: expect.arrayContaining([expect.stringMatching(/Iron Vale/i)]),
      }),
    );
    spy.mockRestore();
  });
});
