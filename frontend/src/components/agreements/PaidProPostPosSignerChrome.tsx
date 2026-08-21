/**
 * Post-POS streamlined signer entry chrome.
 *
 * After demo checkout settlement + Pro copy render:
 * - User sees inline signer fields for 2-4 parties
 * - Single Continue button at the bottom
 * - No relic 5-button row (Add signer details / Send for review / Copy / Download / Edit)
 *
 * This replaces PaidProForcedFirstReviewChrome for demo session users.
 */

import { useState, type FormEvent } from "react";

export type PartySignerSlot = {
  partyName: string;
  signerName: string;
  signerEmail: string;
  signerTitle: string;
};

export type PaidProPostPosSignerChromeProps = {
  parties: readonly { name: string; role?: string | null }[];
  initialSigners?: readonly PartySignerSlot[];
  onContinue: (signers: PartySignerSlot[]) => void;
  continueDisabled?: boolean;
  continueBusy?: boolean;
  className?: string;
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function PaidProPostPosSignerChrome({
  parties,
  initialSigners = [],
  onContinue,
  continueDisabled = false,
  continueBusy = false,
  className = "",
}: PaidProPostPosSignerChromeProps) {
  const partyCount = Math.min(Math.max(parties.length, 2), 4);
  const effectiveParties = parties.slice(0, partyCount);

  const [signers, setSigners] = useState<PartySignerSlot[]>(() => {
    return effectiveParties.map((party, i) => {
      const existing = initialSigners[i];
      return {
        partyName: party.name || `Party ${i + 1}`,
        signerName: existing?.signerName || "",
        signerEmail: existing?.signerEmail || "",
        signerTitle: existing?.signerTitle || "",
      };
    });
  });

  const updateSigner = (index: number, field: keyof PartySignerSlot, value: string) => {
    setSigners((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const allSignersComplete = signers.every(
    (s) => s.signerName.trim() && isValidEmail(s.signerEmail)
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!allSignersComplete || continueDisabled || continueBusy) return;
    onContinue(signers);
  };

  return (
    <div
      className={`rounded-lg border border-stone-200/90 bg-white px-4 py-4 shadow-sm ring-1 ring-black/[0.04] ${className}`}
      data-testid="paid-pro-post-pos-signer-chrome"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
        Add signer details
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-stone-600">
        Enter the authorized signer for each party. These details will appear on the signature page.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        {signers.map((signer, index) => (
          <div
            key={index}
            className="rounded-md border border-stone-200/80 bg-stone-50/50 px-3 py-3"
            data-testid={`signer-slot-${index}`}
          >
            <p className="text-xs font-semibold text-stone-900">
              {signer.partyName}
              {effectiveParties[index]?.role && effectiveParties[index]?.role !== "party" ? (
                <span className="ml-1.5 font-normal text-stone-500">
                  ({effectiveParties[index]?.role})
                </span>
              ) : null}
            </p>
            <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
              <div>
                <label
                  htmlFor={`signer-name-${index}`}
                  className="block text-[10px] font-medium text-stone-600"
                >
                  Signer name <span className="text-amber-600">*</span>
                </label>
                <input
                  id={`signer-name-${index}`}
                  type="text"
                  value={signer.signerName}
                  onChange={(e) => updateSigner(index, "signerName", e.target.value)}
                  placeholder="Full name"
                  className="mt-1 w-full rounded-md border border-stone-300/90 bg-white px-2.5 py-1.5 text-xs text-stone-900 placeholder:text-stone-400 focus:border-emerald-500/60 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                  data-testid={`signer-name-input-${index}`}
                  autoComplete="name"
                />
              </div>
              <div>
                <label
                  htmlFor={`signer-email-${index}`}
                  className="block text-[10px] font-medium text-stone-600"
                >
                  Email <span className="text-amber-600">*</span>
                </label>
                <input
                  id={`signer-email-${index}`}
                  type="email"
                  value={signer.signerEmail}
                  onChange={(e) => updateSigner(index, "signerEmail", e.target.value)}
                  placeholder="email@example.com"
                  className="mt-1 w-full rounded-md border border-stone-300/90 bg-white px-2.5 py-1.5 text-xs text-stone-900 placeholder:text-stone-400 focus:border-emerald-500/60 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                  data-testid={`signer-email-input-${index}`}
                  autoComplete="email"
                />
              </div>
            </div>
            <div className="mt-2">
              <label
                htmlFor={`signer-title-${index}`}
                className="block text-[10px] font-medium text-stone-600"
              >
                Title (optional)
              </label>
              <input
                id={`signer-title-${index}`}
                type="text"
                value={signer.signerTitle}
                onChange={(e) => updateSigner(index, "signerTitle", e.target.value)}
                placeholder="e.g., CEO, Owner, Manager"
                className="mt-1 w-full rounded-md border border-stone-300/90 bg-white px-2.5 py-1.5 text-xs text-stone-900 placeholder:text-stone-400 focus:border-emerald-500/60 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                data-testid={`signer-title-input-${index}`}
                autoComplete="organization-title"
              />
            </div>
          </div>
        ))}

        {!allSignersComplete ? (
          <p className="text-[11px] font-medium text-amber-800" role="status">
            Enter name and email for each signer to continue.
          </p>
        ) : null}

        <button
          type="submit"
          className="w-full rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-45"
          disabled={!allSignersComplete || continueDisabled || continueBusy}
          data-testid="paid-pro-post-pos-continue"
        >
          {continueBusy ? "Preparing…" : "Continue"}
        </button>
      </form>

      <p className="mt-3 text-[10px] leading-relaxed text-stone-500">
        Nothing is sent or signed until you confirm on the next step.
      </p>
    </div>
  );
}
