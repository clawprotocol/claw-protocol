import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildRecipientSigningDocumentFields,
  buildVs01PrepareSigningRoles,
  recipientCounterpartyIdForPrepareRole,
  recipientFieldBelongsToLockedSigner,
  type Vs01PrepareSigningRole,
} from "../src/vs01/vs01SignerFieldAssignment";
import type { Vs01RecipientPlacedField } from "../src/vs01/types";
import {
  buildVs01SigningPacketModel,
  canonicalFlowStackBottomNorm,
  type Vs01SigningPacketPage,
  VS01_PACKET_PAGE_HEIGHT_PT,
  VS01_PACKET_PAGE_WIDTH_PT,
} from "../src/vs01/buildVs01SigningPacketModel";
import type { PlacedSigningField } from "../src/vs01/signingFields";
import { normalizedPdfRectToCssPercent } from "../src/vs01/vs01FieldCssGeometry";
import { canonicalPageTypographyPx } from "../src/vs01/vs01CanonicalPageRender";
import { buildFlowLineDescriptors, flowLinesForPage } from "../src/vs01/vs01CanonicalTextLayout";
import { repairFinalGradeGuidedCorpus } from "../src/components/agreements/guidedDealCompletion/guidedFinalGradeCorpus";
import { TEST74_BAD_GUIDED_CORPUS } from "../src/components/agreements/guidedDealCompletion/guidedFinalGradeCorpus.fixtures";
import {
  buildVs01CanonicalPacketPortable,
  buildVs01CanonicalPacketSeed,
  computeVs01PacketRevision,
  encodeVs01CanonicalPacketPortable,
  VS01_CANONICAL_PACKET_QUERY,
  VS01_PACKET_REVISION_QUERY,
} from "../src/vs01/vs01CanonicalPacketSeed";
import { buildFullPacketManifestFromCanonicalModel } from "../src/vs01/vs01SigningPacketManifest";
import { VS01_RECIPIENT_SIGN_QUERY } from "../src/vs01/StepReceipt";
import { signatureFieldRectFromMeasuredUnderline } from "../src/vs01/vs01SignatureDomPlacement";
import {
  VS01_EXECUTION_LABEL_LINE_HEIGHT_FRAC,
  VS01_EXECUTION_LABEL_MARGIN_TOP_EM,
  VS01_EXECUTION_LABEL_ROW_MARGIN_TOP_EM,
  VS01_EXECUTION_NAME_ROW_MARGIN_TOP_EM,
  VS01_EXECUTION_MAX_LABEL_GAP_PX,
  VS01_EXECUTION_SIGNATURE_MARGIN_BOTTOM_EM,
  VS01_EXECUTION_SPACER_FRAC,
  VS01_SIGNATURE_OPTICAL_OFFSET_NORM,
  VS01_SIGNATURE_INK_BASELINE_BIAS_PX,
  VS01_SIGNATURE_NAME_ROW_MIN_GAP_PX,
  VS01_SIGNATURE_FIELD_WIDTH_MIN_FRAC,
  VS01_SIGNATURE_FIELD_WIDTH_MAX_FRAC,
  VS01_SIGNATURE_OPTICAL_OFFSET_PX,
  VS01_SIGNATURE_OVERLAY_HEIGHT_NORM,
  VS01_SIGNATURE_SHELL_MAX_HEIGHT_PX,
  VS01_SIGNATURE_SHELL_MIN_HEIGHT_PX,
  VS01_SIGNATURE_SIGNED_INK_BIAS_PX,
  VS01_SIGNATURE_SIGNED_INK_FONT_PX,
  VS01_SIGNATURE_SIGNED_INK_FONT_WEIGHT,
  VS01_SIGNATURE_ACTIVE_SHELL_MAX_CLEARANCE_ABOVE_PX,
  VS01_SIGNATURE_SIGNED_INK_MAX_CLEARANCE_ABOVE_PX,
  VS01_SIGNATURE_SIGNED_INK_MAX_OVERLAP_BELOW_PX,
  VS01_VISUAL_PAGE_HEIGHT_PT,
  VS01_VISUAL_PAGE_WIDTH_PT,
} from "../src/vs01/vs01VisualConstants";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARTIFACT_DIR = join(__dirname, "artifacts", "vs01-canonical-visual");
const STARTER_749 = `${"Starter free preview clause. ".repeat(40)}`.slice(0, 749);

function roles() {
  return buildVs01PrepareSigningRoles({
    agreementId: "ag_visual_qa",
    creatorName: "Acme LLC",
    creatorEmail: "anthem@example.test",
    ownerSignerName: "Anthem H Blanchard",
    ownerSignerTitle: "Manager",
    counterparties: [{ id: "cp1", name: "Joe Smith", email: "joe@example.test", signerName: "Joe Smith" }],
  });
}

/** Final-grade repaired corpus uses Joe Brown (test77 / QA parity). */
function test77Roles() {
  return buildVs01PrepareSigningRoles({
    agreementId: "ag_visual_qa",
    creatorName: "Acme LLC",
    creatorEmail: "anthemhayek@gmail.com",
    ownerSignerName: "Anthem H Blanchard",
    ownerSignerTitle: "Manager",
    counterparties: [
      { id: "cp_joe", name: "Joe Brown", email: "jb34@me.com", signerName: "Joe Brown" },
    ],
  });
}

