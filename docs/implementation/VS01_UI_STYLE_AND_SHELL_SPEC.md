# VS01 thin frontend — UI shell, style system & interaction tone

**Purpose:** Lock the **look, layout, and feel** for the VS01 pilot so it ships as **fun, clean, professional, versionable, and agent-friendly**, with a **restrained** nod to the Doginal Dogs / dojinaldogs.com social-layer vibe (community-forward, playful confidence) **without** meme noise, gimmicks, or heavy branding.

**Scope:** Presentation and UX rules only. **No code.** **No backend changes.** Aligns with [`VS01_THIN_FRONTEND_PLAN.md`](VS01_THIN_FRONTEND_PLAN.md), [`VS01_THIN_FRONTEND_BUILD_PLAN.md`](VS01_THIN_FRONTEND_BUILD_PLAN.md), and [`VS01_REVIEW_AND_COMPRESSION.md`](VS01_REVIEW_AND_COMPRESSION.md).

---

## 1. Visual direction

### Look and feel

- **Base mood:** “Proof lab” meets “friendly clubhouse”—**calm surfaces**, **one accent personality**, **evidence-first typography** for ids and hashes.
- **Surface:** Soft off-white or very light warm gray page background; **one elevated card** for the active step so the flow reads as a single instrument panel.
- **Density:** **Spacious**—generous vertical rhythm between sections; forms never feel cramped. Pilot = clarity over features.
- **Line:** Thin borders, **no** heavy chrome; **no** skeuomorphic metaphors (no fake paper stacks, no 3D coins).

### Balancing playful + professional

| Playful (allowed) | Professional (required) |
|-------------------|-------------------------|
| Accent color on primary CTA and stepper active state | Neutral text hierarchy (title → body → muted help) |
| Short, human microcopy (“You’re set—grab your bundle”) | Full disclaimer strip; hashes shown **verbatim** in mono |
| Rounded corners on cards and buttons | Flat, predictable layout grid; no decorative clutter |
| Optional tiny “spark” or paw-dot motif **only** in header accent strip | Legal-adjacent tone: evidence, not hype |

**Rule:** Playfulness lives in **accent + microcopy + spacing**; professionalism lives in **structure, typography roles, and hash/id treatment**. Never both fight in the same element (e.g. no rainbow gradients on the receipt hash block).

### Echoing Doginal Dogs / social layer (restrained)

The social layer reads as **community, memes-as-culture, and “we’re in this together”—not** as casino energy or mascot overload.

**Do echo (subtle):**

- **Warmth:** Slight warmth in neutrals (cream / warm gray), not sterile blue-gray clinical UI.
- **Confidence:** Bold but simple primary button; feels “send it” without shouting.
- **Belonging:** One **optional** line in the header or footer—“Built for people who care about proof *and* the pack”—or similar; **one sentence max**, skippable in stricter builds.
- **Accent:** A single **signature hue** (see tokens)—think “signal color” (e.g. electric coral, amber, or saturated teal) used **only** for primary actions, active step, and focus rings—**not** for body text or large backgrounds.

**Do not echo (too noisy for VS01):**

- Comic Sans–style display fonts, dog puns in every label, paw prints as list bullets, rotating meme GIFs, or “wagmi” copy on legal disclaimers.
- Full-bleed illustrated heroes, NFT frames, or chain-status dashboards.

**Metaphor budget:** At most **one** small non-text motif (e.g. **single** paw-dot or bone-minus icon in the header) if the team wants it—**default: none** for the smallest ship.

---

## 2. Layout shell

### Exact shell structure (pilot)

Use a **single column**, max width **~640–720px** for readable forms (wider feels empty for this flow).

```
┌─────────────────────────────────────────────┐
│  [optional accent hairline / 4px strip]      │  ← premium: subtle brand tint; playful: optional paw-dot
├─────────────────────────────────────────────┤
│  HEADER                                      │
│  • Product line: “CLAW · VS01” or “VS01 Sign” │
│  • One-line subtitle: what this tool does     │
├─────────────────────────────────────────────┤
│  STEPPER (1 — 2 — 3)                         │  ← labels: Finalize · Sign · Done
├─────────────────────────────────────────────┤
│  GLOBAL ERROR / TOAST SLOT (if any)          │  ← full width of column, above card
├─────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────┐│
│  │ MAIN CARD (active step)                  ││  ← primary “premium” surface: shadow-sm, radius-lg, padding-xl
│  │  Step title + short helper text          ││
│  │  [step body: forms, hashes, actions]     ││
│  └─────────────────────────────────────────┘│
├─────────────────────────────────────────────┤
│  FOOTER / HELP                               │
│  • Disclaimer: not legal advice; informational│
│  • Micro-help: VS01 receipt ids (`rcpt_…`)   │  ← from review doc; reduces confusion
│  • Optional: link “Read about VS01 vs timeline receipts” │
└─────────────────────────────────────────────┘
```

