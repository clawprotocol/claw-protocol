import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearPremiumPartyNamesHandoff, writePremiumPartyNamesHandoff } from "./premiumPartyNamesHandoff";
import {
  draftHasPlaceholderParties,
  draftPartyPlaceholdersOkViaLivePreview,
  dumpStatedPartiesPaintedInBody,
  extractRealPartyNamesFromPreview,
  formatRecipientSignerLabelsLine,
  getDraftFirstReviewBlocker,
  hasRealPartiesJoinedLine,
  isPartyFixDetailsReviewBlocker,
  mergePremiumDraftPartiesWithRecipientPriority,
  mergePremiumRecipientDisplayName,
  partyNamesResolvedViaRenderedPreview,
  pickRecipientSignerLabelsForHandoff,
} from "./reviewPlaceholderGuard";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const base = (parties: ParsedDraftShape["parties"]): ParsedDraftShape => ({
  title: "Test",
  jurisdiction: "DE",
  parties,
  purpose: "Scope",
  payment_terms: "Pay",
  duration: "1y",
  due_date: null,
  effective_date: "Signing",
  payment: { amount: null, cadence: null, valid: true },
});

describe("getDraftFirstReviewBlocker", () => {
  it("returns null for real parties and substantive title (structural gaps are advisory elsewhere)", () => {
    expect(
      getDraftFirstReviewBlocker(
        base([
          { name: "Jane Smith", role: "party" },
          { name: "Acme LLC", role: "party" },
        ]),
      ),
    ).toBe(null);
  });

  it("returns party_placeholder for Party A / Party B when no preview available", () => {
    expect(
      getDraftFirstReviewBlocker(
        base([
          { name: "Party A (edit in review)", role: "party" },
          { name: "Party B (edit in review)", role: "party" },
        ]),
      ),
    ).toBe("party_placeholder");
  });

  it("returns null when draft.parties has placeholders but rendered preview has real names", () => {
    const preview = "SERVICES AGREEMENT\n\nThis Agreement is entered into by and between Priya Shah and Diego Alvarez.\n\n1. Scope of Services...";
    expect(
      getDraftFirstReviewBlocker(
        base([
          { name: "Party A (edit in review)", role: "party" },
          { name: "Party B (edit in review)", role: "party" },
        ]),
        { userVisibleFullDocumentPlain: preview },
      ),
    ).toBe(null);
  });

  it("returns party_placeholder when rendered preview also has placeholder names", () => {
    const preview = "SERVICES AGREEMENT\n\nThis Agreement is entered into by and between Party A and Party B.\n\n1. Scope of Services...";
    expect(
      getDraftFirstReviewBlocker(
        base([
          { name: "Party A (edit in review)", role: "party" },
          { name: "Party B (edit in review)", role: "party" },
        ]),
        { userVisibleFullDocumentPlain: preview },
      ),
    ).toBe("party_placeholder");
  });

  it("returns other_placeholder for generic Agreement title even when parties are real", () => {
    expect(
      getDraftFirstReviewBlocker({
        ...base([
          { name: "Jane Smith", role: "party" },
          { name: "Acme LLC", role: "party" },
        ]),
        title: "Agreement",
      }),
    ).toBe("other_placeholder");
  });

  it("does not Fix-details-for-parties when dump names are painted and slots are empty", () => {
    const preview =
      'SERVICES AGREEMENT\n\nThis Agreement ("Agreement") is entered into by and between: Priya Shah of Northline Studio ("Client") and Diego Alvarez of Harbor Marks LLC ("Service Provider") (collectively, the "Parties").\n\n1. Scope of Services / Purpose: design a logo and brand kit.\n';
    const intake =
      "Priya Shah of Northline Studio is hiring Diego Alvarez of Harbor Marks LLC to design a logo and brand kit.";
    const emptySlots = base([
      { name: "", role: "client" },
      { name: "", role: "service_provider" },
    ]);
    expect(dumpStatedPartiesPaintedInBody(intake, preview)).toBe(true);
    expect(
      getDraftFirstReviewBlocker(emptySlots, {
        userVisibleFullDocumentPlain: preview,
        intakeText: intake,
      }),
    ).not.toBe("party_placeholder");
    expect(
      getDraftFirstReviewBlocker(emptySlots, {
        userVisibleFullDocumentPlain: preview,
        intakeText: intake,
      }),
    ).not.toBe("other_placeholder");
    expect(
      isPartyFixDetailsReviewBlocker(emptySlots, {
        userVisibleFullDocumentPlain: preview,
        intakeText: intake,
      }),
    ).toBe(false);
  });
});

