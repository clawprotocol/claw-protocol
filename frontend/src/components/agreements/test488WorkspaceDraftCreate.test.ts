/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  formatDraftCreateHttpUserMessage,
  isDraftCreateHttpForbidden,
  readDraftCreateHttpErrorDetail,
} from "./draftCreateHttpError";
import type { ReviewFirstPersistHttpError } from "./reviewLinkPersistDiagnostics";

describe("TEST488 — workspace draft create 403 handling", () => {
  it("maps draft_limit_reached 403 to clear user message", () => {
    const err = Object.assign(new Error("create_failed_http_403"), {
      httpStatus: 403,
      httpDetail: "draft_limit_reached: capped",
      responseBody: {
        detail: {
          code: "draft_limit_reached",
          message: "Free workspaces can have up to 2 active drafts. Finish or upgrade to add another.",
          paywall: true,
        },
      },
    }) as ReviewFirstPersistHttpError;
    expect(isDraftCreateHttpForbidden(err)).toBe(true);
    expect(readDraftCreateHttpErrorDetail(err)?.code).toBe("draft_limit_reached");
    expect(formatDraftCreateHttpUserMessage(err)).toContain("2 active drafts");
  });

  it("does not treat non-403 as forbidden draft create", () => {
    const err = Object.assign(new Error("create_failed_http_500"), {
      httpStatus: 500,
    }) as ReviewFirstPersistHttpError;
    expect(isDraftCreateHttpForbidden(err)).toBe(false);
  });
});

describe("TEST488 — workspace bind sends checkout org for subscription repair", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("bindAuthenticatedUserToWorkspace includes subscription_source_org_id", () => {
    const src = readFileSync(join(__dirname, "../../auth/workspaceBindingApi.ts"), "utf8");
    expect(src).toContain("subscription_source_org_id");
    expect(src).toContain("readPaidCheckoutOrgId");
  });

  it("workspace create uses same clawAgreementHeaders draft contract as SimpleCreatePage", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const simpleCreate = readFileSync(
      join(__dirname, "../../launch/simpleProduct/SimpleCreatePage.tsx"),
      "utf8",
    );
    expect(intake).toContain("clawAgreementHeaders");
    expect(intake).toContain('apiUrl("/api/agreements/draft")');
    expect(simpleCreate).toContain("AgreementBuilderIntake");
    expect(intake).toContain("formatDraftCreateHttpUserMessage");
    expect(intake).toContain("isDraftCreateHttpForbidden");
  });

  it("runPersistAndOpen surfaces 403 instead of silent structured fallback", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const fnStart = intake.indexOf("async function runPersistAndOpen");
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = intake.slice(fnStart, fnStart + 25000);
    expect(fnBody).toContain("isDraftCreateHttpForbidden(e)");
    expect(fnBody).toContain("formatDraftCreateHttpUserMessage(e)");
    const forbiddenIdx = fnBody.indexOf("isDraftCreateHttpForbidden(e)");
    const structuredIdx = fnBody.indexOf("isStructuredDraftUsableForLocalReviewFallback");
    expect(forbiddenIdx).toBeGreaterThan(-1);
    expect(structuredIdx).toBeGreaterThan(-1);
    expect(forbiddenIdx).toBeLessThan(structuredIdx);
  });
});

describe("TEST488 — successful workspace create navigates to /app/send", () => {
  it("AgreementWizardShell onCreated uses workspaceCreatePostSendPath", () => {
    const shell = readFileSync(join(__dirname, "../../agreement/AgreementWizardShell.tsx"), "utf8");
    expect(shell).toContain("workspaceCreatePostSendPath");
    expect(shell).toContain('navigate(workspaceCreatePostSendPath(tid)');
  });
});