### What should feel premium vs playful

| Region | Premium | Playful |
|--------|---------|---------|
| **Header** | Clear hierarchy, plenty of air | Accent strip or one friendly subtitle |
| **Stepper** | Numeric clarity, disabled future steps muted | Active step uses accent + short label |
| **Main card** | Shadow, border, consistent padding | Rounded corners; optional friendly step title |
| **Footer** | Sober disclaimer, small type | None (keep disclaimer serious) |

**Rule:** The **card** and **typography** feel premium; the **accent** and **one line of voice** feel playful—never the reverse.

---

## 3. Design tokens

Implement as **CSS variables** in one file (e.g. `vs01-tokens.css` or `tokens.ts` → CSS-in-JS)—**single source of truth**.

### Color roles

| Token role | Usage |
|------------|--------|
| `--color-bg-page` | Page background (warm off-white / ~neutral-50 warm) |
| `--color-bg-card` | Card surface (white or ~neutral-0 with slight warm tint) |
| `--color-border-subtle` | Card border, dividers |
| `--color-text-primary` | Headings, primary labels |
| `--color-text-secondary` | Helper text, descriptions |
| `--color-text-muted` | Placeholders, disabled step labels |
| `--color-accent` | Primary button background, active stepper, focus ring color |
| `--color-accent-hover` | Hover state for primary (slightly darker or saturated) |
| `--color-danger` | Errors, destructive secondary actions (rare) |
| `--color-success` | Success inline states (sparingly—see interactions) |

**Contrast:** Meet **WCAG AA** for text on backgrounds used in pilot (body on page/card, button label on accent).

### Typography roles

| Role | Spec |
|------|------|
| **Page title** | Sans, **600–700** weight, **~20–24px** |
| **Step title** | Sans, **600**, **~18px** |
| **Body** | Sans, **400**, **15–16px**, comfortable line-height **1.5–1.6** |
| **Helper / legal** | Sans, **400**, **12–13px**, `--color-text-muted` |
| **Hash / id / monospace** | **Monospace**, **13–14px**, letter-spacing **normal** (no fake-crypto wide tracking); wrap long hex with `overflow-wrap: anywhere` |

**Font stack:** System UI stack is fine for pilot (`ui-sans-serif, system-ui, …`); **one** webfont only if already standard—avoid loading two families.

### Spacing

- **Base unit:** `4px` or `8px` scale.
- **Card padding:** `24–32px` (token: `--space-card`).
- **Between sections inside card:** `16–24px`.
- **Page margin:** `16–24px` horizontal on mobile; cap column width on desktop.

### Border radius

- **Card:** `12–16px` (`--radius-card`).
- **Buttons / inputs:** `8–10px` (`--radius-control`).
- **Pills / chips** (if any): full pill—**use sparingly** (e.g. step badges only).

### Shadows

- **Card:** **One** level only—soft, low blur: e.g. `0 1px 2px rgba(0,0,0,.06), 0 4px 12px rgba(0,0,0,.04)`.
- **No** dramatic elevation stacks; **no** neon glow.

### Button hierarchy

| Level | Style |
|-------|--------|
| **Primary** | Filled `--color-accent`, white or near-black label (pick for contrast); **full width** on mobile optional |
| **Secondary** | Ghost or outline: border `--color-border-subtle`, text `--color-text-primary` |
| **Tertiary / link** | Text-only, underline on hover, `--color-accent` for emphasis |

**States:** `:disabled` reduces opacity **and** `pointer-events`; **no** mystery clicks.

### Mono / hash display style

- **Container:** Subtle background (`--color-bg-muted` or ~5% black on white), **1px** border, **padding** `8–12px`, **radius** `--radius-control`.
- **Content:** Full hash on desktop if space allows; **or** truncated middle with **copy** button adjacent (`aria-label="Copy receipt hash"`).
- **Never** style hashes in rainbow or gradient—**readability = trust**.

---

## 4. Interaction tone

### Loading

- **Feel:** Calm, honest—“working on it,” not theatrical.
- **Pattern:** Disable primary control + **inline** spinner on the button **or** a thin progress line under the card title—**not** full-screen overlays for pilot.
- **Copy:** Short: “Finalizing…”, “Creating session…”, “Signing…”, “Preparing download…”

### Success

- **Feel:** Quiet confirmation—**checkmark or short success line** optional; **no** confetti, no sound.
- **Step advance:** Moving to the next step **is** the success signal; Step Done may show a single line “Receipt issued.”

### Errors

- **Feel:** Neutral, fix-forward—**what happened** + **what to do** (retry, start over).
- **Pattern:** `ErrorBanner` below header / above card; **persistent** until user acts or new attempt clears it.
- **409 / double complete:** Specific copy per build plan (“Session already completed; start over.”) + **secondary** “Start over” if implemented.

