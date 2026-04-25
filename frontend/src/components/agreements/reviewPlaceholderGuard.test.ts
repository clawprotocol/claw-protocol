import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearPremiumPartyNamesHandoff, writePremiumPartyNamesHandoff } from "./premiumPartyNamesHandoff";
import {
  draftHasPlaceholderParties,
  draftPartyPlaceholdersOkViaLivePreview,
  formatRecipientSignerLabelsLine,
  getDraftFirstReviewBlocker,
  hasRealPartiesJoinedLine,
  mergePremiumDraftPartiesWithRecipientPriority,
  mergePremiumRecipientDisplayName,
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

  it("returns party_placeholder for Party A / Party B", () => {
    expect(
      getDraftFirstReviewBlocker(
        base([
          { name: "Party A (edit in review)", role: "party" },
          { name: "Party B (edit in review)", role: "party" },
        ]),
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
