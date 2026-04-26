# LawDog: Universal Review Intake — QA

Manual QA for review paths where a reviewer can suggest changes in more than one way, while LawDog stays a neutral **compare / merge / resolution** layer. Nothing in the owner’s **saved** master draft changes without their explicit **Apply** (or the equivalent) on a proposal.

## Product intent (what to expect)

- **Plain English**: the reviewer can describe what should change, then use **Preview changes** (LawDog Assist) to line that up with agreement fields. The existing “instruction” / posture flow remains.
- **Paste revised draft**: the reviewer can paste a full or partial revised draft, optionally add a short cover note, then **Preview** to compare. The “compare against current + summary before send” is the existing preview + material summary panel, which uses a **deep-cloned baseline**; the on-screen draft in LawDog is not overwritten at preview time.
- **Upload file**: the UI shows **Upload file comparison coming soon** with a **disabled** control. There is **no** OCR, upload, or file-diff pipeline in the product for this path yet. Confirm the UI is honest (placeholder + disabled) and not a working upload.
- **Direct compare (optional)**: a separate, read-only two-paste compare (see *Direct compare* in the same review area). It does not submit proposals and does not merge into the live draft.
- **Owner**: incoming items are shown as **Suggested edits**; owner actions are **Apply** and **Decline** (calm, collaborative copy — no “dispute,” “redline war,” or similar in user-facing review strings).

## Checklist (happy path + safeguards)

- [ ] **Reviewer copies draft** using **Copy full draft** (and optional clause / key terms where shown).
- [ ] **Reviewer uses outside** counsel, an AI, or Word: they can return via **plain English** and/or **Paste revised draft** (not trapped in LawDog for drafting).
- [ ] **Reviewer pastes a revised draft** in **Paste revised draft**, then **Preview changes**: comparison and **material change summary** (and structured diff) are visible before **Send suggested edits**.
- [ ] **LawDog compares** differences; baseline for that preview is preserved (no silent overwrite of the live draft in the recipient’s session).
- [ ] **Owner** sees **Suggested edits** and a clear summary of material / section changes, then can **Apply** or **Decline** only; no surprise merge.
- [ ] **Final saved draft** / master agreement updates **only** after the owner’s confirmation (Apply), not on preview alone.
- [ ] **Upload**: control is **disabled**; text clearly states **coming soon** (no real file diff).
- [ ] **Tone**: review copy is collaborative; no hostile framing in the surfaces covered by the intake copy scan.

## Defer / do not file as “done”

- File **upload** with OCR or in-panel file-versus-file diff (only after backend + UI ship).
- Relying on **Direct compare** to apply changes (it is explicitly read-only; applying still goes through owner workflow).

## How to test quickly

1. Open a review link as recipient → **Suggest edits** → confirm **Bring back suggested edits** and the three path labels.
2. Switch **Plain English** / **Paste revised draft**; confirm paste field only in paste mode; **Upload** stays disabled.
3. Run a full **Preview** then **Send**; as owner, **Apply** or **Decline** and confirm the saved draft only updates on **Apply**.

