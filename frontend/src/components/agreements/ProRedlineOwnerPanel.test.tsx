/** @vitest-environment jsdom */
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import { ProRedlineOwnerPanel } from "./ProRedlineOwnerPanel";

const redlineApi = vi.hoisted(() => ({
  downloadExportDraftTxt: vi.fn(async () => ({ ok: true })),
  downloadExportDraftDocx: vi.fn(async () => ({ ok: true })),
  postProRedlineImportText: vi.fn(),
  postProRedlineImportFile: vi.fn(),
  postProRedlineAcceptImport: vi.fn(),
  postProRedlineRejectImport: vi.fn(),
  postProRedlineSuggestionMarkApplied: vi.fn(),
  postProRedlineSuggestionReject: vi.fn(),
}));

vi.mock("../../agreement/proRedlineReviewApi", () => redlineApi);

const workspaceApi = vi.hoisted(() => ({
  fetchAgreementDraft: vi.fn(),
}));

vi.mock("../../agreement/agreementWorkspaceApi", () => workspaceApi);

function longProBody(): string {
  return "Paragraph one\n\nParagraph two\n\n" + "x".repeat(600);
}

function makePaidProDraft(overrides: Partial<AgreementDraft> = {}): AgreementDraft {
  const body = longProBody();
  return {
    id: "ag-redline-test",
    title: "T",
    jurisdiction: "CA",
    parties: [],
    purpose: "p",
    payment_terms: "pay",
    duration: null,
    due_date: null,
    effective_date: null,
    created_at: "2026-01-15T12:00:00.000Z",
    updated_at: "2026-01-15T12:00:00.000Z",
    versions: [],
    audit_log: [],
    premium_render_source: "server_full_document_text",
    server_full_document_text: body,
    document_text: body,
    ...overrides,
  };
}

