from __future__ import annotations

from typing import Any, Dict, Tuple


def normalize_rect_pdf(
    x0: float, y0: float, x1: float, y1: float, page_w: float, page_h: float
) -> Dict[str, Any]:
    """0–1 normalized page coordinates (origin top-left, matching PDF user space)."""
    if page_w <= 0 or page_h <= 0:
        return {
            "x": 0.0,
            "y": 0.0,
            "width": 0.0,
            "height": 0.0,
            "space": "normalized_page",
        }
    return {
        "x": max(0.0, min(1.0, x0 / page_w)),
        "y": max(0.0, min(1.0, y0 / page_h)),
        "width": max(0.0, min(1.0, (x1 - x0) / page_w)),
        "height": max(0.0, min(1.0, (y1 - y0) / page_h)),
        "space": "normalized_page",
    }


def union_bboxes(bboxes: list[Tuple[float, float, float, float]]) -> Tuple[float, float, float, float]:
    if not bboxes:
        return 0.0, 0.0, 0.0, 0.0
    x0 = min(b[0] for b in bboxes)
    y0 = min(b[1] for b in bboxes)
    x1 = max(b[2] for b in bboxes)
    y1 = max(b[3] for b in bboxes)
    return x0, y0, x1, y1