describe("extractRealPartyNamesFromPreview", () => {
  it("extracts party names from standard agreement opening", () => {
    const preview = "SERVICES AGREEMENT\n\nThis Agreement is entered into by and between Priya Shah and Diego Alvarez.\n\n1. Scope";
    const result = extractRealPartyNamesFromPreview(preview);
    expect(result).toEqual({ party1: "Priya Shah", party2: "Diego Alvarez" });
  });

  it("extracts names from between ... and pattern", () => {
    const preview = "This is a contract between Jane Smith and Acme LLC for services.";
    const result = extractRealPartyNamesFromPreview(preview);
    expect(result).toEqual({ party1: "Jane Smith", party2: "Acme LLC" });
  });

  it("extracts person-of-entity names after between: with role parens", () => {
    const preview =
      'SERVICES AGREEMENT\n\nThis Agreement ("Agreement") is entered into by and between: Priya Shah of Northline Studio ("Client") and Diego Alvarez of Harbor Marks LLC ("Service Provider") (collectively, the "Parties").\n\n1. Scope';
    const result = extractRealPartyNamesFromPreview(preview);
    expect(result?.party1).toMatch(/Priya Shah of Northline Studio/i);
    expect(result?.party2).toMatch(/Diego Alvarez of Harbor Marks LLC/i);
  });

  it("returns null when party names are placeholders", () => {
    const preview = "Agreement between Party A and Party B.";
    expect(extractRealPartyNamesFromPreview(preview)).toBe(null);
  });

  it("returns null for short previews", () => {
    expect(extractRealPartyNamesFromPreview("short")).toBe(null);
    expect(extractRealPartyNamesFromPreview("")).toBe(null);
  });

  it("returns null when pattern not found", () => {
    const preview = "This is a long document without the standard pattern. It goes on and on.";
    expect(extractRealPartyNamesFromPreview(preview)).toBe(null);
  });
});

describe("partyNamesResolvedViaRenderedPreview", () => {
  it("returns true when draft has placeholder parties but rendered preview has real names", () => {
    const draft = base([
      { name: "Party A (edit in review)", role: "party" },
      { name: "Party B (edit in review)", role: "party" },
    ]);
    const preview = "Agreement entered into by and between Mike Green and Sarah Chen.";
    expect(partyNamesResolvedViaRenderedPreview(draft, preview)).toBe(true);
  });

  it("returns false when draft already has real parties", () => {
    const draft = base([
      { name: "Jane Smith", role: "party" },
      { name: "Acme LLC", role: "party" },
    ]);
    const preview = "Agreement between Jane Smith and Acme LLC.";
    expect(partyNamesResolvedViaRenderedPreview(draft, preview)).toBe(false);
  });

  it("returns false when rendered preview also has placeholders", () => {
    const draft = base([
      { name: "Party A (edit in review)", role: "party" },
      { name: "Party B (edit in review)", role: "party" },
    ]);
    const preview = "Agreement between Party A and Party B.";
    expect(partyNamesResolvedViaRenderedPreview(draft, preview)).toBe(false);
  });

  it("returns false for null/empty inputs", () => {
    const draft = base([
      { name: "Party A (edit in review)", role: "party" },
      { name: "Party B (edit in review)", role: "party" },
    ]);
    expect(partyNamesResolvedViaRenderedPreview(null, "some preview")).toBe(false);
    expect(partyNamesResolvedViaRenderedPreview(draft, null)).toBe(false);
    expect(partyNamesResolvedViaRenderedPreview(draft, "")).toBe(false);
  });
});

