import { afterEach, describe, expect, it } from "vitest";
import {
  clearAcceptedReviewSnapshotRef,
  clearDisplayReviewSnapshotAuthority,
} from "../../agreement/canonicalReviewSnapshotApi";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN,
  resetPaidProVisibleDocumentShellLogsForTests,
  resolveCanonicalPlainForVisibleShell,
} from "./paidProVisibleDocumentShell";
import {
  clearPaidProReviewSessionAuthorityForTests,
  establishPaidProReviewSessionAuthority,
} from "./paidProReviewSessionAuthority";
import { clearPaidProSourceOfTruth, hashPaidProCorpus } from "./paidProSourceOfTruth";
import { replacePaidProSourceOfTruth } from "./paidProSourceOfTruthState";
import {
  collectReviewPlainTopLevelSectionNumbers,
  extractSuppliedGoverningLaw,
  repairReviewPlainSectionContinuity,
  reviewPlainHasOperativeGoverningLaw,
  reviewPlainHasSkippedSectionNumbers,
} from "./reviewPlainSectionContinuity";

function twoPartyIntake(args: { client: string; provider: string; law: string }): string {
  return (
    `${args.client} is hiring ${args.provider} to design a logo and brand kit for $2,400, ` +
    `term 30 days, governing law ${args.law}.`
  );
}

function servicesBody(args: {
  client: string;
  provider: string;
  headings: Array<[number, string]>;
}): string {
  const lines = [
    "SERVICES AGREEMENT",
    "",
    `This Services Agreement (this "Agreement") is entered into as of the Effective Date by and between ${args.client} ("Client") and ${args.provider} ("Service Provider").`,
    "",
  ];
  for (const [num, title] of args.headings) {
    lines.push(`${num}. ${title}`);
    if (/Force Majeure/i.test(title)) {
      lines.push("Neither party is liable for delay caused by events beyond its reasonable control.");
    } else if (/Notices/i.test(title)) {
      lines.push("Any notice under this Agreement must be in writing and delivered as set forth below.");
      lines.push(`If to ${args.client}: ${args.client} Email: notices-client@example.com`);
      lines.push(`If to ${args.provider}: ${args.provider} Email: notices-provider@example.com`);
    } else if (/Independent Contractor/i.test(title)) {
      lines.push("Designer is an independent contractor and may not assign this Agreement without consent.");
    } else {
      lines.push(`The parties agree to the ${title.toLowerCase()} terms of this Agreement.`);
    }
    lines.push("");
  }
  lines.push(
    "IN WITNESS WHEREOF, the parties have executed this Agreement as of the Effective Date.",
    "",
    `CLIENT: ${args.client}`,
    "By: ____________________",
    "",
    `SERVICE PROVIDER: ${args.provider}`,
    "By: ____________________",
  );
  return lines.join("\n");
}

const LATE_TITLES: Record<number, string> = {
  1: "Services and Deliverables",
  2: "Client Materials, Cooperation, and Approvals",
  3: "Fees and Payment",
  4: "Term and Termination",
  5: "Intellectual Property",
  6: "Confidentiality",
  7: "Representations and Warranties",
  8: "Limitation of Liability",
  9: "Indemnification",
  10: "Miscellaneous",
  11: "Independent Contractor and Assignment",
  12: "Force Majeure",
  13: "Governing Law",
  14: "Notices",
};

function sequentialThrough(n: number, client: string, provider: string): string {
  const headings: Array<[number, string]> = [];
  for (let i = 1; i <= n; i += 1) {
    headings.push([i, LATE_TITLES[i] ?? `Section ${i}`]);
  }
  return servicesBody({ client, provider, headings });
}

function twelveThenFourteen(client: string, provider: string): string {
  const headings: Array<[number, string]> = (
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14] as const
  ).map((n) => [n, LATE_TITLES[n] ?? `Section ${n}`]);
  return servicesBody({ client, provider, headings });
}

function tenThenTwelve(client: string, provider: string): string {
  const headings: Array<[number, string]> = [
    [1, "Services and Deliverables"],
    [2, "Fees and Payment"],
    [3, "Term and Termination"],
    [4, "Intellectual Property"],
    [5, "Confidentiality"],
    [6, "Limitation of Liability"],
    [7, "Indemnification"],
    [8, "Independent Contractor and Assignment"],
    [9, "Force Majeure"],
    [10, "Miscellaneous"],
    [12, "Notices"],
  ];
  return servicesBody({ client, provider, headings });
}

