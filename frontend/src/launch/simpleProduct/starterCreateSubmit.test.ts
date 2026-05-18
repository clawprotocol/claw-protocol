import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  REMOVED_STARTER_TEMPLATE_BUBBLE_LABELS,
  SIMPLE_CREATE_PROMPT_HEADING,
  SIMPLE_CREATE_PROMPT_PLACEHOLDER,
  logStarterCreateSubmit,
  resolveStarterCreateSubmitText,
} from "./starterCreateSubmit";

describe("resolveStarterCreateSubmitText", () => {
  it("uses current textarea value on fresh simple create when non-empty", () => {
    const long =
      "SaaS reseller agreement between Acme Corp and Beta LLC with territory limits, revenue share, and 24-month term.";
    const r = resolveStarterCreateSubmitText({
      textareaCurrentValue: long,
      intakeStepBuffer: "stale buffer",
      intakeBaselineCommitted: "Simple NDA between two parties",
      freshSimpleCreateUx: true,
    });
    expect(r.text).toBe(long);
    expect(r.source).toBe("textarea_current_value");
  });

  it("prefers DOM textarea over stale baseline on fresh create", () => {
    const pasted = "Custom pasted prompt that replaces starter template entirely.";
    const r = resolveStarterCreateSubmitText({
      textareaCurrentValue: pasted,
      intakeStepBuffer: "",
      intakeBaselineCommitted: "Independent contractor agreement",
      freshSimpleCreateUx: true,
    });
    expect(r.text).toBe(pasted);
    expect(r.source).toBe("textarea_current_value");
  });

  it("falls back to buffer when DOM empty on fresh create", () => {
    const buf = "Buffer-only intake for create draft.";
    const r = resolveStarterCreateSubmitText({
      textareaCurrentValue: "",
      intakeStepBuffer: buf,
      intakeBaselineCommitted: "Consulting agreement with monthly retainer",
      freshSimpleCreateUx: true,
    });
    expect(r.text).toBe(buf);
    expect(r.source).toBe("textarea_current_value");
  });
});

describe("starter create page static contracts", () => {
  const page = readFileSync(join(__dirname, "SimpleCreatePage.tsx"), "utf8");
  const intake = readFileSync(
    join(__dirname, "../../components/agreements/AgreementBuilderIntake.tsx"),
    "utf8",
  );

  it("does not render starter template bubbles on SimpleCreatePage", () => {
    for (const label of REMOVED_STARTER_TEMPLATE_BUBBLE_LABELS) {
      expect(page).not.toContain(label);
    }
    expect(page).not.toContain("SIMPLE_CREATE_CONVERSATION_STARTERS");
    expect(page).not.toContain("Quick starters");
    expect(page).not.toContain("Speak your agreement");
  });

  it("uses starter create prompt copy constants in intake stage-A", () => {
    expect(intake).toContain("SIMPLE_CREATE_PROMPT_HEADING");
    expect(intake).toContain("SIMPLE_CREATE_PROMPT_SUPPORT");
    expect(SIMPLE_CREATE_PROMPT_HEADING).toBe("Describe your agreement.");
    expect(SIMPLE_CREATE_PROMPT_PLACEHOLDER).toMatch(/services agreement between/i);
  });

  it("logs starter-create-submit from intake via helper", () => {
    expect(intake).toContain("logStarterCreateSubmit");
    expect(intake).toContain("resolveStarterCreateSubmitText");
    expect(intake).toContain("prepareFreshStarterCreateSubmit");
  });

  it("speak affordance focuses textarea without prefilling template", () => {
    expect(intake).toContain("claw-intake-start-dictation");
    expect(intake).toContain("Speak your agreement");
    const prefill = intake.slice(intake.indexOf("const onPrefill"), intake.indexOf("const onPrefill") + 800);
    expect(prefill).toMatch(/freshSimpleCreateUx[\s\S]*setIntakeStepBuffer\(t\)/);
  });
});

describe("logStarterCreateSubmit", () => {
  it("emits metadata shape", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logStarterCreateSubmit("hello", "textarea_current_value");
    expect(spy).toHaveBeenCalledWith("[starter-create-submit]", {
      inputLen: 5,
      source: "textarea_current_value",
      hasSelectedTemplate: false,
    });
    spy.mockRestore();
  });
});
