import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  STARTER_QUICK_ADDS,
  appendStarterQuickAddSnippet,
  logStarterSuggestionApplied,
} from "./starterQuickAdds";
import { resolveStarterCreateSubmitText as resolveSubmit } from "./starterCreateSubmit";

describe("appendStarterQuickAddSnippet", () => {
  it("appends snippet without replacing existing pasted prompt", () => {
    const pasted = "SaaS reseller agreement between Acme and Beta with revenue share.";
    const snippet = STARTER_QUICK_ADDS[0]!.append;
    const next = appendStarterQuickAddSnippet(pasted, snippet);
    expect(next).toContain(pasted);
    expect(next.length).toBeGreaterThan(pasted.length);
    expect(next).toMatch(/confidentiality obligations/i);
  });

  it("preserves prior text when multiple quick-adds are applied", () => {
    let text = "Independent contractor for design work, $8k fixed fee.";
    for (const item of STARTER_QUICK_ADDS) {
      text = appendStarterQuickAddSnippet(text, item.append);
    }
    expect(text).toContain("Independent contractor");
    expect(text).toMatch(/work-made-for-hire/i);
    expect(text).toMatch(/return or destruction/i);
  });
});

describe("starter quick-add create submit integration", () => {
  it("create draft resolves textarea including appended quick-add text", () => {
    const base = "Consulting agreement between Alpha LLC and Beta Inc.";
    const withAdd = appendStarterQuickAddSnippet(base, STARTER_QUICK_ADDS[1]!.append);
    const r = resolveSubmit({
      textareaCurrentValue: withAdd,
      intakeStepBuffer: withAdd,
      intakeBaselineCommitted: "Simple NDA between two parties",
      freshSimpleCreateUx: true,
    });
    expect(r.text).toBe(withAdd);
    expect(r.text).toMatch(/work-made-for-hire/i);
    expect(r.text).not.toBe("Simple NDA between two parties");
  });
});

describe("starter quick-add UI contracts", () => {
  const intake = readFileSync(
    join(__dirname, "../../components/agreements/AgreementBuilderIntake.tsx"),
    "utf8",
  );
  const quickAddsRow = readFileSync(
    join(__dirname, "../../components/agreements/StarterQuickAddsRow.tsx"),
    "utf8",
  );

  it("uses dedicated starter quick-add row on fresh stage-A", () => {
    expect(intake).toContain("showStarterQuickAdds");
    expect(intake).toContain("StarterQuickAddsRow");
    expect(intake).toContain("handleStarterQuickAddApply");
    expect(intake).toContain("logStarterSuggestionApplied");
    expect(intake).not.toContain("Tap a starter or describe");
  });

  it("quick-add chips are buttons with optional quick adds copy", () => {
    const defs = readFileSync(join(__dirname, "starterQuickAdds.ts"), "utf8");
    expect(quickAddsRow).toContain('type="button"');
    expect(quickAddsRow).toContain("Optional quick adds");
    expect(quickAddsRow).not.toContain("Suggestions");
    expect(defs).toContain("Confidentiality term");
    expect(defs).toContain("work_for_hire");
    expect(defs).toContain("return_destroy");
  });

  it("does not show stale ready-to-send helper on stage-A input", () => {
    expect(intake).not.toMatch(
      /stageAInputFirst[\s\S]{0,400}INTAKE_MICRO_TRUST_LINE/,
    );
    expect(intake).not.toMatch(
      /stageAInputFirst[\s\S]{0,400}INTAKE_HELPER_LEAD/,
    );
  });

  it("hides legacy unified clause suggestions when starter quick-adds show", () => {
    expect(intake).toMatch(/!showStarterQuickAdds[\s\S]*showUnifiedClauseSuggestions/);
  });
});

describe("logStarterSuggestionApplied", () => {
  it("logs metadata shape", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logStarterSuggestionApplied({
      suggestionKey: "confidentiality",
      inputLenBefore: 10,
      inputLenAfter: 120,
    });
    expect(spy).toHaveBeenCalledWith("[starter-suggestion-applied]", {
      suggestionKey: "confidentiality",
      inputLenBefore: 10,
      inputLenAfter: 120,
    });
    spy.mockRestore();
  });
});
