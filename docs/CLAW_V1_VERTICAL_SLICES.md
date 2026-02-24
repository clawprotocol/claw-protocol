# CLAW v1 — Vertical Slices (UX/UI Only)
**Status:** Draft (UX-first)  
**Scope:** Frontend UX/UI + mocked storage only (React/TS).  
**Non-goals (v1):** No protocol hooks, no OpenAI calls, no email, no payments/treasury, no real IPFS/Arweave, no anchoring.

---

## Global Product Principles
- **Professional + paid**: calm, deterministic UI; clear state; export quality outputs.
- **Mobile-first mandatory**: small screens work without hidden controls; primary actions stay reachable.
- **Non-binding by default**: every output defaults to “Non-binding draft” unless explicitly marked otherwise.
- **Reviewable / Exportable / Appeal-compatible**: always provide (1) review view, (2) export, (3) audit trail.
- **Not legal advice** disclaimers wherever users may infer legal conclusions.

---

## Utilities Overview (1-sentence purpose each)
1) **eSign (Signed Record):** Capture a signed record with participants, signature placements, and an immutable-ish audit trail (mocked), exportable as a professional bundle.  
2) **Agreement Creator:** Guide users through drafting a structured agreement (mocked suggestions), versioning, and producing a reviewable export.  
3) **Agreement Adjudicator:** Let users submit a dispute packet (agreement + timeline + attachments) and generate a “review packet” + “appeal packet” UI output (mocked evaluation).  
4) **Timeline:** Build a chronological evidence timeline with attachments and metadata, producing consistent receipts/exports (mocked).  
5) **Personal Liability:** A guided intake to document personal risk, actions taken, and mitigations, outputting a “personal record” packet (mocked).

**Document Repository / Document Vault (cross-cutting):** A unified place to store and reuse uploaded files and generated docs across utilities (mock local storage + generated IDs; later maps to IPFS/Arweave).

---

## Shared UX Components (used across utilities)

### A) Document Vault (Mocked)
**Purpose:** Central source of documents (uploads + generated exports) with stable IDs and metadata.

**Core UI:**
- **Vault List View** (filter + search)
  - File row: icon, filename, type, size, created, tags, “Used in: eSign/Agreement/Timeline/…” chips
  - Actions: Preview, Rename, Tag, Copy ID, Attach to current task, Delete (soft delete)
- **Preview Drawer / Bottom Sheet**
  - Filename + metadata
  - Actions: Attach, Download (mock), Copy ID, View usage
- **Attach Flow**
  - “Attach from Vault” opens Vault sheet with multi-select
  - Selected items appear as chips with remove affordance

**Mock behavior:**
- Store files in browser memory/localStorage (or lightweight in-app store).
- Generate `doc_` IDs (e.g., `doc_8F3K2P`) and `bundle_` IDs for exports.
- “Download” just triggers browser download of a generated placeholder file (or JSON).

---

### B) Export Modal (Unified)
**Purpose:** Consistent export paths across utilities.

**UI:**
- Title: “Export”
- Format chips: PDF (mock), JSON, ZIP (mock), “Share link” (disabled in v1)
- Include toggles:
  - Include audit trail
  - Include attachments list
  - Include participants
  - Include disclaimers page
- Primary CTA: “Generate Export”
- Secondary: “Cancel”

**Result state:**
- Success panel with: `bundle_id`, timestamp, “Save to Vault” toggle (default ON)
- Buttons: “Download”, “View in Vault”, “Copy Bundle ID”

---

### C) Audit Trail Drawer
**Purpose:** Always-available review/appeal layer.

**Entries show:**
- timestamp, actor (user/system), action label, details (collapsed), related doc IDs
- Example: “Added signer: Jane Doe”, “Placed signature field”, “Export generated: bundle_…”

---

### D) Status Banner (Top-of-screen)
**Purpose:** Make non-binding + environment status obvious.

**Banner states:**
- “Draft (Non-binding)” (default)
- “Ready for review”
- “Signed record created” (eSign)
- “Packet prepared (Appeal-compatible)” (Adjudicator/Timeline)
- Always includes: “Not legal advice” link → opens disclaimer sheet.

---

## Utility 1: eSign (Signed Record)

### Mobile-first Flow (screens)
1. **Start / Create Signed Record**
   - Choose document: Upload OR “Attach from Vault”
   - Name the record
   - Banner: Draft (Non-binding) + Not legal advice

2. **Add Participants**
   - Add signer(s) + optional viewer(s)
   - Each participant: name, email (optional; *not used in v1*), role (Signer/Viewer)
   - “Signing order” optional toggle (mock)

3. **Prepare Document**
   - Document preview (page)
   - Tools: Place signature / initials / date / text field (mock)
   - Participants switcher
   - Audit drawer available

4. **Review**
   - Summary: participants, required fields, document list, disclaimers
   - “Generate Signed Record” (mock)

5. **Result**
   - “Signed Record Created” (mock)
   - Export modal shortcut
   - Save bundle to Vault (default ON)
   - View audit trail

### Definition of Done (UX-only)
- [ ] Small screens (320–420px) can add/edit/remove signers without horizontal scroll.
- [ ] Bottom sticky action bar always shows primary CTA (Next / Add signer / Review).
- [ ] Participants are accessible via bottom sheet at all widths.
- [ ] Tool controls never disappear; they collapse into an icon row + sheet.
- [ ] Export modal produces a bundle and stores it in Vault with IDs.
- [ ] Audit trail drawer shows meaningful mocked events for each step.
- [ ] Non-binding + Not legal advice visible on every screen.