describe("ProRedlineOwnerPanel", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    redlineApi.postProRedlineImportText.mockReset();
    redlineApi.postProRedlineAcceptImport.mockReset();
    redlineApi.postProRedlineRejectImport.mockReset();
    workspaceApi.fetchAgreementDraft.mockReset();
  });

  it("renders Review changes for a paid Pro authoritative draft", () => {
    render(
      <ProRedlineOwnerPanel
        agreementId="ag-redline-test"
        draft={makePaidProDraft()}
        intakeTextFallback="ctx"
        onDraftReplaced={() => {}}
      />,
    );
    expect(screen.getByRole("heading", { name: /review changes/i })).toBeTruthy();
    expect(screen.getByText(/redline/i)).toBeTruthy();
  });

  it("after import with changes shows “Changes detected”", async () => {
    const user = userEvent.setup();
    const pendingDraft = makePaidProDraft({
      pro_redline_v1: {
        pending_import: {
          id: "p1",
          base_len: 100,
          imported_len: 120,
          diff_summary_json: {
            changed_block_count: 1,
            blocks: [{ kind: "added", text: "New clause" }],
          },
        },
        version_events: [],
        suggestions: [],
      },
    });
    redlineApi.postProRedlineImportText.mockResolvedValue({
      ok: true,
      changed_block_count: 1,
      no_changes: false,
    });
    workspaceApi.fetchAgreementDraft.mockResolvedValue({ draft: pendingDraft });

    const { container } = render(
      <ProRedlineOwnerPanel
        agreementId="ag-redline-test"
        draft={makePaidProDraft()}
        intakeTextFallback="ctx"
        onDraftReplaced={() => {}}
      />,
    );
    const section = container.querySelector("section");
    expect(section).toBeTruthy();
    const paste = within(section as HTMLElement).getByPlaceholderText(/paste edited agreement/i);
    await user.type(paste, "edited");
    await user.click(within(section as HTMLElement).getByRole("button", { name: /compare pasted text/i }));
    expect(await within(section as HTMLElement).findByText(/Changes detected/i)).toBeTruthy();
  });

  it("accept imported version calls replacement handler", async () => {
    const user = userEvent.setup();
    const onReplaced = vi.fn();
    const pendingDraft = makePaidProDraft({
      server_full_document_text: longProBody() + "\n\nEDITED",
      pro_redline_v1: {
        pending_import: {
          id: "p1",
          base_len: 100,
          imported_len: 110,
          diff_summary_json: {
            changed_block_count: 1,
            blocks: [{ kind: "added", text: "EDITED" }],
          },
        },
        version_events: [{ source: "imported_revision", created_at: "2026-01-16T10:00:00.000Z" }],
        suggestions: [],
      },
    });
    const acceptedDraft = makePaidProDraft({
      server_full_document_text: pendingDraft.server_full_document_text,
      pro_redline_v1: {
        pending_import: null,
        version_counter: 1,
        version_events: [
          { source: "imported_revision", created_at: "2026-01-16T10:00:00.000Z" },
          {
            source: "owner_accepted_revision",
            version_number: 1,
            created_at: "2026-01-16T11:00:00.000Z",
          },
        ],
        suggestions: [],
      },
    });
    redlineApi.postProRedlineAcceptImport.mockResolvedValue({ ok: true, draft: acceptedDraft, version_number: 1 });

    const { container } = render(
      <ProRedlineOwnerPanel
        agreementId="ag-redline-test"
        draft={pendingDraft}
        intakeTextFallback="ctx"
        onDraftReplaced={onReplaced}
      />,
    );
    const section = container.querySelector("section") as HTMLElement;
    await user.click(within(section).getByRole("button", { name: /accept imported version/i }));
    expect(redlineApi.postProRedlineAcceptImport).toHaveBeenCalledWith("ag-redline-test");
    expect(onReplaced).toHaveBeenCalledWith(acceptedDraft);
    expect(await within(section).findByText(/imported version accepted/i)).toBeTruthy();
  });

  it("reject imported version preserves draft via handler", async () => {
    const user = userEvent.setup();
    const onReplaced = vi.fn();
    const pendingDraft = makePaidProDraft({
      pro_redline_v1: {
        pending_import: {
          id: "p1",
          diff_summary_json: { changed_block_count: 1, blocks: [{ kind: "removed", text: "x" }] },
        },
        version_events: [],
        suggestions: [],
      },
    });
    const afterReject = makePaidProDraft({
      pro_redline_v1: {
        pending_import: null,
        version_events: [
          { source: "owner_rejected_revision", rejection_kind: "import", created_at: "2026-01-17T09:00:00.000Z" },
        ],
      },
    });
    redlineApi.postProRedlineRejectImport.mockResolvedValue({ ok: true, draft: afterReject });

    const { container } = render(
      <ProRedlineOwnerPanel
        agreementId="ag-redline-test"
        draft={pendingDraft}
        intakeTextFallback="ctx"
        onDraftReplaced={onReplaced}
      />,
    );
    const section = container.querySelector("section") as HTMLElement;
    await user.click(within(section).getByRole("button", { name: /reject imported version/i }));
    expect(onReplaced).toHaveBeenCalledWith(afterReject);
  });

  it("shows version history including draft created", () => {
    const d = makePaidProDraft({
      pro_redline_v1: {
        version_events: [
          { source: "imported_revision", created_at: "2026-02-01T08:00:00.000Z" },
          { source: "owner_accepted_revision", version_number: 1, created_at: "2026-02-01T09:00:00.000Z" },
        ],
      },
    });
    const { container } = render(
      <ProRedlineOwnerPanel agreementId="ag-redline-test" draft={d} intakeTextFallback="ctx" onDraftReplaced={() => {}} />,
    );
    const section = container.querySelector("section") as HTMLElement;
    expect(within(section).getByText("Draft created")).toBeTruthy();
    expect(within(section).getByText(/imported revision/i)).toBeTruthy();
    expect(within(section).getByText(/accepted version 1/i)).toBeTruthy();
  });
});