describe("draftHasPlaceholderParties", () => {
  it("flags Party A / Party B", () => {
    expect(
      draftHasPlaceholderParties(
        base([
          { name: "Party A (edit in review)", role: "party" },
          { name: "Party B (edit in review)", role: "party" },
        ]),
      ),
    ).toBe(true);
  });

  it("allows real names", () => {
    expect(
      draftHasPlaceholderParties(
        base([
          { name: "Jane Smith", role: "party" },
          { name: "Acme LLC", role: "party" },
        ]),
      ),
    ).toBe(false);
  });

});

describe("hasRealPartiesJoinedLine", () => {
  it("accepts a comma-separated real pair", () => {
    expect(hasRealPartiesJoinedLine("John Smith, Mary Jane")).toBe(true);
  });
});

describe("draftPartyPlaceholdersOkViaLivePreview", () => {
  it("returns true when structured draft is stale but live preview line has two real names", () => {
    const draft = base([
      { name: "Party A (edit in review)", role: "party" },
      { name: "Party B (edit in review)", role: "party" },
    ]);
    expect(draftHasPlaceholderParties(draft)).toBe(true);
    expect(
      draftPartyPlaceholdersOkViaLivePreview(draft, "Jane Smith and John Brown", null),
    ).toBe(true);
  });

  it("returns false when live line still looks like placeholders", () => {
    const draft = base([
      { name: "Party A (edit in review)", role: "party" },
      { name: "Party B (edit in review)", role: "party" },
    ]);
    expect(draftPartyPlaceholdersOkViaLivePreview(draft, "Party A and Party B", null)).toBe(false);
  });
});

describe("pickRecipientSignerLabelsForHandoff", () => {
  it("replaces joined placeholder signer labels with real names", () => {
    const prev = "Party A (edit in review) · Party B (edit in review)";
    expect(pickRecipientSignerLabelsForHandoff(prev, "Alex Rivera", "Jordan Lee")).toBe("Alex Rivera · Jordan Lee");
  });

  it("includes meaningful roles in the signer label line", () => {
    expect(
      pickRecipientSignerLabelsForHandoff("", "Acme LLC", "Jane Doe", {
        role1: "Client",
        role2: "Consultant",
      }),
    ).toBe("Acme LLC (Client) · Jane Doe (Consultant)");
  });

  it("keeps explicit user-entered labels when not placeholder", () => {
    expect(pickRecipientSignerLabelsForHandoff("Designer · Client", "A", "B")).toBe("Designer · Client");
  });
});

describe("formatRecipientSignerLabelsLine", () => {
  it("omits generic party roles", () => {
    expect(formatRecipientSignerLabelsLine("A", "B", "party", "party_b")).toBe("A · B");
  });
});

describe("mergePremiumRecipientDisplayName", () => {
  it("prefers premium draft when higher-priority sources are empty or placeholders", () => {
    expect(
      mergePremiumRecipientDisplayName(
        "",
        "",
        "",
        "Party A (edit in review)",
        "Jane Smith",
        "Party A (edit in review)",
      ),
    ).toBe("Jane Smith");
  });

  it("uses prior structured draft when premium draft party is still a placeholder", () => {
    expect(
      mergePremiumRecipientDisplayName(
        "",
        "",
        "",
        "Morgan Lee",
        "Party A (edit in review)",
        "Party A (edit in review)",
      ),
    ).toBe("Morgan Lee");
  });

  it("does not let stale snapshot placeholder names beat real recipient fields", () => {
    expect(
      mergePremiumRecipientDisplayName(
        "",
        "",
        "Taylor Jones",
        "Party B (edit in review)",
        "Party A (edit in review)",
        "Party A (edit in review)",
      ),
    ).toBe("Taylor Jones");
  });

  it("prefers party modal over recipient and premium", () => {
    expect(
      mergePremiumRecipientDisplayName(
        "",
        "From Modal",
        "From Recipient",
        "From Prior",
        "From Premium",
        "From Snap",
      ),
    ).toBe("From Modal");
  });

  it("prefers session handoff over modal", () => {
    expect(
      mergePremiumRecipientDisplayName(
        "Mike Green",
        "Modal Name",
        "",
        "Party A (edit in review)",
        "Party B (edit in review)",
        "Party A (edit in review)",
      ),
    ).toBe("Mike Green");
  });

  it("rejects premium draft prose and uses safe slot labels", () => {
    expect(
      mergePremiumRecipientDisplayName(
        "",
        "",
        "",
        "",
        "I'm a freelance designer and need an agreement with a client",
        "",
        { partySlot: 0, agreementFamily: null },
      ),
    ).toBe("Party A");
    expect(
      mergePremiumRecipientDisplayName(
        "",
        "",
        "",
        "",
        "consultant helping a startup with diligence",
        "",
        { partySlot: 1, agreementFamily: "consulting_agreement" },
      ),
    ).toBe("Client");
  });

  it("preserves prior valid names when premium rewrite returns prose", () => {
    expect(
      mergePremiumRecipientDisplayName(
        "",
        "",
        "",
        "Morgan Lee",
        "I need an agreement with a client for payment terms",
        "",
        { partySlot: 0, agreementFamily: null },
      ),
    ).toBe("Morgan Lee");
  });
});

