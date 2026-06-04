/**
 * Mobile Paid Pro review document scaffold for containment / class regression tests.
 */

import { PremiumAgreementReadonlyView } from "../../components/agreements/PremiumAgreementReadonlyView";

const MOBILE_TITLE =
  "CONSULTING AND IMPLEMENTATION AGREEMENT";
const MOBILE_SIGNATURE = `
<p class="premium-doc-signature-party-start">CLIENT:</p>
<p class="premium-doc-signature-entity-name">Blue Canyon Analytics LLC</p>
<p class="premium-doc-signature-field">By:</p>
<p class="premium-doc-signature-field">Name:</p>
<p class="premium-doc-signature-field">Title:</p>
<p class="premium-doc-signature-field">Date:</p>
`;

export function PaidProReviewMobileLayoutFixture() {
  return (
    <div
      data-testid="paid-pro-review-mobile-fixture"
      id="claw-simple-create-preview"
      data-paid-pro-review-compact="true"
      className="mt-2 block min-w-0"
      style={{ width: 376, maxWidth: 376, overflowX: "hidden" }}
    >
      <div
        id="fadeWrapper"
        className="mt-2 rounded-2xl border px-1 py-3"
        style={{ maxWidth: "100%", overflowX: "hidden" }}
      >
        <div data-paid-pro-review-document-shell="true" className="px-2 py-2">
          <div data-testid="simple-pro-final-review-screen" className="flex flex-col gap-2">
            <div
              data-testid="simple-pro-final-review-document"
              className="w-full max-w-full min-w-0 overflow-x-hidden rounded-sm border bg-white"
            >
              <PremiumAgreementReadonlyView
                html={`<h1>${MOBILE_TITLE}</h1><p>Body paragraph for mobile layout.</p>${MOBILE_SIGNATURE}`}
                fullDocumentFlow
                compactDocumentTopPadding
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
