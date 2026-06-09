/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { AgreementRecipientReview } from "./AgreementRecipientReview";
import { AccessProvider } from "../access/AccessContext";
import { formatAgreementPlainTextForEditing } from "./formatAgreementPlainTextForEditing";
import { resolveReviewFirstDisplayCorpus } from "../launch/simpleProduct/reviewFirstDisplayCorpus";
import {
  buildTest323ConsultingCorpus,
  SECTION_9_BODY,
} from "./reviewFirstDocumentDisplay.test323.test.tsx";
import {
  section9BodyBetweenHeadings,
  section9HeadingImmediatelyPrecedesSection10,
} from "./reviewFirstDocumentDisplaySection9Trace";
import { countPaidProExecutionBlocks } from "../components/agreements/paidProExecutionBlockAuthority";
import { resetPaidProTest315ReviewCopyHydrationLogsForTests } from "../launch/simpleProduct/reviewReadyHydratedDisplayCorpus";

const agreementId = "ag_test323_section9_visible";
const BLUE = "Blue Canyon Analytics LLC";
const IRON = "Iron Vale Systems Inc.";

function jsonResponse(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function reviewerDraftFromApi() {
  const corpus = buildTest323ConsultingCorpus();
  return {
    id: agreementId,
    title: "Consulting Agreement",
    jurisdiction: "NV",
    parties: [
      { id: "p1", name: BLUE, role: "owner" },
      { id: "p2", name: IRON, role: "party" },
    ],
    purpose: corpus,
    payment_terms: "premium",
    duration: null,
    due_date: null,
    effective_date: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    versions: [],
    audit_log: [],
    premium_render_source: "review_first_final_corpus",
    server_full_document_text: corpus,
    premium_server_full_document_text: corpus,
    pro_redline_v1: {
      review_first_final_corpus: { text: corpus },
    },
  };
}

describe("TEST323 AgreementRecipientReview Section 9 visible DOM", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProTest315ReviewCopyHydrationLogsForTests();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("reviewer route DOM textContent contains Section 9 body between headings 9 and 10", async () => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : typeof Request !== "undefined" && input instanceof Request
              ? input.url
              : String(input);
      const method = (
        init?.method ||
        (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")
      ).toUpperCase();
      if (method === "POST" && url.includes("/render")) {
        return jsonResponse({ rendered_html: "<p>Services Agreement</p><p>Body.</p>" });
      }
      if (method === "GET" && url.includes("/api/agreements/") && !url.includes("/revise")) {
        return jsonResponse({ draft: reviewerDraftFromApi() });
      }
      return new Response("not found", { status: 404 });
    });

    render(
      <AccessProvider>
        <AgreementRecipientReview agreementId={agreementId} recipientAccessToken="tok_test323" />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByText(/Loading agreement/i)).toBeNull();
    });

    await waitFor(() => {
      expect(screen.getByText(/Sarah Mitchell/i)).toBeTruthy();
    });

    const docShell = screen.getByTestId("recipient-document-shell");
    const domText = docShell.textContent ?? "";
    expect(domText).toMatch(/9\.\s+MISCELLANEOUS/i);
    expect(domText).toMatch(/10\.\s+ELECTRONIC SIGNATURES/i);
    expect(domText).toMatch(new RegExp(SECTION_9_BODY.slice(0, 40), "i"));
    expect(section9BodyBetweenHeadings(domText)).toBe(true);
    expect(section9HeadingImmediatelyPrecedesSection10(domText)).toBe(false);

    const draft = reviewerDraftFromApi();
    const copyText = formatAgreementPlainTextForEditing(
      resolveReviewFirstDisplayCorpus(draft, "copy_export")?.text ?? "",
    );
    expect(copyText).toMatch(/entire agreement between the parties/i);
    expect(section9BodyBetweenHeadings(copyText)).toBe(true);
    expect(countPaidProExecutionBlocks(copyText)).toBe(1);
    expect(countPaidProExecutionBlocks(domText)).toBe(1);
  });
});
