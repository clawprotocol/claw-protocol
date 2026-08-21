import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { canonicalizeStarterDraftForReview } from "./starterRecipientDraftMerge";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import { runPaidProSignerMetadataAuthoritySeed } from "./paidProSignerMetadataSeed";
import { clearConsumedPaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import {
  resetSignerMetadataLossDetectionBaseline,
  resolveUniversalSignerMetadataBySlotForCanonicalSeed,
} from "./universalSignerMetadataAuthority";
import {
  clearPremiumPartyNamesHandoff,
  resetPremiumRecipientHandoffDedupForTests,
} from "./premiumPartyNamesHandoff";
import { resetCanonicalPartyMetadataDiagnosticsForTests } from "./canonicalPartyMetadataAuthority";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const EMPTY_PAYMENT = { amount: null, cadence: null, valid: false } as const;

function emptyDraft(): ParsedDraftShape {
  return {
    title: "",
    jurisdiction: "TBD",
    parties: [],
    purpose: "",
    payment_terms: "",
    duration: null,
    due_date: null,
    effective_date: null,
    payment: EMPTY_PAYMENT,
  };
}

function paintDraft(dump: string): ParsedDraftShape {
  return canonicalizeStarterDraftForReview(
    runIntakeDefaultsAndRoles(emptyDraft(), dump, true, defaultIntakePartyRoleLabels()),
  );
}

function resolveFromDraft(dump: string, draft: ParsedDraftShape) {
  const legalEntities = (draft.parties || []).map((p) => String(p.name || "").trim()).filter(Boolean);
  return {
    legalEntities,
    resolved: resolveUniversalSignerMetadataBySlotForCanonicalSeed({
      legalEntities,
      intakeText: dump,
      draftParties: draft.parties,
      uiSignerNames: [],
      uiSignerTitles: [],
    }),
  };
}

const ROLE_OR_FAKE = /^(client|service provider|party\s*[ab]|party\s*\d+)$/i;

describe("first Pro signer seed from draft.parties", () => {
  beforeEach(() => {
    resetSignerMetadataLossDetectionBaseline();
    clearConsumedPaidProSignerMetadataAuthority();
    resetCanonicalPartyMetadataDiagnosticsForTests();
    clearPremiumPartyNamesHandoff();
    resetPremiumRecipientHandoffDedupForTests();
  });

  afterEach(() => {
    resetPremiumRecipientHandoffDedupForTests();
    resetCanonicalPartyMetadataDiagnosticsForTests();
    clearPremiumPartyNamesHandoff();
    clearConsumedPaidProSignerMetadataAuthority();
    vi.unstubAllGlobals();
  });

  it("Mike paint → one signer named Mike (service_provider); other slot empty, not Client", () => {
    const dump = "I hired Mike to paint my office. We shook on it.";
    const draft = paintDraft(dump);
    expect(draft.parties.map((p) => ({ name: p.name, role: p.role }))).toEqual([
      { name: "Client", role: "client" },
      { name: "Mike", role: "service_provider" },
    ]);
    const { resolved } = resolveFromDraft(dump, draft);
    const names = resolved.map((r) => r.signerName);
    expect(names.length).toBeGreaterThanOrEqual(2);
    expect(names.length).toBeLessThanOrEqual(4);
    expect(names).toContain("Mike");
    expect(names.filter((n) => n.trim() === "Mike")).toHaveLength(1);
    expect(names.some((n) => ROLE_OR_FAKE.test(n.trim()))).toBe(false);
    expect(names.some((n) => /I hired Mike/i.test(n))).toBe(false);
    expect(draft.parties.find((p) => p.name === "Mike")?.role).toBe("service_provider");
  });

  it("Sarah wedding → signer Sarah", () => {
    const dump = "Sarah will photograph our wedding on June 12. We agreed $1800 cash.";
    const draft = paintDraft(dump);
    expect(draft.parties.some((p) => p.name === "Sarah")).toBe(true);
    const names = resolveFromDraft(dump, draft).resolved.map((r) => r.signerName);
    expect(names).toContain("Sarah");
    expect(names.some((n) => ROLE_OR_FAKE.test(n.trim()))).toBe(false);
  });

  it("Jordan NDA → signer Jordan", () => {
    const dump = "nda between me and Jordan about the app idea";
    const draft = paintDraft(dump);
    expect(draft.parties.some((p) => p.name === "Jordan")).toBe(true);
    const names = resolveFromDraft(dump, draft).resolved.map((r) => r.signerName);
    expect(names).toContain("Jordan");
    expect(names.some((n) => ROLE_OR_FAKE.test(n.trim()))).toBe(false);
  });

  it("Red Mesa → Anthem + Red Mesa LLC as names", () => {
    const dump = "Consulting for Red Mesa LLC, I am Anthem, they pay monthly";
    const draft = paintDraft(dump);
    const partyNames = draft.parties.map((p) => p.name);
    expect(partyNames.some((n) => /Anthem/i.test(n))).toBe(true);
    expect(partyNames.some((n) => /Red Mesa/i.test(n))).toBe(true);
    const names = resolveFromDraft(dump, draft).resolved.map((r) => r.signerName);
    expect(names.some((n) => /Anthem/i.test(n))).toBe(true);
    expect(names.some((n) => /Red Mesa LLC/i.test(n))).toBe(true);
    expect(names.some((n) => /they\s+pay/i.test(n))).toBe(false);
  });

  it("fence unnamed → no fake person names; Client / Service Provider stay role-only", () => {
    const dump = "need someone to fix the broken fence";
    const draft = paintDraft(dump);
    expect(draft.parties.map((p) => ({ name: p.name, role: p.role }))).toEqual([
      { name: "Client", role: "client" },
      { name: "Service Provider", role: "service_provider" },
    ]);
    const names = resolveFromDraft(dump, draft).resolved.map((r) => r.signerName);
    expect(names.every((n) => !(n || "").trim() || ROLE_OR_FAKE.test(n.trim()))).toBe(true);
    expect(names.some((n) => /^(client|service provider)$/i.test((n || "").trim()))).toBe(false);
    expect(names.some((n) => /fence/i.test(n))).toBe(false);
  });

  it("does not seed the hire dump as Party 1 / a signer name", () => {
    const dump = "I hired Mike to paint my office. We shook on it.";
    const draft = paintDraft(dump);
    const names = resolveFromDraft(dump, draft).resolved.map((r) => r.signerName);
    const dumpAsName = /I hired Mike to paint/i;
    expect(draft.parties.some((p) => dumpAsName.test(p.name))).toBe(false);
    expect(names.some((n) => dumpAsName.test(n))).toBe(false);
    expect(names.some((n) => /^party\s*1$/i.test(n.trim()))).toBe(false);
  });

  it("runPaidProSignerMetadataAuthoritySeed hydrates Mike and leaves Client blank", () => {
    const storage = new Map<string, string>();
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
    const dump = "I hired Mike to paint my office. We shook on it.";
    const draft = paintDraft(dump);
    const legalEntities = (draft.parties || []).map((p) => String(p.name || "").trim()).filter(Boolean);
    const seed = runPaidProSignerMetadataAuthoritySeed({
      stage: "draft_parties_prefill",
      legalEntities,
      intakeText: dump,
      draft,
      uiSignerNames: [],
      uiSignerTitles: [],
      authoritativePartyCount: 2,
    });
    expect(seed.names).toContain("Mike");
    expect(seed.names.some((n) => /^(client|service provider)$/i.test(n.trim()))).toBe(false);
    expect(seed.emails.every((e) => !(e || "").trim())).toBe(true);
    expect(seed.names.length).toBeGreaterThanOrEqual(2);
    expect(seed.names.length).toBeLessThanOrEqual(4);
  });
});