function leftoverEightSection(client: string, provider: string): string {
  return servicesBody({
    client,
    provider,
    headings: [
      [1, "Services and Deliverables"],
      [2, "Fees and Payment"],
      [3, "Term and Termination"],
      [4, "Intellectual Property"],
      [5, "Confidentiality"],
      [6, "Limitation of Liability"],
      [7, "Governing Law"],
      [8, "Notices"],
    ],
  }).replace(
    "The parties agree to the governing law terms of this Agreement.",
    "This Agreement is governed by the laws of the jurisdiction named in the intake.",
  );
}

function assertSequentialIntegers(plain: string): void {
  const nums = collectReviewPlainTopLevelSectionNumbers(plain);
  expect(reviewPlainHasSkippedSectionNumbers(plain)).toBe(false);
  for (let i = 1; i < nums.length; i += 1) {
    expect(nums[i]).toBe(nums[i - 1]! + 1);
  }
}

describe("Review/plain skipped section numbering", () => {
  const cases = [
    { law: "Oklahoma", client: "Cedar Ridge LLC", provider: "Maple Grove Inc" },
    { law: "Colorado", client: "Riverbend Studio", provider: "Oak Point LLC" },
    { law: "New York", client: "Summit Craft Co", provider: "Harborline Design LLC" },
  ] as const;

  it.each(cases)("FAILs 12-then-14 and 10-then-12; PASSES sequential ($law)", ({ law, client, provider }) => {
    const skipped1214 = twelveThenFourteen(client, provider);
    const skipped1012 = tenThenTwelve(client, provider);
    const sequential = sequentialThrough(14, client, provider);

    expect(reviewPlainHasSkippedSectionNumbers(skipped1214)).toBe(true);
    expect(collectReviewPlainTopLevelSectionNumbers(skipped1214)).toContain(12);
    expect(collectReviewPlainTopLevelSectionNumbers(skipped1214)).toContain(14);
    expect(collectReviewPlainTopLevelSectionNumbers(skipped1214)).not.toContain(13);

    expect(reviewPlainHasSkippedSectionNumbers(skipped1012)).toBe(true);
    expect(collectReviewPlainTopLevelSectionNumbers(skipped1012)).toEqual(
      expect.arrayContaining([10, 12]),
    );
    expect(collectReviewPlainTopLevelSectionNumbers(skipped1012)).not.toContain(11);

    expect(reviewPlainHasSkippedSectionNumbers(sequential)).toBe(false);
    expect(collectReviewPlainTopLevelSectionNumbers(sequential)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
    ]);
    expect(extractSuppliedGoverningLaw(twoPartyIntake({ client, provider, law }))).toBe(law);
  });

  it("repairs 12-then-14 and keeps intake governing law (not a hard-coded venue)", () => {
    const client = "Cedar Ridge LLC";
    const provider = "Maple Grove Inc";
    const law = "Oklahoma";
    const raw = twelveThenFourteen(client, provider);
    expect(reviewPlainHasSkippedSectionNumbers(raw)).toBe(true);
    expect(reviewPlainHasOperativeGoverningLaw(raw, law)).toBe(false);

    const { text } = repairReviewPlainSectionContinuity(raw, {
      intakeText: twoPartyIntake({ client, provider, law }),
    });
    assertSequentialIntegers(text);
    expect(reviewPlainHasOperativeGoverningLaw(text, law)).toBe(true);
    expect(text).toMatch(new RegExp(law, "i"));
    expect(text).not.toMatch(/Texas/);
    expect(text).not.toMatch(/Northline/);
    expect(text).not.toMatch(/Harbor Marks/);
    expect(text).not.toMatch(/Priya|Diego/);
  });

  it("repairs 10-then-12 and keeps a different supplied governing law", () => {
    const client = "Riverbend Studio";
    const provider = "Oak Point LLC";
    const law = "Colorado";
    const raw = tenThenTwelve(client, provider);
    expect(reviewPlainHasSkippedSectionNumbers(raw)).toBe(true);

    const { text } = repairReviewPlainSectionContinuity(raw, {
      intakeText: twoPartyIntake({ client, provider, law }),
    });
    assertSequentialIntegers(text);
    expect(reviewPlainHasOperativeGoverningLaw(text, law)).toBe(true);
    expect(text).toMatch(/Colorado/i);
  });

  it("does not collapse 12-then-14 when governing law is still missing and no intake was supplied", () => {
    const raw = twelveThenFourteen("Cedar Ridge LLC", "Maple Grove Inc");
    const { text, repairs } = repairReviewPlainSectionContinuity(raw);
    expect(reviewPlainHasSkippedSectionNumbers(text)).toBe(true);
    expect(collectReviewPlainTopLevelSectionNumbers(text)).toContain(14);
    expect(repairs).toEqual([]);
  });

  it("does not remint leftover 8-section into 10/11/12/13", () => {
    const client = "Summit Craft Co";
    const provider = "Harborline Design LLC";
    const leftover = leftoverEightSection(client, provider);
    expect(collectReviewPlainTopLevelSectionNumbers(leftover)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(reviewPlainHasSkippedSectionNumbers(leftover)).toBe(false);

    const { text } = repairReviewPlainSectionContinuity(leftover, {
      intakeText: twoPartyIntake({ client, provider, law: "Delaware" }),
    });
    const nums = collectReviewPlainTopLevelSectionNumbers(text);
    expect(nums).not.toContain(10);
    expect(nums).not.toContain(11);
    expect(nums).not.toContain(12);
    expect(nums).not.toContain(13);
    expect(nums[0]).toBe(1);
    expect(reviewPlainHasSkippedSectionNumbers(text)).toBe(false);
  });
});

