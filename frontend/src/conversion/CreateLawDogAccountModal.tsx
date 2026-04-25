import { useEffect, useRef, useState } from "react";
import {
  LOCAL_LAW_USE_SIGNUP_SHORT,
  NOT_LEGAL_ADVICE,
  NOT_SUBSTITUTE_COUNSEL_PRODUCT_LANE_SHORT,
  PRODUCT_NOT_LAW_FIRM,
  WHO_MAY_USE_PRODUCT_LANE_SHORT,
} from "../compliance/disclosureCopy";
import { LAWDOG_COLORS, LAWDOG_LOGO_SRC } from "../design/tokens";
import { logProductEvent } from "../lib/experimentation/productEvents";
import {
  persistProductLegalAcceptanceAsync,
  readProductLegalAccepted,
} from "../launch/legal/legalAcceptanceLocal";
import { getOrgId } from "../launch/orgContext";

export type CreateLawDogAccountModalProps = {
  open: boolean;
  onClose: () => void;
  /** Shown only when {@link googleHref} is set. */
  googleHref: string | null;
  onContinueEmail: () => void;
  onContinueGoogle?: () => void;
  /** Included on `signup_legal_assent` (e.g. claim flow + record id). */
  assentAnalyticsContext?: Record<string, unknown>;
};

export function CreateLawDogAccountModal({
  open,
  onClose,
  googleHref,
  onContinueEmail,
  onContinueGoogle,
  assentAnalyticsContext,
}: CreateLawDogAccountModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [termsAck, setTermsAck] = useState(false);
  const [assentSubmitting, setAssentSubmitting] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  useEffect(() => {
    if (open) setTermsAck(readProductLegalAccepted());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLInputElement>("#lawdog-signup-legal")?.focus();
    }, 50);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const runAssentThen = async (auth_path: "email" | "google", then: () => void) => {
    if (!termsAck || assentSubmitting) return;
    setAssentSubmitting(true);
    try {
      const org_id = getOrgId();
      const rec = await persistProductLegalAcceptanceAsync({
        auth_path,
        org_id,
        meta: {
          ...assentAnalyticsContext,
          client_path: typeof window !== "undefined" ? window.location.pathname : undefined,
        },
      });
      if (rec) {
        logProductEvent("signup_legal_assent", {
          terms_version_id: rec.terms_version_id,
          privacy_version_id: rec.privacy_version_id,
          client_assent_id: rec.client_assent_id,
          assent_timestamp_iso: rec.at,
          legal_ack_version: rec.v,
          auth_path,
          product_signup_assent_id: rec.server_assent_id,
          server_assent_recorded: Boolean(rec.server_assent_id),
          ...(assentAnalyticsContext ?? {}),
        });
      }
      then();
    } finally {
      setAssentSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lawdog-create-account-title"
        className="relative z-[1] w-full max-w-md rounded-2xl border border-slate-700/90 bg-slate-950 px-6 py-6 shadow-[0_24px_64px_rgba(0,0,0,0.45)]"
      >
        <div className="mb-4 flex flex-col items-center text-center">
          <img
            src={LAWDOG_LOGO_SRC}
            alt=""
            width={40}
            height={40}
            className="lawdog-claim-modal-logo-glow h-10 w-10 object-contain opacity-90 brightness-0 invert"
            decoding="async"
          />
        </div>
        <h2 id="lawdog-create-account-title" className="text-center text-lg font-semibold text-slate-50">
          Create your LawDog account
        </h2>
        <p className="mt-3 text-left text-sm leading-relaxed text-slate-400">
          This record is ready. Save it to your workspace to keep your proof and continue using LawDog.
        </p>
        <p
          id="lawdog-signup-product-lane"
          className="mt-3 text-left text-xs leading-relaxed text-slate-500"
        >
          {PRODUCT_NOT_LAW_FIRM} {NOT_LEGAL_ADVICE}
        </p>
        <p id="lawdog-signup-eligibility" className="mt-2 text-left text-xs leading-relaxed text-slate-500">
          {WHO_MAY_USE_PRODUCT_LANE_SHORT}
        </p>
        <p id="lawdog-signup-not-counsel" className="mt-2 text-left text-xs leading-relaxed text-slate-500">
          {NOT_SUBSTITUTE_COUNSEL_PRODUCT_LANE_SHORT}
        </p>
        <p id="lawdog-signup-local-law" className="mt-2 text-left text-xs leading-relaxed text-slate-500">
          {LOCAL_LAW_USE_SIGNUP_SHORT}
        </p>
        <label
          htmlFor="lawdog-signup-legal"
          className="mt-4 flex cursor-pointer items-start gap-2.5 text-left text-sm leading-relaxed text-slate-300"
        >
          <input
            id="lawdog-signup-legal"
            type="checkbox"
            checked={termsAck}
            onChange={(e) => setTermsAck(e.target.checked)}
            disabled={assentSubmitting}
            aria-describedby="lawdog-signup-product-lane lawdog-signup-eligibility lawdog-signup-not-counsel lawdog-signup-local-law lawdog-signup-export-reassurance"
            className="mt-1 h-4 w-4 shrink-0 rounded border-slate-600 bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500/80 focus:ring-offset-slate-950 disabled:opacity-50"
            style={{ accentColor: LAWDOG_COLORS.cta_primary }}
          />
          <span>
            I agree to the{" "}
            <a
              href={`${origin}/terms`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-emerald-300/95 underline-offset-2 hover:underline"
            >
              Terms of Service
            </a>{" "}
            and{" "}
            <a
              href={`${origin}/privacy`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-emerald-300/95 underline-offset-2 hover:underline"
            >
              Privacy Policy
            </a>
            .
          </span>
        </label>
        <p
          id="lawdog-signup-export-reassurance"
          className="mt-2 text-xs leading-relaxed text-slate-500"
        >
          The Privacy Policy describes how we process account, agreement, signing, and verification-related data. Free
          plans still let you access and export records you already have.{" "}
          <a
            href={`${origin}/privacy#privacy-contact`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-emerald-400/90 underline-offset-2 hover:underline"
          >
            Data &amp; privacy requests
          </a>
          {" · "}
          <a
            href={`${origin}/privacy#privacy-cookies-choices`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-emerald-400/90 underline-offset-2 hover:underline"
          >
            Cookie &amp; storage choices
          </a>
          .
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            className="vs01-btn vs01-btn--primary min-h-[2.75rem] w-full"
            disabled={!termsAck || assentSubmitting}
            onClick={() => void runAssentThen("email", onContinueEmail)}
          >
            Continue with email
          </button>
          {googleHref ? (
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary min-h-[2.75rem] w-full border-slate-600"
              disabled={!termsAck || assentSubmitting}
              onClick={() => void runAssentThen("google", () => onContinueGoogle?.())}
            >
              Continue with Google
            </button>
          ) : null}
          <button
            type="button"
            className="mt-1 min-h-11 w-full py-2 text-center text-sm font-medium text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500/70"
            onClick={onClose}
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
