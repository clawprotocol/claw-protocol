/**
 * FINAL VS01 VISUAL CONSTANTS — FROZEN (signature baseline correction)
 *
 * Signed ink sits above the underline stroke; descenders may kiss the line.
 * Do not tune ad hoc — change only with full Playwright visual matrix verification.
 */

import {
  VS01_PACKET_PAGE_HEIGHT_PT,
  VS01_PACKET_PAGE_WIDTH_PT,
} from "./vs01PacketLayoutConstants";

/** Canonical page box (612×792 pt letter). */
export const VS01_VISUAL_PAGE_WIDTH_PT = VS01_PACKET_PAGE_WIDTH_PT;
export const VS01_VISUAL_PAGE_HEIGHT_PT = VS01_PACKET_PAGE_HEIGHT_PT;

// ── Signature overlay shell (DOM-anchored; corpus fallback rects unchanged) ──

/** Normalized overlay shell height @ 1:1 (~22px). */
export const VS01_SIGNATURE_OVERLAY_HEIGHT_NORM = 0.0278;

/** Playwright shell height ceiling @ 1:1 (px). */
export const VS01_SIGNATURE_SHELL_MAX_HEIGHT_PX = 22;

/** Playwright shell height floor @ 1:1 (px). */
export const VS01_SIGNATURE_SHELL_MIN_HEIGHT_PX = 18;

/**
 * Fraction of shell extending below underline baseline.
 * Keep minimal — signed ink descenders reach the stroke via CSS bias, not shell hang.
 */
export const VS01_SIGNATURE_BELOW_LINE_FRAC = 0.14;

/** Post-measurement shell Y nudge (px @ 1:1; negative raises shell onto stroke). */
export const VS01_SIGNATURE_OPTICAL_OFFSET_PX = 1;

export const VS01_SIGNATURE_OPTICAL_OFFSET_NORM =
  VS01_SIGNATURE_OPTICAL_OFFSET_PX / VS01_VISUAL_PAGE_HEIGHT_PT;

/** Active/prepare ink baseline bias within shell (px down). */
export const VS01_SIGNATURE_INK_BASELINE_BIAS_PX = 2;

/** Signed ink baseline bias within shell (px; negative raises ink above underline). */
export const VS01_SIGNATURE_SIGNED_INK_BIAS_PX = -5;

/** Signed ink font size @ 1:1 page scale (px). */
export const VS01_SIGNATURE_SIGNED_INK_FONT_PX = 22;

/** Signed ink font weight (CSS numeric). */
export const VS01_SIGNATURE_SIGNED_INK_FONT_WEIGHT = 620;

/** Left inset from underline start as fraction of underline width (~2px @ 190px). */
export const VS01_SIGNATURE_FIELD_LEFT_INSET_FRAC = 0.012;

/** Target field width as fraction of measured underline (left-anchored, wide occupancy). */
export const VS01_SIGNATURE_FIELD_WIDTH_TARGET_FRAC = 0.88;

export const VS01_SIGNATURE_FIELD_WIDTH_MIN_FRAC = 0.78;

export const VS01_SIGNATURE_FIELD_WIDTH_MAX_FRAC = 0.92;

/** Minimum gap from signed ink bottom to Name: row (px @ 1:1). */
export const VS01_SIGNATURE_NAME_ROW_MIN_GAP_PX = 4;

/** Max px signed ink bottom may extend below underline (light descender kiss). */
export const VS01_SIGNATURE_SIGNED_INK_MAX_OVERLAP_BELOW_PX = 1;

/** Max px signed ink bottom sits above underline (prevents floating too high). */
export const VS01_SIGNATURE_SIGNED_INK_MAX_CLEARANCE_ABOVE_PX = 2;

/**
 * Max px active signature shell bottom sits above underline (editable affordance).
 * Shell placement — not signed ink baseline.
 */
export const VS01_SIGNATURE_ACTIVE_SHELL_MAX_CLEARANCE_ABOVE_PX =
  VS01_SIGNATURE_OVERLAY_HEIGHT_NORM * VS01_VISUAL_PAGE_HEIGHT_PT * 0.35 +
  VS01_SIGNATURE_OPTICAL_OFFSET_PX +
  2;

// ── Execution block rhythm (witness page) ──

export const VS01_EXECUTION_LABEL_LINE_HEIGHT_FRAC = 0.98;

export const VS01_EXECUTION_LABEL_MARGIN_TOP_EM = 0;

/** Clearance between By block and Name: row (room for signed ink descenders). */
export const VS01_EXECUTION_NAME_ROW_MARGIN_TOP_EM = 0.68;

/** Breathing room between Name / Title / Date rows. */
export const VS01_EXECUTION_LABEL_ROW_MARGIN_TOP_EM = 0.08;

export const VS01_EXECUTION_SIGNATURE_MARGIN_BOTTOM_EM = 0.38;

export { VS01_EXECUTION_SPACER_FRAC } from "./vs01PacketLayoutConstants";

/** Playwright max gap between execution-stack lines (px). */
export const VS01_EXECUTION_MAX_LABEL_GAP_PX = 28;

// ── Recipient active signature field (canonical surface) ──

/** Active editable signature field border radius @ 1:1 (px). */
export const VS01_RECIPIENT_ACTIVE_FIELD_BORDER_RADIUS_PX = 1;

/** Active editable signature field background opacity (0–1). */
export const VS01_RECIPIENT_ACTIVE_FIELD_BG_OPACITY = 0.008;

/** Active editable signature field border mix vs accent (0–1). */
export const VS01_RECIPIENT_ACTIVE_FIELD_BORDER_MIX = 0.16;

// ── Prepare viewport shell ──

export const VS01_PREPARE_SCROLL_MAX_HEIGHT_VH = 84;

export const VS01_PREPARE_SCROLL_OFFSET_REM = 6.5;

export const VS01_PREPARE_PAGES_INNER_PADDING_TOP_REM = 0.55;

export const VS01_PREPARE_PAGES_INNER_PADDING_X_REM = 0.85;

export const VS01_PREPARE_PAGES_INNER_PADDING_BOTTOM_REM = 1.05;

export const VS01_PREPARE_PAGES_INNER_GAP_REM = 0.9;
