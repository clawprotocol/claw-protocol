import { LegalDocLayout, LegalSectionTitle } from "./LegalDocLayout";
import {
  getLegalPrivacyInquiryEmail,
  LEGAL_GOVERNING_LAW_STATE,
  LEGAL_OPERATING_ENTITY,
  LEGAL_PRODUCT_NAME,
  LEGAL_WEBSITE_TERMS_VERSION,
} from "./legalConstants";

const linkClass = "font-medium text-teal-400/90 underline-offset-2 hover:underline";

export function TermsPage() {
  const privacyEmail = getLegalPrivacyInquiryEmail();

  return (
    <LegalDocLayout
      documentTopId="terms-top"
      title="Terms of Service"
      meta={`Version ${LEGAL_WEBSITE_TERMS_VERSION} · Effective as posted on this page.`}
    >
      <section id="terms-definitions">
        <LegalSectionTitle>Definitions and service description</LegalSectionTitle>
        <p className="mt-2">
          These Terms of Service (“Terms”) govern access to and use of the websites, applications, APIs, and related
          services that {LEGAL_OPERATING_ENTITY} (“we,” “us,” “our”) makes available under the {LEGAL_PRODUCT_NAME} name
          (collectively, the “Service”).
        </p>
        <p className="mt-2">
          The Service is software for drafting, sending, organizing, signing-related workflows, and technical
          verification-style records (such as hashes, receipts, logs, and similar artifacts) where those features are
          offered. Unless we expressly agree in a separate signed writing, it does not include legal representation,
          legal advice, or court filing on your behalf.
        </p>
        <p className="mt-2">
          “You” means the individual or entity accepting these Terms. “User Content” means information, documents,
          files, and other materials you submit to the Service or generate using it, excluding our proprietary software
          and templates as such.
        </p>
      </section>

      <section>
        <LegalSectionTitle>LawDog is software, not a law firm</LegalSectionTitle>
        <p className="mt-2">
          {LEGAL_OPERATING_ENTITY} is a technology provider. {LEGAL_PRODUCT_NAME} is software, not a law firm, and we
          are not your lawyer. We do not provide legal services. Nothing in the Service, these Terms, or your
          communications with us creates a law firm–client relationship with {LEGAL_OPERATING_ENTITY}.
        </p>
      </section>

      <section>
        <LegalSectionTitle>No legal advice; no attorney–client relationship</LegalSectionTitle>
        <p className="mt-2">
          Any templates, suggestions, summaries, or assistive features (including where artificial intelligence is used)
          are for convenience only and are not legal advice. You are solely responsible for determining whether any
          document, workflow, or record is appropriate for your situation and jurisdiction. Consult a qualified attorney
          when you need legal advice. Using {LEGAL_PRODUCT_NAME} does not create an attorney–client relationship with{" "}
          {LEGAL_OPERATING_ENTITY} or with any individual associated with the Service.
        </p>
      </section>

      <section>
        <LegalSectionTitle>No guarantee of enforceability, admissibility, or legal sufficiency</LegalSectionTitle>
        <p className="mt-2">
          We do not guarantee that any agreement, record, export, or verification output will be enforceable,
          admissible in any proceeding, or legally sufficient for any purpose. Outcomes depend on facts, governing law,
          procedure, and the conduct of parties and courts. Technical records produced by the Service are tools for your
          workflows and records, not a certification of legal outcome or compliance with any statute or regulation unless
          separately established in your matter.
        </p>
      </section>

      <section id="terms-who-may-use">
        <LegalSectionTitle>Who may use LawDog</LegalSectionTitle>
        <p className="mt-2">
          You may use the Service only for your own lawful personal or business transactions, or for an organization you
          are authorized to act for. The product offers document workflow, electronic signature, recordkeeping, and
          structured drafting tools within that scope.
        </p>
        <p className="mt-2">
          You must be at least eighteen (18) years old and have the legal capacity to contract and to enter into these
          Terms.
        </p>
        <p className="mt-2">
          If you register for or use the Service on behalf of another person or entity (including a company,
          partnership, or other organization), you represent that you have actual authority to act for and to bind that
          person or entity to these Terms in connection with the Service. The organization is responsible for all
          activity under accounts used by persons it authorizes or allows to access the Service on its behalf, and for
          their compliance with these Terms.
        </p>
        <p className="mt-2">
          You may not access or use the Service where such access or use is prohibited by applicable law.
        </p>
      </section>

      <section id="terms-not-substitute-counsel">
        <LegalSectionTitle>Who may not rely on the Service for certain purposes</LegalSectionTitle>
        <p className="mt-2">
          The Service is not—and must not be relied on as—a substitute for licensed legal counsel in active disputes;
          court filings; regulated filings; jurisdiction-specific legal compliance determinations; legal opinions; or
          representation before courts or agencies. It does not provide those professional services.
        </p>
      </section>

      <section>
        <LegalSectionTitle>Global availability; compliance with applicable laws</LegalSectionTitle>
        <p className="mt-2">
          The Service may be reachable from many locations. You are responsible for ensuring your use complies with laws
          that apply to you, your organization, and your jurisdiction. We do not represent that the Service has been
          localized, translated, or legally qualified for every country, state, or locality.
        </p>
        <p className="mt-2">
          Contractual governing law and dispute rules are in{" "}
          <a href="#terms-governing" className={linkClass}>
            Governing law; disputes
          </a>{" "}
          below (home base: State of {LEGAL_GOVERNING_LAW_STATE}), except where mandatory local consumer or other
          non-waivable rights apply to you under applicable law.
        </p>
      </section>

      <section>
        <LegalSectionTitle>Electronic records and signatures</LegalSectionTitle>
        <p className="mt-2">
          Where the Service offers electronic signing, delivery, acknowledgment, or similar features, you consent to
          use electronic records and signatures in connection with those features to the extent offered by the product.
          E-sign and electronic record rules vary by transaction, jurisdiction, and channel. You are responsible for
          satisfying any consent, disclosure, or retention requirements that apply to you. We do not determine whether a
          particular signature or record meets any statute, regulation, or court rule.
        </p>
      </section>

      <section id="terms-billing">
        <LegalSectionTitle>Fees, billing, renewal, cancellation, and downgrades</LegalSectionTitle>
        <p className="mt-2">
          Paid features, if offered, are priced and billed as shown at checkout or in your order summary. Taxes,
          assessments, and payment-processor fees may apply. By purchasing a paid plan, you authorize us and our payment
          processors to charge your payment method for applicable fees.
        </p>
        <p className="mt-2">
          <span className="font-medium text-slate-200">Monthly plans.</span> Where you select monthly billing, your
          subscription renews each billing period until you cancel through the Billing or account tools we make available,
          unless we state otherwise at purchase.
        </p>
        <p className="mt-2">
          <span className="font-medium text-slate-200">Annual plans.</span> Where you select annual billing, you pay one
          upfront charge for the term shown at checkout. Whether your plan continues or renews after that term, and on
          what terms, is as stated at purchase and in these Terms; where purchase terms are silent, continuation or
          renewal follows the Terms of Service and our then-current offering.
        </p>
        <p className="mt-2">
          <span className="font-medium text-slate-200">Cancellation and refunds.</span> You may cancel or change your
          plan through Billing when available for your workspace. Refunds and credits are only as described on your
          order at purchase, in these Terms, and in applicable law.
        </p>
        <p className="mt-2">
          <span className="font-medium text-slate-200">Downgrades and non-payment.</span> If you downgrade, cancel, or
          fail to pay, paid-only features may become unavailable. Subject to your account settings and our retention
          practices described in the Privacy Policy, existing records you already have may remain available to view and
          export where the product allows; we do not promise indefinite retention or export availability for every
          object or format.
        </p>
      </section>

      <section id="terms-permitted-use">
        <LegalSectionTitle>Permitted use of the Service</LegalSectionTitle>
        <p className="mt-2">
          Subject to these Terms, your plan, and product limits, you may use the Service for lawful purposes to create
          structured drafts; send, sign, store, and export records and documents; and use assistive features (including
          where artificial intelligence is offered) where your plan and the product allow. That use is software for your
          workflows only. It does not replace licensed counsel for the matters in{" "}
          <a href="#terms-not-substitute-counsel" className={linkClass}>
            Who may not rely on the Service for certain purposes
          </a>
          . The software-only, non-advice, and non-counsel limitations stated earlier in these Terms apply as well. You
          are responsible for your use of the Service and for ensuring it remains consistent with these Terms and
          applicable law.
        </p>
      </section>

      <section id="terms-acceptable-use">
        <LegalSectionTitle>Acceptable use and prohibited conduct</LegalSectionTitle>
        <p className="mt-2">
          Unless we otherwise agree in writing, you may use the Service only as permitted in these Terms and in the
          product. You will not: (a) violate applicable law or use the Service for unlawful purposes; (b) infringe
          others’ intellectual property, privacy, or publicity rights; (c) gain or attempt to gain unauthorized access to
          the Service, accounts, networks, or systems, or circumvent authentication, authorization, rate limits, or
          security measures; (d) share, sell, or transfer credentials or permit access to your account in a manner that
          violates these Terms or our posted policies; (e) upload or distribute malware or interfere with or disrupt the
          Service or other users; (f) scrape, spider, harvest, or use automated means to extract data or interact with
          the Service beyond documented APIs and other use we expressly permit.
        </p>
        <p className="mt-2">
          You will not: (g) use the Service to send spam, unsolicited bulk communications in violation of law, or
          deceptive outreach; (h) impersonate any person or entity, falsely claim authority to act for another, or
          misrepresent your identity or affiliation; (i) use the Service to engage in the unauthorized or unlawful
          practice of law; (j) mislead third parties about LawDog’s role, including by suggesting we are a law firm,
          provide legal representation, or act as your lawyer, or by representing that the Service or its outputs
          certify legal compliance, approve a particular legal outcome, or replace licensed counsel; (k) misuse
          signing, delivery, acknowledgment, or access links, tokens, or recipient flows, or related identity workflows,
          in a deceptive or unlawful manner, including to obtain signatures or actions without proper authority; (l) use
          the Service to build a competing product by systematic extraction of our content or behavior; (m) use the
          Service in violation of applicable sanctions, export-control laws, or restrictions imposed by competent
          authorities. We may investigate and take appropriate action, including removing content, suspending accounts,
          and referring unlawful activity to authorities.
        </p>
      </section>

      <section>
        <LegalSectionTitle>User Content; license to operate the Service; exports and retention</LegalSectionTitle>
        <p className="mt-2">
          You retain ownership of your User Content, subject to third-party rights in materials you provide. You grant
          {LEGAL_OPERATING_ENTITY} a non-exclusive, worldwide, royalty-free license to host, copy, process, transmit,
          display, and create technical derivatives (such as encrypted or hashed forms) of User Content as reasonably
          necessary to provide, secure, and improve the Service and as described in our Privacy Policy. You represent
          that you have the rights needed to grant this license.
        </p>
        <p className="mt-2">
          You are responsible for maintaining copies of materials you need. Features may allow export of certain
          records; exports depend on product capabilities and your plan. Retention periods and deletion are described in
          the Privacy Policy and may depend on your actions, plan, and legal requirements.
        </p>
      </section>

      <section>
        <LegalSectionTitle>Privacy Policy</LegalSectionTitle>
        <p className="mt-2">
          Our{" "}
          <a href="/privacy" className={linkClass}>
            Privacy Policy
          </a>{" "}
          explains how we collect, use, and disclose personal information and is incorporated into these Terms by this
          reference. If you use the Service, you consent to those practices.
        </p>
      </section>

      <section>
        <LegalSectionTitle>Affiliate and referral programs</LegalSectionTitle>
        <p className="mt-2">
          If we offer an affiliate, referral, or similar program, participation is governed by the{" "}
          <a href="/affiliate-terms" className={linkClass}>
            Affiliate Terms
          </a>{" "}
          (or successor terms we publish) in addition to these Terms. If these Terms and the Affiliate Terms conflict on
          affiliate matters, the Affiliate Terms control for the program. If you do not participate in such a program,
          this section does not impose additional obligations on you.
        </p>
      </section>

      <section id="terms-suspension">
        <LegalSectionTitle>Suspension and termination</LegalSectionTitle>
        <p className="mt-2">
          You may stop using the Service at any time. We may suspend or terminate access to the Service or to specific
          features if you materially breach these Terms; if we reasonably believe suspension is necessary to prevent harm,
          fraud, abuse, legal risk, or regulatory risk; to comply with law or lawful requests; or if we discontinue all
          or part of the Service.
        </p>
        <p className="mt-2">
          We will give notice where reasonable and permitted by law. Provisions that by their nature should survive
          (including disclaimers, limitations of liability, indemnity to the extent included, and governing law) survive
          termination.
        </p>
        <p className="mt-2">
          {LEGAL_OPERATING_ENTITY} may restrict, deny, suspend, or terminate access to the Service, accounts,
          transactions, or features where reasonably necessary to comply with sanctions, export-control laws,
          prohibited-jurisdiction rules, or other applicable legal or regulatory obligations.
        </p>
      </section>

      <section>
        <LegalSectionTitle>Disclaimers; limitation of liability; indemnity</LegalSectionTitle>
        <p className="mt-2">
          <span className="font-medium text-slate-200">Disclaimer of warranties.</span> Except where prohibited by law,
          the Service is provided on an “as is” and “as available” basis. We disclaim all warranties, whether express,
          implied, or statutory, including implied warranties of merchantability, fitness for a particular purpose,
          title, and non-infringement. We do not warrant that the Service will be uninterrupted, error-free, or free
          of harmful components.
        </p>
        <p className="mt-2">
          <span className="font-medium text-slate-200">Limitation of liability.</span> To the maximum extent permitted by
          law, {LEGAL_OPERATING_ENTITY} and its suppliers, licensors, and affiliates will not be liable for any indirect,
          incidental, special, consequential, exemplary, or punitive damages, or for loss of profits, revenue, data, or
          goodwill, arising from or related to the Service or these Terms. Our aggregate liability for all claims
          relating to the Service arising out of any twelve-month period is limited to the greater of (a) amounts you
          paid us for the Service in that period or (b) one hundred U.S. dollars (USD $100), except where prohibited by
          law. Some jurisdictions do not allow certain limitations; in those jurisdictions our liability is limited to
          the fullest extent permitted.
        </p>
        <p className="mt-2">
          <span className="font-medium text-slate-200">Indemnity.</span> To the extent permitted by law, you will defend,
          indemnify, and hold harmless {LEGAL_OPERATING_ENTITY} and its officers, directors, employees, and contractors
          from and against any claims, damages, losses, and expenses (including reasonable attorneys’ fees) arising out
          of your User Content, your use of the Service in violation of these Terms or law, or your violation of
          third-party rights.
        </p>
      </section>

      <section id="terms-governing">
        <LegalSectionTitle>Governing law; disputes</LegalSectionTitle>
        <p className="mt-2">
          These Terms are governed by the laws of the State of {LEGAL_GOVERNING_LAW_STATE}, United States, without regard
          to conflict-of-law principles that would require application of another jurisdiction’s laws, except that
          mandatory consumer protection or other non-waivable laws in your place of residence or operations may still
          apply to you where applicable law requires.
        </p>
        <p className="mt-2">
          Subject to applicable law, you and {LEGAL_OPERATING_ENTITY} consent to the exclusive jurisdiction and venue of
          the state and federal courts located in {LEGAL_GOVERNING_LAW_STATE} for disputes arising out of or relating to
          these Terms or the Service, except that we may seek injunctive relief in any court of competent jurisdiction.
          You waive any objection to venue in those courts.
        </p>
      </section>

      <section id="terms-contact">
        <LegalSectionTitle>Contact; general notices</LegalSectionTitle>
        <p className="mt-2">
          For privacy and data-rights requests, follow the{" "}
          <a href="/privacy#privacy-contact" className={linkClass}>
            How to reach us
          </a>{" "}
          section of our Privacy Policy
          {privacyEmail ? (
            <>
              , or email{" "}
              <a href={`mailto:${privacyEmail}`} className={linkClass}>
                {privacyEmail}
              </a>
            </>
          ) : null}
          . For other legal notices to {LEGAL_OPERATING_ENTITY}, use the contact method we publish for this Service when
          available (including any email shown in the Privacy Policy).
        </p>
      </section>

      <section>
        <LegalSectionTitle>Changes to these Terms</LegalSectionTitle>
        <p className="mt-2">
          We may modify these Terms from time to time. We will post the updated Terms on this page and update the version
          identifier when we do. If a change is material, we will provide reasonable notice by appropriate means (such as
          an in-product notice or email to the address associated with your account) where required by law. Your
          continued use of the Service after the effective date of changes constitutes acceptance unless applicable law
          requires your express consent for certain changes.
        </p>
      </section>

      <section>
        <LegalSectionTitle>Miscellaneous</LegalSectionTitle>
        <p className="mt-2">
          These Terms, together with the Privacy Policy and any order or plan terms presented at purchase, are the
          entire agreement between you and {LEGAL_OPERATING_ENTITY} regarding the Service and supersede prior
          understandings on the same subject. If any provision is held unenforceable, the remaining provisions remain in
          effect. You may not assign these Terms without our consent; we may assign them in connection with a merger,
          acquisition, or sale of assets. Our failure to enforce a provision is not a waiver. Section headings are for
          convenience only.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Terms version {LEGAL_WEBSITE_TERMS_VERSION} · {LEGAL_OPERATING_ENTITY} · {LEGAL_PRODUCT_NAME}
        </p>
      </section>
    </LegalDocLayout>
  );
}
