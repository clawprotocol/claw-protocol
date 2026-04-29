import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearCreateReviewAgreementResumeId,
  readCreateReviewAgreementResumeId,
  writeCreateReviewAgreementResumeId,
} from "./agreementIntakeStorage";
import { shouldKeepReviewDisplayAfterProHydrate } from "./sendHandoffAuthoritativeCorpus";

describe("AgreementBuilderIntake paid-pro resume + hydrate contract", () => {
  const sessionStore = new Map<string, string>();

  beforeEach(() => {
    sessionStore.clear();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => (sessionStore.has(k) ? sessionStore.get(k)! : null),
      setItem: (k: string, v: string) => void sessionStore.set(k, v),
      removeItem: (k: string) => void sessionStore.delete(k),
    } as Storage);
    clearCreateReviewAgreementResumeId();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips agreement_id in session for /app/send → /app/create resume hydration", () => {
    writeCreateReviewAgreementResumeId("  agr-xyz  ");
    expect(readCreateReviewAgreementResumeId()).toBe("agr-xyz");
  });

  it("hydrate shape: server_full_document_text length + render source keeps review (not intake)", () => {
    const d = {
      premium_render_source: "server_full_document_text",
      server_full_document_text: "b".repeat(600),
      premium_full_document_text: "",
      premium_server_full_document_text: "",
    };
    expect(shouldKeepReviewDisplayAfterProHydrate(d)).toBe(true);
  });

  it("runPersistAndOpen must not clear premium completion state (regression: paid Pro → free intake)", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).not.toMatch(/runPersistAndOpen[\s\S]{0,12000}clearPremiumCompletionStateAfterSend/);
  });

  it("paid authoritative recipient step uses Review and send CTA copy (not Create review link)", () => {
    const p = join(__dirname, "AgreementBuilderIntake.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("paidProAuthoritative");
    expect(s).toContain('"Review and send"');
    expect(s).toContain("Add at least one recipient before continuing.");
  });
});
