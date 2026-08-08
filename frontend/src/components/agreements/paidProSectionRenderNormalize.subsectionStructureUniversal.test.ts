import { describe, expect, it } from "vitest";
import { repairGluedSectionHeadingsInText } from "./documentSectionHeadingSplit";
import { normalizePaidProSectionRender } from "./paidProSectionRenderNormalize";
import { repairJoinedTopLevelSectionHeadings } from "./sectionStructureAuthority";

type GlueCase = {
  label: string;
  parent: number;
  title: string;
  firstSub: number;
  laterMain: number;
  laterMainTitle: string;
  misplacedSubs: Array<{ n: number; title: string; body: string }>;
};

const UNIVERSAL_CASES: GlueCase[] = [
  {
    label: "retest General Terms / Notices (9→10)",
    parent: 9,
    title: "General Terms",
    firstSub: 1,
    laterMain: 10,
    laterMainTitle: "NOTICES",
    misplacedSubs: [
      { n: 2, title: "Force Majeure", body: "Neither party is liable for delays beyond control." },
      { n: 3, title: "Assignment", body: "Neither party may assign without consent." },
    ],
  },
  {
    label: "early Payment Terms under Fees (3→4)",
    parent: 3,
    title: "Payment Terms",
    firstSub: 1,
    laterMain: 4,
    laterMainTitle: "Fees Schedule",
    misplacedSubs: [
      { n: 2, title: "Late Fees", body: "Late amounts accrue interest at one percent per month." },
      { n: 3, title: "Expenses", body: "Pre-approved expenses are reimbursable." },
    ],
  },
  {
    label: "high-number Miscellaneous under Notices (18→19)",
    parent: 18,
    title: "Miscellaneous",
    firstSub: 1,
    laterMain: 19,
    laterMainTitle: "Notices",
    misplacedSubs: [
      { n: 2, title: "Severability", body: "If any provision is unenforceable, the rest remains." },
      { n: 3, title: "Waiver", body: "Failure to enforce is not a waiver." },
    ],
  },
  {
    label: "ALL-CAPS Liability under Indemnity (14→15)",
    parent: 14,
    title: "LIMITATION OF LIABILITY",
    firstSub: 1,
    laterMain: 15,
    laterMainTitle: "INDEMNIFICATION",
    misplacedSubs: [
      { n: 2, title: "Cap", body: "Aggregate liability is capped at fees paid." },
    ],
  },
];

/** Production-shaped defect: `N. TitleN.1` + title on next line; later N.x sit under M > N. */
function buildGluedCorpus(c: GlueCase): string {
  const p = c.parent;
  const m = c.laterMain;
  const misplaced = c.misplacedSubs.flatMap((sub) => [
    "",
    `${p}.${sub.n} ${sub.title}`,
    sub.body,
  ]);

  return [
    `${Math.max(1, p - 1)}. Prior Section`,
    "Prior section body.",
    "",
    `${p}. ${c.title}${p}.${c.firstSub}`,
    "Intro",
    "Introductory subsection body.",
    "",
    `${m}. ${c.laterMainTitle}`,
    "Later main section body that incorrectly absorbed parent subsections.",
    ...misplaced,
    "",
    `${m + 1}. Governing Law`,
    "This Agreement is governed by California law.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
  ].join("\n");
}