---

## Utility 2: Agreement Creator

### Mobile-first Flow
1. **Agreement Type / Template**
   - Choose template (NDA, Contractor, Lease addendum, “Blank”)
   - Set title + jurisdiction field (free text) + parties count

2. **Parties**
   - Add parties: name, entity type, address (optional), role label (Party A/B)
   - Attach supporting docs from Vault (optional)

3. **Terms Builder**
   - Section list (accordion):
     - Scope
     - Payment
     - Term/Termination
     - Confidentiality
     - Liability / Limitations
     - Dispute Resolution
   - Each section: rich text editor (simple textarea v1) + “Insert clause” (mock list)

4. **Version / Redline (v1-lite)**
   - Save Version button creates “Version 1, 2…” snapshots (mock)
   - Compare view: side-by-side changes (simple diff-style highlighting mocked)

5. **Review + Export**
   - “Non-binding draft” banner
   - Export modal → bundle saved to Vault

### Definition of Done (UX-only)
- [ ] Can create an agreement from template and add parties/terms on mobile.
- [ ] Version snapshots list visible and selectable.
- [ ] Compare view works on mobile via segmented toggle (Old/New/Diff).
- [ ] Export creates bundle and stores to Vault.
- [ ] Audit drawer captures versions + edits (mock).
- [ ] Disclaimers present.

---

## Utility 3: Agreement Adjudicator

### Mobile-first Flow
1. **Start Packet**
   - Select Agreement (Attach from Vault) OR “Choose from Creator”
   - Select Timeline (Attach from Vault) OR “Create new Timeline”

2. **Dispute Intake**
   - Fields: dispute title, what happened (textarea), desired outcome (textarea)
   - Parties involved (select from agreement parties or add ad-hoc)

3. **Evidence Attach**
   - Attach documents from Vault + upload new
   - Tag evidence (e.g., “Invoice”, “Message”, “Photo”)

4. **Review Packet (Mock)**
   - Packet summary: agreement, timeline, evidence list, participants
   - “Generate Review Packet” (mock) → shows structured “Findings (mock)”
   - Banner: “Reviewable; non-binding”

5. **Appeal Packet**
   - “Add appeal notes” + “Export appeal packet”
   - Audit trail includes all steps

### Definition of Done (UX-only)
- [ ] Users can assemble a dispute packet from Vault docs on mobile.
- [ ] Review Packet screen is readable and print/export-friendly.
- [ ] Appeal Packet export exists and is saved to Vault.
- [ ] Clear disclaimers that no legal advice is provided.
- [ ] Audit trail captures attachments and packet generation.

---

## Utility 4: Timeline (Evidence Timeline + Receipts later)

### Mobile-first Flow
1. **Create Timeline**
   - Title, context, optional tags
   - “Add first event” CTA

2. **Timeline List**
   - Chronological list with date chips
   - Each event card: date/time, title, short notes, attachments count

3. **Add / Edit Event**
   - Fields: date/time, event type, description, involved parties, location (optional)
   - Attach from Vault / upload
   - “Save event” adds audit entry

4. **Timeline Review**
   - Filter by tag/type
   - “Generate Timeline Export” (mock)
   - “Freeze timeline” (disabled in v1; shown but gated as “Coming soon”)

### Definition of Done (UX-only)
- [ ] Add/edit events with attachments on mobile without layout breaks.
- [ ] Event detail is readable and supports long text.
- [ ] Export generates bundle and stores to Vault.
- [ ] Audit drawer shows event create/edit actions.
- [ ] “Receipts/Anchoring” UI is clearly mocked/disabled.

---

## Utility 5: Personal Liability Tool

### Mobile-first Flow
1. **Start**
   - Choose scenario: Personal, Business operator, Contractor, “Other”
   - Banner: “Personal record; not legal advice”

2. **Guided Intake**
   - Sections (accordion):
     - Parties / entities involved
     - Timeline of actions (lightweight)
     - Communications log
     - Assets/obligations (high-level)
     - Mitigations taken (checkboxes + notes)

3. **Upload Supporting Docs**
   - Attach from Vault / upload

4. **Review**
   - “Record Summary” view designed for export

5. **Export**
   - Export modal → “Personal Record Packet” saved to Vault

### Definition of Done (UX-only)
- [ ] Mobile-first intake is usable one-handed (sticky next/back).
- [ ] Inputs handle long text; autosave draft (local) is indicated.
- [ ] Export creates bundle + stores to Vault.
- [ ] Disclaimers shown and persistent.

---

## What’s Mocked in v1 (Explicit)
- **Email:** no invitations, no notifications, no delivery.
- **OpenAI calls:** no generation, no adjudication; any “analysis” is placeholder text.
- **Payments:** no billing, no checkout, no subscriptions.
- **Treasury:** no wallet, no balances, no disbursements.
- **IPFS/Arweave:** Vault is local-only; IDs are generated client-side.
- **Anchoring / receipts:** any “anchor” button is disabled or “Coming soon”.
- **Identity verification:** no KYC; participant emails are optional and non-functional.

---

## UX-only Done Definition (Global)
- [ ] Mobile-first routes exist for all 5 utilities + Document Vault.
- [ ] Shared Export modal + Audit drawer + Status banner available everywhere.
- [ ] All screens have reachable primary action via sticky bottom action bar on mobile.
- [ ] No critical controls disappear under 400px width.
- [ ] Consistent empty states + loading skeletons (lightweight).
- [ ] All exports save to Vault with stable IDs.
- [ ] “Not legal advice” and “Non-binding by default” are visible, not buried.