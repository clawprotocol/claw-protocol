import { LegalDocLayout, LegalSectionTitle } from "./LegalDocLayout";
import { getLegalPrivacyInquiryEmail, LEGAL_GOVERNING_LAW_STATE, LEGAL_OPERATING_ENTITY, LEGAL_PRODUCT_NAME } from "./legalConstants";
import { SpaLink } from "../SpaLink";

const linkClass = "font-medium text-teal-400/90 underline-offset-2 hover:underline";

export function PrivacyPage() {
  const privacyEmail = getLegalPrivacyInquiryEmail();

  return (
    <LegalDocLayout documentTopId="privacy-top" title="Privacy Policy" meta="Effective as posted on this page.">
      <section id="privacy-who">
        <LegalSectionTitle>Who this Policy covers</LegalSectionTitle>
        <p className="mt-2">
          This Policy describes how {LEGAL_OPERATING_ENTITY} (“we,” “us,” “our”) processes information when you use{" "}
          {LEGAL_PRODUCT_NAME}. We operate the Service from the United States; contractual terms — including governing
          law and venue in the State of {LEGAL_GOVERNING_LAW_STATE} where applicable, global-use responsibility, and
          limits on warranties — are in the{" "}
          <SpaLink to="/terms" className={linkClass}>
            Terms of Service
          </SpaLink>
          .
        </p>
        <p className="mt-2">
          When you use {LEGAL_PRODUCT_NAME}, your information may be processed in the United States and in other countries
          where we or our service providers operate, including if you access the Service from outside the United States.
        </p>
      </section>

      <section>
        <LegalSectionTitle>Categories of information we process</LegalSectionTitle>
        <p className="mt-2">
          Depending on how you use {LEGAL_PRODUCT_NAME}, we process the following categories of information:
        </p>
        <ul className="mt-3 list-inside list-disc space-y-2 text-slate-300">
          <li>
            <span className="font-medium text-slate-200">Account data.</span> Identifiers and credentials you provide to
            create or manage an account (such as email, name, organization or workspace identifiers, and authentication
            data handled by our systems or sign-in providers).
          </li>
          <li>
            <span className="font-medium text-slate-200">Agreement and workflow data.</span> Content and metadata you
            upload or enter in connection with drafts, agreements, negotiations, attachments, workspace organization
            (for example titles, folders, tags), and related product workflows — including structured fields and
            collaboration history the product stores to operate those features.
          </li>
          <li>
            <span className="font-medium text-slate-200">Signature and electronic record data.</span> Information
            generated when you or counterparties use signing, delivery, acknowledgment, or similar electronic-record
            features, including typed or drawn signature representations where captured, timestamps, signer roles,
            ceremony or completion signals, and status data needed to evidence what occurred in the product.
          </li>
          <li>
            <span className="font-medium text-slate-200">Proof and verification metadata.</span> Technical identifiers
            and cryptographic or integrity-related metadata we maintain so records can be checked or exported (for
            example hashes, anchors, audit or version indices, and chain or verification pointers where those features
            are enabled). This category supports verification and audit trails and is distinct from optional product
            analytics described below.
          </li>
        </ul>
        <p className="mt-3">
          We also collect limited technical data (such as device or browser type and IP address) for security,
          debugging, and reliability, as described below.
        </p>
      </section>

      <section>
        <LegalSectionTitle>Service providers (categories)</LegalSectionTitle>
        <p className="mt-2">
          We use subprocessors and vendors in the following <span className="font-medium text-slate-200">categories</span>{" "}
          to operate {LEGAL_PRODUCT_NAME}. Specific vendors may change; this list describes roles, not an exhaustive
          commercial directory:
        </p>
        <ul className="mt-3 list-inside list-disc space-y-2 text-slate-300">
          <li>
            <span className="font-medium text-slate-200">Hosting and storage</span> — servers, object storage, databases,
            and backups for application data.
          </li>
          <li>
            <span className="font-medium text-slate-200">Payment processing</span> — card and payment rails; we receive
            limited transaction metadata needed to deliver your plan (see Payments).
          </li>
          <li>
            <span className="font-medium text-slate-200">Email and communications</span> — transactional email,
            notifications, and related delivery infrastructure.
          </li>
          <li>
            <span className="font-medium text-slate-200">Analytics and product telemetry</span> — coarse events, errors,
            and session or usage metrics to run and improve the product (see Session and event analytics).
          </li>
          <li>
            <span className="font-medium text-slate-200">AI and assistive tooling</span> — when you use AI-assisted
            features, inputs and outputs may be processed by model providers under our configuration; do not submit
            highly sensitive information you are not permitted to share. See{" "}
            <a href="#privacy-agreement-ai" className={linkClass}>
              Agreement content and artificial intelligence
            </a>
            .
          </li>
          <li>
            <span className="font-medium text-slate-200">Security and fraud prevention</span> — abuse detection, rate
            limiting, integrity checks, and related tooling to protect accounts and the service.
          </li>
        </ul>
        <p className="mt-3">
          Providers in these categories may process information in the United States and in other countries where they or
          we operate. Each category may involve one or more providers. Their processing is governed by our agreements with
          them and, where applicable, their own terms and privacy notices for their services.
        </p>
      </section>

      <section id="privacy-agreement-ai">
        <LegalSectionTitle>Agreement content and artificial intelligence</LegalSectionTitle>
        <p className="mt-2">
          We do not use your agreement content to train public AI models. When you use assistive features, we may send
          relevant portions of your content to third-party model providers under our configuration to produce outputs
          for that session or request (including embeddings for optional semantic search where enabled). That processing
          is inference to operate the feature, not training general-purpose models on our behalf. Third-party handling is
          subject to our vendor agreements and those providers&apos; applicable terms and privacy notices.
        </p>
      </section>

      <section>
        <LegalSectionTitle>Session and event analytics</LegalSectionTitle>
        <p className="mt-2">
          We may log coarse product events (such as steps completed or errors) tied to a session or account to understand
          usage and improve {LEGAL_PRODUCT_NAME}. Events may be processed by analytics or observability providers in the
          categories above. We do not use those events to assert legal outcomes or compliance on your behalf.
        </p>
      </section>

      <section id="privacy-cookies-choices" className="scroll-mt-20">
        <LegalSectionTitle>Cookies, storage, and your choices</LegalSectionTitle>
        <p className="mt-2">
          We use first-party cookies and similar storage where needed to operate the application (for example to keep
          you signed in and to remember preferences). Core workflows do not depend on non-essential third-party
          advertising cookies. If we introduce optional non-essential cookies or similar technologies, we will describe
          them here and, where required, obtain consent before they run.
        </p>
        <p className="mt-2">
          There is no in-product settings screen to toggle cookies or site data; control is through your browser or
          device (for example clearing site data, blocking third-party cookies, or using private browsing). Doing so may
          affect sign-in persistence or certain convenience features. For account-level privacy requests, use{" "}
          <a href="#privacy-contact" className={linkClass}>
            How to reach us
          </a>{" "}
          below.
        </p>
      </section>

      <section>
        <LegalSectionTitle>No fingerprinting</LegalSectionTitle>
        <p className="mt-2">
          We do not use canvas fingerprinting, device fingerprinting, or similar techniques to identify you outside
          ordinary cookies, local storage, or identifiers you explicitly provide or that are standard for operating a
          web application.
        </p>
      </section>

      <section>
        <LegalSectionTitle>Payments</LegalSectionTitle>
        <p className="mt-2">
          Payments are processed by third-party payment providers in the payment-processing category above. Card and
          billing details are handled according to their practices; {LEGAL_OPERATING_ENTITY} receives limited
          transaction metadata needed to deliver your plan.
        </p>
      </section>

      <section>
        <LegalSectionTitle>How we use data</LegalSectionTitle>
        <p className="mt-2">
          We use data to provide and secure the service, troubleshoot issues, improve features, communicate with you
          about your account, comply with law, and enforce our terms. We do not sell your personal information as a
          standalone product.
        </p>
      </section>

      <section>
        <LegalSectionTitle>Retention, security, and incidents</LegalSectionTitle>
        <p className="mt-2">
          We retain information for as long as needed for the purposes described in this Policy and as required by law.
          We apply administrative, technical, and organizational measures appropriate to the nature of the service. No
          method of transmission or storage is completely secure; we do not guarantee absolute security.
        </p>
        <p className="mt-2">
          Retention periods are not uniform across the product: account and workspace administration data; agreement,
          signature, and workflow records; and proof or verification metadata may each be kept for different lengths of
          time depending on their purpose, your actions, your plan, and what the law requires.
        </p>
        <p className="mt-2">
          If we become aware of a breach involving personal data where applicable law requires us to notify you or a
          regulator, we will make notifications consistent with those requirements. If you believe you have discovered a
          security vulnerability, contact us using the same pathway as privacy inquiries in{" "}
          <a href="#privacy-contact" className={linkClass}>
            How to reach us
          </a>{" "}
          (describe the issue with enough detail for us to investigate).
        </p>
      </section>

      <section id="privacy-your-choices">
        <LegalSectionTitle>Your choices and data requests</LegalSectionTitle>
        <div id="privacy-contact" className="scroll-mt-20">
          <p className="mt-2">
            <span className="font-medium text-slate-200">How to reach us.</span>{" "}
            {privacyEmail ? (
              <>
                For privacy, data-rights, and related inquiries about information described in this Policy, contact us at{" "}
                <a href={`mailto:${privacyEmail}`} className={linkClass}>
                  {privacyEmail}
                </a>
                . Include enough information for us to verify your request and identify your account or role (for example
                workspace identifier), without sending passwords.
              </>
            ) : (
              <>
                {LEGAL_OPERATING_ENTITY} provides a monitored privacy and data-rights channel for each production LawDog
                site. If no email is listed in this section, send requests through the support or privacy
                contact published for this site (for example on your invoice, subscription confirmation, account portal, or
                public help page).
              </>
            )}
          </p>
          <p className="mt-2">
            Where available in-product, you may access, update, or delete certain account data. We will respond to
            verifiable requests consistent with applicable law. Nothing in this Policy limits mandatory consumer rights in
            your jurisdiction where they apply.
          </p>
        </div>
        <p className="mt-2">
          For browser-side storage choices, see{" "}
          <a href="#privacy-cookies-choices" className={linkClass}>
            Cookies, storage, and your choices
          </a>
          .
        </p>
      </section>

      <section>
        <LegalSectionTitle>Updates</LegalSectionTitle>
        <p className="mt-2">
          We may update this Policy. We will post the new version and note the effective date. Material changes may
          include additional notice as appropriate.
        </p>
      </section>
    </LegalDocLayout>
  );
}
