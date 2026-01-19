 CLAW_JUDGE_DIAGRAM_MD: |
    # CLAW — Minimal Verification Diagram (Judge / Auditor View)

    > **Purpose:**  
    > This document shows only what is necessary to understand how CLAW records, verifies, and presents evidence.  
    > It intentionally excludes payments, culture, DAOs, tokens, and UX layers.

    ---

    ## Core Verification Flow (Minimal)

    ```mermaid
    flowchart LR
      A[Document / Agreement / Evidence] --> B[Canonicalization]
      B --> C[SHA-256 Hash]
      C --> D[Merkle Inclusion]
      D --> E[Bitcoin Transaction]

      E --> F[CLAW Receipt]
      F --> G[Independent Verifier]

      G -->|Valid / Invalid| H[Judge • Auditor • Counterparty]
    ```

    ---

    ## Optional Determination & Enforcement (Clearly Separate)

    ```mermaid
    flowchart LR
      R[CLAW Receipt] --> D1[Automated Determination<br/>(By Prior Agreement Only)]
      D1 -->|Optional| L1[Licensed Review / Appeal]
      D1 -->|If Agreed| E1[Escrow / Contractual Consequence]
    ```

    ---

    ## What This Diagram Proves (Precisely)

    - The exact digital content was fixed in a specific form
    - The content existed no later than the Bitcoin block containing the transaction
    - Anyone can independently verify this without trusting CLAW or its operators

    ---

    ## What This Diagram Does NOT Claim

    - It does not prove truth or accuracy of the content
    - It does not determine legal rights or liability
    - It does not replace courts, judges, or counsel
    - It does not enforce outcomes

    This diagram represents evidence authentication and sequencing only.

    ---

    ## Privacy & Safety Note

    - Sensitive inputs, reasoning, or reviewer identity may be protected
    - Only cryptographic commitments and timestamps are public
    - Verification does not require disclosure of protected material

    ---

    ## One-Sentence Summary for the Record

    > **CLAW provides a verifiable method to prove when specific digital content existed and to optionally record agreed determinations, without asserting adjudicative authority.**

    ---

    ## End of Document