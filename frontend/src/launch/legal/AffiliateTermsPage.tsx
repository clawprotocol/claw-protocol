import { LegalDocLayout, LegalSectionTitle } from "./LegalDocLayout";
import { LEGAL_GOVERNING_LAW_STATE, LEGAL_OPERATING_ENTITY, LEGAL_PRODUCT_NAME } from "./legalConstants";

export function AffiliateTermsPage() {
  return (
    <LegalDocLayout
      documentTopId="affiliate-terms-top"
      title="Affiliate Terms"
      meta="These terms apply to the referral program in addition to the Terms of Service and Privacy Policy."
    >
      <section>
        <LegalSectionTitle>Overview</LegalSectionTitle>
        <p className="mt-2">
          {LEGAL_PRODUCT_NAME}&apos;s affiliate program is administered by {LEGAL_OPERATING_ENTITY}, an Oklahoma limited
          liability company operating from the United States. The program allows eligible participants to earn
          commissions for referral and marketing activities that bring new customers to {LEGAL_OPERATING_ENTITY},
          subject to these Affiliate Terms, the general Terms of Service, and the Privacy Policy. Participation
          creates no employment relationship and no partnership or joint venture. Federal endorsement-disclosure duties
          and U.S. federal and state tax and information-reporting obligations apply as described in these Affiliate
          Terms.
        </p>
      </section>

      <section>
        <LegalSectionTitle>Disclosure of material connection</LegalSectionTitle>
        <p className="mt-2">
          Affiliates must clearly and conspicuously disclose any material connection to {LEGAL_PRODUCT_NAME} when
          recommending it. When you recommend, endorse, or link to {LEGAL_PRODUCT_NAME} in exchange for compensation or
          other incentives from {LEGAL_OPERATING_ENTITY}, that disclosure must appear in the same medium and close in
          time to the recommendation, in a manner an ordinary consumer would notice and understand (including placement,
          readability, and audio/video cues where applicable). You are responsible for complying with applicable
          advertising, endorsement, and consumer-protection laws, including — where applicable — the U.S. Federal Trade
          Commission&apos;s Guides Concerning Use of Endorsements and Testimonials in Advertising and related enforcement
          policy.
        </p>
      </section>

      <section>
        <LegalSectionTitle>Independent contractors; no agency</LegalSectionTitle>
        <p className="mt-2">
          Affiliates are independent contractors. Nothing in these Affiliate Terms appoints you as an agent, employee,
          legal representative, or partner of {LEGAL_OPERATING_ENTITY}. You have no authority to negotiate, sign, or
          enter into agreements on {LEGAL_OPERATING_ENTITY}&apos;s behalf, to bind {LEGAL_OPERATING_ENTITY} to any
          obligation, or to make representations about {LEGAL_PRODUCT_NAME} except as expressly permitted in writing by{" "}
          {LEGAL_OPERATING_ENTITY}.
        </p>
      </section>

      <section>
        <LegalSectionTitle>No promises on behalf of LawDog</LegalSectionTitle>
        <p className="mt-2">
          You may not promise pricing, features, service levels, payouts, legal outcomes, or any other commitment in
          {LEGAL_OPERATING_ENTITY}&apos;s name. Direct prospects to official {LEGAL_PRODUCT_NAME} materials and
          checkout flows for current terms and product capabilities.
        </p>
      </section>

      <section>
        <LegalSectionTitle>Claims and representations you must not make</LegalSectionTitle>
        <p className="mt-2">
          You may not, directly or by implication, do any of the following in connection with {LEGAL_PRODUCT_NAME}:
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1.5 text-sm leading-relaxed text-slate-300">
          <li>State or imply that {LEGAL_PRODUCT_NAME} or {LEGAL_OPERATING_ENTITY} is a law firm or provides legal advice or legal representation.</li>
          <li>State or imply that use of {LEGAL_PRODUCT_NAME} creates an attorney–client relationship.</li>
          <li>
            Guarantee or warrant any legal outcome, or guarantee enforceability of any agreement, admissibility of any
            record, or compliance with any statute, regulation, or industry rule.
          </li>
          <li>Use fake reviews, fabricated testimonials, or misrepresenting who used or endorsed {LEGAL_PRODUCT_NAME}.</li>
          <li>
            Impersonate {LEGAL_OPERATING_ENTITY}, {LEGAL_PRODUCT_NAME}, or any third party (including staff, customers,
            or regulators).
          </li>
        </ul>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          You must not suggest that {LEGAL_PRODUCT_NAME} replaces review by qualified counsel where that review is
          appropriate.
        </p>
      </section>

      <section>
        <LegalSectionTitle>Prohibited promotion methods</LegalSectionTitle>
        <p className="mt-2">
          You may not send spam, use purchased or harvested contact lists without legally sufficient consent, or use
          unsolicited commercial email, text messages, or telephone calls that violate applicable law (including
          consent, identification, and opt-out requirements such as the U.S. Telephone Consumer Protection Act, CAN-SPAM
          Act, and state telemarketing or “mini-TCPA” rules where they apply to your outreach). You may not distribute
          malware, use deceptive urgency or scarcity, or make false, misleading, or unsubstantiated claims about{" "}
          {LEGAL_PRODUCT_NAME} or competitors. You may not promote {LEGAL_PRODUCT_NAME} on sites or in contexts that are
          unlawful or infringe intellectual property.
        </p>
      </section>

      <section>
        <LegalSectionTitle>Product lane</LegalSectionTitle>
        <p className="mt-2">
          {LEGAL_PRODUCT_NAME} provides software for agreements, records, and related workflows as described in official
          product documentation. You must not misrepresent what the product does, who may use it, or what obligations
          users assume when they sign up. Features, limits, and eligibility vary by plan; do not guarantee access to any
          specific feature.
        </p>
      </section>

      <section>
        <LegalSectionTitle>No self-referrals</LegalSectionTitle>
        <p className="mt-2">
          You may not refer yourself, members of your household, businesses you control, or other accounts created to
          circumvent this rule. Self-referrals and similar schemes may result in forfeiture of commissions and removal
          from the program.
        </p>
      </section>

      <section>
        <LegalSectionTitle>Valid referrals and commissions</LegalSectionTitle>
        <p className="mt-2">
          A commission arises only when we attribute a qualifying subscription or payment to your referral link or code
          according to program rules in effect at the time. We may define “qualifying” actions (for example, paid
          conversion after a valid trial) and may adjust attribution windows or criteria with reasonable notice.
        </p>
      </section>

      <section>
        <LegalSectionTitle>Payouts — delay, suspension, and review</LegalSectionTitle>
        <p className="mt-2">
          Commissions may appear as pending until we validate the underlying activity, referred payment clears, and any
          applicable hold or minimum threshold is met.{" "}
          <strong className="text-slate-200">No payout is released</strong> until required tax documentation (including a
          valid W-9 or applicable W-8, as described below) is on file, verified, and matched to payout instructions.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          We may delay, withhold, suspend, or reverse payouts for fraud; suspected breach of these Affiliate Terms;
          chargebacks or refunds on referred revenue; legal, regulatory, or reputational risk; missing, expired, or
          deficient tax documentation; law-enforcement or civil process; unusual or abusive traffic or attribution
          patterns; or while we investigate any of the foregoing. No payout is due while a suspension is in effect to the
          extent permitted by these Affiliate Terms and applicable law.
        </p>
      </section>

      <section>
        <LegalSectionTitle>U.S. and {LEGAL_GOVERNING_LAW_STATE} program administration</LegalSectionTitle>
        <p className="mt-2">
          {LEGAL_OPERATING_ENTITY} is the program operator and payer of record for U.S. federal tax purposes for
          commissions it pays under this program. Program administration, fraud review, tax documentation checks, and
          payout gating are conducted from {LEGAL_GOVERNING_LAW_STATE} and elsewhere in the United States as we determine;
          that posture does not waive endorsement, privacy, or other requirements in jurisdictions where you promote.
        </p>
      </section>

      <section>
        <LegalSectionTitle>Tax documentation, withholding, and your tax obligations</LegalSectionTitle>
        <p className="mt-2">
          <strong className="text-slate-200">Condition precedent.</strong> We do not pay affiliate commissions unless
          and until you provide a valid, signed IRS Form W-9 (U.S. persons) or, if you are not a U.S. person or we request
          otherwise, the applicable IRS Form W-8 series (for example W-8BEN, W-8BEN-E, or W-8ECI) or other certifications
          we specify for your tax classification. We may refuse to process or release payouts until acceptable
          documentation is received, verified, and matched to payout instructions.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          We may withhold or offset amounts from payouts when required by the U.S. Internal Revenue Code, regulations,
          treaty claims as filed, court order, or competent taxing authority, including backup withholding when legally
          required (for example when a payee fails to furnish a correct taxpayer identification number or under other
          Code rules). You are solely responsible for all income, self-employment, sales, use, and other taxes on
          commissions you earn; except where the law requires us to withhold, we do not pay your tax liabilities for
          you. Consult a qualified tax advisor.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          When federal thresholds and classification rules require it, {LEGAL_OPERATING_ENTITY} files IRS Form 1099-NEC (or
          successor forms) as payer. Oklahoma state reporting for nonemployee compensation (including direct filing or
          electronic submission to the Oklahoma Tax Commission when Oklahoma law requires it for a payer administering the
          program from {LEGAL_GOVERNING_LAW_STATE}) is satisfied as applicable law requires.
        </p>
      </section>

      <section>
        <LegalSectionTitle>Refunds and chargebacks</LegalSectionTitle>
        <p className="mt-2">
          If a referred customer receives a refund, chargeback, or reversal, we may reverse or offset the related
          commission against current or future payouts.
        </p>
      </section>

      <section>
        <LegalSectionTitle>Anti-abuse</LegalSectionTitle>
        <p className="mt-2">
          Artificial traffic, misleading advertising, cookie stuffing, incentive fraud, or attempts to game attribution
          are prohibited. Conduct described under “Prohibited promotion methods” is also grounds for action under this
          section. We may void commissions and suspend or terminate participation for abuse.
        </p>
      </section>

      <section>
        <LegalSectionTitle>No guaranteed earnings</LegalSectionTitle>
        <p className="mt-2">
          We do not guarantee impressions, conversions, or income. Past performance of the program does not predict future
          results.
        </p>
      </section>

      <section>
        <LegalSectionTitle>Discretionary determinations</LegalSectionTitle>
        <p className="mt-2">
          {LEGAL_OPERATING_ENTITY} may make reasonable, good-faith determinations about eligibility, attribution,
          commission amounts, and compliance with these terms. Our records and program systems generally govern absent
          clear error.
        </p>
      </section>

      <section>
        <LegalSectionTitle>Suspension and termination</LegalSectionTitle>
        <p className="mt-2">
          You may leave the program at any time. We may suspend or terminate your participation immediately or after
          notice where practicable if we believe you have breached these Affiliate Terms, engaged in fraud or abuse,
          created legal, regulatory, or reputational risk for {LEGAL_OPERATING_ENTITY} or {LEGAL_PRODUCT_NAME}, or if we
          wind down or modify the program for business reasons. Upon termination for breach or risk, unpaid commissions
          may be forfeited to the extent permitted by law and these terms. We may suspend payouts during any
          investigation.
        </p>
      </section>

      <section>
        <LegalSectionTitle>Related policies</LegalSectionTitle>
        <p className="mt-2">
          The{" "}
          <a href="/terms" className="font-medium text-teal-400/90 underline-offset-2 hover:underline">
            Terms of Service
          </a>
          ,{" "}
          <a href="/privacy" className="font-medium text-teal-400/90 underline-offset-2 hover:underline">
            Privacy Policy
          </a>
          , and{" "}
          <a href="/privacy#privacy-contact" className="font-medium text-teal-400/90 underline-offset-2 hover:underline">
            Data &amp; privacy requests
          </a>{" "}
          apply to your use of {LEGAL_PRODUCT_NAME} and to personal data we process in connection with the program.
        </p>
      </section>

      <section>
        <LegalSectionTitle>Changes</LegalSectionTitle>
        <p className="mt-2">
          We may update these Affiliate Terms. Continued participation after the effective date of changes constitutes
          acceptance unless law requires otherwise. If the general Terms of Service and these Affiliate Terms conflict on
          affiliate matters, these Affiliate Terms control for the program.
        </p>
      </section>
    </LegalDocLayout>
  );
}
