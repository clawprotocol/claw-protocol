# LawDog: portable review QA checklist

Manual QA for the amicable, portable review flow (reviewer uses their own tool, then returns suggested text; LawDog diffs; both sides confirm). Pair with feature work in the recipient review surface (`AgreementRecipientReview`) and owner workspace (`AgreementReview`).

## What exists today (implementation snapshot)

- **Copy / export (plain text)**: Recipients and owners can copy the full draft (and clause / key terms where offered) from the UI to the system clipboard. There is no file upload of a revised document for diff in product UI today.
- **Return edits**: Recipients and owners can **paste** revised or annotated text. The copy explicitly states that **file comparison and upload are not available yet** (coming soon); paste is the supported path.
- **Compare**: After **Preview changes**, the UI shows structured field diff plus an inline “view changes” (character/token-level) presentation against the current draft snapshot for that preview. Owner-side previews use the same pattern; queued recipient **suggested edits** get the same style of comparison before apply/decline.
- **Owner accept / decline**: The owner **applies** a preview to the saved draft, **declines** a recipient suggestion (dismisses that item only), or **dismisses** a local preview without changing the saved draft. Recipients **send suggested edits** after preview; the owner must **apply** for the server draft to update. Nothing applies silently.
- **Safeguards (product behavior)**: Previews are built from a **snapshot of the current draft and HTML** before merge; the saved draft is not overwritten until the owner **applies** (recipient path) or **applies** after their own preview (owner path). Discarding a preview reverts the UI to the last saved state for that flow; declining a queue item does not change other open items.

## Checklist (happy path + safeguards)

- [ ] **Copy current draft**: Use “Copy full draft” (and optional clause / key terms). Clipboard receives plain text suitable for external work.
- [ ] **Revise externally**: In any out-of-product editor or model; LawDog is not required for that step.
- [ ] **Paste revised / notes back**: Pasted text is the supported path; confirm UI does **not** claim upload or OCR is available. Placeholder/footnote should mention that **file comparison is coming soon** if the product is ahead of the backend.
- [ ] **Preview changes**: Preview runs; **no silent write** to the owner’s master draft.
- [ ] **Compare before & after**: Open structured and “view changes” modes; material edits should be obvious where the diff engine can represent them.
- [ ] **Summary of changes**: “Changes summary” / changed sections are readable before commit.
- [ ] **Owner accepts or declines** (recipients) / **applies or dismisses preview** (own revisions): Only **Apply** updates the stored draft; **Decline** affects only the selected suggestion; **Dismiss preview** cancels a pending preview.
- [ ] **Final draft updates only after confirmation**: Recipient: owner must apply. Owner: only apply after reviewing summary. **Neither side** should see a surprise full replacement without a confirmation step in that flow.
- [ ] **Revert / undo mindset**: Dismiss or decline returns you to a state without having merged that proposal; re-fetch or reload should not show applied changes if you only previewed. (If product adds explicit undo of an apply later, add a case here.)
- [ ] **Tone**: Wording should read as a **calm agreement workspace** — prefer “suggested edits,” “review notes,” “agreement path,” and avoid “dispute” / litigation framing in user-visible review copy.

## Explicitly deferred (do not mark as done in QA)

- **Upload** of a revised file and **OCR** / file-vs-file diff inside LawDog. Until shipped, the UI may only offer paste, with a clear “coming soon” for file-based comparison.
