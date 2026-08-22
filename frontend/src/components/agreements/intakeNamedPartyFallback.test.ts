import { describe, expect, it } from "vitest";
import { applyNamedPartyFallbackFromIntake, inferCasualScopeFromDump, inferCasualTwoPartyFromDump, looksLikeMoneyTermOrClausePartyName, tryInferNamedPartiesFromIntake } from "./intakeNamedPartyFallback";
import { assessStarterComplexityGate } from "./starterMultiPartyProGate";
import { draftHasPlaceholderParties, draftHasPlaceholderFieldsForRecipients } from "./reviewPlaceholderGuard";
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { canonicalizeStarterDraftForReview } from "./starterRecipientDraftMerge";
import { buildAgreementPreviewText, buildStarterAgreementPreviewForReview } from "./agreementPreviewFromDraft";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import { detectAgreementFamily } from "./agreementFamilyRouter";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const EMPTY_PAYMENT = { amount: null, cadence: null, valid: false } as const;

function makeSignerIntake(signers: { name: string; email: string }[], description: string): string {
  const lines = [description];
  signers.forEach((s, i) => {
    const label = i === 0 ? "Sender/signer 1" : `Signer ${i + 1}`;
    lines.push(`${label}: ${s.name}, ${s.email}`);
  });
  return lines.join("\n");
}

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

describe("tryInferNamedPartiesFromIntake", () => {
  it("infers person and company from employment-style phrasing", () => {
    const raw =
      "Create an employment agreement for John Smith in Acme LLC for $20 an hour starting next Monday in California.";
    const out = tryInferNamedPartiesFromIntake(raw);
    expect(out).not.toBeNull();
    expect(out![0].name).toContain("John Smith");
    expect(out![1].name).toMatch(/Acme LLC/i);
  });

  it("extracts 4 explicit signers from signer-line intake", () => {
    const raw = [
      "Consulting agreement with confidentiality provisions.",
      "Sender/signer 1: Anthem Blanchard, anthem@example.com",
      "Signer 2: Sarah Collins, sarah@example.com",
      "Signer 3: Michael Reed, michael@example.com",
      "Signer 4: Jamie Chen, jamie@example.com",
    ].join("\n");
    const out = tryInferNamedPartiesFromIntake(raw);
    expect(out).not.toBeNull();
    expect(out).toHaveLength(4);
    expect(out![0].name).toBe("Anthem Blanchard");
    expect(out![1].name).toBe("Sarah Collins");
    expect(out![2].name).toBe("Michael Reed");
    expect(out![3].name).toBe("Jamie Chen");
  });

  it("extracts emails alongside signer names", () => {
    const raw = [
      "Service agreement",
      "Signer 1: Alice Jones, alice@corp.co",
      "Signer 2: Bob Williams, bob@corp.co",
    ].join("\n");
    const out = tryInferNamedPartiesFromIntake(raw);
    expect(out).not.toBeNull();
    expect(out![0].email).toBe("alice@corp.co");
    expect(out![1].email).toBe("bob@corp.co");
  });

  it("handles party/signatory labels", () => {
    const raw = [
      "NDA",
      "Party 1: Jane Doe",
      "Party 2: Corp Industries",
    ].join("\n");
    const out = tryInferNamedPartiesFromIntake(raw);
    expect(out).not.toBeNull();
    expect(out![0].name).toBe("Jane Doe");
  });

  it("returns null for intake without explicit signer lines or named patterns", () => {
    const raw = "Draft a simple consulting agreement for my business.";
    const out = tryInferNamedPartiesFromIntake(raw);
    expect(out).toBeNull();
  });

  it("still matches between-style patterns", () => {
    const raw = "Create an agreement between Alpha Corp and Beta Ltd";
    const out = tryInferNamedPartiesFromIntake(raw);
    expect(out).not.toBeNull();
    expect(out![0].name).toBe("Alpha Corp");
    expect(out![1].name).toBe("Beta Ltd");
  });

  it("grounds a casual hire dump to the named person", () => {
    const raw = "I hired Mike to paint my office. We shook on it.";
    const out = tryInferNamedPartiesFromIntake(raw);
    expect(out).not.toBeNull();
    expect(out!.map((p) => p.name)).toContain("Mike");
    expect(out!.some((p) => /party\s*[ab]/i.test(p.name))).toBe(false);
  });

  it("grounds a deal-with-name dump that has no hire verb", () => {
    const raw = "need a painting deal with Mike for my office";
    const out = tryInferNamedPartiesFromIntake(raw);
    expect(out).not.toBeNull();
    expect(out!.map((p) => p.name)).toContain("Mike");
  });

  it("grounds a will-do dump", () => {
    const raw = "Sarah will design my website";
    const out = tryInferNamedPartiesFromIntake(raw);
    expect(out).not.toBeNull();
    expect(out!.map((p) => p.name)).toContain("Sarah");
  });
});