function premiumCorpus(_repeat = 90): string {
  const clauses = [
    [
      "1. Engagement and Scope",
      "Client engages Service Provider to provide workflow automation, document preparation, integration support, and related advisory services described in the applicable statement of work. Service Provider will perform the services in a professional manner using personnel with appropriate skill and experience.",
      "The parties may adjust priorities, deliverables, and timing by written approval, including by email, provided that any material change in fees or scope must be confirmed before the additional work begins.",
    ],
    [
      "2. Project Management",
      "Service Provider will maintain reasonable project records, participate in scheduled check-ins, and promptly notify Client of dependencies or blockers that may affect delivery. Client will provide timely access to systems, subject matter experts, and business approvals reasonably required for performance.",
    ],
    [
      "3. Fees and Payment",
      "Client will pay the fees stated in the applicable order form or statement of work. Unless otherwise stated, invoices are due thirty days after receipt. Undisputed late amounts may accrue interest at the lesser of one percent per month or the maximum rate permitted by law.",
    ],
    [
      "4. Confidential Information",
      "Each party may receive non-public business, technical, financial, customer, or product information from the other party. The receiving party will use confidential information only to perform or receive services under this Agreement and will protect it using at least reasonable care.",
      "Confidential information does not include information that is independently developed without use of the disclosing party's confidential information, becomes public through no fault of the receiving party, or is lawfully received from a third party without a duty of confidentiality.",
    ],
    [
      "5. Data Security",
      "Service Provider will use commercially reasonable administrative, technical, and organizational safeguards designed to protect Client data against unauthorized access, loss, or misuse. Service Provider will promptly notify Client of any confirmed security incident involving Client data.",
    ],
    [
      "6. Intellectual Property",
      "Client retains ownership of materials, data, trademarks, and content provided by Client. Subject to full payment, Client will own final deliverables specifically prepared for Client, excluding Service Provider's pre-existing materials, reusable tools, templates, know-how, and general skills.",
      "Service Provider grants Client a non-exclusive, perpetual license to use any embedded pre-existing materials solely as part of the deliverables for Client's internal business purposes.",
    ],
    [
      "7. Warranties and Disclaimers",
      "Each party represents that it has authority to enter into this Agreement. Service Provider warrants that services will be performed in a professional and workmanlike manner. Except as expressly stated, neither party makes any other warranty, whether express, implied, statutory, or otherwise.",
    ],
    [
      "8. Limitation of Liability",
      "Neither party will be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits or revenue, even if advised of the possibility of such damages. Each party's aggregate liability is limited to amounts paid or payable under this Agreement in the twelve months before the claim.",
    ],
    [
      "9. Term and Termination",
      "This Agreement begins on the effective date and continues until terminated. Either party may terminate for material breach if the breach is not cured within thirty days after written notice. Upon termination, Client will pay for services performed and approved expenses incurred before the effective termination date.",
    ],
    [
      "10. General Terms",
      "The parties are independent contractors. Neither party may assign this Agreement without the other party's consent, except to an affiliate or successor in connection with a merger, reorganization, or sale of substantially all assets. This Agreement is governed by the laws stated in the order form, without regard to conflicts principles.",
      "This Agreement, together with any applicable statement of work, is the entire agreement between the parties regarding its subject matter and supersedes all prior or contemporaneous understandings. Any amendment must be in writing and signed or otherwise accepted by both parties.",
    ],
  ];

  return `${clauses.map((section) => section.join("\n")).join("\n\n")}

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
Acme LLC
By: ______________________
Name: Anthem H Blanchard
Title: Manager
Date: ____________________

SERVICE PROVIDER:
Joe Smith
By: ______________________
Name: Joe Smith
Date: ____________________`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pct(n: number): string {
  return `${n * 100}%`;
}

async function screenshotCanonicalSurface(page: Page, surface: Locator, path: string): Promise<void> {
  const viewport = page.viewportSize();
  const minViewportWidth = VS01_PACKET_PAGE_WIDTH_PT + 88;
  const minViewportHeight = VS01_PACKET_PAGE_HEIGHT_PT + 88;
  if (!viewport || viewport.width < minViewportWidth || viewport.height < minViewportHeight) {
    await page.setViewportSize({
      width: Math.max(viewport?.width ?? 0, minViewportWidth),
      height: Math.max(viewport?.height ?? 0, minViewportHeight),
    });
  }
  await page.addStyleTag({
    content: `
      .vs01-sign-workspace--prepare .vs01-sign-scroll,
      .vs01-sign-workspace--prepare .vs01-sign-doc-surface,
      .vs01-sign-workspace--prepare .vs01-sign-doc-pages-wrap {
        max-height: none !important;
        overflow: visible !important;
      }
    `,
  });
  const box = await surface.boundingBox();
  if (!box) {
    throw new Error("Canonical VS01 surface was not available for screenshot capture.");
  }
  await page.screenshot({
    path,
    clip: {
      x: Math.floor(box.x),
      y: Math.floor(box.y),
      width: Math.ceil(box.width),
      height: Math.ceil(box.height),
    },
    timeout: 15_000,
  });
}

async function screenshotAppViewport(page: Page, root: Locator, path: string): Promise<void> {
  await expect(root).toBeVisible();
  await expect(root.locator(".vs01-sign-doc-surface--bridge")).toBeVisible();
  await expect(root.locator(".vs01-sign-rail")).toBeVisible();
  await expect(root.locator(".vs01-sign-page-surface--canonical")).toBeVisible();
  await page.screenshot({ path, fullPage: false, timeout: 15_000 });
}

const TEST78_PAGE_CAPTURE_PAD_PX = 24;

/** Recipient review scroll uses max-height:70vh; test78 must show full 612×792 page for QA PNGs. */
async function ensureTest78CaptureOverflowVisible(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      .vs01-test78-fixture .vs01-sign-scroll,
      .vs01-test78-fixture .vs01-recipient-signing-scroll,
      .vs01-test78-fixture .vs01-sign-doc-pages-wrap,
      .vs01-test78-fixture .vs01-sign-doc-surface--bridge,
      .vs01-test78-fixture .vs01-sign-pages-inner {
        max-height: none !important;
        overflow: visible !important;
      }
      .vs01-test78-fixture .vs01-recipient-signing-header {
        margin-bottom: 0.35rem;
      }
      .vs01-test78-fixture .vs01-recipient-signing-header .vs01-card-title {
        margin: 0 0 0.2rem;
        font-size: 1.05rem;
      }
      .vs01-test78-fixture .vs01-recipient-signing-subtitle,
      .vs01-test78-fixture .vs01-recipient-signing-signer {
        margin: 0 0 0.15rem;
        font-size: 0.78rem;
        line-height: 1.25;
      }
    `,
  });
}

async function assertCanonicalPageFullyVisible(
  page: Page,
  surface: Locator,
  captureRoot: Locator,
  opts: { witness: boolean; initialsEnabled: boolean },
): Promise<void> {
  await expect(surface).toHaveCSS("width", `${VS01_PACKET_PAGE_WIDTH_PT}px`);
  await expect(surface).toHaveCSS("height", `${VS01_PACKET_PAGE_HEIGHT_PT}px`);

  const metrics = await surface.evaluate((pageEl) => {
    const pageNode = pageEl as HTMLElement;
    const pageRect = pageNode.getBoundingClientRect();
    const band = pageNode.querySelector(".vs01-canonical-initials-band") as HTMLElement | null;
    const bandRect = band?.getBoundingClientRect() ?? null;
    const scroll = pageNode.closest(".vs01-sign-scroll") as HTMLElement | null;
    const scrollRect = scroll?.getBoundingClientRect() ?? null;
    const captureRootEl = pageNode.closest("[data-vs01-test78-capture-root]") as HTMLElement | null;
    const captureRect = captureRootEl?.getBoundingClientRect() ?? null;
    return {
      pageTop: pageRect.top,
      pageBottom: pageRect.bottom,
      pageLeft: pageRect.left,
      pageRight: pageRect.right,
      pageHeight: pageRect.height,
      pageWidth: pageRect.width,
      bandVisible: Boolean(bandRect && bandRect.height > 2 && bandRect.width > 2),
      bandTop: bandRect?.top ?? null,
      bandBottom: bandRect?.bottom ?? null,
      scrollClipsPage: scrollRect ? pageRect.bottom > scrollRect.bottom + 1.5 : false,
      scrollTop: scrollRect?.top ?? null,
      scrollBottom: scrollRect?.bottom ?? null,
      captureTop: captureRect?.top ?? null,
      captureBottom: captureRect?.bottom ?? null,
      pageInsideCapture:
        captureRect != null
          ? pageRect.top >= captureRect.top - 1 &&
            pageRect.bottom <= captureRect.bottom + 1.5 &&
            pageRect.left >= captureRect.left - 1 &&
            pageRect.right <= captureRect.right + 1.5
          : false,
    };
  });

  expect(metrics.pageHeight).toBeGreaterThanOrEqual(VS01_PACKET_PAGE_HEIGHT_PT - 2);
  expect(metrics.pageHeight).toBeLessThanOrEqual(VS01_PACKET_PAGE_HEIGHT_PT + 2);
  expect(metrics.pageWidth).toBeGreaterThanOrEqual(VS01_PACKET_PAGE_WIDTH_PT - 2);
  expect(metrics.pageWidth).toBeLessThanOrEqual(VS01_PACKET_PAGE_WIDTH_PT + 2);
  expect(metrics.scrollClipsPage).toBe(false);
  expect(metrics.pageInsideCapture).toBe(true);

  const vp = page.viewportSize();
  expect(vp).not.toBeNull();
  expect(metrics.pageBottom).toBeLessThanOrEqual((vp?.height ?? 0) + 2);
  expect(metrics.pageTop).toBeGreaterThanOrEqual(0);

  const captureBox = await captureRoot.boundingBox();
  expect(captureBox).not.toBeNull();
  expect(metrics.pageBottom).toBeLessThanOrEqual((captureBox?.y ?? 0) + (captureBox?.height ?? 0) + 2);

  if (!opts.witness && opts.initialsEnabled) {
    expect(metrics.bandVisible).toBe(true);
    expect(metrics.bandBottom).not.toBeNull();
    expect(metrics.bandBottom!).toBeLessThanOrEqual(metrics.pageBottom + 1.5);
    expect(metrics.bandBottom!).toBeGreaterThan(metrics.pageTop);
    await expect(surface.locator(".vs01-canonical-initials-band")).toBeVisible();
    const initialsCount = await surface.locator("[data-vs01-visual-field-type='initials']").count();
    expect(initialsCount).toBeGreaterThan(0);
  }

  if (!opts.witness && !opts.initialsEnabled) {
    await expect(surface.locator("[data-vs01-visual-field-type='initials']")).toHaveCount(0);
    expect(metrics.pageBottom).toBeGreaterThan(metrics.pageTop + VS01_PACKET_PAGE_HEIGHT_PT - 4);
  }

  if (opts.witness) {
    await expect(surface.locator("[data-vs01-visual-field-type='initials']")).toHaveCount(0);
    expect(metrics.pageBottom).toBeGreaterThan(metrics.pageTop + VS01_PACKET_PAGE_HEIGHT_PT - 4);
  }
}

async function screenshotTest78RecipientArtifact(
  page: Page,
  captureRoot: Locator,
  surface: Locator,
  path: string,
): Promise<void> {
  await expect(captureRoot).toBeVisible();
  await expect(surface).toBeVisible();
  const box = await captureRoot.boundingBox();
  if (!box) {
    throw new Error("test78 capture root was not available for screenshot");
  }
  const vp = page.viewportSize();
  const neededHeight = Math.ceil(box.height) + TEST78_PAGE_CAPTURE_PAD_PX;
  const neededWidth = Math.ceil(box.width) + TEST78_PAGE_CAPTURE_PAD_PX;
  if (
    !vp ||
    vp.height < neededHeight ||
    vp.width < neededWidth
  ) {
    await page.setViewportSize({
      width: Math.max(vp?.width ?? 0, neededWidth, VS01_PACKET_PAGE_WIDTH_PT + 120),
      height: Math.max(vp?.height ?? 0, neededHeight, VS01_PACKET_PAGE_HEIGHT_PT + 200),
    });
  }
  await captureRoot.screenshot({ path, timeout: 15_000 });
}

function renderSignatureLineHtml(line: string): string {
  const m = line.match(/^((?:By|Signature)\s*:\s*)(_+)?(.*)$/i);
  if (!m) return escapeHtml(line);
  const prefix = m[1]!.replace(/^Signature/i, "By");
  const underscores = m[2] ?? "______________________";
  return `<span>${escapeHtml(prefix)}</span><span class="vs01-canonical-signature-underline">${escapeHtml(underscores)}</span>`;
}

function completedSignatureText(field: PlacedSigningField): string {
  if (field.type !== "signature") return "";
  return field.assignedPartyIndex === 1 ? "Joe Smith" : "Anthem H Blanchard";
}

function completedInitialsText(field: PlacedSigningField): string {
  if (field.type !== "initials") return "";
  return field.assignedPartyIndex === 1 ? "JS" : "AHB";
}

function renderPreparePlacementFieldHtml(
  field: PlacedSigningField,
  opts: { highlightPartyIndex?: number | null } = {},
): string {
  const css = normalizedPdfRectToCssPercent(field);
  const autoClass = field.autoInitials ? " vs01-sign-placement-box--auto-initials" : "";
  const partyIdx = field.assignedPartyIndex ?? 0;
  const highlight = opts.highlightPartyIndex;
  const otherRole =
    highlight != null && highlight !== partyIdx ? " vs01-sign-placement-box--other-role" : "";
  const cornerLabel =
    field.type === "initials"
      ? "Initials"
      : field.type === "signature"
        ? "Signature"
        : field.type;
  const body =
    field.type === "initials"
      ? `<span class="vs01-sign-placement-initials">${escapeHtml(field.value?.trim() || completedInitialsText(field) || "Initials")}</span>`
      : field.type === "signature"
        ? ""
        : "";
  return `<div class="vs01-sign-placement-box vs01-sign-placement-box--${field.type}${autoClass}${otherRole}" data-vs01-visual-field-type="${field.type}" data-vs01-visual-party-index="${partyIdx}" style="position:absolute;left:${css.left};top:${css.top};width:${css.width};height:${css.height};z-index:3;"><span class="vs01-sign-placement-label">${escapeHtml(cornerLabel)}</span>${body}</div>`;
}

function renderCanonicalPageHtml(
  page: Vs01SigningPacketPage,
  fields: readonly PlacedSigningField[],
  opts: {
    signed?: boolean;
    showInitials?: boolean;
    renderFields?: boolean;
    /** Prepare/recipient overlay chrome (visible field boxes), not tiny completed-text chips. */
    preparePlacementChrome?: boolean;
    highlightPartyIndex?: number | null;
  } = {},
): string {
  const { contentRect, initialsBandRect } = page;
  const { lineHeightPx, fontSizePx } = canonicalPageTypographyPx(VS01_PACKET_PAGE_WIDTH_PT);
  const flowLines = flowLinesForPage(page);
  const lineDescriptors = buildFlowLineDescriptors(flowLines);

  const flowLinesHtml = lineDescriptors
    .map((line, i) => {
      if (!line.trimmed) {
        return `<div class="vs01-canonical-flow-spacer" aria-hidden="true"></div>`;
      }
      if (line.isSignatureExecutionLine) {
        return `<div data-vs01-canonical-text data-vs01-signature-execution-line data-vs01-signature-party="${line.partyIndex ?? 0}" class="vs01-canonical-flow-line vs01-canonical-flow-line--signature">${renderSignatureLineHtml(line.trimmed)}</div>`;
      }
      return `<div data-vs01-canonical-text class="vs01-canonical-flow-line vs01-canonical-flow-line--${line.kind}">${escapeHtml(line.text)}</div>`;
    })
    .join("");

  const pageFields = fields.filter((f) => {
    if (f.page !== page.pageIndex) return false;
    if (opts.showInitials === false && f.type === "initials") return false;
    return true;
  });

  const fieldBoxesHtml = (opts.renderFields === false ? [] : pageFields).map((field) => {
      if (opts.preparePlacementChrome) {
        return renderPreparePlacementFieldHtml(field, {
          highlightPartyIndex: opts.highlightPartyIndex,
        });
      }
      const css = normalizedPdfRectToCssPercent(field);
      const autoClass = field.autoInitials ? " vs01-sign-placement-box--auto-initials" : "";
      const signedValue = opts.signed ? completedSignatureText(field) : "";
      const initialsValue = completedInitialsText(field);
      const signedClass =
        field.type === "signature" && signedValue ? " vs01-sign-placement-box--signed" : "";
      const initialsStyle =
        field.type === "initials" && initialsValue
          ? "display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:11px;line-height:1;color:#0f172a;font-weight:700;letter-spacing:0.05em;white-space:nowrap;overflow:hidden;text-overflow:clip;"
          : "";
      const signedMarkup = signedValue
        ? `<span class="vs01-visual-completed-signature" data-vs01-visual-completed-signature="${field.assignedPartyIndex ?? ""}">${escapeHtml(signedValue)}</span>`
        : "";
      const initialsMarkup = initialsValue
        ? `<span class="vs01-visual-completed-initials" data-vs01-visual-completed-initials="${field.assignedPartyIndex ?? ""}">${escapeHtml(initialsValue)}</span>`
        : "";
      const boxFlexStyle =
        field.type === "signature" && signedValue
          ? "display:flex;flex-direction:column;justify-content:flex-start;align-items:flex-start;"
          : `${initialsStyle}display:flex;flex-direction:column;justify-content:flex-end;`;
      return `<div class="vs01-sign-placement-box vs01-sign-placement-box--${field.type}${autoClass}${signedClass}" data-vs01-visual-field-type="${field.type}" data-vs01-visual-party-index="${field.assignedPartyIndex ?? ""}" style="position:absolute;left:${css.left};top:${css.top};width:${css.width};height:${css.height};${boxFlexStyle}">${signedMarkup}${initialsMarkup}</div>`;
    })
    .join("");

  return `<div class="vs01-sign-page-surface vs01-sign-page-surface--footer-safe vs01-sign-page-surface--canonical" style="width:${VS01_PACKET_PAGE_WIDTH_PT}px;height:${VS01_PACKET_PAGE_HEIGHT_PT}px;position:relative;">
  <div class="vs01-canonical-page-content" data-vs01-canonical-layout-mode="flow" aria-label="Canonical signing page ${page.pageIndex + 1}">
    <div class="vs01-canonical-flow-body" style="left:${pct(contentRect.x)};top:${pct(contentRect.y)};width:${pct(contentRect.width)};height:${pct(contentRect.height)};font-size:${fontSizePx}px;line-height:${lineHeightPx}px;--vs01-canonical-line-height:${lineHeightPx}px;--vs01-execution-label-line-height-frac:${VS01_EXECUTION_LABEL_LINE_HEIGHT_FRAC};--vs01-execution-label-margin-top-em:${VS01_EXECUTION_LABEL_MARGIN_TOP_EM};--vs01-execution-label-row-margin-top-em:${VS01_EXECUTION_LABEL_ROW_MARGIN_TOP_EM};--vs01-execution-name-row-margin-top-em:${VS01_EXECUTION_NAME_ROW_MARGIN_TOP_EM};--vs01-execution-signature-margin-bottom-em:${VS01_EXECUTION_SIGNATURE_MARGIN_BOTTOM_EM};--vs01-execution-spacer-frac:${VS01_EXECUTION_SPACER_FRAC};--vs01-signature-ink-bias:${VS01_SIGNATURE_INK_BASELINE_BIAS_PX}px;--vs01-signature-signed-ink-bias:${VS01_SIGNATURE_SIGNED_INK_BIAS_PX}px;--vs01-signature-signed-ink-font:${VS01_SIGNATURE_SIGNED_INK_FONT_PX}px;--vs01-signature-signed-ink-weight:${VS01_SIGNATURE_SIGNED_INK_FONT_WEIGHT};">
      ${flowLinesHtml}
    </div>
    <div class="vs01-canonical-initials-band" aria-hidden="true" style="left:${pct(initialsBandRect.x)};top:${pct(initialsBandRect.y)};width:${pct(initialsBandRect.width)};height:${pct(initialsBandRect.height)};"></div>
  </div>
  <div class="vs01-sign-page-placement-host">
    <div class="vs01-sign-overlay vs01-sign-overlay--placed" role="presentation">${fieldBoxesHtml}</div>
  </div>
</div>`;
}

function rectsIntersect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function rectContains(
  outer: { x: number; y: number; width: number; height: number },
  inner: { x: number; y: number; width: number; height: number },
): boolean {
  const eps = 0.0001;
  return (
    inner.x >= outer.x - eps &&
    inner.y >= outer.y - eps &&
    inner.x + inner.width <= outer.x + outer.width + eps &&
    inner.y + inner.height <= outer.y + outer.height + eps
  );
}

function buildVisualModel() {
  const model = buildVs01SigningPacketModel({
    mode: "guided_pro",
    authoritativeCorpusPlain: premiumCorpus(120),
    roles: roles(),
    corpusGateArgs: { freeBaselinePlain: STARTER_749 },
  });
  if (!model.allowed) {
    throw new Error(`Signing packet model not allowed: ${model.diagnostics.validationErrors.join(", ")}`);
  }
  return model;
}

function buildTest74VisualModel() {
  const repaired = repairFinalGradeGuidedCorpus(TEST74_BAD_GUIDED_CORPUS, {
    authoritativePartyNames: ["Acme LLC", "Joe Smith"],
  }).text;
  const model = buildVs01SigningPacketModel({
    mode: "guided_pro",
    authoritativeCorpusPlain: repaired,
    roles: roles(),
    corpusGateArgs: { freeBaselinePlain: STARTER_749 },
  });
  if (!model.allowed) {
    throw new Error(`Test74 signing packet model not allowed: ${model.diagnostics.validationErrors.join(", ")}`);
  }
  return model;
}

function witnessPageIndex(model: ReturnType<typeof buildVisualModel>): number {
  return model.pages.findIndex((p) => p.flowLines.some((line) => /\bIN WITNESS WHEREOF\b/i.test(line)));
}

function assertNoSkippedTopLevelNumbering(corpus: string): void {
  const sectionNumbers = [...corpus.matchAll(/^\s*(\d+)\.\s+[A-Z]/gm)].map((match) => Number(match[1]));
  expect(sectionNumbers.length).toBeGreaterThanOrEqual(8);
  expect(sectionNumbers).toEqual(sectionNumbers.map((_, index) => index + 1));
}

function assertInitialsModelGeometry(model: ReturnType<typeof buildVisualModel>): void {
  const roleCount = roles().length;
  const witnessIdx = witnessPageIndex(model);
  assertNoSkippedTopLevelNumbering(model.corpus);
  expect(model.pages.length).toBeGreaterThanOrEqual(3);
  expect(witnessIdx).toBe(model.pages.length - 1);

  for (const page of model.pages) {
    expect(page.contentRect.width * VS01_PACKET_PAGE_WIDTH_PT).toBeGreaterThanOrEqual(490);
    expect(page.contentRect.width * VS01_PACKET_PAGE_WIDTH_PT).toBeLessThanOrEqual(520);
    expect(page.contentRect.height * VS01_PACKET_PAGE_HEIGHT_PT).toBeGreaterThanOrEqual(640);
    expect(page.initialsBandRect.height * VS01_PACKET_PAGE_HEIGHT_PT).toBeGreaterThanOrEqual(56);
    expect(page.initialsBandRect.height * VS01_PACKET_PAGE_HEIGHT_PT).toBeLessThanOrEqual(72);
    const initials = model.fields.filter((f) => f.type === "initials" && f.page === page.pageIndex);
    const signatures = model.fields.filter((f) => f.type === "signature" && f.page === page.pageIndex);
    if (page.pageIndex === witnessIdx) {
      expect(initials).toHaveLength(0);
    } else {
      expect(initials).toHaveLength(roleCount);
      expect(new Set(initials.map((f) => f.assignedPartyIndex)).size).toBe(roleCount);
    }

    const lastLineBottom = Math.max(0, ...page.textBlocks.map((text) => text.y + text.height));
    expect(lastLineBottom).toBeLessThan(page.initialsBandRect.y);

    for (const text of page.textBlocks) {
      expect(text.x * VS01_PACKET_PAGE_WIDTH_PT).toBeGreaterThanOrEqual(48);
      expect((text.x + text.width) * VS01_PACKET_PAGE_WIDTH_PT).toBeLessThanOrEqual(564);
      expect(text.x).toBeGreaterThanOrEqual(page.contentRect.x - 0.0001);
      expect(text.x + text.width).toBeLessThanOrEqual(page.contentRect.x + page.contentRect.width + 0.0001);
      expect(text.y).toBeGreaterThanOrEqual(page.contentRect.y - 0.0001);
      expect(text.y + text.height).toBeLessThan(page.initialsBandRect.y);
    }

    for (const field of initials) {
      expect(rectContains(page.initialsBandRect, field)).toBe(true);
      expect(page.textBlocks.some((text) => rectsIntersect(field, text))).toBe(false);
      expect(signatures.some((signature) => rectsIntersect(field, signature))).toBe(false);
    }
  }
}

function pageIndexForInitialsScreenshot(model: ReturnType<typeof buildVisualModel>, pageKind: InitialsPageKind): number {
  const witnessIdx = witnessPageIndex(model);
  if (pageKind === "page1") return 0;
  if (pageKind === "witness") return witnessIdx;
  return Math.floor((witnessIdx > 0 ? witnessIdx : model.pages.length - 1) / 2);
}

type InitialsPageKind = "page1" | "page-middle" | "witness";

type BrowserPageLayoutMetrics = {
  viewportLabel: string;
  viewportWidth: number;
  pageScale: number;
  pageWidth: number;
  pageHeight: number;
  contentLeft: number;
  contentRight: number;
  contentTop: number;
  contentBottom: number;
  footerRuleY: number;
  footerReserve: number;
  initialsChipX: number | null;
  initialsChipY: number | null;
  signatureFieldX: number | null;
  signatureFieldY: number | null;
  lastTextBottom: number;
  pageContentOverflows: boolean;
  surfaceOverflows: boolean;
  whitespaceRatio: number;
};

function expectClosePx(actual: number | null, expected: number | null, tolerance: number): void {
  expect(actual).not.toBeNull();
  expect(expected).not.toBeNull();
  expect(Math.abs((actual ?? 0) - (expected ?? 0))).toBeLessThanOrEqual(tolerance);
}

function expectBrowserMetricsMatchCanonical(
  metrics: BrowserPageLayoutMetrics,
  canonical: BrowserPageLayoutMetrics,
): void {
  expectClosePx(metrics.contentLeft, canonical.contentLeft, 2);
  expectClosePx(metrics.contentRight, canonical.contentRight, 2);
  expectClosePx(metrics.contentTop, canonical.contentTop, 2);
  expectClosePx(metrics.contentBottom, canonical.contentBottom, 2);
  expectClosePx(metrics.footerRuleY, canonical.footerRuleY, 3);
  expectClosePx(metrics.footerReserve, canonical.footerReserve, 3);
  if (canonical.initialsChipX != null) {
    expectClosePx(metrics.initialsChipX, canonical.initialsChipX, 3);
    expectClosePx(metrics.initialsChipY, canonical.initialsChipY, 3);
  }
  if (canonical.signatureFieldX != null) {
    expectClosePx(metrics.signatureFieldX, canonical.signatureFieldX, 3);
    expectClosePx(metrics.signatureFieldY, canonical.signatureFieldY, 3);
  }
}

function canonicalBrowserMetricsForPage(
  viewportLabel: string,
  viewportWidth: number,
  pageKind: InitialsPageKind | "signed-witness",
  includeFields = true,
): BrowserPageLayoutMetrics {
  const model = buildVisualModel();
  const pageIndex =
    pageKind === "signed-witness" ? witnessPageIndex(model) : pageIndexForInitialsScreenshot(model, pageKind);
  const page = model.pages[pageIndex]!;
  const initials = model.fields.find((field) => field.type === "initials" && field.page === page.pageIndex);
  const signature = model.fields.find((field) => field.type === "signature" && field.page === page.pageIndex);
  const lastLineBottom = Math.max(0, ...page.textBlocks.map((text) => text.y + text.height));
  const printableHeight = page.initialsBandRect.y - page.contentRect.y;
  const contentHeight = Math.max(0, lastLineBottom - page.contentRect.y);

  return {
    viewportLabel,
    viewportWidth,
    pageScale: 1,
    pageWidth: VS01_PACKET_PAGE_WIDTH_PT,
    pageHeight: VS01_PACKET_PAGE_HEIGHT_PT,
    contentLeft: Number((page.contentRect.x * VS01_PACKET_PAGE_WIDTH_PT).toFixed(2)),
    contentRight: Number(((page.contentRect.x + page.contentRect.width) * VS01_PACKET_PAGE_WIDTH_PT).toFixed(2)),
    contentTop: Number((page.contentRect.y * VS01_PACKET_PAGE_HEIGHT_PT).toFixed(2)),
    contentBottom: Number(((page.contentRect.y + page.contentRect.height) * VS01_PACKET_PAGE_HEIGHT_PT).toFixed(2)),
    footerRuleY: Number((page.initialsBandRect.y * VS01_PACKET_PAGE_HEIGHT_PT).toFixed(2)),
    footerReserve: Number((page.initialsBandRect.height * VS01_PACKET_PAGE_HEIGHT_PT).toFixed(2)),
    initialsChipX: includeFields && initials ? Number((initials.x * VS01_PACKET_PAGE_WIDTH_PT).toFixed(2)) : null,
    initialsChipY: includeFields && initials ? Number((initials.y * VS01_PACKET_PAGE_HEIGHT_PT).toFixed(2)) : null,
    signatureFieldX: includeFields && signature ? Number((signature.x * VS01_PACKET_PAGE_WIDTH_PT).toFixed(2)) : null,
    signatureFieldY: includeFields && signature ? Number((signature.y * VS01_PACKET_PAGE_HEIGHT_PT).toFixed(2)) : null,
    lastTextBottom: Number((canonicalFlowStackBottomNorm(page) * VS01_PACKET_PAGE_HEIGHT_PT).toFixed(2)),
    pageContentOverflows: false,
    surfaceOverflows: false,
    whitespaceRatio: printableHeight > 0 ? Number(((printableHeight - contentHeight) / printableHeight).toFixed(4)) : 0,
  };
}

async function collectBrowserPageLayoutMetrics(
  surface: Locator,
  viewportLabel: string,
  viewportWidth: number,
): Promise<BrowserPageLayoutMetrics> {
  return surface.evaluate(
    (el, args) => {
      const page = el as HTMLElement;
      const pageRect = page.getBoundingClientRect();
      const scale = pageRect.width / 612;
      const docX = (rect: DOMRect) => (rect.left - pageRect.left) / scale;
      const docY = (rect: DOMRect) => (rect.top - pageRect.top) / scale;
      const docRight = (rect: DOMRect) => (rect.right - pageRect.left) / scale;
      const docBottom = (rect: DOMRect) => (rect.bottom - pageRect.top) / scale;
      const flowBody = page.querySelector(".vs01-canonical-flow-body") as HTMLElement | null;
      const pageContent = page.querySelector(".vs01-canonical-page-content") as HTMLElement | null;
      const footerBand = page.querySelector(".vs01-canonical-initials-band") as HTMLElement | null;
      const initials = page.querySelector("[data-vs01-visual-field-type='initials']") as HTMLElement | null;
      const signature = page.querySelector("[data-vs01-visual-field-type='signature']") as HTMLElement | null;
      const textNodes = [...page.querySelectorAll("[data-vs01-canonical-text]")] as HTMLElement[];
      const flowRect = flowBody?.getBoundingClientRect();
      const footerRect = footerBand?.getBoundingClientRect();
      const initialsRect = initials?.getBoundingClientRect();
      const signatureRect = signature?.getBoundingClientRect();
      const lastTextBottom = Math.max(0, ...textNodes.map((node) => docBottom(node.getBoundingClientRect())));
      const printableHeight = footerRect && flowRect ? docY(footerRect) - docY(flowRect) : 0;
      const contentHeight = flowRect ? Math.max(0, lastTextBottom - docY(flowRect)) : 0;

      return {
        viewportLabel: args.viewportLabel,
        viewportWidth: args.viewportWidth,
        pageScale: Number(scale.toFixed(4)),
        pageWidth: Math.round(pageRect.width / scale),
        pageHeight: Math.round(pageRect.height / scale),
        contentLeft: flowRect ? Number(docX(flowRect).toFixed(2)) : 0,
        contentRight: flowRect ? Number(docRight(flowRect).toFixed(2)) : 0,
        contentTop: flowRect ? Number(docY(flowRect).toFixed(2)) : 0,
        contentBottom: flowRect ? Number(docBottom(flowRect).toFixed(2)) : 0,
        footerRuleY: footerRect ? Number(docY(footerRect).toFixed(2)) : 0,
        footerReserve: footerRect ? Number((footerRect.height / scale).toFixed(2)) : 0,
        initialsChipX: initialsRect ? Number(docX(initialsRect).toFixed(2)) : null,
        initialsChipY: initialsRect ? Number(docY(initialsRect).toFixed(2)) : null,
        signatureFieldX: signatureRect ? Number(docX(signatureRect).toFixed(2)) : null,
        signatureFieldY: signatureRect ? Number(docY(signatureRect).toFixed(2)) : null,
        lastTextBottom: Number(lastTextBottom.toFixed(2)),
        pageContentOverflows: pageContent
          ? pageContent.scrollHeight > pageContent.clientHeight + 1 ||
            pageContent.scrollWidth > pageContent.clientWidth + 1
          : true,
        surfaceOverflows: page.scrollHeight > page.clientHeight + 1 || page.scrollWidth > page.clientWidth + 1,
        whitespaceRatio: printableHeight > 0 ? Number(((printableHeight - contentHeight) / printableHeight).toFixed(4)) : 0,
      };
    },
    { viewportLabel, viewportWidth },
  );
}

async function assertAndLogBrowserPageLayoutMetrics(
  surface: Locator,
  viewport: { width: number; label: string },
  pageKind: InitialsPageKind | "signed-witness",
  includeFields = true,
): Promise<BrowserPageLayoutMetrics> {
  const metrics = await collectBrowserPageLayoutMetrics(surface, viewport.label, viewport.width);
  const canonical = canonicalBrowserMetricsForPage(viewport.label, viewport.width, pageKind, includeFields);
  console.info("[vs01-page-layout-metrics]", metrics);
  expectBrowserMetricsMatchCanonical(metrics, canonical);
  expectClosePx(metrics.pageWidth, VS01_PACKET_PAGE_WIDTH_PT, 1);
  expectClosePx(metrics.pageHeight, VS01_PACKET_PAGE_HEIGHT_PT, 1);
  expect(metrics.lastTextBottom).toBeLessThan(metrics.footerRuleY - 2);
  expect(metrics.pageContentOverflows).toBe(false);
  expect(metrics.surfaceOverflows).toBe(false);
  return metrics;
}

function logPageLayoutMetrics(args: {
  viewport: string;
  pageKind: string;
  page: Vs01SigningPacketPage;
  fields: readonly PlacedSigningField[];
}): void {
  const { page, viewport, pageKind, fields } = args;
  const lastLineBottom = Math.max(0, ...page.textBlocks.map((text) => text.y + text.height));
  const signatureAnchorY = Math.min(
    1,
    ...page.signatureLineAnchors.map((anchor) => anchor.y),
  );
  const initialsFields = fields.filter((field) => field.type === "initials" && field.page === page.pageIndex);
  const initialsTop = Math.min(1, ...initialsFields.map((field) => field.y));
  const printableHeight = page.initialsBandRect.y - page.contentRect.y;
  const contentHeight = Math.max(0, lastLineBottom - page.contentRect.y);
  console.info("[vs01-page-layout-metrics]", {
    viewportLabel: viewport,
    viewportWidth: Number(viewport.match(/\d+$/)?.[0] ?? 0),
    pageScale: 1,
    pageWidth: VS01_PACKET_PAGE_WIDTH_PT,
    pageHeight: VS01_PACKET_PAGE_HEIGHT_PT,
    pageKind,
    pageIndex: page.pageIndex,
    contentLeft: Math.round(page.contentRect.x * VS01_PACKET_PAGE_WIDTH_PT),
    contentRight: Math.round((page.contentRect.x + page.contentRect.width) * VS01_PACKET_PAGE_WIDTH_PT),
    contentTop: Math.round(page.contentRect.y * VS01_PACKET_PAGE_HEIGHT_PT),
    contentBottom: Math.round((page.contentRect.y + page.contentRect.height) * VS01_PACKET_PAGE_HEIGHT_PT),
    footerRuleY: Math.round(page.initialsBandRect.y * VS01_PACKET_PAGE_HEIGHT_PT),
    bodyHeight: Math.round(page.contentRect.height * VS01_PACKET_PAGE_HEIGHT_PT),
    printableHeight: Math.round(printableHeight * VS01_PACKET_PAGE_HEIGHT_PT),
    footerReserve: Math.round(page.initialsBandRect.height * VS01_PACKET_PAGE_HEIGHT_PT),
    contentHeight: Math.round(contentHeight * VS01_PACKET_PAGE_HEIGHT_PT),
    whitespaceRatio: printableHeight > 0 ? Number(((printableHeight - contentHeight) / printableHeight).toFixed(4)) : 0,
    signatureAnchorY: signatureAnchorY < 1 ? Math.round(signatureAnchorY * VS01_PACKET_PAGE_HEIGHT_PT) : null,
    signatureFieldX: null,
    signatureFieldY: null,
    initialsChipX: initialsFields[0] ? Math.round(initialsFields[0].x * VS01_PACKET_PAGE_WIDTH_PT) : null,
    initialsChipY: initialsTop < 1 ? Math.round(initialsTop * VS01_PACKET_PAGE_HEIGHT_PT) : null,
    initialsTop: initialsTop < 1 ? Math.round(initialsTop * VS01_PACKET_PAGE_HEIGHT_PT) : null,
    topPadding: Math.round(page.contentRect.y * VS01_PACKET_PAGE_HEIGHT_PT),
    bottomPadding: Math.round((1 - (page.initialsBandRect.y + page.initialsBandRect.height)) * VS01_PACKET_PAGE_HEIGHT_PT),
  });
}

function logVisualPageMetrics(viewport: string, pageKind: InitialsPageKind | "signed-witness"): void {
  const model = buildVisualModel();
  const pageIndex =
    pageKind === "signed-witness" ? witnessPageIndex(model) : pageIndexForInitialsScreenshot(model, pageKind);
  const page = model.pages[pageIndex];
  if (!page) return;
  logPageLayoutMetrics({ viewport, pageKind, page, fields: model.fields });
}

function buildPrepareWorkspaceHtml(
  opts: { signed?: boolean; showInitials?: boolean; pageIndex?: number; renderFields?: boolean } = {},
): string {
  const model = buildVisualModel();
  if (opts.showInitials) assertInitialsModelGeometry(model);

  const fallbackWitnessIndex = witnessPageIndex(model);
  const witnessPage =
    model.pages[fallbackWitnessIndex >= 0 ? fallbackWitnessIndex : model.pages.length - 1] ??
    model.pages[model.pages.length - 1]!;
  const pageForScreenshot = opts.pageIndex != null ? (model.pages[opts.pageIndex] ?? witnessPage) : witnessPage;

  const pageMarkup = renderCanonicalPageHtml(pageForScreenshot, model.fields, opts);
  const css = readFileSync(join(__dirname, "../src/vs01/vs01.css"), "utf8");
  const tokens = readFileSync(join(__dirname, "../src/vs01/vs01-tokens.css"), "utf8");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>${tokens}\n${css}</style>
</head>
<body style="margin:0;background:#0f172a;color:#0f172a;">
  <div class="vs01-sign-workspace vs01-sign-workspace--prepare" style="max-width:100%;padding:1rem;box-sizing:border-box;">
    <div class="vs01-sign-doc-col">
      <div class="vs01-sign-scroll">
        <div class="vs01-sign-doc-pages-wrap vs01-sign-doc-surface vs01-sign-doc-surface--bridge">
          <div class="vs01-sign-pages-inner">${pageMarkup}</div>
        </div>
      </div>
    </div>
    <aside class="vs01-sign-rail">
      <p class="vs01-sign-rail-line"><span class="vs01-sign-rail-k">Signers</span> <span class="vs01-sign-rail-v">Acme LLC · Joe Smith</span></p>
      <button type="button" class="vs01-btn vs01-btn--primary" style="margin-top:0.5rem;">Continue to send</button>
    </aside>
  </div>
</body>
</html>`;
}

function buildBodyWorkspaceHtml(pageKind: "page1" | "page-middle"): string {
  const model = buildVisualModel();
  assertInitialsModelGeometry(model);
  const pageIndex = pageIndexForInitialsScreenshot(model, pageKind);
  return buildPrepareWorkspaceHtml({ pageIndex, renderFields: false });
}

function buildInitialsWorkspaceHtml(pageKind: InitialsPageKind): string {
  const model = buildVisualModel();
  assertInitialsModelGeometry(model);
  return buildPrepareWorkspaceHtml({
    showInitials: true,
    pageIndex: pageIndexForInitialsScreenshot(model, pageKind),
  });
}

const TEST77_REALISTIC_FINAL_CORPUS = `AI AUTOMATION SERVICES AGREEMENT

This AI Automation Services Agreement (the "Agreement") is entered into by and between Acme LLC ("Client") and Joe Brown ("Service Provider"). Client and Service Provider may be referred to individually as a "Party" and collectively as the "Parties."

1. Purpose and Scope
1.1 Client engages Service Provider to design, configure, and support workflow automation services for intake routing, document preparation, operational reporting, and related integrations.
1.2 Service Provider will perform the services in a professional manner and will coordinate with Client on priorities, milestones, acceptance criteria, and dependencies.
1.3 Any material change in scope, timeline, or fees must be approved in writing by both Parties before the changed work begins.

2. Fees and Payment
2.1 Client will pay the fees stated in the applicable statement of work or order form.
2.2 Unless a statement of work provides otherwise, undisputed invoices are due thirty (30) days after receipt.
2.3 Client may withhold disputed amounts in good faith if Client provides reasonable detail about the dispute and pays all undisputed amounts when due.

3. Confidentiality
3.1 Each Party may receive confidential or non-public information from the other Party. The receiving Party will use that information only to perform or receive services under this Agreement.
3.2 The receiving Party will protect confidential information using at least reasonable care and will not disclose it except to personnel and advisors who need access and are bound by confidentiality duties.
3.3 Confidentiality obligations do not apply to information that becomes public without breach, is independently developed, or is lawfully received from a third party without a duty of confidentiality.

4. Ownership and Work Product
4.1 Client retains ownership of Client materials, data, trademarks, and business content provided to Service Provider.
4.2 Subject to full payment, Client owns final deliverables specifically prepared for Client under this Agreement.
4.3 Service Provider retains ownership of pre-existing tools, templates, know-how, background technology, and general skills, and grants Client a perpetual internal-use license to any such materials embedded in the deliverables.

5. Support and Service Levels
5.1 Service Provider will provide commercially reasonable implementation support during normal business hours unless the applicable statement of work states a different support schedule.
5.2 Service Provider will promptly notify Client of material blockers, production-impacting issues, or dependencies that may affect delivery.
5.3 Service Provider will use reasonable efforts to maintain reliable production automation components and to remediate confirmed defects within a commercially reasonable time.

6. Term and Termination
6.1 This Agreement begins on the effective date and continues until terminated in accordance with this section.
6.2 Either Party may terminate this Agreement for material breach if the breaching Party does not cure the breach within thirty (30) days after written notice.
6.3 Upon termination, Client will pay for services performed and approved expenses incurred before the termination effective date.

7. Notices
7.1 Notices under this Agreement must be delivered in writing to the contact information maintained by the receiving Party for contract notices.
7.2 Email notice is effective when sent unless the sender receives an automated delivery failure message.

8. General Terms
8.1 The Parties are independent contractors, and this Agreement does not create a partnership, joint venture, fiduciary relationship, or employment relationship.
8.2 Neither Party may assign this Agreement without the other Party's prior written consent, except to an affiliate or successor in connection with a merger, reorganization, or sale of substantially all assets.
8.3 This Agreement is governed by the laws stated in the applicable order form, without regard to conflicts-of-law rules.
8.4 This Agreement, together with any applicable statement of work, is the entire agreement between the Parties regarding its subject matter and supersedes prior or contemporaneous understandings.

9. Electronic Signatures and Counterparts
9.1 The Parties may execute this Agreement electronically and in counterparts, each of which is deemed an original and all of which together constitute one instrument.
9.2 Electronic signatures have the same legal effect as manually signed originals.

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
Date: ____________________`;

function assertRealisticFinalCorpus(corpus: string): void {
  expect(corpus).toMatch(/Acme LLC\s*\("Client"\)/i);
  expect(corpus).toMatch(/Joe Brown\s*\("Service Provider"\)/i);
  expect(corpus).not.toMatch(/Client,\s+the\s+Client|Service Provider,\s+the\s+Service Provider/i);
  expect(corpus).not.toMatch(/^\s*\d+\.\d+\.?\s+(?:Assignment|Insurance|Indemnification|Notices?|Force Majeure|Equitable Relief)\.\s*$/im);
  expect(corpus).not.toMatch(/\bParty\s+A\b|\bParty\s+B\b|\bCompany\b|\bContractor\b/i);
  const sentences = corpus
    .replace(/\r\n/g, "\n")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.replace(/\s+/g, " ").trim().toLowerCase())
    .filter((s) => s.length > 42);
  const counts = new Map<string, number>();
  for (const sentence of sentences) counts.set(sentence, (counts.get(sentence) ?? 0) + 1);
  expect([...counts.entries()].filter(([, count]) => count > 2)).toEqual([]);
}

