/**
 * Dev-only visual QA for paid Pro review → inline signer setup (Test266).
 * Route: /dev/qa/paid-pro-review-ux (import.meta.env.DEV only)
 */
import { useLayoutEffect, useMemo } from "react";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "../components/agreements/paidProAgreementAuthority";
import { applyAcceptedProCorpusSafeDisplay } from "../components/agreements/acceptedProCorpusSafeDisplay";
import { SimpleProFinalReviewScreen } from "../components/agreements/SimpleProFinalReviewScreen";
import {
  PAID_PRO_INLINE_SIGNER_SECTION_BODY,
  PAID_PRO_INLINE_SIGNER_SECTION_TITLE,
} from "../components/agreements/paidProInlineSignerSetupCopy";
import { resolvePaidProReviewRenderPlain } from "../components/agreements/paidProReviewRenderCorpus";
import { establishPaidProSourceOfTruth } from "../components/agreements/paidProSourceOfTruth";
import { PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA } from "../components/agreements/signerSetupPartyIdentity";
import {
  SIMPLE_CREATE_PAID_PRO_REVIEW_SUBTITLE,
  SIMPLE_CREATE_PAID_PRO_REVIEW_TITLE,
} from "../launch/simpleProduct/simpleCreatePaidProReviewShell";
import {
  PAID_PRO_REVIEW_UX_VISUAL_CLIENT,
  PAID_PRO_REVIEW_UX_VISUAL_CORPUS,
  PAID_PRO_REVIEW_UX_VISUAL_DRAFT,
  PAID_PRO_REVIEW_UX_VISUAL_INTAKE,
  PAID_PRO_REVIEW_UX_VISUAL_PROVIDER,
} from "./paidProReviewUxVisualFixture";

function PaidProInlineSignerPartyCards() {
  const parties = [
    { label: "Party 1", entity: PAID_PRO_REVIEW_UX_VISUAL_CLIENT },
    { label: "Party 2", entity: PAID_PRO_REVIEW_UX_VISUAL_PROVIDER },
  ];
  return (
    <div className="mt-4 space-y-4" data-testid="paid-pro-inline-signer-party-cards">
      {parties.map((p) => (
        <div
          key={p.label}
          className="rounded-lg border border-slate-700/45 bg-slate-950/30 p-3 sm:p-4"
          data-testid={`paid-pro-inline-party-card-${p.label.replace(/\s+/g, "-").toLowerCase()}`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {p.label} legal entity
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-100">{p.entity}</p>
          <label className="mt-3 block text-xs font-medium text-slate-400 sm:text-sm">
            Signer name
            <input
              type="text"
              readOnly
              value=""
              placeholder="Required before signature links"
              className="mt-1 w-full rounded-md border border-slate-600/70 bg-[#141d32] px-3 py-2 text-sm text-slate-100 outline-none"
              data-claw-recipient-field={p.label === "Party 1" ? "r1-signer-name" : "r2-signer-name"}
            />
          </label>
          <label className="mt-3 block text-xs font-medium text-slate-400 sm:text-sm">
            Signer email
            <input
              type="email"
              readOnly
              value=""
              className="mt-1 w-full rounded-md border border-slate-600/70 bg-[#141d32] px-3 py-2 text-sm text-slate-100 outline-none"
              data-claw-recipient-field={p.label === "Party 1" ? "r1-email" : "r2-email"}
            />
          </label>
        </div>
      ))}
    </div>
  );
}

export function PaidProReviewUxVisualPage() {
  const sessionPlain = useMemo(() => {
    const safe = applyAcceptedProCorpusSafeDisplay(PAID_PRO_REVIEW_UX_VISUAL_CORPUS, {
      draft: PAID_PRO_REVIEW_UX_VISUAL_DRAFT,
      intakeText: PAID_PRO_REVIEW_UX_VISUAL_INTAKE,
    });
    return safe.text;
  }, []);

  useLayoutEffect(() => {
    establishPaidProSourceOfTruth({ text: sessionPlain, source: "server_full_draft" });
  }, [sessionPlain]);

  const paidReviewPlain = useMemo(() => {
    const resolved = resolvePaidProReviewRenderPlain({
      draft: PAID_PRO_REVIEW_UX_VISUAL_DRAFT,
      intakeText: PAID_PRO_REVIEW_UX_VISUAL_INTAKE,
    });
    return resolved.length >= PAID_PRO_AUTHORITY_MIN_LEN ? resolved : sessionPlain;
  }, [sessionPlain]);

  const noop = () => {};

  return (
    <div
      className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 sm:px-6"
      data-testid="paid-pro-review-ux-visual-page"
    >
      <header className="mx-auto max-w-3xl" data-testid="paid-pro-review-ux-shell-header">
        <h1 className="text-xl font-semibold tracking-tight text-slate-50 sm:text-2xl">
          {SIMPLE_CREATE_PAID_PRO_REVIEW_TITLE}
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-400">{SIMPLE_CREATE_PAID_PRO_REVIEW_SUBTITLE}</p>
      </header>

      <div
        id="claw-simple-create-preview"
        data-paid-pro-review-compact="true"
        className="mx-auto mt-4 block w-full max-w-3xl min-w-0"
        data-testid="paid-pro-review-ux-preview-root"
      >
        <div
          data-paid-pro-review-document-shell="true"
          className="px-[clamp(1.35rem,4.5vw,2.65rem)] py-2 sm:py-3"
        >
          <div
            className="mt-1.5 rounded-2xl border border-stone-800/20 bg-gradient-to-b from-stone-900/35 to-slate-950 px-1 py-2 sm:mt-2 sm:px-2 sm:py-3"
            data-testid="paid-pro-review-ux-document-frame"
          >
            <SimpleProFinalReviewScreen
              agreementHtml=""
              canonicalPaidProReview
              suppressShellDuplicatedChrome
              suppressFinalReviewActions
              suppressPostDocumentScrollSpacer
              stickyBottomScrollInsetPx={0}
              paidReviewPlain={paidReviewPlain}
              paidReviewAuthoritativeSource="paid_pro_review_surface"
              signersReady={false}
              signaturePrimaryLabel={PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA}
              onSendForSignature={noop}
              onSendForReview={noop}
              onCopyAgreement={noop}
              onExportAgreement={noop}
            />
          </div>

          <div
            className="mt-3 w-full sm:pr-0 md:max-w-3xl"
            id="claw-paid-pro-inline-signer-setup"
            data-testid="paid-pro-inline-signer-setup"
          >
            <div
              data-claw-recipient-setup
              data-testid="paid-pro-inline-signer-setup-panel"
              className="rounded-xl border border-slate-700/50 bg-slate-950/90 p-4 sm:p-5"
              role="region"
              aria-label={PAID_PRO_INLINE_SIGNER_SECTION_TITLE}
            >
              <h2 className="text-lg font-semibold tracking-tight text-slate-50 sm:text-xl">
                {PAID_PRO_INLINE_SIGNER_SECTION_TITLE}
              </h2>
              <p className="mt-1 text-sm leading-snug text-slate-400">{PAID_PRO_INLINE_SIGNER_SECTION_BODY}</p>
              <PaidProInlineSignerPartyCards />
            </div>
          </div>
        </div>
      </div>

      <p className="mx-auto mt-4 max-w-3xl text-[11px] text-slate-500" data-testid="paid-pro-review-ux-gap-hint">
        Gap probe targets: paid-pro-review-status-panel → paid-pro-inline-signer-setup (wrapper) and → Signer
        details heading.
      </p>
    </div>
  );
}
