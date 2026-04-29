import { describe, expect, it } from "vitest";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import { isPaidProAgreementAuthoritative } from "../../components/agreements/paidProAgreementAuthority";
import { describePaidProSendModalBranch } from "../../components/agreements/sendHandoffAuthoritativeCorpus";

describe("SimpleSendPage paid-pro send gate (post-hydrate draft shape)", () => {
  it("server_full_document_text corpus bypasses professional-send upsell after persist-style hydrate", () => {
    const d = {
      premium_render_source: "server_full_document_text",
      server_full_document_text: "s".repeat(620),
      purpose: "structured stub",
      premium_server_full_document_text: "",
      premium_full_document_text: "",
    } as unknown as AgreementDraft;
    const m = describePaidProSendModalBranch(d, { agreementId: "agr-1" });
    expect(m.paidProSendAllowed).toBe(true);
    expect(m.hasMaterialPremiumPipelineCorpus).toBe(true);
    expect(
      isPaidProAgreementAuthoritative({ draft: d, agreementId: "agr-1", includeLocalCompletionMarker: false }),
    ).toBe(true);
  });
});
