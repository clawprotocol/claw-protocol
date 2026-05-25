import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildVs01PrepareSigningRoles } from "../src/vs01/vs01SignerFieldAssignment";
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

function renderCanonicalPageHtml(
  page: Vs01SigningPacketPage,
  fields: readonly PlacedSigningField[],
  opts: { signed?: boolean; showInitials?: boolean; renderFields?: boolean } = {},
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

  const fieldBoxesHtml = (opts.renderFields === false ? [] : fields)
    .filter((f) => f.page === page.pageIndex)
    .map((field) => {
      const css = normalizedPdfRectToCssPercent(field);
      const autoClass = field.autoInitials ? " vs01-sign-placement-box--auto-initials" : "";
      const signedValue = opts.signed ? completedSignatureText(field) : "";
      const initialsValue = completedInitialsText(field);
      const signedStyle =
        field.type === "signature" && signedValue
          ? "display:flex;align-items:center;justify-content:center;font-family:'Brush Script MT','Segoe Script','Snell Roundhand',cursive;font-size:min(17px,13cqw);line-height:1;color:#111827;font-weight:500;letter-spacing:0.01em;white-space:nowrap;overflow:hidden;text-overflow:clip;"
          : "";
      const initialsStyle =
        field.type === "initials" && initialsValue
          ? "display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:11px;line-height:1;color:#0f172a;font-weight:700;letter-spacing:0.05em;white-space:nowrap;overflow:hidden;text-overflow:clip;"
          : "";
      const signedMarkup = signedValue
        ? `<span class="vs01-visual-completed-signature" data-vs01-visual-completed-signature="${field.assignedPartyIndex ?? ""}" style="display:block;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:clip;">${escapeHtml(signedValue)}</span>`
        : "";
      const initialsMarkup = initialsValue
        ? `<span class="vs01-visual-completed-initials" data-vs01-visual-completed-initials="${field.assignedPartyIndex ?? ""}">${escapeHtml(initialsValue)}</span>`
        : "";
      return `<div class="vs01-sign-placement-box vs01-sign-placement-box--${field.type}${autoClass}" data-vs01-visual-field-type="${field.type}" data-vs01-visual-party-index="${field.assignedPartyIndex ?? ""}" style="position:absolute;left:${css.left};top:${css.top};width:${css.width};height:${css.height};${signedStyle}${initialsStyle}">${signedMarkup}${initialsMarkup}</div>`;
    })
    .join("");

  return `<div class="vs01-sign-page-surface vs01-sign-page-surface--footer-safe vs01-sign-page-surface--canonical" style="width:${VS01_PACKET_PAGE_WIDTH_PT}px;height:${VS01_PACKET_PAGE_HEIGHT_PT}px;position:relative;">
  <div class="vs01-canonical-page-content" data-vs01-canonical-layout-mode="flow" aria-label="Canonical signing page ${page.pageIndex + 1}">
    <div class="vs01-canonical-flow-body" style="left:${pct(contentRect.x)};top:${pct(contentRect.y)};width:${pct(contentRect.width)};height:${pct(contentRect.height)};font-size:${fontSizePx}px;line-height:${lineHeightPx}px;--vs01-canonical-line-height:${lineHeightPx}px;">
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

test.describe("VS01 canonical visual regression", () => {
  test.beforeAll(() => {
    mkdirSync(ARTIFACT_DIR, { recursive: true });
  });

  for (const viewport of [
    { width: 390, height: 844, label: "iphone-390" },
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
