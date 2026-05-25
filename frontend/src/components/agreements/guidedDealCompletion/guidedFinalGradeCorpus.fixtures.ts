/** Shared malformed guided corpora for regression tests (test73 / test74). */

export const TEST73_BAD_GUIDED_CORPUS = `
AI AUTOMATION SERVICES AGREEMENT

This Agreement is between Acme LLC ("Client") and Joe Brown ("Provider") for AI automation services.
${"Provider will deliver workflow automation, integrations, and operational reporting with milestone acceptance. ".repeat(12)}

1. Purpose and Scope

2. Fees and Payment
3.1 Client shall pay a monthly service fee of $6,000 per month for ongoing support.
3.2 Invoices are due Net 30 from receipt of invoice.
3.4 Total project fee is $120,000 for the initial build phase.

3. Confidentiality
3.1 Each Party shall protect Confidential Information.

4. Ownership and Work Product
4.1 Client owns project deliverables upon payment.

5. Support Expectations
2.1 Each Party shall keep confidential information confidential and use it only as permitted.
2.2 Neither Party shall disclose confidential information without consent.
2.3 Provider will maintain 99.9% monthly uptime for production automation components.
5.1 Provider offers commercially reasonable support during business hours.

6. Term and Termination
6.1 Initial term is twelve (12) months.
6.3 Termination if not working; breach.
6.4 Effect of termination.

7. Notices
7.1 Notices may be delivered electronically to the addresses on file.

Add LLC suffixes to party names before signing.

Acme LLC
Name: Anthem H Blanchard
Title: Manager

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
Acme LLC
By: ______________________
Name: Anthem H Blanchard
Title: Manager
Date: ____________________

SERVICE PROVIDER:
Joe Brown
By: ______________________
Name: Joe Brown
Date: ____________________
`.trim();

export const TEST74_BAD_GUIDED_CORPUS = `
AI AUTOMATION SERVICES AGREEMENT

This Agreement is between Acme LLC ("Client") and Joe Brown ("Service Provider").
${"Provider will deliver workflow automation, integrations, and operational reporting with milestone acceptance. ".repeat(10)}

1. Purpose and Scope
AI Automation Services Agreement

2. Fees and Payment
2.1 Client shall pay a monthly service fee of $6,000 per month.
2.2 Total project fee is $120,000 for the initial build phase.
2.3 Each Party shall keep confidential information confidential and use it only as permitted.
2.4 Client shall recover attorney fees if enforcement is required.
2.5 The Contractor shall invoice the Company within thirty (30) days.
2.6 Schedule A payment terms apply to phase one deliverables.
2.7 Net 30 applies to undisputed invoices.
2.8 Schedule A payment terms apply to phase one deliverables again.

4. Ownership and Work Product
4.1 Client owns project deliverables upon payment.
4.2 All work product and deliverables vest in Client upon full payment.
4.3 Deliverables include source code, documentation, and automation assets.

5. Support Expectations
5.1 Provider will maintain 99.9% monthly uptime for production automation components.

6. Term and Termination
6.1 Either party may terminate with thirty (30) days written notice.

Acme LLC
Name: Anthem H Blanchard
Title: Member
SERVICE PROVIDER:
Joe Brown
Name: Joe Brown

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
Acme LLC
By: ______________________
Name: Anthem H Blanchard
Title: Member
Date: ____________________

SERVICE PROVIDER:
Joe Brown
By: ______________________
Name: Joe Brown
Date: ____________________
`.trim();