describe("universal subsection glue + mis-nest repair", () => {
  it.each(UNIVERSAL_CASES)(
    "splits letter-glued main→subsection with no whitespace — $label",
    (c) => {
      const raw = `${c.parent}. ${c.title}${c.parent}.${c.firstSub}\nIntro\nBody.`;
      const split = repairGluedSectionHeadingsInText(raw);
      expect(split, c.label).toMatch(
        new RegExp(`${c.parent}\\.\\s+${c.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n\\n${c.parent}\\.${c.firstSub}\\b`),
      );
      expect(split, c.label).not.toMatch(
        new RegExp(`${c.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${c.parent}\\.${c.firstSub}`),
      );
    },
  );

  it.each(UNIVERSAL_CASES)(
    "repairJoinedTopLevelSectionHeadings relocates N.x before later main — $label",
    (c) => {
      const repaired = repairJoinedTopLevelSectionHeadings(buildGluedCorpus(c));
      expect(repaired.text, c.label).not.toMatch(
        new RegExp(`${c.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${c.parent}\\.${c.firstSub}`),
      );
      expect(repaired.text, c.label).toMatch(
        new RegExp(`^${c.parent}\\.\\s+${c.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "m"),
      );
      expect(repaired.text, c.label).toMatch(new RegExp(`^${c.parent}\\.${c.firstSub}\\b`, "m"));

      const laterIdx = repaired.text.search(
        new RegExp(`^${c.laterMain}\\.\\s+${c.laterMainTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "im"),
      );
      expect(laterIdx, c.label).toBeGreaterThan(0);

      let prev = repaired.text.search(new RegExp(`^${c.parent}\\.${c.firstSub}\\b`, "m"));
      for (const sub of c.misplacedSubs) {
        const idx = repaired.text.search(
          new RegExp(`^${c.parent}\\.${sub.n}\\s+${sub.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "m"),
        );
        expect(idx, `${c.label} ${c.parent}.${sub.n}`).toBeGreaterThan(prev);
        expect(idx, `${c.label} ${c.parent}.${sub.n} before later main`).toBeLessThan(laterIdx);
        prev = idx;
      }
      expect(repaired.repairs.some((r) => r.includes("relocate_misplaced_subsections")), c.label).toBe(
        true,
      );
    },
  );

  it.each(UNIVERSAL_CASES)(
    "normalizePaidProSectionRender repairs glue + order end-to-end — $label",
    (c) => {
      const { text, fixedHeadingBodyCollapse } = normalizePaidProSectionRender(buildGluedCorpus(c));
      expect(fixedHeadingBodyCollapse, c.label).toBeGreaterThan(0);
      expect(text, c.label).not.toMatch(
        new RegExp(`${c.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${c.parent}\\.${c.firstSub}`),
      );
      const laterIdx = text.search(
        new RegExp(`^${c.laterMain}\\.\\s+${c.laterMainTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "im"),
      );
      for (const sub of c.misplacedSubs) {
        const idx = text.search(
          new RegExp(`^${c.parent}\\.${sub.n}\\s+${sub.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "m"),
        );
        expect(idx, c.label).toBeGreaterThan(0);
        expect(idx, c.label).toBeLessThan(laterIdx);
      }
    },
  );

  it("splits title glued with no space before subsection title (Terms9.1Notices)", () => {
    const split = repairGluedSectionHeadingsInText("9. General Terms9.1Notices\nBody.");
    expect(split).toMatch(/9\.\s+General Terms\n\n9\.1 Notices/m);
    expect(split).not.toMatch(/Terms9\.1/);
  });

  it("splits deeper subsection glue (18.1.1) and relocates bare N.x title-on-next-line", () => {
    const input = [
      "18. Miscellaneous18.1",
      "Survival",
      "Survival body.",
      "",
      "19. Notices",
      "Notice body.",
      "",
      "18.1.1 Deep Survival",
      "Deep body.",
      "",
      "18.2 Severability",
      "Severability body.",
    ].join("\n");
    const repaired = repairJoinedTopLevelSectionHeadings(input);
    expect(repaired.text).not.toMatch(/Miscellaneous18\.1/);
    expect(repaired.text).toMatch(/^18\.1\b/m);
    const idxDeep = repaired.text.search(/^18\.1\.1\s+Deep Survival/m);
    const idx182 = repaired.text.search(/^18\.2\s+Severability/m);
    const idx19 = repaired.text.search(/^19\.\s+Notices/im);
    expect(idxDeep).toBeGreaterThan(0);
    expect(idx182).toBeGreaterThan(idxDeep);
    expect(idx19).toBeGreaterThan(idx182);
  });

  it("does not relocate orphan subsections when parent main section was never seen", () => {
    const input = [
      "7. Governing Law",
      "Governing body.",
      "",
      "1.5 Out-of-Scope Work",
      "Scope body.",
    ].join("\n");
    const repaired = repairJoinedTopLevelSectionHeadings(input);
    expect(repaired.repairs.some((r) => r.includes("relocate_misplaced_subsections"))).toBe(false);
    expect(repaired.text.search(/^7\.\s+Governing Law/m)).toBeLessThan(
      repaired.text.search(/^1\.5\s+Out-of-Scope Work/m),
    );
  });
});
