# CLAW Automated Determination Clause
## (Agreement-Based Automated Determination + Privacy + Appeal Lane)

> **Status:** Draft v1 (opt-in only)  
> **Purpose:** Provide a legally conservative, jurisdiction-agnostic clause that allows parties to use CLAW’s Automated Determination (“AD”) mechanism **without creating unauthorized practice of law, unintended adjudication claims, or forced disclosure risks**.

---

## 0) Read This First (Design Intent)

This clause is intentionally:
- **Opt-in** (never default)
- **Scope-limited** (no open-ended adjudication)
- **Contractual** (authority flows only from agreement)
- **Audit-first** (deterministic records + receipts)
- **Privacy-preserving** (selective disclosure / ZK-compatible)
- **Appealable** (clear human override lane)

CLAW does **not** declare itself a court, arbitrator, or law firm.  
CLAW supplies a **mechanized determination process** whose effect depends entirely on what the parties agree to **in advance**.

---

## 1) Definitions

**“Automated Determination” (AD)**  
A determination produced by a defined computational workflow (which may include LLMs and/or human reviewers) operating on specified inputs under specified rules.

**“Determination Engine”**  
The specific workflow identified by name and version (e.g., *CLAW Determination Engine v1.0*), including any model class, rule set, and review requirements.

**“Determination Output”**  
The structured result produced by the Determination Engine, including any pass/fail status, scores, findings, or explanatory text.

**“CLAW Receipt”**  
A cryptographic receipt verifiable under the CLAW protocol evidencing commitments, inputs, outputs, and timestamps.

**“Private Mode”**  
A mode in which inputs, reasoning, reviewer identity, or other sensitive elements are shielded from public disclosure, while proof of validity and sequence remains verifiable (e.g., via commitments or zero-knowledge attestations).

---

## 2) Opt-In to Automated Determination

### 2.1 Explicit Agreement Required
The parties **expressly agree** to use Automated Determination **only** for the matters and effects described in this section.

No Automated Determination shall apply absent this express agreement.

### 2.2 Identification of the Determination Process
The parties designate the following Determination Engine:

- **Engine name & version:** `[e.g., CLAW Determination Engine v1.0]`
- **Mode:** `[Public / Private / Private + ZK attestation]`
- **Model class (if applicable):** `[e.g., nano / mini / custom]`
- **Human review required:** `[Yes / No / Conditional]`

The Determination Engine version is fixed for the life of this Agreement unless amended by written agreement of all parties.

---

## 3) Scope of Determination (Critical Limitation)

### 3.1 In-Scope Issues
Automated Determination applies **only** to the following narrowly defined issues:

- `[e.g., objective milestone completion]`
- `[e.g., delivery confirmation against agreed checklist]`
- `[e.g., calculation of amounts using agreed formula]`
- `[e.g., compliance with explicitly enumerated obligations]`

### 3.2 Explicit Exclusions
Automated Determination shall **not** decide:

- criminal matters
- questions of statutory interpretation beyond the contract
- rights of non-parties
- issues requiring equitable relief unless separately agreed
- professional malpractice or ethical violations

This limitation is intentional and material.

---

## 4) Inputs and Rules

### 4.1 Permitted Inputs
Only the following inputs may be considered:

- documents expressly referenced in this Agreement
- submissions made through the CLAW workflow
- data meeting the agreed schema

Inputs not meeting these criteria **must be ignored**.

### 4.2 Ruleset
The Determination Engine shall apply only:

- the terms of this Agreement
- the enumerated ruleset attached as **Schedule A**
- no external norms or unstated assumptions

---

## 5) Effect of Determination Output (Choose One)

> **Exactly one of the following subsections must be selected.**

### Option A — Advisory Only (Non-Binding)
The Determination Output is advisory and non-binding.  
It may be used for negotiation, internal decision-making, or settlement discussions but has no automatic contractual effect.

---

### Option B — Conditional Contractual Trigger
The parties agree that the Determination Output shall trigger the following contractual consequences:

- **If PASS:** `[describe consequence]`
- **If FAIL:** `[describe consequence]`

These consequences are agreed contractual terms and may be enforced to the extent permitted by law.

---

### Option C — Binding Expert Determination (By Agreement)
Within the scope defined in Section 3, the Determination Output shall be binding as an expert determination, except in cases of:

- fraud
- manifest error
- violation of this Agreement
- non-compliance with applicable law

Nothing herein waives mandatory rights under applicable law.

---

## 6) Privacy and Selective Disclosure

### 6.1 Private Mode
Where Private Mode is selected:

- underlying inputs may remain confidential
- reasoning and intermediate analysis may remain confidential
- reviewer identity may be shielded

### 6.2 Public Proof
Even in Private Mode, the parties agree that:

- cryptographic commitments
- timestamps
- proof of rule compliance
- proof that a valid Determination Output was produced

may be anchored and verified without revealing protected content.

### 6.3 No Adverse Inference
The use of Private Mode shall not give rise to adverse inference, presumption, or waiver of privilege where applicable.

---

## 7) Escrow Coordination (Optional)

If this Agreement involves escrow, the parties authorize the escrow agent to rely on the Determination Output **solely** as specified below:

- **Release condition:** `[e.g., PASS]`
- **Hold condition:** `[e.g., FAIL pending cure]`
- **Cure period:** `[time period]`

CLAW Receipts may be provided to the escrow agent as evidence of compliance, but the escrow agent retains all rights and obligations imposed by law unless expressly modified by contract.

---

## 8) Appeal and Human Override Lane

### 8.1 Appeal Right
A party may appeal a Determination Output within `[X] days` on the following limited grounds:

- manifest error
- violation of agreed rules
- material procedural defect

### 8.2 Appeal Process
Upon appeal:

- the matter may be referred to a human reviewer
- the reviewer may be a licensed attorney if required
- the appeal outcome may replace or affirm the original output

### 8.3 Effect of Appeal
Unless otherwise agreed:
- escrow actions are paused during appeal
- contractual consequences are suspended pending resolution

---

## 9) No Court Substitution / No Sovereign Authority

The parties acknowledge that:

- Automated Determination is a private contractual mechanism
- it does not replace courts or statutory arbitration regimes
- it does not bind non-parties
- it derives authority solely from this Agreement

---

## 10) Records and Verification

The parties consent to the creation and retention of CLAW Receipts evidencing:

- this Agreement
- submissions
- Determination Outputs
- appeals and resolutions

Such receipts provide proof of existence, sequence, and integrity — not truth or legal advice.

---

## 11) No Legal Advice / No Attorney-Client Relationship

Unless explicitly stated in a separate engagement:

- no attorney-client relationship is formed
- Automated Determination does not constitute legal advice
- any licensed review is limited to the scope expressly stated

---

## 12) Survival and Severability

This clause survives termination of the Agreement for purposes of recordkeeping, verification, and enforcement of accrued rights.

If any provision is held invalid, the remainder shall be enforced to the maximum extent permitted by law.

---

## End of Clause