describe("mergePremiumDraftPartiesWithRecipientPriority", () => {
  beforeEach(() => {
    clearPremiumPartyNamesHandoff();
  });
  afterEach(() => {
    clearPremiumPartyNamesHandoff();
    vi.unstubAllGlobals();
  });

  it("overwrites placeholder premium draft parties with prior + recipient merge", () => {
    const premium = base([
      { name: "Party A (edit in review)", role: "party" },
      { name: "Party B (edit in review)", role: "party" },
    ]);
    const prior = base([
      { name: "Riley Chen", role: "party" },
      { name: "Pat Jordan", role: "party" },
    ]);
    const { draft, displayName1, displayName2 } = mergePremiumDraftPartiesWithRecipientPriority(
      premium,
      prior,
      "Alex Backup",
      "",
      "Party A (edit in review)",
      "Party B (edit in review)",
    );
    expect(displayName1).toBe("Alex Backup");
    expect(displayName2).toBe("Pat Jordan");
    expect(draft.parties?.[0]?.name).toBe("Alex Backup");
    expect(draft.parties?.[1]?.name).toBe("Pat Jordan");
  });

  it("prefers party modal names over placeholder premium draft", () => {
    const premium = base([
      { name: "Party A (edit in review)", role: "party" },
      { name: "Party B (edit in review)", role: "party" },
    ]);
    const prior = base([
      { name: "Party A (edit in review)", role: "party" },
      { name: "Party B (edit in review)", role: "party" },
    ]);
    const { draft, displayName1, displayName2 } = mergePremiumDraftPartiesWithRecipientPriority(
      premium,
      prior,
      "",
      "",
      "Party A (edit in review)",
      "Party B (edit in review)",
      "Mike Green",
      "Sarah Homeowner",
    );
    expect(displayName1).toBe("Mike Green");
    expect(displayName2).toBe("Sarah Homeowner");
    expect(draft.parties?.[0]?.name).toBe("Mike Green");
    expect(draft.parties?.[1]?.name).toBe("Sarah Homeowner");
  });

  it("prefers session party handoff when resume prior is missing", () => {
    const mem: Record<string, string> = {};
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => (Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null),
      setItem: (k: string, v: string) => {
        mem[k] = v;
      },
      removeItem: (k: string) => {
        delete mem[k];
      },
      clear: () => {
        Object.keys(mem).forEach((k) => delete mem[k]);
      },
      key: () => null,
      get length() {
        return Object.keys(mem).length;
      },
    } as Storage);
    writePremiumPartyNamesHandoff("Mike Green", "Sarah Homeowner");
    const premium = base([
      { name: "Party A (edit in review)", role: "party" },
      { name: "Party B (edit in review)", role: "party" },
    ]);
    const { draft, displayName1, displayName2 } = mergePremiumDraftPartiesWithRecipientPriority(
      premium,
      null,
      "",
      "",
      "Party A (edit in review)",
      "Party B (edit in review)",
    );
    expect(displayName1).toBe("Mike Green");
    expect(displayName2).toBe("Sarah Homeowner");
    expect(draft.parties?.[0]?.name).toBe("Mike Green");
    expect(draft.parties?.[1]?.name).toBe("Sarah Homeowner");
  });
});
