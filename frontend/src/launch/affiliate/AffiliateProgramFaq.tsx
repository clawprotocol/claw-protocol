import { LEGAL_OPERATING_ENTITY } from "../legal/legalConstants";

export const AFFILIATE_PROGRAM_FAQ_ITEMS: { q: string; a: string }[] = [
    {
      q: "What do I have to disclose when I recommend LawDog?",
      a: "U.S. FTC-style endorsement rules (and similar laws elsewhere) require a clear and conspicuous disclosure of any material connection when you recommend LawDog for compensation or other incentives. See Affiliate Terms — Disclosure of material connection.",
    },
    {
      q: "What tax forms are required before payout?",
      a: `${LEGAL_OPERATING_ENTITY} does not release affiliate payouts until a valid IRS Form W-9 (U.S. persons) or the applicable W-8 series form we request is on file and verified. You are responsible for your own taxes on amounts earned.`,
    },
    {
      q: "What claims or outreach are prohibited?",
      a: "Spam, deceptive urgency, impersonation, misrepresenting LawDog as a law firm or legal counsel, and other conduct in Affiliate Terms — Prohibited promotion methods and Claims and representations you must not make — can void earnings and end participation.",
    },
    {
      q: "How do I become an affiliate?",
      a: "Use your personal link from this page. When someone starts through your link and uses LawDog in a real way, you earn per the program. Eligibility matches what you see in your account.",
    },
    {
      q: "How do I earn?",
      a: "You earn when referred people subscribe and use LawDog — not from clicks alone. Details sit next to your numbers in Payouts & activity.",
    },
    {
      q: "What is my link?",
      a: "Your personal referral URL is in the “Your link” section on this page. Copy it and share honestly; misleading claims can disqualify payouts.",
    },
    {
      q: "When do I get paid?",
      a: "Payouts follow validation and clearing periods. Pending balances usually mean we are waiting on payment confirmation, refund windows, or fraud checks.",
    },
    {
      q: "Why are earnings pending?",
      a: "Charges may still be settling, trials may not have converted yet, or we may be reviewing unusual patterns. Pending is normal early on.",
    },
    {
      q: "What does Doginal verified mean?",
      a: "It is an operator-side honor attestation for campaign pages — not on-chain proof of ownership. It helps viewers understand how the page was reviewed.",
    },
    {
      q: "Can I refer myself?",
      a: "No. Self-referrals, household referrals, and controlled entities are not allowed and may void earnings.",
    },
  ];

/**
 * Compact affiliate education — accordion, no separate tour.
 */
export function AffiliateProgramFaq(props: {
  maxItems?: number;
  className?: string;
  title?: string;
  titleId?: string;
}) {
  const max = props.maxItems;
  const items =
    typeof max === "number" && max > 0 ? AFFILIATE_PROGRAM_FAQ_ITEMS.slice(0, max) : AFFILIATE_PROGRAM_FAQ_ITEMS;
  const titleId = props.titleId ?? "aff-faq-title";

  return (
    <section
      className={props.className ?? "rounded-xl border border-slate-800/70 bg-slate-950/35 px-4 py-4 sm:px-5"}
      aria-labelledby={titleId}
    >
      <h2 id={titleId} className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {props.title ?? "How it works"}
      </h2>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-600">Tap a question to expand. See Affiliate Terms for the full program.</p>
      <div className="mt-3 space-y-2">
        {items.map((row) => (
          <details
            key={row.q}
            className="rounded-lg border border-slate-800/80 bg-slate-900/30 px-3 py-2 text-left"
          >
            <summary className="cursor-pointer text-sm font-medium text-slate-200">{row.q}</summary>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">{row.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
