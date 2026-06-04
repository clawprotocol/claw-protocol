import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractBetweenPartyNameList } from "./partyBetweenParse";
import { applySimpleFlowSmartDefaults, type ParsedDraftShape } from "./intakeSmartDefaults";
import { parseIntakeToStructuredAgreement } from "./intakeStructuredAgreementModel";
import {
  BLUE_CANYON_QA_HOME_PROMPT,
  isContaminatedPartyLegalNameFromSignerInstruction,
  matchSignerForEntityIsClauses,
  stripSignerInstructionClausesFromIntake,
  stripSignerInstructionContaminationFromCorpus,
} from "./intakeSignerInstructionParse";
import { extractSignerMetadataFromIntake, resolveUniversalSignerMetadataBySlot } from "./universalSignerMetadataAuthority";
import {
  linearPremiumRecipientSlots,
  persistPremiumRecipientHandoff,
  readPremiumRecipientHandoff,
} from "./premiumPartyNamesHandoff";
import { tryInferNamedPartiesFromIntake } from "./intakeNamedPartyFallback";

const BLUE_CANYON_QA_PROMPT = BLUE_CANYON_QA_HOME_PROMPT;

const BLUE = "Blue Canyon Analytics LLC";
const IRON = "Iron Vale Systems Inc.";

describe("intakeSignerInstructionParse — Blue Canyon QA prompt", () => {
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
    storage.clear();
    vi.unstubAllGlobals();
  });

  it("extracts both signers with titles from the full home prompt", () => {
    const rows = matchSignerForEntityIsClauses(BLUE_CANYON_QA_PROMPT);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ entity: BLUE, signerName: "Sarah Mitchell", signerTitle: "CEO" });
    expect(rows[1]).toMatchObject({
      entity: expect.stringMatching(/Iron Vale Systems Inc\.?/i),
      signerName: "Michael Torres",
      signerTitle: "President",
    });

    const intake = extractSignerMetadataFromIntake(BLUE_CANYON_QA_PROMPT);
    expect(intake.extractedNames).toEqual(expect.arrayContaining(["Sarah Mitchell", "Michael Torres"]));
    expect(intake.extractedTitles).toEqual(expect.arrayContaining(["CEO", "President"]));
  });

  it("does not let signer instructions contaminate between-party extraction", () => {
    const parties = extractBetweenPartyNameList(BLUE_CANYON_QA_PROMPT);
    expect(parties[0]).toMatch(/Blue Canyon Analytics LLC/i);
    expect(parties[1]).toMatch(/Iron Vale Systems Inc\.?/i);
    expect(parties.join(" ")).not.toMatch(/Sarah Mitchell/i);
    expect(parties.join(" ")).not.toMatch(/Michael Torres/i);
    expect(isContaminatedPartyLegalNameFromSignerInstruction("for Blue Canyon Analytics LLC is Sarah Mitchell")).toBe(
      true,
    );
  });

  it("structured intake parties stay clean legal entities", () => {
    const structured = parseIntakeToStructuredAgreement(BLUE_CANYON_QA_PROMPT);
    expect(structured.parties.length).toBeGreaterThanOrEqual(2);
    expect(structured.parties[0]).toMatch(/Blue Canyon Analytics LLC/i);
    expect(structured.parties[1]).toMatch(/Iron Vale Systems Inc\.?/i);
    expect(structured.parties.join(" ")).not.toMatch(/Signer for/i);
  });

  it("applySimpleFlowSmartDefaults merges signer metadata into draft parties", () => {
    const base: ParsedDraftShape = {
      title: "Consulting Agreement",
      jurisdiction: "Delaware",
      parties: [
        { name: BLUE, role: "party" },
        { name: IRON, role: "party" },
      ],
      purpose: "",
      payment_terms: "",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: { amount: null, valid: false, cadence: null },
    };
    const next = applySimpleFlowSmartDefaults(base, BLUE_CANYON_QA_PROMPT);
    const p0 = next.parties[0] as { signerName?: string; signerTitle?: string };
    const p1 = next.parties[1] as { signerName?: string; signerTitle?: string };
    expect(p0.signerName).toBe("Sarah Mitchell");
    expect(p0.signerTitle).toBe("CEO");
    expect(p1.signerName).toBe("Michael Torres");
    expect(p1.signerTitle).toBe("President");
  });

  it("resolveUniversalSignerMetadataBySlot returns both slots for QA legal entities", () => {
    const resolved = resolveUniversalSignerMetadataBySlot({
      legalEntities: [BLUE, IRON],
      intakeText: BLUE_CANYON_QA_PROMPT,
    });
    expect(resolved[0]?.signerName).toBe("Sarah Mitchell");
    expect(resolved[0]?.signerTitle).toBe("CEO");
    expect(resolved[1]?.signerName).toBe("Michael Torres");
    expect(resolved[1]?.signerTitle).toBe("President");
  });

  it("persistPremiumRecipientHandoff round-trip includes signer metadata", () => {
    persistPremiumRecipientHandoff({
      party1: {
        name: BLUE,
        email: "sarah@blue.com",
        role: "party",
        signerName: "Sarah Mitchell",
        signerTitle: "CEO",
      },
      party2: {
        name: IRON,
        email: "michael@iron.com",
        role: "party",
        signerName: "Michael Torres",
        signerTitle: "President",
      },
    });
    const ho = readPremiumRecipientHandoff();
    expect(ho).not.toBeNull();
    expect(ho!.party1.signerName).toBe("Sarah Mitchell");
    expect(ho!.party1.signerTitle).toBe("CEO");
    expect(ho!.party2.signerName).toBe("Michael Torres");
    expect(ho!.party2.signerTitle).toBe("President");
    const slots = linearPremiumRecipientSlots(ho, 2);
    expect(slots.filter((s) => (s.signerName || "").trim()).length).toBe(2);
    expect(slots.filter((s) => (s.signerTitle || "").trim()).length).toBe(2);
  });

  it("tryInferNamedPartiesFromIntake uses between parser, not signer clause", () => {
    const inferred = tryInferNamedPartiesFromIntake(BLUE_CANYON_QA_PROMPT);
    expect(inferred?.[0]?.name).toMatch(/Blue Canyon Analytics LLC/i);
    expect(inferred?.[1]?.name).toMatch(/Iron Vale Systems Inc\.?/i);
  });

  it("strips contaminated opening phrase from agreement body", () => {
    const corrupted =
      'This Agreement is between for Blue Canyon Analytics LLC is Sarah Mitchell ("Client") and Iron Vale Systems Inc. ("Service Provider").';
    const fixed = stripSignerInstructionContaminationFromCorpus(corrupted);
    expect(fixed.text).toMatch(/between Blue Canyon Analytics LLC/i);
    expect(fixed.text).not.toMatch(/is Sarah Mitchell/i);
    expect(fixed.repairs).toBeGreaterThan(0);
  });

  it("stripSignerInstructionClausesFromIntake removes signer sentences but keeps between clause", () => {
    const stripped = stripSignerInstructionClausesFromIntake(BLUE_CANYON_QA_PROMPT);
    expect(stripped).not.toMatch(/Signer for/i);
    expect(stripped).toMatch(/between Blue Canyon Analytics LLC and Iron Vale Systems Inc/i);
  });
});