describe("applyNamedPartyFallbackFromIntake", () => {
  it("replaces placeholder parties with extracted signer rows", () => {
    const parsed: ParsedDraftShape = {
      title: "Agreement",
      jurisdiction: "Delaware",
      parties: [
        { name: "Party A (edit in review)", role: "party" },
        { name: "Party B (edit in review)", role: "party" },
      ],
      purpose: "",
      payment_terms: "",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: EMPTY_PAYMENT,
    };
    const intake = [
      "Consulting agreement",
      "Sender/signer 1: Anthem Blanchard, anthem@test.com",
      "Signer 2: Sarah Collins, sarah@test.com",
      "Signer 3: Michael Reed, michael@test.com",
      "Signer 4: Jamie Chen, jamie@test.com",
    ].join("\n");
    const result = applyNamedPartyFallbackFromIntake(parsed, intake);
    expect(result.parties).toHaveLength(4);
    expect(result.parties![0].name).toBe("Anthem Blanchard");
    expect(result.parties![1].name).toBe("Sarah Collins");
    expect(result.parties![2].name).toBe("Michael Reed");
    expect(result.parties![3].name).toBe("Jamie Chen");
  });

  it("does not replace when parties are already real names", () => {
    const parsed: ParsedDraftShape = {
      title: "Agreement",
      jurisdiction: "Delaware",
      parties: [
        { name: "Alice Jones", role: "party" },
        { name: "Bob Williams", role: "party" },
      ],
      purpose: "",
      payment_terms: "",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: EMPTY_PAYMENT,
    };
    const intake = "Signer 1: Other Person\nSigner 2: Another One";
    const result = applyNamedPartyFallbackFromIntake(parsed, intake);
    expect(result.parties![0].name).toBe("Alice Jones");
    expect(result.parties![1].name).toBe("Bob Williams");
  });

  it("hasPlaceholderParties=false when explicit names present", () => {
    const parsed: ParsedDraftShape = {
      title: "Agreement",
      jurisdiction: "Delaware",
      parties: [
        { name: "Anthem Blanchard", role: "party" },
        { name: "Sarah Collins", role: "party" },
        { name: "Michael Reed", role: "party" },
        { name: "Jamie Chen", role: "party" },
      ],
      purpose: "",
      payment_terms: "",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: EMPTY_PAYMENT,
    };
    expect(draftHasPlaceholderParties(parsed)).toBe(false);
  });
});