### Confirmations

- **Minimal pilot:** No modal stacks—**at most** one confirm for destructive “Start over” if state is non-trivial.
- **Default:** Primary actions are **one click**; friction only where data loss is real.

### Plug-and-play for humans

- **Empty states:** Each step shows **one sentence** of intent (“Upload the final PDF you want bound to this receipt.”).
- **Next action:** Always **one obvious primary** at the bottom of the card.
- **Jargon:** Surface `field_manifest` as **“Signature box on page”** with expandable “Advanced numbers” if needed—**pilot can stay numeric** with good labels (`Page`, `X`, `Y`, `Width`, `Height`).

### Legibility for agents

- **Stable regions:** Header, stepper, error slot, card, footer—**same DOM regions** across steps so automated tests and future agents don’t hunt for moving selectors.
- **Data attributes (optional):** `data-vs01-step="finalize|sign|done"` on card root for robust targeting without class churn.

---

## 5. Component styling rules

### StepFinalize

- **Top:** Short description + file input styled as **dashed border** drop zone **or** native file input with **secondary** “Choose file” button—keep **accessible**.
- **Primary:** “Finalize document” full-width on narrow viewports.
- **After success:** Show `document_id` + `content_sha256` snippet in **hash panel** style; **secondary** “Continue” or auto-advance per product choice.

### StepSign

- **Group** fields: Signer → Intent (select) → Geometry in a **fieldset** with legend “Signature placement (minimal)”.
- **Numeric inputs:** Equal width in a **simple grid** (2 columns on wide enough screens).
- **Primary:** Single primary—“Create session & sign” **or** two buttons with clear order (session then sign) if split—**visually** stack; loading state matches `session` vs `complete` from build plan.

### StepDone

- **Hero row:** `receipt_id` + `receipt_hash_sha256` in hash panels; **copy** buttons.
- **Secondary:** “Refresh receipt” as outline button; loading shows inline on that control only.
- **Download bundle CTA:** **Primary**, prominent, icon optional (simple download glyph)—label **“Download verification bundle (.zip)”**; on success, optional one-line “Saved—verify locally with your workflow.”

### ErrorBanner / Toast

- **Banner (default):** Left border **4px** `--color-danger` or amber for non-fatal; padding **12–16px**; icon optional (alert circle)—**one line title + optional detail**.
- **Toast (if used):** Fixed bottom or top, **auto-dismiss** only for non-blocking info—**errors stay as banner** until cleared.

### Hash / id display

- Always **mono**; optional **“Copy”** adjacent; **truncate** with middle-ellipsis only if needed, full string in `title` tooltip.

### Download bundle CTA

- **Primary** button; if `loading === "bundle"`, show spinner **in** button and disable repeat click.
- **Failure:** Inline error under button + **Retry** as same primary.

---

## 6. Agent-friendly frontend rules

### Centralize styling

- **One** tokens file + **one** layout/shell component stylesheet (or module) for `Vs01Layout`, stepper, card, footer.
- **Step components** use **semantic classes** (`vs01-step`, `vs01-hash-panel`) defined in a shared partial—**avoid** inline one-off colors in step files.

### Separate API logic and presentation

- **No** fetch or URL strings in styled components—**Wizard** or `vs01Api` only, per build plan.
- **Presentation components** accept `loading`, `error`, and **callbacks** only; styling does not branch on HTTP codes—**parent** maps codes to messages.

### Low-risk future edits

- **Change tokens** → global refresh without touching step logic.
- **Change copy** → small constants file (`vs01Copy.ts` or markdown snippets) optional.
- **Add a step** → extend stepper + switch; shell unchanged.

---

## 7. Out of scope (visual & UX — first UI pass)

Do **not** add:

- **Heavy branding:** Custom illustration packs, video loops, mascot animations, sound
- **Motion:** Parallax, page transitions, Lottie, skeleton screens that duplicate layout (simple spinners OK)
- **Dashboards:** Charts, tables of receipts, multi-doc galleries
- **OCR / timeline / anchor / auth / draft / LLM** UIs or visual entry points
- **Dark mode** (unless zero-cost via tokens later—**not** required for pilot)
- **Theming marketplace** or user-selectable themes
- **Decorative NFT frames** or chain logos in the hero
- **Gamification:** streaks, points, badges
- **Full PDF viewer** chrome (canvas tools, thumbnails strip)—filename + hash only per thin plan

---

## Reference

- Flow & API: [`VS01_THIN_FRONTEND_PLAN.md`](VS01_THIN_FRONTEND_PLAN.md)
- Architecture & components: [`VS01_THIN_FRONTEND_BUILD_PLAN.md`](VS01_THIN_FRONTEND_BUILD_PLAN.md)
- Product/backend context: [`VS01_REVIEW_AND_COMPRESSION.md`](VS01_REVIEW_AND_COMPRESSION.md)