function padToVisibleShellFloor(corpus: string): string {
  const min = PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN + 1500;
  if (corpus.length >= min) return corpus;
  const pad = "Each party shall keep confidential information confidential. ".repeat(80);
  return corpus.replace(
    "IN WITNESS WHEREOF, the parties have executed this Agreement as of the Effective Date.",
    `${pad.trim()}\n\nIN WITNESS WHEREOF, the parties have executed this Agreement as of the Effective Date.`,
  );
}

describe("persist Review paint sequentializes skipped integers", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearPaidProReviewSessionAuthorityForTests();
    clearDisplayReviewSnapshotAuthority();
    clearAcceptedReviewSnapshotRef();
    resetPaidProVisibleDocumentShellLogsForTests();
  });

  it("Screen 1 persist Review paint FAILs 12-then-14 until repaired, then PASSES sequential + supplied law", () => {
    const client = "Cedar Ridge LLC";
    const provider = "Maple Grove Inc";
    const law = "Oklahoma";
    const intake = twoPartyIntake({ client, provider, law });
    const raw = padToVisibleShellFloor(twelveThenFourteen(client, provider));
    expect(reviewPlainHasSkippedSectionNumbers(raw)).toBe(true);

    replacePaidProSourceOfTruth({
      text: raw,
      hash: hashPaidProCorpus(raw),
      accepted_at: Date.now(),
      source: "server_full_draft",
      reviewSessionId: "review_plain_skip_paint",
    });
    establishPaidProReviewSessionAuthority({
      corpusPlain: raw,
      source: "persist_get",
      integrityOk: true,
      reviewSessionId: "review_plain_skip_paint",
      agreementId: "agr_review_plain_skip",
    });

    const draft: ParsedDraftShape = {
      title: "Services Agreement",
      jurisdiction: law,
      agreement_family: "services_agreement",
      parties: [
        { name: client, role: "Client" },
        { name: provider, role: "Service Provider" },
      ],
      purpose: "logo and brand kit",
      payment_terms: "$2,400",
      duration: "30 days",
      due_date: null,
      effective_date: null,
      payment: { amount: 2400, cadence: "one_time", valid: true },
    };

    const painted = resolveCanonicalPlainForVisibleShell({
      draft,
      intakeText: intake,
      agreementId: "agr_review_plain_skip",
      paidProActive: true,
      premiumCheckoutCompleted: true,
      premiumPaidDocumentSurface: true,
      acceptedCanonicalPlain: raw,
    });

    expect(reviewPlainHasSkippedSectionNumbers(painted.plain)).toBe(false);
    assertSequentialIntegers(painted.plain);
    expect(reviewPlainHasOperativeGoverningLaw(painted.plain, law)).toBe(true);
    expect(painted.plain).toMatch(/Oklahoma/i);
    expect(painted.plain).not.toMatch(/Texas/);
    expect(painted.plain).not.toMatch(/Northline|Harbor Marks|Priya|Diego/);
  });
});
