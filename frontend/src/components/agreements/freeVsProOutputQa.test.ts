/**
 * Free vs Pro output QA — deterministic layers only (no LLM / no fetch).
 * Loads qa/fixtures for priority scenarios.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAgreementPreviewText } from "./agreementPreviewFromDraft";
import { buildPremiumAgreementReadonlyHtml } from "./premiumAgreementDocumentHtml";
import { computePremiumDocumentRenderHints } from "./premiumDocumentRenderHints";
import {
  buildIntakeContradictionWarning,
  detectIntakeContradictionHints,
} from "./intakeContradictionHints";
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { parseIntakeToStructuredAgreement } from "./intakeStructuredAgreementModel";
import { buildPremiumSituationProfile } from "./premiumSituationIntelligence";

const FIXTURE_DIR = resolve(__dirname, "../../../../qa/fixtures");
const FIXTURE_FILES = [
  "creator-economy-prompts.json",
  "messy-prompts.json",
  "contradictory-prompts.json",
  "emotional-prompts.json",
  "crypto-prompts.json",
  "short-prompts.json",
] as const;

const PRIORITY_IDS = [
  "creator-001",
  "messy-004",
  "short-002",
  "contra-001",
  "emo-001",
  "crypto-001",
  "short-001",
  "emo-003",
  "short-003",
] as const;

/** Pro delivery header — must not appear in Free starter preview body. */
const PRO_ONLY_MARKERS = [
  "This LawDog Pro agreement is organized for your review",
  "Built for a paid creator or brand collaboration",
  "Built for B2B software",
] as const;

const EMPTY_PAYMENT = { amount: null as number | null, cadence: null as string | null, valid: true };

type FixtureRow = { id: string; prompt: string; tags?: string[]; title?: string };

function loadFixture(id: string): FixtureRow {
  for (const file of FIXTURE_FILES) {
    const rows = JSON.parse(readFileSync(join(FIXTURE_DIR, file), "utf-8")) as FixtureRow[];
    const row = rows.find((r) => r.id === id);
    if (row) return row;
  }
  throw new Error(`fixture not found: ${id}`);
}

function starterDraftFromIntake(intake: string): ParsedDraftShape {
  const structured = parseIntakeToStructuredAgreement(intake);
  const base: ParsedDraftShape = {
    title: structured.title || "",
    jurisdiction: structured.jurisdiction || "",
    parties: structured.parties || [],
    purpose: structured.purpose || "",
    payment_terms: structured.payment_terms || "",
    duration: structured.duration ?? null,
    due_date: null,
    effective_date: null,
    payment: EMPTY_PAYMENT,
    agreement_family: structured.agreement_family,
  };
  return runIntakeDefaultsAndRoles(base, intake, true, defaultIntakePartyRoleLabels());
}

function freeStarterPreview(intake: string): string {
  return buildAgreementPreviewText(starterDraftFromIntake(intake), { starterPreview: true });
}

describe("freeVsProOutputQa — priority fixtures", () => {
  it.each(PRIORITY_IDS)("%s — Free starter preview excludes Pro-only framing", (id) => {
    const { prompt } = loadFixture(id);
    const preview = freeStarterPreview(prompt);
    for (const marker of PRO_ONLY_MARKERS) {
      expect(preview).not.toContain(marker);
    }
    expect(preview.length).toBeGreaterThan(80);
  });

  it("creator-001 — Pro render hints include executive framing", () => {
    const { prompt } = loadFixture("creator-001");
    const draft = starterDraftFromIntake(prompt);
    const hints = computePremiumDocumentRenderHints(draft, "1. SCOPE\n\nDeliverables.", prompt);
    expect(hints.executiveFramingLine).toMatch(/creator|brand/i);
    expect(hints.executiveFramingLine).not.toMatch(/LawDog Pro agreement is organized/i);
  });

  it("short-002 — Pro hints reflect SaaS situation", () => {
    const { prompt } = loadFixture("short-002");
    const hints = computePremiumDocumentRenderHints(
      starterDraftFromIntake(prompt),
      "1. SUBSCRIPTION\n\nFees.",
      prompt,
    );
    expect(hints.executiveFramingLine).toMatch(/Software|subscription|SaaS/i);
  });

  it("contra-001 — contradiction warning before Pro generation", () => {
    const { prompt } = loadFixture("contra-001");
    expect(buildIntakeContradictionWarning(prompt)).toMatch(/exclusive/i);
    expect(detectIntakeContradictionHints(prompt).length).toBeGreaterThanOrEqual(1);
  });

  it("emo-001 — emotional intake gets calm Pro executive framing", () => {
    const { prompt } = loadFixture("emo-001");
    const profile = buildPremiumSituationProfile(prompt);
    expect(profile.executiveLine).toMatch(/Neutral|Sensitive|professional/i);
    expect(profile.executiveLine).not.toMatch(/sue|destroy|prosecuted/i);
  });

  it("Pro readonly HTML strips starter disclaimer and shows executive callout", () => {
    const plain =
      "INFLUENCER AGREEMENT\n\nThis is a simplified starter preview for review only.\n\n1. DELIVERABLES\n\nThree posts.";
    const html = buildPremiumAgreementReadonlyHtml(plain, {
      signatureSectionMode: "collaboration",
      partyNames: ["Brand Co", "Creator"],
      renderHints: {
        paymentNeedsFinalNumbers: false,
        partiesNeedLegalNames: false,
        jurisdictionNeedsSelection: false,
        executiveFramingLine: "Built for a paid creator or brand collaboration.",
        contradictionDocumentNote: null,
      },
    });
    expect(html).not.toMatch(/simplified starter preview/i);
    expect(html).toMatch(/creator|brand/i);
  });

  it("contra-001 — Pro contradiction document note when hints computed", () => {
    const { prompt } = loadFixture("contra-001");
    const hints = computePremiumDocumentRenderHints(
      starterDraftFromIntake(prompt),
      "1. GRANT\n\nLicense scope.",
      prompt,
    );
    expect(hints.contradictionDocumentNote).toMatch(/exclusive/i);
  });
});