function buildTest77VisualModel(initialsEnabled: boolean) {
  assertRealisticFinalCorpus(TEST77_REALISTIC_FINAL_CORPUS);
  const model = buildVs01SigningPacketModel({
    mode: "guided_pro",
    authoritativeCorpusPlain: TEST77_REALISTIC_FINAL_CORPUS,
    roles: test77Roles(),
    corpusGateArgs: { freeBaselinePlain: STARTER_749 },
    initialsEnabled,
  });
  if (!model.allowed) {
    throw new Error(`Test77 model not allowed: ${model.diagnostics.validationErrors.join(", ")}`);
  }
  expect(model.corpus).toMatch(/Acme LLC/i);
  expect(model.corpus).toMatch(/Joe Brown/i);
  expect(model.corpus).toMatch(/IN WITNESS WHEREOF/i);
  expect(model.corpus).not.toMatch(/Draft Agreement \(non-binding template\)/i);
  return model;
}

function buildTest77WorkspaceHtml(opts: {
  initialsEnabled: boolean;
  pageIndex?: number;
  witness?: boolean;
  fieldPartyIndex?: number | null;
  showInitials?: boolean;
  renderFields?: boolean;
  preparePlacementChrome?: boolean;
  highlightPartyIndex?: number | null;
  fieldsForPage?: readonly PlacedSigningField[];
  testId?: string;
  workspaceLead?: string;
}): string {
  const model = buildTest77VisualModel(opts.initialsEnabled);
  const witnessIdx = witnessPageIndex(model);
  const pageIndex = opts.witness ? witnessIdx : (opts.pageIndex ?? 0);
  const packetPage = model.pages[pageIndex] ?? model.pages[model.pages.length - 1]!;
  let pageFields =
    opts.fieldsForPage ??
    model.fields.filter((f) => {
      if (f.page !== pageIndex) return false;
      if (opts.showInitials === false && f.type === "initials") return false;
      return true;
    });
  if (opts.fieldPartyIndex != null) {
    pageFields = pageFields.filter((f) => (f.assignedPartyIndex ?? 0) === opts.fieldPartyIndex);
  }
  const pageMarkup = renderCanonicalPageHtml(packetPage, pageFields, {
    showInitials: opts.showInitials ?? opts.initialsEnabled,
    renderFields: opts.renderFields ?? true,
    preparePlacementChrome: opts.preparePlacementChrome ?? true,
    highlightPartyIndex: opts.highlightPartyIndex,
    signed: opts.witness ? false : undefined,
  });
  const css = readFileSync(join(__dirname, "../src/vs01/vs01.css"), "utf8");
  const tokens = readFileSync(join(__dirname, "../src/vs01/vs01-tokens.css"), "utf8");
  const testIdAttr = opts.testId ? ` data-testid="${opts.testId}"` : "";
  const lead =
    opts.workspaceLead ??
    (opts.initialsEnabled
      ? "Prepare — initials on every body page"
      : "Prepare — initials suppressed");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>${tokens}\n${css}</style>
</head>
<body style="margin:0;background:#0f172a;color:#0f172a;">
  <main class="vs01-test77-app-shell"${testIdAttr} style="min-height:100vh;background:#0f172a;padding:18px 20px 28px;box-sizing:border-box;">
    <header class="vs01-test77-app-header" style="display:flex;align-items:center;justify-content:space-between;margin:0 auto 16px;max-width:1180px;color:#e5e7eb;">
      <div style="font-weight:700;letter-spacing:0.02em;">LawDog</div>
      <nav aria-label="Visual fixture navigation" style="display:flex;gap:8px;">
        <button type="button" class="vs01-btn vs01-btn--secondary vs01-btn--auto">My agreements</button>
        <button type="button" class="vs01-btn vs01-btn--secondary vs01-btn--auto">Dashboard</button>
      </nav>
    </header>
  <div class="vs01-sign-workspace vs01-sign-workspace--prepare" style="max-width:1180px;margin:0 auto;padding:1rem;box-sizing:border-box;">
    <div class="vs01-sign-doc-col">
      <div class="vs01-sign-scroll">
        <div class="vs01-sign-doc-pages-wrap vs01-sign-doc-surface vs01-sign-doc-surface--bridge">
          <div class="vs01-sign-pages-inner">${pageMarkup}</div>
        </div>
      </div>
    </div>
    <aside class="vs01-sign-rail">
      <p class="vs01-sign-rail-line"><span class="vs01-sign-rail-k">Signers</span> <span class="vs01-sign-rail-v">Acme LLC · Joe Brown</span></p>
      <p class="vs01-card-help">${escapeHtml(lead)}</p>
    </aside>
  </div>
</main>
</body>
</html>`;
}

async function expectVisualFieldsInsidePage(surface: Locator, selector = "[data-vs01-visual-field-type]"): Promise<void> {
  const result = await surface.evaluate((pageEl, fieldSelector) => {
    const page = pageEl as HTMLElement;
    const pageRect = page.getBoundingClientRect();
    return [...page.querySelectorAll(String(fieldSelector))].map((node) => {
      const rect = (node as HTMLElement).getBoundingClientRect();
      return {
        leftOk: rect.left >= pageRect.left - 1,
        topOk: rect.top >= pageRect.top - 1,
        rightOk: rect.right <= pageRect.right + 1,
        bottomOk: rect.bottom <= pageRect.bottom + 1,
        width: rect.width,
        height: rect.height,
      };
    });
  }, selector);
  expect(result.length).toBeGreaterThan(0);
  for (const item of result) {
    expect(item.leftOk && item.topOk && item.rightOk && item.bottomOk).toBe(true);
  }
}

async function anchorWitnessSignatureOverlaysInBrowser(surface: Locator): Promise<void> {
  const measured = await surface.evaluate(() => {
    const page = document.querySelector(".vs01-sign-page-surface--canonical") as HTMLElement | null;
    if (!page) return null;
    const surfaceRect = page.getBoundingClientRect();
    if (surfaceRect.width < 8 || surfaceRect.height < 8) return null;
    const underlines: { partyIndex: number; x: number; y: number; width: number; height: number }[] = [];
    page.querySelectorAll<HTMLElement>("[data-vs01-signature-execution-line]").forEach((lineEl) => {
      const partyIndex = Number.parseInt(lineEl.getAttribute("data-vs01-signature-party") ?? "", 10);
      if (!Number.isFinite(partyIndex)) return;
      const underline = lineEl.querySelector<HTMLElement>(".vs01-canonical-signature-underline");
      if (!underline) return;
      const uRect = underline.getBoundingClientRect();
      underlines.push({
        partyIndex,
        x: (uRect.left - surfaceRect.left) / surfaceRect.width,
        y: (uRect.top - surfaceRect.top) / surfaceRect.height,
        width: uRect.width / surfaceRect.width,
        height: Math.max(uRect.height / surfaceRect.height, 0.001),
      });
    });
    const parties = [...page.querySelectorAll<HTMLElement>("[data-vs01-visual-field-type='signature']")].map(
      (sig) => Number.parseInt(sig.getAttribute("data-vs01-visual-party-index") ?? "", 10),
    );
    return { underlines, parties };
  });
  if (!measured) return;

  const placements = measured.parties
    .filter((partyIndex) => Number.isFinite(partyIndex))
    .map((partyIndex) => {
      const underline = measured.underlines.find((u) => u.partyIndex === partyIndex);
      if (!underline) return null;
      const field = signatureFieldRectFromMeasuredUnderline(underline);
      return { partyIndex, field };
    })
    .filter((item): item is { partyIndex: number; field: ReturnType<typeof signatureFieldRectFromMeasuredUnderline> } =>
      item != null,
    );

  await surface.evaluate((_, updates) => {
    const page = document.querySelector(".vs01-sign-page-surface--canonical") as HTMLElement | null;
    if (!page || !Array.isArray(updates)) return;
    for (const { partyIndex, field } of updates) {
      const sig = page.querySelector(
        `[data-vs01-visual-field-type='signature'][data-vs01-visual-party-index="${partyIndex}"]`,
      ) as HTMLElement | null;
      if (!sig) continue;
      sig.style.left = `${field.x * 100}%`;
      sig.style.top = `${field.y * 100}%`;
      sig.style.width = `${field.width * 100}%`;
      sig.style.height = `${field.height * 100}%`;
      sig.setAttribute("data-vs01-signature-dom-anchored", "1");
    }
  }, placements);
}

async function expectWitnessSignatureOverlayGeometry(surface: Locator, expectedCount: number): Promise<void> {
  await anchorWitnessSignatureOverlaysInBrowser(surface);
  const metrics = await surface.evaluate(() => {
    const page = document.querySelector(".vs01-sign-page-surface--canonical") as HTMLElement | null;
    if (!page) return [];
    const pageRect = page.getBoundingClientRect();
    const pxRect = (el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      return {
        left: r.left - pageRect.left,
        top: r.top - pageRect.top,
        right: r.right - pageRect.left,
        bottom: r.bottom - pageRect.top,
        width: r.width,
        height: r.height,
        centerY: r.top - pageRect.top + r.height / 2,
      };
    };
    const intersects = (
      a: { left: number; top: number; right: number; bottom: number },
      b: { left: number; top: number; right: number; bottom: number },
      tolerancePx = 0,
    ) =>
      a.left < b.right - tolerancePx &&
      a.right > b.left + tolerancePx &&
      a.top < b.bottom - tolerancePx &&
      a.bottom > b.top + tolerancePx;
    const signatures = [...page.querySelectorAll("[data-vs01-visual-field-type='signature']")] as HTMLElement[];
    return signatures.map((sig) => {
      const party = sig.getAttribute("data-vs01-visual-party-index") ?? "";
      const line = page.querySelector(`[data-vs01-signature-execution-line][data-vs01-signature-party="${party}"]`);
      const underline = line?.querySelector(".vs01-canonical-signature-underline");
      const field = pxRect(sig);
      const label = sig.querySelector(".vs01-sign-placement-label");
      const labelRect = label ? pxRect(label) : null;
      const labelEl = label as HTMLElement | null;
      const underlineRect = underline ? pxRect(underline) : null;
      const topPct = Number.parseFloat(sig.style.top) / 100;
      const heightPct = Number.parseFloat(sig.style.height) / 100;
      const anchoredBottom =
        Number.isFinite(topPct) && Number.isFinite(heightPct)
          ? (topPct + heightPct) * pageRect.height
          : field.bottom;
      const protectedText = [...page.querySelectorAll("[data-vs01-canonical-text]")]
        .filter((node) => node !== line)
        .filter((node) => /^(CLIENT|SERVICE PROVIDER|Name|Title|Date)\b|^(Acme LLC|Joe Brown)\b/i.test((node.textContent ?? "").trim()))
        .map(pxRect);
      return {
        party,
        field,
        label: labelRect,
        labelText: labelEl?.textContent?.trim() ?? "",
        labelClipped: labelEl ? labelEl.scrollWidth > labelEl.clientWidth + 1 : true,
        underline: underlineRect,
        centerDelta: underlineRect ? field.centerY - underlineRect.centerY : null,
        baselineDelta: underlineRect ? anchoredBottom - underlineRect.bottom : null,
        layoutBottomDelta: underlineRect ? field.bottom - underlineRect.bottom : null,
        pageWidth: pageRect.width,
        pageHeight: pageRect.height,
        fieldIntersections: protectedText.filter((text) => intersects(field, text, 1.25)).length,
        labelIntersections: labelRect ? protectedText.filter((text) => intersects(labelRect, text)).length : 0,
      };
    });
  });
  expect(metrics).toHaveLength(expectedCount);
  for (const item of metrics) {
    expect(item.underline).not.toBeNull();
    expect(item.field.left).toBeGreaterThanOrEqual(0);
    expect(item.field.top).toBeGreaterThanOrEqual(0);
    expect(item.field.height).toBeGreaterThanOrEqual(VS01_SIGNATURE_SHELL_MIN_HEIGHT_PX - 2);
    expect(item.field.height).toBeLessThanOrEqual(VS01_SIGNATURE_SHELL_MAX_HEIGHT_PX + 2);
    expect(item.field.right).toBeLessThanOrEqual(item.pageWidth + 1);
    expect(item.field.bottom).toBeLessThanOrEqual(item.pageHeight + 1);
    expect(item.field.left).toBeGreaterThanOrEqual(item.underline!.left - 1);
    expect(item.baselineDelta, `party ${item.party} baselineDelta=${item.baselineDelta}`).not.toBeNull();
    expect(item.baselineDelta!, `party ${item.party} baselineDelta=${item.baselineDelta}`).toBeGreaterThanOrEqual(
      -VS01_SIGNATURE_SIGNED_INK_MAX_OVERLAP_BELOW_PX,
    );
    expect(item.baselineDelta!).toBeLessThanOrEqual(VS01_SIGNATURE_ACTIVE_SHELL_MAX_CLEARANCE_ABOVE_PX);
    expect(item.layoutBottomDelta ?? 0).toBeLessThanOrEqual(8);
    expect(item.labelText).toBe("Signature");
    expect(item.labelClipped).toBe(false);
    expect(item.fieldIntersections).toBe(0);
    expect(item.labelIntersections).toBe(0);
  }
}

async function expectExecutionBlockDensity(surface: Locator): Promise<void> {
  const metrics = await surface.evaluate((maxGapPx) => {
    const page = document.querySelector(".vs01-sign-page-surface--canonical") as HTMLElement | null;
    if (!page) return { gaps: [] as number[], maxGap: 0 };
    const pxTop = (el: Element) => (el as HTMLElement).getBoundingClientRect().top;
    const executionLines = [...page.querySelectorAll("[data-vs01-signature-execution-line]")] as HTMLElement[];
    const gaps: number[] = [];
    for (const line of executionLines) {
      const lineTop = pxTop(line);
      const labels = [...page.querySelectorAll(".vs01-canonical-flow-line--signature_label")] as HTMLElement[];
      const stack = [
        line,
        ...labels.filter((node) => {
          const top = pxTop(node);
          return top > lineTop && top < lineTop + 120;
        }).sort((a, b) => pxTop(a) - pxTop(b)),
      ];
      for (let i = 1; i < stack.length; i += 1) {
        gaps.push(pxTop(stack[i]!) - pxTop(stack[i - 1]!));
      }
    }
    return { gaps, maxGap: gaps.length ? Math.max(...gaps) : 0 };
  }, VS01_EXECUTION_MAX_LABEL_GAP_PX);
  expect(metrics.gaps.length).toBeGreaterThan(0);
  expect(metrics.maxGap).toBeLessThanOrEqual(VS01_EXECUTION_MAX_LABEL_GAP_PX);
}

async function expectCanonicalPageLayoutStable(surface: Locator): Promise<void> {
  const first = await collectBrowserPageLayoutMetrics(surface, "stability-pass-1", VS01_VISUAL_PAGE_WIDTH_PT);
  await surface.page().waitForTimeout(120);
  const second = await collectBrowserPageLayoutMetrics(surface, "stability-pass-2", VS01_VISUAL_PAGE_WIDTH_PT);
  expectClosePx(first.contentLeft, second.contentLeft, 1);
  expectClosePx(first.contentTop, second.contentTop, 1);
  expectClosePx(first.pageWidth, second.pageWidth, 1);
  expectClosePx(first.pageHeight, second.pageHeight, 1);
  if (first.signatureFieldY != null && second.signatureFieldY != null) {
    expectClosePx(first.signatureFieldY, second.signatureFieldY, 1);
  }
}

async function expectSignedWitnessSignatureComposition(surface: Locator): Promise<void> {
  await anchorWitnessSignatureOverlaysInBrowser(surface);
  const metrics = await surface.evaluate(
    (cfg) => {
      const page = document.querySelector(".vs01-sign-page-surface--canonical") as HTMLElement | null;
      if (!page) return [] as {
        party: string;
        shellHeight: number;
        nameGap: number | null;
        inkAboveUnderline: number | null;
        inkIntersectsName: boolean;
        underlineVisible: boolean;
        inkWidthFrac: number | null;
        inkTextWidthFrac: number | null;
        inkLeftBiasPx: number | null;
        inkFontPx: number;
      }[];
      const pageRect = page.getBoundingClientRect();
      const rel = (el: Element) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        return {
          top: r.top - pageRect.top,
          bottom: r.bottom - pageRect.top,
          left: r.left - pageRect.left,
          width: r.width,
          height: r.height,
        };
      };
      const inks = [...page.querySelectorAll("[data-vs01-visual-completed-signature]")] as HTMLElement[];
      return inks.map((ink) => {
        const box = ink.closest(".vs01-sign-placement-box") as HTMLElement | null;
        const party = box?.getAttribute("data-vs01-visual-party-index") ?? "";
        const lineEl = page.querySelector(
          `[data-vs01-signature-execution-line][data-vs01-signature-party="${party}"]`,
        );
        const underline = lineEl?.querySelector(".vs01-canonical-signature-underline");
        let nameRow: Element | null = null;
        let cursor = lineEl?.nextElementSibling ?? null;
        while (cursor) {
          if (
            cursor.classList.contains("vs01-canonical-flow-line--signature_label") &&
            /^Name\s*:/i.test((cursor.textContent ?? "").trim())
          ) {
            nameRow = cursor;
            break;
          }
          if (cursor.matches("[data-vs01-signature-execution-line]")) break;
          cursor = cursor.nextElementSibling;
        }
        const inkRect = rel(ink);
        const underlineRect = underline ? rel(underline) : null;
        const nameRect = nameRow ? rel(nameRow) : null;
        const boxRect = box ? rel(box) : null;
        const underlineStyle = underline ? getComputedStyle(underline) : null;
        const inkStyle = getComputedStyle(ink);
        return {
          party,
          shellHeight: boxRect?.height ?? 0,
          nameGap: nameRect ? nameRect.top - inkRect.bottom : null,
          inkAboveUnderline: underlineRect ? underlineRect.bottom - inkRect.bottom : null,
          inkIntersectsName: nameRect ? inkRect.bottom > nameRect.top + 0.5 : false,
          underlineVisible: underlineStyle ? underlineStyle.borderBottomWidth !== "0px" : false,
          inkWidthFrac: boxRect && underlineRect && underlineRect.width > 0 ? boxRect.width / underlineRect.width : null,
          inkTextWidthFrac:
            underlineRect && inkRect.width > 0 ? inkRect.width / underlineRect.width : null,
          shellLeftBiasPx: boxRect && underlineRect ? boxRect.left - underlineRect.left : null,
          inkLeftBiasPx: underlineRect ? inkRect.left - underlineRect.left : null,
          inkFontPx: parseFloat(inkStyle.fontSize) || 0,
        };
      });
    },
    {
      minWidthFrac: VS01_SIGNATURE_FIELD_WIDTH_MIN_FRAC,
      maxWidthFrac: VS01_SIGNATURE_FIELD_WIDTH_MAX_FRAC,
    },
  );

  expect(metrics.length).toBeGreaterThanOrEqual(1);
  for (const item of metrics) {
    expect(item.shellHeight, `party ${item.party} shell height`).toBeGreaterThanOrEqual(
      VS01_SIGNATURE_SHELL_MIN_HEIGHT_PX - 2,
    );
    expect(item.shellHeight, `party ${item.party} shell height`).toBeLessThanOrEqual(
      VS01_SIGNATURE_SHELL_MAX_HEIGHT_PX + 2,
    );
    expect(item.inkIntersectsName, `party ${item.party} ink/name collision`).toBe(false);
    expect(item.nameGap, `party ${item.party} name gap`).not.toBeNull();
    expect(item.nameGap!).toBeGreaterThanOrEqual(VS01_SIGNATURE_NAME_ROW_MIN_GAP_PX);
    expect(item.inkAboveUnderline, `party ${item.party} ink baseline`).not.toBeNull();
    expect(item.inkAboveUnderline!, `party ${item.party} ink kisses underline`).toBeGreaterThanOrEqual(
      -VS01_SIGNATURE_SIGNED_INK_MAX_OVERLAP_BELOW_PX,
    );
    expect(item.inkAboveUnderline!, `party ${item.party} ink sits above line`).toBeLessThanOrEqual(
      VS01_SIGNATURE_SIGNED_INK_MAX_CLEARANCE_ABOVE_PX,
    );
    expect(item.underlineVisible, `party ${item.party} underline visible`).toBe(true);
    expect(item.inkWidthFrac, `party ${item.party} ink width`).not.toBeNull();
    expect(item.inkWidthFrac!).toBeGreaterThanOrEqual(VS01_SIGNATURE_FIELD_WIDTH_MIN_FRAC - 0.08);
    expect(item.inkWidthFrac!).toBeLessThanOrEqual(1.05);
    expect(item.inkFontPx, `party ${item.party} ink font`).toBeGreaterThanOrEqual(16);
  }
}

async function expectInitialsReadable(surface: Locator, expectedCount: number): Promise<void> {
  const boxes = surface.locator(".vs01-sign-placement-box--auto-initials");
  await expect(boxes).toHaveCount(expectedCount);
  const metrics = await boxes.evaluateAll((nodes) =>
    nodes.map((node) => {
      const el = node as HTMLElement;
      const label = el.querySelector(".vs01-sign-placement-label") as HTMLElement | null;
      const value = el.querySelector(".vs01-sign-placement-initials") as HTMLElement | null;
      const labelRect = label?.getBoundingClientRect();
      const labelStyle = label ? getComputedStyle(label) : null;
      const lineHeight = labelStyle ? parseFloat(labelStyle.lineHeight) : 0;
      const rect = el.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        labelText: label?.textContent?.trim() ?? "",
        valueText: value?.textContent?.trim() ?? "",
        labelLines: labelRect && lineHeight > 0 ? Math.ceil(labelRect.height / lineHeight) : 0,
      };
    }),
  );
  for (const item of metrics) {
    expect(item.width).toBeGreaterThanOrEqual(44);
    expect(item.height).toBeGreaterThanOrEqual(18);
    expect(item.labelText).toBe("Initials");
    expect(item.valueText).toMatch(/^(AHB|JB)$/);
    expect(item.labelLines).toBeLessThanOrEqual(2);
  }
}

async function assertTest77CanonicalSurface(
  page: Page,
  surface: Locator,
  opts: {
    pageKind:
      | "body-initials-on"
      | "body-initials-off"
      | "witness"
      | "sender-review"
      | "counterparty-review"
      | "prepare-witness"
      | "sender-witness"
      | "counterparty-witness";
    initialsEnabled: boolean;
  },
): Promise<void> {
  await expect(surface).toBeVisible();
  await expect(surface).toHaveCSS("width", `${VS01_PACKET_PAGE_WIDTH_PT}px`);
  await expect(surface).toHaveCSS("height", `${VS01_PACKET_PAGE_HEIGHT_PT}px`);
  const bg = await surface.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toMatch(/rgb\(255,\s*255,\s*255\)|#fff/i);

  await expect(surface.locator(".vs01-canonical-page-content")).toBeVisible();
  await expect(surface.locator(".vs01-canonical-flow-body")).toBeVisible();
  await expect(surface.locator(".vs01-canonical-initials-band")).toBeVisible();

  const fontSize = await surface.locator(".vs01-canonical-flow-body").evaluate((el) =>
    getComputedStyle(el).fontSize,
  );
  expect(fontSize).toBe("13px");

  await expect(
    surface.locator(".vs01-canonical-flow-line").filter({ hasText: /Acme LLC/i }).first(),
  ).toBeVisible();

  if (opts.pageKind === "witness") {
    await expect(
      surface.locator("[data-vs01-signature-execution-line], .vs01-canonical-flow-line").filter({
        hasText: /IN WITNESS WHEREOF/i,
      }).first(),
    ).toBeVisible();
    await expect(
      surface.locator(".vs01-canonical-flow-line--signature, .vs01-canonical-flow-line").filter({
        hasText: /Joe Brown/i,
      }).first(),
    ).toBeVisible();
    await expect(surface.locator("[data-vs01-signature-execution-line]")).toHaveCount(2);
    await expect(surface.locator("[data-vs01-visual-field-type='initials']")).toHaveCount(0);
    await expect(surface.locator("[data-vs01-visual-completed-initials]")).toHaveCount(0);
    return;
  }

  if (
    opts.pageKind === "prepare-witness" ||
    opts.pageKind === "sender-witness" ||
    opts.pageKind === "counterparty-witness"
  ) {
    await expect(surface.locator("[data-vs01-signature-execution-line]")).toHaveCount(2);
    const expectedSignatures = opts.pageKind === "prepare-witness" ? 2 : 1;
    await expect(surface.locator("[data-vs01-visual-field-type='signature']")).toHaveCount(expectedSignatures);
    await expect(surface.locator("[data-vs01-visual-field-type='initials']")).toHaveCount(0);
    await expectVisualFieldsInsidePage(surface, "[data-vs01-visual-field-type='signature']");
    await expectWitnessSignatureOverlayGeometry(surface, expectedSignatures);
    return;
  }

  if (opts.pageKind === "body-initials-off") {
    expect(opts.initialsEnabled).toBe(false);
    await expect(surface.locator("[data-vs01-visual-field-type='initials']")).toHaveCount(0);
    await expect(surface.locator(".vs01-sign-placement-box--auto-initials")).toHaveCount(0);
    await expect(surface.locator("[data-vs01-visual-completed-initials]")).toHaveCount(0);
    await expect(surface.locator(".vs01-sign-placement-ph.vs01-sign-placement-initials")).toHaveCount(0);
    return;
  }

  const expectedInitials = opts.pageKind === "body-initials-on" ? 2 : 1;
  await expect(surface.locator("[data-vs01-visual-field-type='initials']")).toHaveCount(expectedInitials);
  await expectInitialsReadable(surface, expectedInitials);
  await expect(surface.locator(".vs01-sign-placement-ph.vs01-sign-placement-initials")).toHaveCount(
    0,
  );
  await expect(surface.locator("[data-vs01-visual-completed-initials]")).toHaveCount(0);
  await expectVisualFieldsInsidePage(surface, "[data-vs01-visual-field-type='initials']");

  if (opts.pageKind === "sender-review") {
    await expect(surface.locator(".vs01-sign-placement-box--other-role")).toHaveCount(0);
    await expect(surface.locator('[data-vs01-visual-party-index="0"]')).toHaveCount(1);
  }
  if (opts.pageKind === "counterparty-review") {
    await expect(surface.locator('[data-vs01-visual-party-index="1"]')).toHaveCount(1);
  }
}

async function renderTest77WitnessSignatureArtifact(
  page: Page,
  args: {
    viewport: { width: number; height: number };
    fileLabel: "desktop-1440" | "laptop-1280";
    pageKind: "prepare-witness" | "sender-witness" | "counterparty-witness";
    testId: string;
    workspaceLead: string;
    fieldPartyIndex?: number;
    highlightPartyIndex?: number;
    filename: string;
  },
): Promise<void> {
  await page.setViewportSize(args.viewport);
  await page.setContent(
    buildTest77WorkspaceHtml({
      initialsEnabled: true,
      witness: true,
      fieldPartyIndex: args.fieldPartyIndex,
      showInitials: false,
      renderFields: true,
      preparePlacementChrome: true,
      highlightPartyIndex: args.highlightPartyIndex,
      testId: `${args.testId}-${args.fileLabel}`,
      workspaceLead: args.workspaceLead,
    }),
    { waitUntil: "domcontentloaded" },
  );
  const surface = page.locator(".vs01-sign-page-surface--canonical");
  const root = page.locator(".vs01-test77-app-shell");
  await assertTest77CanonicalSurface(page, surface, {
    pageKind: args.pageKind,
    initialsEnabled: true,
  });
  await screenshotAppViewport(page, root, join(ARTIFACT_DIR, args.filename));
}

test.describe("VS01 canonical visual regression", () => {
  test.beforeAll(() => {
    mkdirSync(ARTIFACT_DIR, { recursive: true });
  });

  for (const viewport of [
    { width: 390, height: 844, label: "iphone-390" },
    { width: 844, height: 390, label: "iphone-844-landscape" },
    { width: 1280, height: 800, label: "laptop-1280" },
    { width: 1440, height: 900, label: "desktop-1440" },
  ]) {
    test(`witness page workspace at ${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.setContent(buildPrepareWorkspaceHtml(), { waitUntil: "domcontentloaded" });
      logVisualPageMetrics(viewport.label, "witness");

      const surface = page.locator(".vs01-sign-page-surface--canonical");
      await expect(surface).toBeVisible();
      await expect(surface).toHaveCSS("width", `${VS01_PACKET_PAGE_WIDTH_PT}px`);
      await assertAndLogBrowserPageLayoutMetrics(surface, viewport, "witness", true);

      const fontSize = await surface.locator(".vs01-canonical-flow-body").evaluate((el) =>
        getComputedStyle(el).fontSize,
      );
      expect(fontSize).toBe("13px");

      await expect(surface.locator("[data-vs01-signature-execution-line]")).toHaveCount(2);

      if (viewport.width >= VS01_PACKET_PAGE_WIDTH_PT) {
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
        expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 4);
      }

      await expectExecutionBlockDensity(surface);
      await expectCanonicalPageLayoutStable(surface);

      await screenshotCanonicalSurface(page, surface, join(ARTIFACT_DIR, `vs01-prepare-witness-${viewport.label}.png`));
    });

    test(`signed witness page workspace at ${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.setContent(buildPrepareWorkspaceHtml({ signed: true }), { waitUntil: "domcontentloaded" });
      logVisualPageMetrics(viewport.label, "signed-witness");

      const surface = page.locator(".vs01-sign-page-surface--canonical");
      await expect(surface).toBeVisible();
      await expect(surface).toHaveCSS("width", `${VS01_PACKET_PAGE_WIDTH_PT}px`);
      await assertAndLogBrowserPageLayoutMetrics(surface, viewport, "signed-witness", true);
      await expect(surface.locator("[data-vs01-signature-execution-line]")).toHaveCount(2);
      await expect(surface.locator("[data-vs01-visual-completed-signature]")).toHaveCount(2);
      await expect(surface.locator("[data-vs01-visual-completed-signature='0']")).toHaveText("Anthem H Blanchard");
      await expectSignedWitnessSignatureComposition(surface);

      const signatureFit = await surface
        .locator("[data-vs01-visual-completed-signature]")
        .evaluateAll((nodes) =>
          nodes.map((node) => {
            const el = node as HTMLElement;
            const style = getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return {
              text: el.textContent ?? "",
              whiteSpace: style.whiteSpace,
              fitsWidth: el.scrollWidth <= el.clientWidth + 1,
              fitsOneLine: rect.height <= parseFloat(style.lineHeight) * 1.25,
            };
          }),
        );
      expect(signatureFit).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            text: "Anthem H Blanchard",
            whiteSpace: "nowrap",
            fitsWidth: true,
            fitsOneLine: true,
          }),
          expect.objectContaining({
            text: "Joe Smith",
            whiteSpace: "nowrap",
            fitsWidth: true,
            fitsOneLine: true,
          }),
        ]),
      );

      await screenshotCanonicalSurface(
        page,
        surface,
        join(ARTIFACT_DIR, `vs01-prepare-witness-signed-${viewport.label}.png`),
      );
    });

    for (const bodyPage of [
      { label: "page1", title: "first body page" },
      { label: "page-middle", title: "middle body page" },
    ] as const) {
      test(`body ${bodyPage.title} at ${viewport.label}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.setContent(buildBodyWorkspaceHtml(bodyPage.label), { waitUntil: "domcontentloaded" });
        logVisualPageMetrics(viewport.label, bodyPage.label);

        const surface = page.locator(".vs01-sign-page-surface--canonical");
        await expect(surface).toBeVisible();
        await expect(surface).toHaveCSS("width", `${VS01_PACKET_PAGE_WIDTH_PT}px`);
        await assertAndLogBrowserPageLayoutMetrics(surface, viewport, bodyPage.label, false);
        await expect(surface.locator("[data-vs01-visual-field-type]")).toHaveCount(0);

        const fontSize = await surface.locator(".vs01-canonical-flow-body").evaluate((el) =>
          getComputedStyle(el).fontSize,
        );
        expect(fontSize).toBe("13px");

        const flowBodyBox = await surface.locator(".vs01-canonical-flow-body").evaluate((el) => {
          const body = el as HTMLElement;
          const page = body.closest(".vs01-sign-page-surface--canonical") as HTMLElement;
          const bodyRect = body.getBoundingClientRect();
          const pageRect = page.getBoundingClientRect();
          return {
            left: bodyRect.left - pageRect.left,
            right: bodyRect.right - pageRect.left,
            top: bodyRect.top - pageRect.top,
            bottom: bodyRect.bottom - pageRect.top,
          };
        });
        expect(flowBodyBox.left).toBeGreaterThanOrEqual(48);
        expect(flowBodyBox.right).toBeLessThanOrEqual(564);
        expect(flowBodyBox.top).toBeGreaterThanOrEqual(48);
        expect(flowBodyBox.bottom).toBeLessThan(VS01_PACKET_PAGE_HEIGHT_PT);

        await screenshotCanonicalSurface(
          page,
          surface,
          join(ARTIFACT_DIR, `vs01-prepare-body-${bodyPage.label}-${viewport.label}.png`),
        );
      });
    }

    for (const initialsPage of [
      { label: "page1", title: "first body page" },
      { label: "page-middle", title: "middle body page" },
      { label: "witness", title: "final witness page" },
    ] as const) {
      test(`initials ${initialsPage.title} at ${viewport.label}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.setContent(buildInitialsWorkspaceHtml(initialsPage.label), { waitUntil: "domcontentloaded" });
        logVisualPageMetrics(viewport.label, initialsPage.label);

        const surface = page.locator(".vs01-sign-page-surface--canonical");
        await expect(surface).toBeVisible();
        await expect(surface).toHaveCSS("width", `${VS01_PACKET_PAGE_WIDTH_PT}px`);
        await assertAndLogBrowserPageLayoutMetrics(surface, viewport, initialsPage.label, true);
        if (initialsPage.label === "witness") {
          await expect(surface.locator("[data-vs01-visual-field-type='initials']")).toHaveCount(0);
          await expect(surface.locator("[data-vs01-visual-completed-initials]")).toHaveCount(0);
        } else {
          await expect(surface.locator("[data-vs01-visual-field-type='initials']")).toHaveCount(2);
          await expect(surface.locator("[data-vs01-visual-completed-initials]")).toHaveCount(2);
          await expect(surface.locator("[data-vs01-visual-completed-initials='0']")).toHaveText("AHB");
          await expect(surface.locator("[data-vs01-visual-completed-initials='1']")).toHaveText("JS");
          const initialsText = await surface.locator("[data-vs01-visual-completed-initials]").allTextContents();
          expect(initialsText.map((text) => text.trim()).sort()).toEqual(["AHB", "JS"]);
        }

        const fontSize = await surface.locator(".vs01-canonical-flow-body").evaluate((el) =>
          getComputedStyle(el).fontSize,
        );
        expect(fontSize).toBe("13px");

        await screenshotCanonicalSurface(
          page,
          surface,
          join(ARTIFACT_DIR, `vs01-prepare-initials-${initialsPage.label}-${viewport.label}.png`),
        );
      });
    }
  }
});

test.describe("VS01 test75 prepare vs signer review parity", () => {
  test("test75 prepare body initials visible (desktop-1440)", async ({ page }) => {
    const model = buildTest74VisualModel();
    const pageIndex = 0;
    const packetPage = model.pages[pageIndex]!;
    const pageFields = model.fields.filter((f) => f.page === pageIndex);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.setContent(
      `<!doctype html><html><head><link rel="stylesheet" href="/src/vs01/vs01.css" /></head><body style="margin:0;background:#444;padding:24px;">${renderCanonicalPageHtml(packetPage, pageFields, {
        showInitials: true,
        renderFields: true,
      })}</body></html>`,
      { waitUntil: "domcontentloaded" },
    );
    const surface = page.locator(".vs01-sign-page-surface--canonical");
    await expect(surface.locator("[data-vs01-visual-field-type='initials']")).toHaveCount(2);
    await expect(surface.locator(".vs01-canonical-flow-line--signature")).toHaveCount(0);
    await screenshotCanonicalSurface(
      page,
      surface,
      join(ARTIFACT_DIR, "vs01-test75-prepare-body-initials-desktop-1440.png"),
    );
  });

  test("test75 prepare witness signature lines (desktop-1440)", async ({ page }) => {
    const model = buildTest74VisualModel();
    const witnessIdx = witnessPageIndex(model);
    const packetPage = model.pages[witnessIdx]!;
    const pageFields = model.fields.filter((f) => f.page === witnessIdx);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.setContent(
      `<!doctype html><body style="margin:0;background:#444;padding:24px;">${renderCanonicalPageHtml(packetPage, pageFields, {
        showInitials: false,
        renderFields: true,
      })}</body>`,
      { waitUntil: "domcontentloaded" },
    );
    const surface = page.locator(".vs01-sign-page-surface--canonical");
    await expect(surface.locator("[data-vs01-signature-execution-line]")).toHaveCount(2);
    await expect(surface.locator("[data-vs01-visual-field-type='initials']")).toHaveCount(0);
    await screenshotCanonicalSurface(
      page,
      surface,
      join(ARTIFACT_DIR, "vs01-test75-prepare-witness-signature-desktop-1440.png"),
    );
  });

  test("test75 signer review body initials visible (desktop-1440)", async ({ page }) => {
    const model = buildTest74VisualModel();
    const pageIndex = 0;
    const packetPage = model.pages[pageIndex]!;
    const pageFields = model.fields.filter((f) => f.page === pageIndex);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.setContent(
      `<!doctype html><body style="margin:0;background:#444;padding:24px;" data-testid="vs01-recipient-canonical-render">${renderCanonicalPageHtml(packetPage, pageFields, {
        showInitials: true,
        renderFields: true,
      })}</body>`,
      { waitUntil: "domcontentloaded" },
    );
    const surface = page.locator(".vs01-sign-page-surface--canonical");
    await expect(surface.locator("[data-vs01-visual-field-type='initials']")).toHaveCount(2);
    await expect(surface.getByText(/Draft Agreement \(non-binding template\)/i)).toHaveCount(0);
    await screenshotCanonicalSurface(
      page,
      surface,
      join(ARTIFACT_DIR, "vs01-test75-signer-review-body-initials-desktop-1440.png"),
    );
  });

  test("test75 signer review witness signature lines (desktop-1440)", async ({ page }) => {
    const model = buildTest74VisualModel();
    const witnessIdx = witnessPageIndex(model);
    const packetPage = model.pages[witnessIdx]!;
    const pageFields = model.fields.filter((f) => f.page === witnessIdx);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.setContent(
      `<!doctype html><body style="margin:0;background:#444;padding:24px;" data-testid="vs01-recipient-canonical-render">${renderCanonicalPageHtml(packetPage, pageFields, {
        showInitials: false,
        renderFields: true,
      })}</body>`,
      { waitUntil: "domcontentloaded" },
    );
    const surface = page.locator(".vs01-sign-page-surface--canonical");
    await expect(surface.locator("[data-vs01-signature-execution-line]")).toHaveCount(2);
    await expect(surface.locator("[data-vs01-visual-field-type='signature']")).toHaveCount(2);
    await screenshotCanonicalSurface(
      page,
      surface,
      join(ARTIFACT_DIR, "vs01-test75-signer-review-witness-signature-desktop-1440.png"),
    );
  });
});

test.describe("VS01 test76 cross-device signer canonical payload", () => {
  test("test76 signer review body initials visible without browser seed (desktop-1440)", async ({ page }) => {
    const model = buildTest74VisualModel();
    const seed = buildVs01CanonicalPacketSeed({
      documentId: "doc_test76",
      agreementId: "ag_visual_qa",
      corpusPlain: model.corpus,
    });
    expect(seed).not.toBeNull();
    const payload = encodeVs01CanonicalPacketPortable(
      buildVs01CanonicalPacketPortable({
        seed: seed!,
        fields: model.fields,
        roles: roles(),
        pageCount: model.pages.length,
        witnessPageIndex: witnessPageIndex(model),
      }),
    );
    expect(payload.length).toBeGreaterThan(1000);
    const pageIndex = 0;
    const packetPage = model.pages[pageIndex]!;
    const pageFields = model.fields.filter((f) => f.page === pageIndex);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("about:blank");
    await page.evaluate(() => {
      try {
        sessionStorage.clear();
        localStorage.clear();
      } catch {
        /* about:blank may not expose storage; the static page still has no seeded storage. */
      }
    });
    await page.setContent(
      `<!doctype html><body style="margin:0;background:#444;padding:24px;" data-testid="vs01-recipient-canonical-render" data-vs01-canonical-payload="url">${renderCanonicalPageHtml(packetPage, pageFields, {
        showInitials: true,
        renderFields: true,
      })}</body>`,
      { waitUntil: "domcontentloaded" },
    );
    const surface = page.locator(".vs01-sign-page-surface--canonical");
    await expect(page.getByTestId("vs01-recipient-canonical-render")).toHaveAttribute(
      "data-vs01-canonical-payload",
      "url",
    );
    await expect(surface.locator("[data-vs01-visual-field-type='initials']")).toHaveCount(2);
    await expect(surface.getByText(/Draft Agreement \(non-binding template\)/i)).toHaveCount(0);
    await screenshotCanonicalSurface(
      page,
      surface,
      join(ARTIFACT_DIR, "vs01-test76-cross-device-signer-body-initials-desktop-1440.png"),
    );
  });

  test("test76 signer review witness signature visible without browser seed (desktop-1440)", async ({ page }) => {
    const model = buildTest74VisualModel();
    const witnessIdx = witnessPageIndex(model);
    const packetPage = model.pages[witnessIdx]!;
    const pageFields = model.fields.filter((f) => f.page === witnessIdx);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("about:blank");
    await page.evaluate(() => {
      try {
        sessionStorage.clear();
        localStorage.clear();
      } catch {
        /* about:blank may not expose storage; the static page still has no seeded storage. */
      }
    });
    await page.setContent(
      `<!doctype html><body style="margin:0;background:#444;padding:24px;" data-testid="vs01-recipient-canonical-render" data-vs01-canonical-payload="url">${renderCanonicalPageHtml(packetPage, pageFields, {
        showInitials: false,
        renderFields: true,
      })}</body>`,
      { waitUntil: "domcontentloaded" },
    );
    const surface = page.locator(".vs01-sign-page-surface--canonical");
    await expect(page.getByTestId("vs01-recipient-canonical-render")).toHaveAttribute(
      "data-vs01-canonical-payload",
      "url",
    );
    await expect(surface.locator("[data-vs01-signature-execution-line]")).toHaveCount(2);
    await expect(surface.locator("[data-vs01-visual-field-type='signature']")).toHaveCount(2);
    await screenshotCanonicalSurface(
      page,
      surface,
      join(ARTIFACT_DIR, "vs01-test76-cross-device-signer-witness-signature-desktop-1440.png"),
    );
  });
});

test.describe("VS01 test77 prepare links and initials toggle", () => {
  test.beforeAll(() => {
    mkdirSync(ARTIFACT_DIR, { recursive: true });
  });

  test("test77 initials on prepare body (desktop-1440)", async ({ page }) => {
    const model = buildTest77VisualModel(true);
    expect(model.fields.some((f) => f.type === "initials")).toBe(true);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.setContent(
      buildTest77WorkspaceHtml({
        initialsEnabled: true,
        pageIndex: 0,
        showInitials: true,
        testId: "vs01-test77-prepare",
      }),
      { waitUntil: "domcontentloaded" },
    );
    const surface = page.locator(".vs01-sign-page-surface--canonical");
    const root = page.locator(".vs01-test77-app-shell");
    await assertTest77CanonicalSurface(page, surface, {
      pageKind: "body-initials-on",
      initialsEnabled: true,
    });
    await screenshotAppViewport(
      page,
      root,
      join(ARTIFACT_DIR, "vs01-test77-initials-on-prepare-body-desktop-1440.png"),
    );
  });

  test("test77 initials off prepare body (desktop-1440)", async ({ page }) => {
    const model = buildTest77VisualModel(false);
    expect(model.fields.some((f) => f.type === "initials")).toBe(false);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.setContent(
      buildTest77WorkspaceHtml({
        initialsEnabled: false,
        pageIndex: 0,
        showInitials: false,
        testId: "vs01-test77-prepare-off",
        workspaceLead: "Prepare — initials off (no initials in model)",
      }),
      { waitUntil: "domcontentloaded" },
    );
    const surface = page.locator(".vs01-sign-page-surface--canonical");
    const root = page.locator(".vs01-test77-app-shell");
    await assertTest77CanonicalSurface(page, surface, {
      pageKind: "body-initials-off",
      initialsEnabled: false,
    });
    await screenshotAppViewport(
      page,
      root,
      join(ARTIFACT_DIR, "vs01-test77-initials-off-prepare-body-desktop-1440.png"),
    );
  });

  test("test77 sender review body initials on (desktop-1440)", async ({ page }) => {
    const model = buildTest77VisualModel(true);
    const ownerFields = model.fields.filter(
      (f) => f.page === 0 && (f.assignedPartyIndex ?? 0) === 0,
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.setContent(
      buildTest77WorkspaceHtml({
        initialsEnabled: true,
        pageIndex: 0,
        fieldsForPage: ownerFields,
        highlightPartyIndex: 0,
        testId: "vs01-test77-sender-review",
        workspaceLead: "Sender review — owner initials only",
      }),
      { waitUntil: "domcontentloaded" },
    );
    const surface = page.locator(".vs01-sign-page-surface--canonical");
    const root = page.locator(".vs01-test77-app-shell");
    await assertTest77CanonicalSurface(page, surface, {
      pageKind: "sender-review",
      initialsEnabled: true,
    });
    await screenshotAppViewport(
      page,
      root,
      join(ARTIFACT_DIR, "vs01-test77-sender-review-body-initials-on-desktop-1440.png"),
    );
  });

  test("test77 counterparty review body initials on (desktop-1440)", async ({ page }) => {
    const model = buildTest77VisualModel(true);
    const cpFields = model.fields.filter(
      (f) => f.page === 0 && (f.assignedPartyIndex ?? 0) === 1,
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.setContent(
      buildTest77WorkspaceHtml({
        initialsEnabled: true,
        pageIndex: 0,
        fieldsForPage: cpFields,
        highlightPartyIndex: 1,
        testId: "vs01-test77-counterparty-review",
        workspaceLead: "Counterparty review — counterparty initials only",
      }),
      { waitUntil: "domcontentloaded" },
    );
    const surface = page.locator(".vs01-sign-page-surface--canonical");
    const root = page.locator(".vs01-test77-app-shell");
    await assertTest77CanonicalSurface(page, surface, {
      pageKind: "counterparty-review",
      initialsEnabled: true,
    });
    await screenshotAppViewport(
      page,
      root,
      join(ARTIFACT_DIR, "vs01-test77-counterparty-review-body-initials-on-desktop-1440.png"),
    );
  });

  test("test77 witness signature block (desktop-1440)", async ({ page }) => {
    buildTest77VisualModel(true);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.setContent(
      buildTest77WorkspaceHtml({
        initialsEnabled: true,
        witness: true,
        showInitials: false,
        renderFields: true,
        preparePlacementChrome: true,
        testId: "vs01-test77-witness",
        workspaceLead: "Prepare witness — signature fields aligned to By lines",
      }),
      { waitUntil: "domcontentloaded" },
    );
    const surface = page.locator(".vs01-sign-page-surface--canonical");
    const root = page.locator(".vs01-test77-app-shell");
    await assertTest77CanonicalSurface(page, surface, {
      pageKind: "prepare-witness",
      initialsEnabled: true,
    });
    await screenshotAppViewport(
      page,
      root,
      join(ARTIFACT_DIR, "vs01-test77-witness-signature-desktop-1440.png"),
    );
  });

  test("test77 prepare witness signature field overlays (desktop-1440)", async ({ page }) => {
    await renderTest77WitnessSignatureArtifact(page, {
      viewport: { width: 1440, height: 900 },
      fileLabel: "desktop-1440",
      pageKind: "prepare-witness",
      testId: "vs01-test77-prepare-witness-fields",
      workspaceLead: "Prepare witness — both signer signature fields",
      filename: "vs01-test77-prepare-witness-signature-fields-desktop-1440.png",
    });
  });

  test("test77 sender review witness signature field (desktop-1440)", async ({ page }) => {
    await renderTest77WitnessSignatureArtifact(page, {
      viewport: { width: 1440, height: 900 },
      fileLabel: "desktop-1440",
      pageKind: "sender-witness",
      fieldPartyIndex: 0,
      highlightPartyIndex: 0,
      testId: "vs01-test77-sender-witness-field",
      workspaceLead: "Sender review — owner signature field",
      filename: "vs01-test77-sender-review-witness-signature-field-desktop-1440.png",
    });
  });

  test("test77 counterparty review witness signature field (desktop-1440)", async ({ page }) => {
    await renderTest77WitnessSignatureArtifact(page, {
      viewport: { width: 1440, height: 900 },
      fileLabel: "desktop-1440",
      pageKind: "counterparty-witness",
      fieldPartyIndex: 1,
      highlightPartyIndex: 1,
      testId: "vs01-test77-counterparty-witness-field",
      workspaceLead: "Counterparty review — counterparty signature field",
      filename: "vs01-test77-counterparty-review-witness-signature-field-desktop-1440.png",
    });
  });

  test("test77 prepare witness signature field overlays (laptop-1280)", async ({ page }) => {
    await renderTest77WitnessSignatureArtifact(page, {
      viewport: { width: 1280, height: 800 },
      fileLabel: "laptop-1280",
      pageKind: "prepare-witness",
      testId: "vs01-test77-prepare-witness-fields",
      workspaceLead: "Prepare witness — both signer signature fields",
      filename: "vs01-test77-prepare-witness-signature-fields-laptop-1280.png",
    });
  });

  test("test77 sender review witness signature field (laptop-1280)", async ({ page }) => {
    await renderTest77WitnessSignatureArtifact(page, {
      viewport: { width: 1280, height: 800 },
      fileLabel: "laptop-1280",
      pageKind: "sender-witness",
      fieldPartyIndex: 0,
      highlightPartyIndex: 0,
      testId: "vs01-test77-sender-witness-field",
      workspaceLead: "Sender review — owner signature field",
      filename: "vs01-test77-sender-review-witness-signature-field-laptop-1280.png",
    });
  });

  test("test77 counterparty review witness signature field (laptop-1280)", async ({ page }) => {
    await renderTest77WitnessSignatureArtifact(page, {
      viewport: { width: 1280, height: 800 },
      fileLabel: "laptop-1280",
      pageKind: "counterparty-witness",
      fieldPartyIndex: 1,
      highlightPartyIndex: 1,
      testId: "vs01-test77-counterparty-witness-field",
      workspaceLead: "Counterparty review — counterparty signature field",
      filename: "vs01-test77-counterparty-review-witness-signature-field-laptop-1280.png",
    });
  });

  test("test77 initials off portable packet omits initials fields", () => {
    const r = test77Roles();
    const onModel = buildTest77VisualModel(true);
    const offModel = buildTest77VisualModel(false);
    const manifestOn = buildFullPacketManifestFromCanonicalModel({ model: onModel, roles: r });
    const manifestOff = buildFullPacketManifestFromCanonicalModel({ model: offModel, roles: r });
    expect(manifestOn.some((f) => f.type === "initials")).toBe(true);
    expect(manifestOff.some((f) => f.type === "initials")).toBe(false);
    const seed = buildVs01CanonicalPacketSeed({
      documentId: "doc_test77_visual",
      agreementId: "ag_visual_qa",
      corpusPlain: offModel.corpus,
    })!;
    const portable = buildVs01CanonicalPacketPortable({
      seed,
      fields: manifestOff,
      roles: r,
      pageCount: offModel.pages.length,
      witnessPageIndex: witnessPageIndex(offModel),
      initialsEnabled: false,
    });
    expect(portable.initialsPolicy.enabled).toBe(false);
    expect(portable.fields.some((f) => f.type === "initials")).toBe(false);
    const encoded = encodeVs01CanonicalPacketPortable(portable);
    expect(encoded).not.toMatch(/"type":"initials"/);
  });
});

function test78Roles(): Vs01PrepareSigningRole[] {
  return buildVs01PrepareSigningRoles({
    agreementId: "ag_visual_qa",
    creatorName: "Acme LLC",
    creatorEmail: "anthemhayek@gmail.com",
    ownerSignerName: "Anthem H Blanchard",
    ownerSignerTitle: "Manager",
    counterparties: [
      { id: "cp_ben", name: "Ben Davis", email: "ben@example.test", signerName: "Ben Davis" },
    ],
  });
}

function test78CorpusPlain(): string {
  return TEST77_REALISTIC_FINAL_CORPUS.replace(/Joe Brown/g, "Ben Davis");
}

function buildTest78VisualModel(initialsEnabled = true) {
  const model = buildVs01SigningPacketModel({
    mode: "guided_pro",
    authoritativeCorpusPlain: test78CorpusPlain(),
    roles: test78Roles(),
    corpusGateArgs: { freeBaselinePlain: STARTER_749 },
    initialsEnabled,
  });
  if (!model.allowed) {
    throw new Error(`Test78 model not allowed: ${model.diagnostics.validationErrors.join(", ")}`);
  }
  return model;
}

function renderRecipientCanonicalCompactFieldHtml(
  field: Vs01RecipientPlacedField,
  args: { roles: Vs01PrepareSigningRole[]; lockedPartyIndex: number },
): string {
  const css = normalizedPdfRectToCssPercent(field);
  const lockedRole = args.roles[args.lockedPartyIndex]!;
  const lockedCp = recipientCounterpartyIdForPrepareRole(lockedRole);
  const isMine = recipientFieldBelongsToLockedSigner(field, lockedCp, lockedRole.roleId);
  const autoClass = field.autoInitials ? " vs01-sign-placement-box--auto-initials" : "";
  const mineClass = isMine
    ? " vs01-recipient-signing-field--mine vs01-recipient-signing-field--editable"
    : " vs01-recipient-signing-field--other vs01-recipient-signing-field--locked";
  const pill = isMine ? "click-to-sign" : "waiting";
  const pillLabel = isMine ? "Click to sign" : "Waiting";
  const pillClass = isMine ? "vs01-recipient-signing-pill--action" : "vs01-recipient-signing-pill--waiting";
  const label = field.type === "signature" ? "Signature" : "Initials";
  const body =
    field.type === "initials"
      ? isMine
        ? `<input type="text" class="vs01-sign-field-inline-input vs01-recipient-signing-field__compact-input" value="" placeholder="Initials" aria-label="Initials" />`
        : `<span class="vs01-sign-placement-initials vs01-recipient-signing-readonly-val">—</span>`
      : isMine
        ? `<input type="text" class="vs01-sign-field-inline-input vs01-recipient-signing-field__compact-input" value="" placeholder="Type signature" aria-label="Signature" />`
        : `<span class="vs01-recipient-signing-pill ${pillClass}">${pillLabel}</span><span class="vs01-recipient-signing-readonly-val">—</span>`;
  return `<div class="lawdog-signing-field lawdog-signing-field--${field.type} vs01-sign-placement-box vs01-sign-placement-box--${field.type}${autoClass} vs01-recipient-signing-field vs01-recipient-signing-field--canonical-compact${mineClass}" data-vs01-recipient-field-type="${field.type}" data-vs01-recipient-field-role="${field.assignedSignerRoleKind ?? ""}" data-vs01-page-index="${field.page}" data-vs01-field-page="${field.page}" data-vs01-field-ready-state="${pill}" data-vs01-visual-field-type="${field.type}" data-vs01-visual-party-index="${field.assignedPartyIndex ?? 0}" style="position:absolute;left:${css.left};top:${css.top};width:${css.width};height:${css.height};z-index:${isMine ? 4 : 2};"><span class="vs01-sign-placement-label">${label}</span>${body}</div>`;
}

function renderRecipientSigningOverlaysHtml(
  pageFields: readonly Vs01RecipientPlacedField[],
  args: {
    roles: Vs01PrepareSigningRole[];
    lockedPartyIndex: number;
  },
): string {
  return pageFields
    .map((field) => renderRecipientCanonicalCompactFieldHtml(field, args))
    .join("");
}

function renderTest78RecipientPageHtml(
  page: Vs01SigningPacketPage,
  documentFields: readonly Vs01RecipientPlacedField[],
  args: {
    roles: Vs01PrepareSigningRole[];
    lockedPartyIndex: number;
  },
): string {
  const pageFields = documentFields.filter((f) => f.page === page.pageIndex);
  const overlayHtml = renderRecipientSigningOverlaysHtml(pageFields, {
    roles: args.roles,
    lockedPartyIndex: args.lockedPartyIndex,
  });
  const base = renderCanonicalPageHtml(page, [], { renderFields: false });
  return base.replace(
    '<div class="vs01-sign-overlay vs01-sign-overlay--placed" role="presentation"></div>',
    `<div class="vs01-sign-overlay vs01-sign-overlay--placed" role="presentation">${overlayHtml}</div>`,
  );
}

function buildTest78RecipientWorkspaceHtml(opts: {
  lockedPartyIndex: number;
  witness?: boolean;
  pageIndex?: number;
  initialsEnabled?: boolean;
  signerName: string;
  signerEmail: string;
  actionLabel: string;
  testId: string;
}): string {
  const roles = test78Roles();
  const model = buildTest78VisualModel(opts.initialsEnabled ?? true);
  const manifest = buildFullPacketManifestFromCanonicalModel({ model, roles });
  const documentFields = buildRecipientSigningDocumentFields({
    ownerRole: roles[0]!,
    roles,
    recipientPlacedFields: manifest,
    senderPlacedFields: [],
  });
  const witnessIdx = witnessPageIndex(model);
  const pageIndex = opts.witness ? witnessIdx : (opts.pageIndex ?? 0);
  const packetPage = model.pages[pageIndex] ?? model.pages[model.pages.length - 1]!;
  const pageMarkup = renderTest78RecipientPageHtml(packetPage, documentFields, {
    roles,
    lockedPartyIndex: opts.lockedPartyIndex,
  });
  const css = readFileSync(join(__dirname, "../src/vs01/vs01.css"), "utf8");
  const tokens = readFileSync(join(__dirname, "../src/vs01/vs01-tokens.css"), "utf8");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>${tokens}\n${css}</style>
</head>
<body style="margin:0;background:#0f172a;color:#e5e7eb;">
  <section class="vs01-recipient-signing-view vs01-sign-step vs01-test78-fixture" data-testid="${opts.testId}" data-vs01-test78-capture-root="true" style="max-width:1180px;margin:0 auto;padding:12px 16px 20px;box-sizing:border-box;">
    <header class="vs01-recipient-signing-header">
      <h2 class="vs01-card-title">Review and sign</h2>
      <p class="vs01-recipient-signing-subtitle">Complete your assigned fields below, then finish signing.</p>
      <p class="vs01-recipient-signing-signer">
        <span class="vs01-recipient-signing-name">${escapeHtml(opts.signerName)}</span>
        <span class="vs01-recipient-signing-sep" aria-hidden> · </span>
        <span class="vs01-recipient-signing-email">${escapeHtml(opts.signerEmail)}</span>
        <span class="vs01-recipient-signing-field-count" aria-hidden> · ${escapeHtml(opts.actionLabel)}</span>
      </p>
    </header>
    <div class="vs01-recipient-signing-doc-wrap">
      <div class="vs01-sign-page-bar" aria-label="Page navigation">
        <span class="vs01-sign-page-label">Page ${pageIndex + 1} of ${model.pages.length}</span>
      </div>
      <div class="vs01-sign-scroll vs01-recipient-signing-scroll">
        <div class="vs01-sign-doc-pages-wrap vs01-sign-doc-surface vs01-sign-doc-surface--bridge" data-testid="vs01-recipient-canonical-render">
          <div class="vs01-sign-pages-inner">${pageMarkup}</div>
        </div>
      </div>
    </div>
  </section>
</body>
</html>`;
}

async function expectRecipientBodyInitialsPlacement(surface: Locator): Promise<void> {
  const metrics = await surface.evaluate(() => {
    const page = document.querySelector(".vs01-sign-page-surface--canonical") as HTMLElement | null;
    const band = page?.querySelector(".vs01-canonical-initials-band") as HTMLElement | null;
    if (!page || !band) return null;
    const pageRect = page.getBoundingClientRect();
    const bandRect = band.getBoundingClientRect();
    const bandNorm = {
      x: (bandRect.left - pageRect.left) / pageRect.width,
      y: (bandRect.top - pageRect.top) / pageRect.height,
      width: bandRect.width / pageRect.width,
      height: bandRect.height / pageRect.height,
    };
    const pxRect = (el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      return {
        left: r.left - pageRect.left,
        top: r.top - pageRect.top,
        right: r.right - pageRect.left,
        bottom: r.bottom - pageRect.top,
        width: r.width,
        height: r.height,
      };
    };
    const intersects = (
      a: { left: number; top: number; right: number; bottom: number },
      b: { left: number; top: number; right: number; bottom: number },
    ) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

    const initials = [...page.querySelectorAll("[data-vs01-visual-field-type='initials']")] as HTMLElement[];
    const bodyText = [...page.querySelectorAll("[data-vs01-canonical-text]")].map(pxRect);
    return initials.map((node) => {
      const field = pxRect(node);
      const inBand =
        field.left >= bandNorm.x * pageRect.width - 2 &&
        field.top >= bandNorm.y * pageRect.height - 2 &&
        field.right <= (bandNorm.x + bandNorm.width) * pageRect.width + 2 &&
        field.bottom <= (bandNorm.y + bandNorm.height) * pageRect.height + 2;
      const bodyHits = bodyText.filter((text) => intersects(field, text)).length;
      return { inBand, bodyHits, width: field.width, height: field.height };
    });
  });
  expect(metrics).not.toBeNull();
  expect(metrics!.length).toBeGreaterThan(0);
  for (const item of metrics!) {
    expect(item.inBand).toBe(true);
    expect(item.bodyHits).toBe(0);
    expect(item.width).toBeGreaterThanOrEqual(40);
    expect(item.height).toBeGreaterThanOrEqual(16);
    expect(item.height).toBeLessThanOrEqual(48);
  }
}

async function renderTest78RecipientArtifact(
  page: Page,
  args: {
    viewport: { width: number; height: number };
    filename: string;
    lockedPartyIndex: number;
    witness: boolean;
    initialsEnabled?: boolean;
    signerName: string;
    signerEmail: string;
    actionLabel: string;
    testId: string;
  },
): Promise<void> {
  const initialsEnabled = args.initialsEnabled ?? true;
  await page.setViewportSize({
    width: args.viewport.width,
    height: Math.max(
      args.viewport.height,
      VS01_PACKET_PAGE_HEIGHT_PT + 220,
    ),
  });
  await page.setContent(
    buildTest78RecipientWorkspaceHtml({
      lockedPartyIndex: args.lockedPartyIndex,
      witness: args.witness,
      initialsEnabled,
      signerName: args.signerName,
      signerEmail: args.signerEmail,
      actionLabel: args.actionLabel,
      testId: args.testId,
    }),
    { waitUntil: "domcontentloaded" },
  );
  await ensureTest78CaptureOverflowVisible(page);
  const surface = page.locator(".vs01-sign-page-surface--canonical");
  const captureRoot = page.locator(`[data-testid="${args.testId}"]`);
  await expect(surface).toBeVisible();
  await expect(captureRoot).toBeVisible();

  await assertCanonicalPageFullyVisible(page, surface, captureRoot, {
    witness: args.witness,
    initialsEnabled,
  });

  if (args.witness) {
    const sigCount = await surface.locator("[data-vs01-visual-field-type='signature']").count();
    expect(sigCount).toBeGreaterThanOrEqual(1);
    await expectVisualFieldsInsidePage(surface, "[data-vs01-visual-field-type='signature']");
    await expectWitnessSignatureOverlayGeometry(surface, sigCount);
  } else {
    expect(initialsEnabled).toBe(true);
    await expectRecipientBodyInitialsPlacement(surface);
    await expectVisualFieldsInsidePage(surface, "[data-vs01-visual-field-type='initials']");
  }

  await screenshotTest78RecipientArtifact(
    page,
    captureRoot,
    surface,
    join(ARTIFACT_DIR, args.filename),
  );
}

test.describe("VS01 test78 recipient signing review placement", () => {
  test.beforeAll(() => {
    mkdirSync(ARTIFACT_DIR, { recursive: true });
  });

  const viewports = [
    { width: 1440, height: 900, label: "desktop-1440" },
    { width: 1280, height: 800, label: "laptop-1280" },
  ] as const;

  for (const viewport of viewports) {
    test(`test78 owner body initials (${viewport.label})`, async ({ page }) => {
      await renderTest78RecipientArtifact(page, {
        viewport,
        filename: `vs01-test78-recipient-owner-body-initials-${viewport.label}.png`,
        lockedPartyIndex: 0,
        witness: false,
        signerName: "Owner",
        signerEmail: "anthemhayek@gmail.com",
        actionLabel: "4 actions required (signature and initials on document pages)",
        testId: `vs01-test78-owner-body-${viewport.label}`,
      });
    });

    test(`test78 counterparty body initials (${viewport.label})`, async ({ page }) => {
      await renderTest78RecipientArtifact(page, {
        viewport,
        filename: `vs01-test78-recipient-counterparty-body-initials-${viewport.label}.png`,
        lockedPartyIndex: 1,
        witness: false,
        signerName: "Ben Davis",
        signerEmail: "ben@example.test",
        actionLabel: "4 actions required (signature and initials on document pages)",
        testId: `vs01-test78-counterparty-body-${viewport.label}`,
      });
    });

    test(`test78 owner witness signature (${viewport.label})`, async ({ page }) => {
      await renderTest78RecipientArtifact(page, {
        viewport,
        filename: `vs01-test78-recipient-owner-witness-signature-${viewport.label}.png`,
        lockedPartyIndex: 0,
        witness: true,
        signerName: "Owner",
        signerEmail: "anthemhayek@gmail.com",
        actionLabel: "4 actions required (signature and initials on document pages)",
        testId: `vs01-test78-owner-witness-${viewport.label}`,
      });
    });

    test(`test78 counterparty witness signature (${viewport.label})`, async ({ page }) => {
      await renderTest78RecipientArtifact(page, {
        viewport,
        filename: `vs01-test78-recipient-counterparty-witness-signature-${viewport.label}.png`,
        lockedPartyIndex: 1,
        witness: true,
        signerName: "Ben Davis",
        signerEmail: "ben@example.test",
        actionLabel: "4 actions required (signature and initials on document pages)",
        testId: `vs01-test78-counterparty-witness-${viewport.label}`,
      });
    });
  }
});

type Test79SignerCase = {
  label: "owner" | "counterparty";
  partyIndex: 0 | 1;
  ownerSigned: boolean;
  signerName: string;
  signerEmail: string;
  initialsValue: string;
  signatureValue: string;
};

function buildTest79RecipientContext(args: { ownerSigned: boolean; partyIndex: 0 | 1 }) {
  const roles = test78Roles();
  const model = buildTest78VisualModel(true);
  const witnessIdx = witnessPageIndex(model);
  const agreementId = "ag_test79_actual_recipient";
  const documentId = `doc_test79_${args.partyIndex}_${args.ownerSigned ? "owner_signed" : "active"}`;
  const fields = buildFullPacketManifestFromCanonicalModel({ model, roles }).map((f) => {
    if (!args.ownerSigned || (f.assignedPartyIndex ?? 0) !== 0) return f;
    if (f.type === "signature") return { ...f, value: "Anthem H Blanchard" };
    if (f.type === "initials") return { ...f, value: "AHB" };
    return f;
  });
  const seed = buildVs01CanonicalPacketSeed({
    documentId,
    agreementId,
    corpusPlain: model.corpus,
  });
  if (!seed) throw new Error("test79 seed build failed");
  const portable = buildVs01CanonicalPacketPortable({
    seed,
    fields,
    roles,
    pageCount: model.pages.length,
    witnessPageIndex: witnessIdx,
    initialsEnabled: true,
  });
  const encoded = encodeVs01CanonicalPacketPortable(portable);
  const packetRevision = computeVs01PacketRevision({
    corpusHash: seed.corpusHash,
    initialsEnabled: portable.initialsPolicy.enabled,
    fieldCount: portable.fieldCount,
  });
  const role = roles[args.partyIndex]!;
  const cpId = recipientCounterpartyIdForPrepareRole(role);
  const params = new URLSearchParams();
  params.set(VS01_RECIPIENT_SIGN_QUERY, "1");
  params.set("recipient_index", String(args.partyIndex));
  params.set("recipient_name", role.signerName || role.partyName || role.roleLabel);
  params.set("recipient_email", role.signerEmail || "");
  params.set("counterparty_id", cpId);
  params.set("document_id", documentId);
  params.set("receipt_id", `rcpt_${documentId}`);
  params.set("agreement_id", agreementId);
  params.set("signer_role_id", role.roleId);
  params.set("assigned_party_index", String(args.partyIndex));
  params.set(VS01_PACKET_REVISION_QUERY, packetRevision);
  params.set(VS01_CANONICAL_PACKET_QUERY, encoded);

  return {
    agreementId,
    documentId,
    fields,
    model,
    params,
    role,
    roles,
    witnessIdx,
  };
}

async function gotoTest79RecipientSigningView(
  page: Page,
  args: Test79SignerCase,
) {
  const ctx = buildTest79RecipientContext({
    ownerSigned: args.ownerSigned,
    partyIndex: args.partyIndex,
  });
  const ownerRole = ctx.roles[0]!;
  const counterpartyRole = ctx.roles[1]!;
  await page.addInitScript(
    ({ agreementId, ownerRoleId, counterpartyRoleId, ownerSigned }) => {
      localStorage.setItem(
        `vs01_signing_packet_status_v1:${agreementId}`,
        JSON.stringify({
          agreementId,
          updatedAt: new Date().toISOString(),
          bySignerKey: {
            [ownerRoleId]: ownerSigned ? "signed" : "opened",
            [counterpartyRoleId]: "opened",
          },
          fullySigned: false,
        }),
      );
    },
    {
      agreementId: ctx.agreementId,
      ownerRoleId: ownerRole.roleId,
      counterpartyRoleId: counterpartyRole.roleId,
      ownerSigned: args.ownerSigned,
    },
  );

  await page.goto(`/app/esign/${ctx.documentId}?${ctx.params.toString()}`);
  await expect(page.getByTestId("vs01-recipient-canonical-render")).toBeVisible({ timeout: 15_000 });
  await page.addStyleTag({
    content: `
      .vs01-recipient-signing-shell,
      .vs01-recipient-signing-view,
      .vs01-recipient-signing-view .vs01-sign-scroll,
      .vs01-recipient-signing-view .vs01-recipient-signing-scroll,
      .vs01-recipient-signing-view .vs01-sign-doc-pages-wrap,
      .vs01-recipient-signing-view .vs01-sign-doc-surface--bridge,
      .vs01-recipient-signing-view .vs01-sign-pages-inner {
        max-height: none !important;
        overflow: visible !important;
      }
    `,
  });
  return ctx;
}

async function fillTest79ActiveFields(
  page: Page,
  args: Test79SignerCase & { pageIndex: number; witness: boolean },
): Promise<void> {
  const pageStack = page.locator(`[data-vs01-sign-page="${args.pageIndex}"]`);
  await expect(pageStack).toBeVisible();
  await pageStack.scrollIntoViewIfNeeded();
  if (args.witness) {
    const input = pageStack
      .locator('[data-vs01-field-type="signature"][data-vs01-field-state="active"] input')
      .first();
    await input.fill(args.signatureValue);
  } else {
    const input = pageStack
      .locator('[data-vs01-field-type="initials"][data-vs01-field-state="active"] input')
      .first();
    await input.fill(args.initialsValue);
  }
}

function parseRgbForTest79(color: string): { r: number; g: number; b: number } | null {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return null;
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
}

async function assertTest79ActualOverlayGeometry(
  pageStack: Locator,
  expectedFields: readonly Vs01RecipientPlacedField[],
  opts: { witness: boolean },
): Promise<void> {
  const expectedById = Object.fromEntries(
    expectedFields.map((f) => [
      f.id,
      {
        id: f.id,
        type: f.type,
        partyIndex: f.assignedPartyIndex ?? 0,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
      },
    ]),
  );
  const metrics = await pageStack.evaluate((stackEl, expected) => {
    const stack = stackEl as HTMLElement;
    const page = stack.querySelector(".vs01-sign-page-surface--canonical") as HTMLElement | null;
    if (!page) return { ok: false as const, reason: "missing-page" };
    const pageRect = page.getBoundingClientRect();
    const captureRect = stack.getBoundingClientRect();
    const band = page.querySelector(".vs01-canonical-initials-band") as HTMLElement | null;
    const bandRect = band?.getBoundingClientRect() ?? null;
    const pxRect = (el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      return {
        left: r.left - pageRect.left,
        top: r.top - pageRect.top,
        right: r.right - pageRect.left,
        bottom: r.bottom - pageRect.top,
        width: r.width,
        height: r.height,
        centerY: r.top - pageRect.top + r.height / 2,
      };
    };
    const intersects = (
      a: { left: number; top: number; right: number; bottom: number },
      b: { left: number; top: number; right: number; bottom: number },
      tolerancePx = 0,
    ) =>
      a.left < b.right - tolerancePx &&
      a.right > b.left + tolerancePx &&
      a.top < b.bottom - tolerancePx &&
      a.bottom > b.top + tolerancePx;
    const expectedMap = expected as Record<
      string,
      { id: string; type: string; partyIndex: number; x: number; y: number; width: number; height: number }
    >;
    const bodyTextRects = [...page.querySelectorAll("[data-vs01-canonical-text]")].map(pxRect);
    const bodyTextBottom = Math.max(0, ...bodyTextRects.map((r) => r.bottom));
    const fields = [...page.querySelectorAll("[data-vs01-field-id]")].map((node) => {
      const el = node as HTMLElement;
      const id = el.getAttribute("data-vs01-field-id") ?? "";
      const exp = expectedMap[id];
      const rect = pxRect(el);
      const expectedRect = exp
        ? {
            left: exp.x * pageRect.width,
            top: exp.y * pageRect.height,
            right: (exp.x + exp.width) * pageRect.width,
            bottom: (exp.y + exp.height) * pageRect.height,
            width: exp.width * pageRect.width,
            height: exp.height * pageRect.height,
            centerY: (exp.y + exp.height / 2) * pageRect.height,
          }
        : null;
      const input = el.querySelector("input") as HTMLElement | null;
      const inputRect = input ? pxRect(input) : null;
      const textNode =
        input ??
        (el.querySelector(".vs01-recipient-signing-readonly-val, .vs01-sign-placement-initials") as HTMLElement | null) ??
        el;
      const color = getComputedStyle(textNode).color;
      const underline = page.querySelector(
        `[data-vs01-signature-execution-line][data-vs01-signature-party="${exp?.partyIndex ?? 0}"] .vs01-canonical-signature-underline`,
      );
      const underlineRect = underline ? pxRect(underline) : null;
      const topPct = Number.parseFloat(el.style.top) / 100;
      const heightPct = Number.parseFloat(el.style.height) / 100;
      const anchoredBottom =
        Number.isFinite(topPct) && Number.isFinite(heightPct)
          ? (topPct + heightPct) * pageRect.height
          : rect.bottom;
      const protectedText = bodyTextRects.filter((_, i) => {
        const node = page.querySelectorAll("[data-vs01-canonical-text]")[i];
        const text = (node?.textContent ?? "").trim();
        return /^(CLIENT|SERVICE PROVIDER|Name|Title|Date)\b|^(Acme LLC|Ben Davis|Anthem H Blanchard|ABC LLC|Joe Blow)\b/i.test(text);
      });
      return {
        id,
        type: el.getAttribute("data-vs01-field-type"),
        state: el.getAttribute("data-vs01-field-state"),
        partyIndex: el.getAttribute("data-vs01-assigned-party-index"),
        rect,
        expectedRect,
        pageWidth: pageRect.width,
        pageHeight: pageRect.height,
        insidePage:
          rect.left >= -1 &&
          rect.top >= -1 &&
          rect.right <= pageRect.width + 1 &&
          rect.bottom <= pageRect.height + 1,
        expansion:
          expectedRect == null
            ? null
            : Math.max(
                Math.abs(rect.left - expectedRect.left),
                Math.abs(rect.top - expectedRect.top),
                Math.abs(rect.width - expectedRect.width),
                Math.abs(rect.height - expectedRect.height),
              ),
        inputInside:
          !inputRect ||
          (inputRect.left >= rect.left - 1 &&
            inputRect.top >= rect.top - 1 &&
            inputRect.right <= rect.right + 1 &&
            inputRect.bottom <= rect.bottom + 1),
        color,
        signature: underlineRect
          ? {
              leftDelta: rect.left - underlineRect.left,
              centerDelta: rect.centerY - underlineRect.centerY,
              baselineDelta: anchoredBottom - underlineRect.bottom,
              layoutBottomDelta: rect.bottom - underlineRect.bottom,
              protectedHits: protectedText.filter((text) => intersects(rect, text, 1.25)).length,
            }
          : null,
        initials: bandRect
          ? {
              belowBody: rect.top >= bodyTextBottom - 1,
              inBand:
                rect.top >= bandRect.top - pageRect.top - 2 &&
                rect.bottom <= bandRect.bottom - pageRect.top + 2,
              abovePageBottom: rect.bottom <= pageRect.height + 1,
            }
          : null,
      };
    });
    return {
      ok: true as const,
      page: {
        width: pageRect.width,
        height: pageRect.height,
        top: pageRect.top - captureRect.top,
        bottom: pageRect.bottom - captureRect.top,
        captureHeight: captureRect.height,
        bottomVisible: pageRect.bottom <= captureRect.bottom + 1,
      },
      fields,
    };
  }, expectedById);

  expect(metrics.ok).toBe(true);
  if (!metrics.ok) return;
  expect(metrics.page.width).toBeGreaterThanOrEqual(VS01_PACKET_PAGE_WIDTH_PT - 2);
  expect(metrics.page.height).toBeGreaterThanOrEqual(VS01_PACKET_PAGE_HEIGHT_PT - 2);
  expect(metrics.page.bottomVisible).toBe(true);
  for (const item of metrics.fields) {
    expect(item.expectedRect, `missing expected model rect for ${item.id}`).not.toBeNull();
    expect(item.insidePage, `${item.id} inside page`).toBe(true);
    if (item.type === "signature") {
      expect(item.signature, `${item.id} has underline`).not.toBeNull();
      expect(item.signature!.leftDelta, `${item.id} left edge vs underline`).toBeGreaterThanOrEqual(-2);
      expect(item.signature!.baselineDelta, `${item.id} baseline`).not.toBeNull();
      // Active recipient fields: shell placement bounds (not signed ink baseline).
      expect(item.signature!.baselineDelta!).toBeGreaterThanOrEqual(-VS01_SIGNATURE_SIGNED_INK_MAX_OVERLAP_BELOW_PX);
      expect(item.signature!.baselineDelta!).toBeLessThanOrEqual(
        VS01_SIGNATURE_ACTIVE_SHELL_MAX_CLEARANCE_ABOVE_PX,
      );
      expect(item.signature!.protectedHits, `${item.id} protected text hits`).toBe(0);
    } else {
      expect(item.expansion, `${item.id} expansion`).not.toBeNull();
      expect(item.expansion!, `${item.id} expands beyond model rect`).toBeLessThanOrEqual(2);
    }
    expect(item.inputInside, `${item.id} input inside field`).toBe(true);
    const rgb = parseRgbForTest79(item.color);
    expect(rgb, `${item.id} readable color ${item.color}`).not.toBeNull();
    expect(Math.max(rgb!.r, rgb!.g, rgb!.b), `${item.id} text too close to white`).toBeLessThan(230);
    if (item.type === "initials") {
      expect(item.initials, `${item.id} initials band`).not.toBeNull();
      expect(item.initials!.belowBody, `${item.id} below body text`).toBe(true);
      expect(item.initials!.inBand, `${item.id} in initials band`).toBe(true);
      expect(item.initials!.abovePageBottom, `${item.id} above page bottom`).toBe(true);
    }
  }
  if (opts.witness) {
    expect(metrics.fields.every((f) => f.type !== "initials")).toBe(true);
  } else {
    expect(metrics.fields.some((f) => f.type === "initials")).toBe(true);
  }
}

async function screenshotTest79PageStack(pageStack: Locator, path: string): Promise<void> {
  await pageStack.scrollIntoViewIfNeeded();
  await expect(pageStack.locator(".vs01-sign-page-surface--canonical")).toBeVisible();
  await pageStack.screenshot({ path, timeout: 15_000 });
}

async function renderTest79ActualRecipientArtifact(
  page: Page,
  args: Test79SignerCase & {
    viewport: { width: number; height: number; label: string };
    witness: boolean;
    filename: string;
  },
): Promise<void> {
  await page.setViewportSize({
    width: args.viewport.width,
    height: Math.max(args.viewport.height, VS01_PACKET_PAGE_HEIGHT_PT + 180),
  });
  const ctx = await gotoTest79RecipientSigningView(page, args);
  const pageIndex = args.witness ? ctx.witnessIdx : 0;
  await fillTest79ActiveFields(page, { ...args, pageIndex });

  const pageStack = page.locator(`[data-vs01-sign-page="${pageIndex}"]`);
  const expectedFields = ctx.fields.filter((f) => f.page === pageIndex);
  await assertTest79ActualOverlayGeometry(pageStack, expectedFields, { witness: args.witness });
  await screenshotTest79PageStack(pageStack, join(ARTIFACT_DIR, args.filename));
}

test.describe("VS01 test79 actual recipient signing path placement", () => {
  test.beforeAll(() => {
    mkdirSync(ARTIFACT_DIR, { recursive: true });
  });

  const viewports = [
    { width: 1440, height: 900, label: "desktop-1440" },
    { width: 1280, height: 800, label: "laptop-1280" },
  ] as const;
  const owner: Test79SignerCase = {
    label: "owner",
    partyIndex: 0,
    ownerSigned: false,
    signerName: "Owner",
    signerEmail: "anthemhayek@gmail.com",
    initialsValue: "AHB",
    signatureValue: "Anthem H Blanchard",
  };
  const counterparty: Test79SignerCase = {
    label: "counterparty",
    partyIndex: 1,
    ownerSigned: true,
    signerName: "Ben Davis",
    signerEmail: "ben@example.test",
    initialsValue: "BD",
    signatureValue: "Ben Davis",
  };

  for (const viewport of viewports) {
    test(`test79 owner body initials active (${viewport.label})`, async ({ page }) => {
      await renderTest79ActualRecipientArtifact(page, {
        ...owner,
        viewport,
        witness: false,
        filename: `vs01-test79-owner-body-initials-active-${viewport.label}.png`,
      });
    });

    test(`test79 owner witness signature active (${viewport.label})`, async ({ page }) => {
      await renderTest79ActualRecipientArtifact(page, {
        ...owner,
        viewport,
        witness: true,
        filename: `vs01-test79-owner-witness-signature-active-${viewport.label}.png`,
      });
    });

    test(`test79 counterparty body initials active after owner signed (${viewport.label})`, async ({ page }) => {
      await renderTest79ActualRecipientArtifact(page, {
        ...counterparty,
        viewport,
        witness: false,
        filename: `vs01-test79-counterparty-body-initials-active-after-owner-signed-${viewport.label}.png`,
      });
    });

    test(`test79 counterparty witness signature active after owner signed (${viewport.label})`, async ({ page }) => {
      await renderTest79ActualRecipientArtifact(page, {
        ...counterparty,
        viewport,
        witness: true,
        filename: `vs01-test79-counterparty-witness-signature-active-after-owner-signed-${viewport.label}.png`,
      });
    });
  }
});

test.describe("VS01 visual stabilization matrix", () => {
  test.beforeAll(() => {
    mkdirSync(ARTIFACT_DIR, { recursive: true });
  });

  const matrixViewports = [
    { width: 390, height: 844, label: "iphone-390" },
    { width: 844, height: 390, label: "iphone-844-landscape" },
    { width: 1280, height: 800, label: "laptop-1280" },
    { width: 1440, height: 900, label: "desktop-1440" },
  ] as const;

  for (const viewport of matrixViewports) {
    test(`prepare witness optical alignment (${viewport.label})`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.setContent(
        buildTest77WorkspaceHtml({
          initialsEnabled: true,
          witness: true,
          showInitials: false,
          renderFields: true,
          preparePlacementChrome: true,
          testId: `vs01-matrix-prepare-${viewport.label}`,
          workspaceLead: "Prepare signature links",
        }),
        { waitUntil: "domcontentloaded" },
      );
      const surface = page.locator(".vs01-sign-page-surface--canonical");
      await expect(surface).toBeVisible();
      await expectWitnessSignatureOverlayGeometry(surface, 2);
      await expectExecutionBlockDensity(surface);
      await expectCanonicalPageLayoutStable(surface);
      await screenshotCanonicalSurface(
        page,
        surface,
        join(ARTIFACT_DIR, `vs01-matrix-prepare-witness-${viewport.label}.png`),
      );
    });

    test(`signed witness page density (${viewport.label})`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.setContent(buildPrepareWorkspaceHtml({ signed: true }), { waitUntil: "domcontentloaded" });
      const surface = page.locator(".vs01-sign-page-surface--canonical");
      await expect(surface).toBeVisible();
      await expect(surface.locator("[data-vs01-visual-completed-signature]")).toHaveCount(2);
      await expectSignedWitnessSignatureComposition(surface);
      await expectExecutionBlockDensity(surface);
      await expectCanonicalPageLayoutStable(surface);
      await screenshotCanonicalSurface(
        page,
        surface,
        join(ARTIFACT_DIR, `vs01-matrix-signed-witness-${viewport.label}.png`),
      );
    });
  }

  test("recipient signing witness optical alignment (laptop-1280)", async ({ page }) => {
    await renderTest78RecipientArtifact(page, {
      viewport: { width: 1280, height: 800, label: "laptop-1280" },
      filename: "vs01-matrix-recipient-witness-laptop-1280.png",
      lockedPartyIndex: 1,
      witness: true,
      signerName: "Counterparty",
      signerEmail: "jb34@me.com",
      actionLabel: "Sign witness page",
      testId: "vs01-matrix-recipient-witness-laptop-1280",
    });
  });
});

test.describe("VS01 test74 repaired corpus visual", () => {
  test("test74 repaired corpus keeps initials in band on body page (desktop-1440)", async ({ page }) => {
    const model = buildTest74VisualModel();
    assertInitialsModelGeometry(model);
    const pageIndex = 0;
    const packetPage = model.pages[pageIndex]!;
    const pageFields = model.fields.filter((f) => f.page === pageIndex);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.setContent(
      `<!doctype html><body style="margin:0;background:#444;padding:24px;">${renderCanonicalPageHtml(packetPage, pageFields, {
        showInitials: true,
        renderFields: true,
      })}</body>`,
      { waitUntil: "domcontentloaded" },
    );
    const surface = page.locator(".vs01-sign-page-surface--canonical");
    await expect(surface.locator("[data-vs01-visual-field-type='initials']")).toHaveCount(2);
    await screenshotCanonicalSurface(
      page,
      surface,
      join(ARTIFACT_DIR, "vs01-test74-body-initials-desktop-1440.png"),
    );
  });
});