describe("full pipeline: multi-party intake → draft (QA scenario)", () => {
  const QA_INTAKE = [
    "Consulting agreement with confidentiality provisions.",
    "Sender/signer 1: Anthem Blanchard, anthem@example.com",
    "Signer 2: Sarah Collins, sarah@example.com",
    "Signer 3: Michael Reed, michael@example.com",
    "Signer 4: Jamie Chen, jamie@example.com",
  ].join("\n");

  it("does not misroute multi-party consulting prompt as NDA/confidentiality-only", () => {
    const family = detectAgreementFamily(QA_INTAKE);
    expect(family).toBe("consulting_agreement");
    expect(family).not.toBe("nda");
    expect(family).not.toBe("confidentiality_commercial_protections_agreement");
  });

  it("produces 4 named parties through runIntakeDefaultsAndRoles (simulating basic_parse_timeout)", () => {
    const emptyParsed: ParsedDraftShape = {
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
    const result = runIntakeDefaultsAndRoles(emptyParsed, QA_INTAKE, true, defaultIntakePartyRoleLabels());
    expect(result.parties.length).toBeGreaterThanOrEqual(4);
    expect(result.parties[0].name).toBe("Anthem Blanchard");
    expect(result.parties[1].name).toBe("Sarah Collins");
    expect(result.parties[2].name).toBe("Michael Reed");
    expect(result.parties[3].name).toBe("Jamie Chen");
    expect(draftHasPlaceholderParties(result)).toBe(false);
  });

  it("preserves existing 2-party prompts (no regression)", () => {
    const twoPartyIntake = "Create a consulting agreement between Acme Corp and Widget LLC";
    const result = runIntakeDefaultsAndRoles(emptyDraft(), twoPartyIntake, true, defaultIntakePartyRoleLabels());
    expect(result.parties.length).toBeGreaterThanOrEqual(2);
    expect(result.parties[0].name).toMatch(/Acme Corp/i);
    expect(result.parties[1].name).toMatch(/Widget LLC/i);
    expect(draftHasPlaceholderParties(result)).toBe(false);
  });

  it("Mike-paint dump keeps Mike, the work, and does not invent payment or Delaware", () => {
    const raw = "I hired Mike to paint my office. We shook on it.";
    const result = runIntakeDefaultsAndRoles(emptyDraft(), raw, true, defaultIntakePartyRoleLabels());
    const names = result.parties.map((p) => p.name).join(" ");
    expect(names).toMatch(/Mike/);
    expect(names).toMatch(/Client/i);
    expect(names).not.toMatch(/Party\s*A/i);
    expect(result.purpose).toMatch(/paint/i);
    expect(result.payment_terms || "").not.toMatch(/no\s+fees|unpaid|\$0\b/i);
    expect(result.jurisdiction || "").not.toMatch(/delaware/i);
    expect((result.jurisdiction || "").trim()).toBe("");
    const canonical = canonicalizeStarterDraftForReview(result);
    expect(canonical.parties.some((p) => /Mike/i.test(p.name))).toBe(true);
    expect(canonical.parties.some((p) => /Client/i.test(p.name))).toBe(true);
    expect(canonical.jurisdiction || "").not.toMatch(/delaware/i);
    expect((canonical.jurisdiction || "").trim()).toBe("");
    expect(canonical.payment_terms || "").not.toMatch(/no\s+fees|unpaid|\$0\b/i);
    expect(canonical.parties.some((p) => /Party\s*A/i.test(p.name))).toBe(false);
    expect(canonical.title).toMatch(/painting agreement|services agreement/i);
    expect(canonical.title).not.toMatch(/^business agreement$/i);
    expect(canonical.purpose).toMatch(/paint/i);
    expect(canonical.purpose).toMatch(/office/i);
    expect(canonical.purpose).toMatch(/\./);
    expect(canonical.purpose).not.toMatch(/^paint my office$/i);
    expect(canonical.purpose).not.toMatch(/\$|no\s+fees|delaware/i);
  });

  it("Jordan NDA dump keeps Jordan and does not invent Delaware", () => {
    const raw = "nda between me and Jordan about the app idea";
    const result = runIntakeDefaultsAndRoles(emptyDraft(), raw, true, defaultIntakePartyRoleLabels());
    const names = result.parties.map((p) => p.name).join(" ");
    expect(names).toMatch(/Jordan/i);
    expect(names).toMatch(/Client/i);
    expect(result.jurisdiction || "").not.toMatch(/delaware/i);
    expect((result.jurisdiction || "").trim()).toBe("");
    expect(result.payment_terms || "").not.toMatch(/no\s+fees|unpaid|\$0\b/i);
    const canonical = canonicalizeStarterDraftForReview(result);
    expect(canonical.parties.some((p) => /Jordan/i.test(p.name))).toBe(true);
    expect(canonical.parties.some((p) => /Client/i.test(p.name))).toBe(true);
    expect((canonical.jurisdiction || "").trim()).toBe("");
    expect(canonical.jurisdiction || "").not.toMatch(/delaware/i);
    expect(canonical.payment_terms || "").not.toMatch(/no\s+fees|unpaid|\$0\b/i);
    expect(canonical.title).toMatch(/non-disclosure agreement/i);
    expect(canonical.purpose).toMatch(/app idea/i);
    expect(canonical.jurisdiction || "").not.toMatch(/delaware/i);
  });

  it("Sarah wedding dump keeps $1800", () => {
    const raw = "Sarah will photograph our wedding on June 12. We agreed $1800 cash.";
    const result = runIntakeDefaultsAndRoles(emptyDraft(), raw, true, defaultIntakePartyRoleLabels());
    expect(result.parties.map((p) => p.name).join(" ")).toMatch(/Sarah/i);
    expect(result.payment_terms || "").toMatch(/1[,.]?800/);
    const canonical = canonicalizeStarterDraftForReview(result);
    expect(canonical.payment_terms || "").toMatch(/1[,.]?800/);
    expect(canonical.jurisdiction || "").not.toMatch(/delaware/i);
  });
});

describe("multi-party extraction: 3, 4, and 5 signers survive full pipeline", () => {
  const THREE_SIGNERS = [
    { name: "Priya Kapoor", email: "priya@kapoorventures.io" },
    { name: "Darius Montgomery", email: "darius@montco.net" },
    { name: "Lena Vasquez", email: "lena@vasquezdesign.co" },
  ];
  const FOUR_SIGNERS = [
    { name: "Tomasz Kowalski", email: "tomasz@kowalski.dev" },
    { name: "Naomi Okafor", email: "naomi@okafor.legal" },
    { name: "Rafael Diaz", email: "rafael@diazgroup.com" },
    { name: "Aisha Patel", email: "aisha@patel.partners" },
  ];
  const FIVE_SIGNERS = [
    { name: "Henrik Larsen", email: "henrik@larsen.se" },
    { name: "Mei Zhang", email: "mei@zhangcapital.cn" },
    { name: "Carlos Gutierrez", email: "carlos@gutierrez.mx" },
    { name: "Fatima Al-Rashidi", email: "fatima@rashidi.ae" },
    { name: "Oliver Chen", email: "oliver@chensoftware.io" },
  ];

  it("3 signers: extraction preserves all names and emails", () => {
    const intake = makeSignerIntake(THREE_SIGNERS, "Partnership agreement");
    const out = tryInferNamedPartiesFromIntake(intake);
    expect(out).toHaveLength(3);
    THREE_SIGNERS.forEach((s, i) => {
      expect(out![i].name).toBe(s.name);
      expect(out![i].email).toBe(s.email);
    });
  });

  it("4 signers: extraction preserves all names and emails", () => {
    const intake = makeSignerIntake(FOUR_SIGNERS, "Joint venture agreement");
    const out = tryInferNamedPartiesFromIntake(intake);
    expect(out).toHaveLength(4);
    FOUR_SIGNERS.forEach((s, i) => {
      expect(out![i].name).toBe(s.name);
      expect(out![i].email).toBe(s.email);
    });
  });

  it("5 signers: extraction preserves all names and emails", () => {
    const intake = makeSignerIntake(FIVE_SIGNERS, "Software licensing agreement");
    const out = tryInferNamedPartiesFromIntake(intake);
    expect(out).toHaveLength(5);
    FIVE_SIGNERS.forEach((s, i) => {
      expect(out![i].name).toBe(s.name);
      expect(out![i].email).toBe(s.email);
    });
  });

  it("3 signers survive runIntakeDefaultsAndRoles + canonicalize", () => {
    const intake = makeSignerIntake(THREE_SIGNERS, "Consulting engagement");
    const result = runIntakeDefaultsAndRoles(emptyDraft(), intake, true, defaultIntakePartyRoleLabels());
    expect(result.parties.length).toBeGreaterThanOrEqual(3);
    THREE_SIGNERS.forEach((s, i) => {
      expect(result.parties[i].name).toBe(s.name);
    });
    const canonical = canonicalizeStarterDraftForReview(result);
    expect(canonical.parties.length).toBeGreaterThanOrEqual(3);
    THREE_SIGNERS.forEach((s, i) => {
      expect(canonical.parties[i].name).toBe(s.name);
    });
    expect(draftHasPlaceholderParties(canonical)).toBe(false);
  });

  it("4 signers survive runIntakeDefaultsAndRoles + canonicalize", () => {
    const intake = makeSignerIntake(FOUR_SIGNERS, "Advisory services contract");
    const result = runIntakeDefaultsAndRoles(emptyDraft(), intake, true, defaultIntakePartyRoleLabels());
    expect(result.parties.length).toBeGreaterThanOrEqual(4);
    FOUR_SIGNERS.forEach((s, i) => {
      expect(result.parties[i].name).toBe(s.name);
    });
    const canonical = canonicalizeStarterDraftForReview(result);
    expect(canonical.parties.length).toBeGreaterThanOrEqual(4);
    FOUR_SIGNERS.forEach((s, i) => {
      expect(canonical.parties[i].name).toBe(s.name);
    });
    expect(draftHasPlaceholderParties(canonical)).toBe(false);
    expect(draftHasPlaceholderFieldsForRecipients(canonical)).toBe(false);
  });

  it("5 signers survive runIntakeDefaultsAndRoles + canonicalize", () => {
    const intake = makeSignerIntake(FIVE_SIGNERS, "Platform development agreement");
    const result = runIntakeDefaultsAndRoles(emptyDraft(), intake, true, defaultIntakePartyRoleLabels());
    expect(result.parties.length).toBeGreaterThanOrEqual(5);
    FIVE_SIGNERS.forEach((s, i) => {
      expect(result.parties[i].name).toBe(s.name);
    });
    const canonical = canonicalizeStarterDraftForReview(result);
    expect(canonical.parties.length).toBeGreaterThanOrEqual(5);
    FIVE_SIGNERS.forEach((s, i) => {
      expect(canonical.parties[i].name).toBe(s.name);
    });
    expect(draftHasPlaceholderParties(canonical)).toBe(false);
  });
});

describe("agreement family routing: service/web/dev agreements with confidentiality", () => {
  it("web development agreement with confidentiality clause → not NDA", () => {
    const intake = "Web development agreement with confidentiality provisions and IP assignment.\nSigner 1: Dev Studio\nSigner 2: Client Corp";
    const family = detectAgreementFamily(intake);
    expect(family).not.toBe("nda");
    expect(family).not.toBe("confidentiality_commercial_protections_agreement");
  });

  it("software development agreement mentioning confidentiality → services family", () => {
    const intake = "Software development agreement including confidentiality for a mobile app project";
    const family = detectAgreementFamily(intake);
    expect(family).not.toBe("nda");
    expect(family).not.toBe("confidentiality_commercial_protections_agreement");
  });

  it("pure NDA still routes correctly", () => {
    const intake = "Mutual NDA between two companies";
    const family = detectAgreementFamily(intake);
    expect(family).toBe("nda");
  });

  it("pure confidentiality agreement still routes correctly", () => {
    const intake = "Confidentiality agreement for a real estate transaction";
    const family = detectAgreementFamily(intake);
    expect(family).toBe("nda");
  });
});

describe("casual two-party dump widening", () => {
  const NAMED: Array<[string, string]> = [
    ["Sarah will photograph our wedding on June 12. We agreed $1800 cash.", "Sarah"],
    ["nda between me and Jordan about the app idea", "Jordan"],
    ["can you write something for my lawn guy Luis, he starts monday", "Luis"],
    ["me and Priya are splitting the etsy shop 50/50", "Priya"],
    ["I sold my bike to Taylor for $200 cash", "Taylor"],
    ["pay Riley $40 a week to walk the dog", "Riley"],
    ["I hired Mike to paint my office. We shook on it.", "Mike"],
    ["deal with Sam", "Sam"],
    ["Hire Alex to build our shopify theme, $3k, two weeks", "Alex"],
  ];

  it.each(NAMED)("infers Client + %s", (dump, name) => {
    const out = inferCasualTwoPartyFromDump(dump);
    expect(out).not.toBeNull();
    expect(out!.map((p) => p.name)).toEqual(expect.arrayContaining(["Client", name]));
    expect(out!.some((p) => /party\s*[ab]/i.test(p.name))).toBe(false);
    expect(tryInferNamedPartiesFromIntake(dump)?.map((p) => p.name)).toEqual(
      expect.arrayContaining([name]),
    );
  });

  it("fence dump has scope only and does not invent parties", () => {
    const dump = "need someone to fix the broken fence";
    expect(inferCasualTwoPartyFromDump(dump)).toBeNull();
    expect(inferCasualScopeFromDump(dump)).toMatch(/fence/i);
  });

  it.each([
    "my dog is named Biscuit and the trucks are teal",
    "lol just testing this, pizza is great",
    "I need a contract",
    "I just want an nda",
  ])("does not treat junk or counterparty-less intake as a two-party deal: %s", (dump) => {
    expect(inferCasualTwoPartyFromDump(dump)).toBeNull();
    expect(inferCasualScopeFromDump(dump)).toBe("");
  });
});

describe("full pipeline: money/term/clause fragments never become party names", () => {
  it("Hire Alex dump keeps Alex through the full pipeline, not Party A or $3k", () => {
    const raw = "Hire Alex to build our shopify theme, $3k, two weeks";
    const before = inferCasualTwoPartyFromDump(raw);
    expect(before?.map((p) => p.name)).toEqual(expect.arrayContaining(["Client", "Alex"]));
    const result = runIntakeDefaultsAndRoles(emptyDraft(), raw, true, defaultIntakePartyRoleLabels());
    const names = result.parties.map((p) => p.name);
    expect(names).toContain("Alex");
    expect(names.some((n) => /party\s*[ab]/i.test(n))).toBe(false);
    expect(names.some((n) => /\$|3k|two\s+weeks/i.test(n))).toBe(false);
    expect(result.purpose).toMatch(/shopify/i);
    const canonical = canonicalizeStarterDraftForReview(result);
    const canonNames = canonical.parties.map((p) => p.name);
    expect(canonNames).toContain("Alex");
    expect(canonNames.some((n) => /party\s*[ab]/i.test(n))).toBe(false);
    expect(canonNames.some((n) => /\$|3k|two\s+weeks/i.test(n))).toBe(false);
    expect(canonical.purpose).toMatch(/shopify/i);
    expect(canonical.purpose).toMatch(/theme/i);
    expect(canonical.title).toMatch(/services agreement/i);
    expect(canonical.title).not.toMatch(/employment/i);
    expect(result.agreement_family).toBe("services_agreement");
    expect(canonical.payment_terms || "").toMatch(/3[,.]?000|3k|\$3/i);
    expect(assessStarterComplexityGate(raw).required).toBe(false);
  });

  it("Red Mesa dump keeps Anthem + Red Mesa LLC, not They Pay Monthly", () => {
    const raw = "Consulting for Red Mesa LLC, I am Anthem, they pay monthly";
    const inferred = inferCasualTwoPartyFromDump(raw);
    expect(inferred).not.toBeNull();
    expect(inferred!.map((p) => p.name)).toEqual(expect.arrayContaining(["Anthem", "Red Mesa LLC"]));
    const result = runIntakeDefaultsAndRoles(emptyDraft(), raw, true, defaultIntakePartyRoleLabels());
    const names = result.parties.map((p) => p.name);
    expect(names.some((n) => /Anthem/i.test(n))).toBe(true);
    expect(names.some((n) => /Red Mesa/i.test(n))).toBe(true);
    expect(names.some((n) => /they\s+pay/i.test(n))).toBe(false);
    const canonical = canonicalizeStarterDraftForReview(result);
    const canonNames = canonical.parties.map((p) => p.name);
    expect(canonNames.some((n) => /Anthem/i.test(n))).toBe(true);
    expect(canonNames.some((n) => /Red Mesa/i.test(n))).toBe(true);
    expect(canonNames.some((n) => /they\s+pay/i.test(n))).toBe(false);
    expect(assessStarterComplexityGate(raw).required).toBe(false);
  });

  it.each([
    "my dog is named Biscuit and the trucks are teal",
    "lol just testing this, pizza is great",
    "I need a contract",
  ])("keeps junk gated: %s", (dump) => {
    expect(assessStarterComplexityGate(dump).required).toBe(true);
    expect(inferCasualTwoPartyFromDump(dump)).toBeNull();
  });

  it("rejects money, term, and they-pay fragments as party names", () => {
    expect(looksLikeMoneyTermOrClausePartyName("$3k, Two Weeks")).toBe(true);
    expect(looksLikeMoneyTermOrClausePartyName("They Pay Monthly")).toBe(true);
    expect(looksLikeMoneyTermOrClausePartyName("two weeks")).toBe(true);
    expect(looksLikeMoneyTermOrClausePartyName("3k/month")).toBe(true);
    expect(looksLikeMoneyTermOrClausePartyName("Alex")).toBe(false);
    expect(looksLikeMoneyTermOrClausePartyName("Red Mesa LLC")).toBe(false);
    expect(looksLikeMoneyTermOrClausePartyName("Anthem")).toBe(false);
  });
});

describe("free starter dump title, purpose, and preview footer", () => {
  function run(raw: string) {
    const result = runIntakeDefaultsAndRoles(emptyDraft(), raw, true, defaultIntakePartyRoleLabels());
    return { result, canonical: canonicalizeStarterDraftForReview(result) };
  }

  it("Mike title is a real heading and purpose is a sentence from his words", () => {
    const { result, canonical } = run("I hired Mike to paint my office. We shook on it.");
    expect(canonical.title).toMatch(/painting agreement|services agreement/i);
    expect(canonical.title).not.toMatch(/^business agreement$/i);
    expect(canonical.purpose).toMatch(/Mike will paint/i);
    expect(canonical.purpose).toMatch(/office/i);
    expect(canonical.purpose).not.toMatch(/^paint my office$/i);
    expect(canonical.parties.map((p) => ({ name: p.name, role: p.role }))).toEqual([
      { name: "Client", role: "client" },
      { name: "Mike", role: "service_provider" },
    ]);
    expect(canonical.payment_terms || "").not.toMatch(/no\s+fees|unpaid|\$0\b/i);
    expect((canonical.jurisdiction || "").trim()).toBe("");
    expect(result.agreement_family).toBe("services_agreement");
  });

  it("Hire Alex is Services Agreement, not Employment", () => {
    const { result, canonical } = run("Hire Alex to build our shopify theme, $3k, two weeks");
    expect(canonical.title).toMatch(/services agreement/i);
    expect(canonical.title).not.toMatch(/employment/i);
    expect(canonical.purpose).toMatch(/shopify/i);
    expect(canonical.purpose).toMatch(/theme/i);
    expect(canonical.parties.map((p) => p.name)).toEqual(expect.arrayContaining(["Client", "Alex"]));
    expect(result.agreement_family).toBe("services_agreement");
  });

  it("Jordan NDA title is a non-disclosure heading and purpose mentions the app idea", () => {
    const { canonical } = run("nda between me and Jordan about the app idea");
    expect(canonical.title).toMatch(/non-disclosure agreement/i);
    expect(canonical.purpose).toMatch(/app idea/i);
    expect((canonical.jurisdiction || "").trim()).toBe("");
    expect(canonical.jurisdiction || "").not.toMatch(/delaware/i);
  });

  it("fence dump visitor-is-hirer keeps Client then unnamed Service Provider", () => {
    const dump = "need someone to fix the broken fence";
    const { result, canonical } = run(dump);
    expect(canonical.title).toMatch(/repair agreement/i);
    expect(canonical.purpose).toMatch(/fence/i);
    expect(result.parties.map((p) => ({ name: p.name, role: p.role }))).toEqual([
      { name: "Client", role: "client" },
      { name: "Service Provider", role: "service_provider" },
    ]);
    expect(canonical.parties.map((p) => ({ name: p.name, role: p.role }))).toEqual([
      { name: "Client", role: "client" },
      { name: "Service Provider", role: "service_provider" },
    ]);
    const preview = buildAgreementPreviewText(canonical, {
      starterPreview: true,
      freeStarterReviewPreview: true,
      intakeText: dump,
    });
    expect(preview).not.toMatch(/Service Provider\s*\(\s*[“"]Client[”"]\)/);
    expect(preview).toMatch(/Client\s*\(\s*[“"]Client[”"]\)/);
    expect(preview).toMatch(/Service Provider\s*\(\s*[“"]Service Provider[”"]\)/);
    expect(assessStarterComplexityGate("lol just testing this, pizza is great").required).toBe(true);
  });

  it("free starter preview does not claim the agreement will be executed electronically via LawDog", () => {
    const raw = "I hired Mike to paint my office. We shook on it.";
    const { canonical } = run(raw);
    const preview = buildAgreementPreviewText(canonical, {
      starterPreview: true,
      freeStarterReviewPreview: true,
      intakeText: raw,
    });
    expect(preview).not.toMatch(/executed electronically via LawDog/i);
    expect(preview).not.toMatch(/will be executed electronically/i);
  });
});

describe("visitor plus one named party is a free two-party deal", () => {
  it("Red Mesa cabinets dump keeps visitor + Red Mesa", () => {
    const dump = "Red Mesa will redo my kitchen cabinets next month. We haven't talked money.";
    const out = inferCasualTwoPartyFromDump(dump);
    expect(out).not.toBeNull();
    expect(out!.map((p) => p.name)).toEqual(expect.arrayContaining(["Client", "Red Mesa"]));
    expect(out!.some((p) => /party\s*[ab]/i.test(p.name))).toBe(false);
    expect(inferCasualScopeFromDump(dump)).toMatch(/kitchen cabinets|redo/i);
  });

  it("Jordan Hale hiring Pine Street keeps both names and does not drop Jordan", () => {
    const dump = "Jordan Hale hiring Pine Street Media LLC";
    const out = inferCasualTwoPartyFromDump(dump);
    expect(out).not.toBeNull();
    expect(out!.map((p) => p.name)).toEqual(
      expect.arrayContaining(["Jordan Hale", "Pine Street Media LLC"]),
    );
    expect(out!.some((p) => /jordan/i.test(p.name))).toBe(true);
    expect(out!.filter((p) => /pine street/i.test(p.name))).toHaveLength(1);
  });

  it("first-person hiring of Pine Street still counts the visitor", () => {
    const dump = "I'm Jordan Hale hiring Pine Street Media LLC";
    const out = inferCasualTwoPartyFromDump(dump);
    expect(out).not.toBeNull();
    expect(out!.map((p) => p.name)).toEqual(
      expect.arrayContaining(["Jordan Hale", "Pine Street Media LLC"]),
    );
  });

  it("neighbor Priya dogsitting dump keeps visitor + Priya", () => {
    const dump = "my neighbor Priya is going to dogsit";
    const out = inferCasualTwoPartyFromDump(dump);
    expect(out).not.toBeNull();
    expect(out!.map((p) => p.name)).toEqual(expect.arrayContaining(["Client", "Priya"]));
    expect(out!.some((p) => /priya/i.test(p.name))).toBe(true);
    expect(inferCasualScopeFromDump(dump)).toMatch(/dogsit/i);
  });

  it("Alex lawn dump still grounds Client + Alex", () => {
    const dump = "Alex will mow my lawn";
    const out = inferCasualTwoPartyFromDump(dump);
    expect(out!.map((p) => p.name)).toEqual(expect.arrayContaining(["Client", "Alex"]));
  });

  it("junk still has no named two-party deal", () => {
    expect(inferCasualTwoPartyFromDump("lol just testing this, pizza is great")).toBeNull();
  });
});

describe("hire-company preamble keeps hirer opposite the company", () => {
  it("Jordan Hale hiring Pine Street paints hirer vs company, not company vs company", () => {
    const dump = "Jordan Hale hiring Pine Street Media LLC to run ads for The Daily Grind";
    const result = runIntakeDefaultsAndRoles(emptyDraft(), dump, true, defaultIntakePartyRoleLabels());
    const canonical = canonicalizeStarterDraftForReview(result);
    expect(canonical.parties.map((p) => p.name)).toEqual(["Jordan Hale", "Pine Street Media LLC"]);
    expect(canonical.parties[0]?.role).toMatch(/client/i);
    expect(canonical.parties[1]?.role).toMatch(/service_provider|service provider/i);
    const preview = buildStarterAgreementPreviewForReview(canonical, { intakeText: dump });
    expect(preview).toMatch(/Jordan Hale/);
    expect(preview).toMatch(/Pine Street Media LLC/);
    expect(preview).not.toMatch(
      /Pine Street Media LLC\s*\(["“']Client["”']\)\s+and\s+Pine Street Media\s*\(["“']Service Provider["”']\)/,
    );
    expect(preview).not.toMatch(/Daily Grind\s*\(["“'](?:Client|Service Provider)["”']\)/);
  });

  it("Alex and Mike slots stay Client vs Service Provider", () => {
    const alex = runIntakeDefaultsAndRoles(
      emptyDraft(),
      "Hire Alex to build our shopify theme, $3k, two weeks",
      true,
      defaultIntakePartyRoleLabels(),
    );
    const alexCanon = canonicalizeStarterDraftForReview(alex);
    expect(alexCanon.parties.map((p) => ({ name: p.name, role: p.role }))).toEqual([
      { name: "Client", role: "client" },
      { name: "Alex", role: "service_provider" },
    ]);
    const alexPreview = buildStarterAgreementPreviewForReview(alexCanon, {
      intakeText: "Hire Alex to build our shopify theme, $3k, two weeks",
    });
    expect(alexPreview).toMatch(/Client\s*\(["“']Client["”']\)/);
    expect(alexPreview).toMatch(/Alex\s*\(["“']Service Provider["”']\)/);

    const mike = runIntakeDefaultsAndRoles(
      emptyDraft(),
      "I hired Mike to paint my office. We shook on it.",
      true,
      defaultIntakePartyRoleLabels(),
    );
    const mikeCanon = canonicalizeStarterDraftForReview(mike);
    expect(mikeCanon.parties.map((p) => ({ name: p.name, role: p.role }))).toEqual([
      { name: "Client", role: "client" },
      { name: "Mike", role: "service_provider" },
    ]);
    const mikePreview = buildStarterAgreementPreviewForReview(mikeCanon, {
      intakeText: "I hired Mike to paint my office. We shook on it.",
    });
    expect(mikePreview).toMatch(/Client\s*\(["“']Client["”']\)/);
    expect(mikePreview).toMatch(/Mike\s*\(["“']Service Provider["”']\)/);
  });
});
