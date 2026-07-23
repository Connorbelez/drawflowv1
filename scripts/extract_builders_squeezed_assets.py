#!/usr/bin/env python3
from __future__ import annotations

import json
import math
from pathlib import Path
from xml.sax.saxutils import escape

from PIL import Image, ImageDraw, ImageFilter


SOURCE = Path("/Users/connor/Downloads/Generated image 1 (2).png")
ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "public" / "assets" / "builders-squeezed-extracted"


def ensure_dirs() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)


def median_channel(values: list[int]) -> int:
    values = sorted(values)
    return values[len(values) // 2]


def sampled_border_background(image: Image.Image) -> tuple[int, int, int]:
    rgb = image.convert("RGB")
    w, h = rgb.size
    samples: list[tuple[int, int, int]] = []
    px = rgb.load()

    for x in range(w):
        samples.append(px[x, 0])
        samples.append(px[x, h - 1])
    for y in range(h):
        samples.append(px[0, y])
        samples.append(px[w - 1, y])

    return (
        median_channel([p[0] for p in samples]),
        median_channel([p[1] for p in samples]),
        median_channel([p[2] for p in samples]),
    )


def ink_mask_crop(
    source: Image.Image,
    bbox: tuple[int, int, int, int],
    *,
    threshold: float = 18,
    feather: int = 1,
) -> Image.Image:
    crop = source.crop(bbox).convert("RGBA")
    bg = sampled_border_background(crop)
    out = Image.new("RGBA", crop.size, (255, 255, 255, 0))
    pixels = crop.load()
    out_px = out.load()

    for y in range(crop.height):
        for x in range(crop.width):
            r, g, b, _ = pixels[x, y]
            dist = math.sqrt((r - bg[0]) ** 2 + (g - bg[1]) ** 2 + (b - bg[2]) ** 2)
            chroma = max(r, g, b) - min(r, g, b)
            darkness = 255 - ((0.299 * r) + (0.587 * g) + (0.114 * b))
            ink = max(dist, chroma * 1.8, darkness * 0.75)
            if ink > threshold:
                alpha = int(max(0, min(255, (ink - threshold) * 9)))
                out_px[x, y] = (r, g, b, alpha)

    if feather:
        alpha = out.getchannel("A").filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(feather))
        out.putalpha(alpha)
    return out


def blueprint_mask_crop(
    source: Image.Image,
    bbox: tuple[int, int, int, int],
    *,
    threshold: float = 8,
    feather: int = 1,
) -> Image.Image:
    crop = source.crop(bbox).convert("RGBA")
    bg = sampled_border_background(crop)
    out = Image.new("RGBA", crop.size, (255, 255, 255, 0))
    pixels = crop.load()
    out_px = out.load()

    for y in range(crop.height):
        for x in range(crop.width):
            r, g, b, _ = pixels[x, y]
            dist = math.sqrt((r - bg[0]) ** 2 + (g - bg[1]) ** 2 + (b - bg[2]) ** 2)
            darkness = 255 - ((0.299 * r) + (0.587 * g) + (0.114 * b))
            blue_bias = b - max(r, g)
            if dist > threshold and blue_bias > -4 and b > r + 8 and darkness < 145:
                alpha = int(max(0, min(255, (dist - threshold) * 11)))
                out_px[x, y] = (r, g, b, alpha)

    if feather:
        alpha = out.getchannel("A").filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(feather))
        out.putalpha(alpha)
    return out


def polygon_crop(
    source: Image.Image,
    bbox: tuple[int, int, int, int],
    points: list[tuple[int, int]],
    *,
    feather: int = 1,
) -> Image.Image:
    crop = source.crop(bbox).convert("RGBA")
    scale = 4
    mask = Image.new("L", (crop.width * scale, crop.height * scale), 0)
    draw = ImageDraw.Draw(mask)
    draw.polygon([(x * scale, y * scale) for x, y in points], fill=255)
    mask = mask.resize(crop.size, Image.Resampling.LANCZOS)
    if feather:
        mask = mask.filter(ImageFilter.GaussianBlur(feather))
    out = Image.new("RGBA", crop.size, (255, 255, 255, 0))
    out.alpha_composite(crop)
    out.putalpha(mask)
    return out


def save_webp(image: Image.Image, name: str) -> Path:
    path = OUT_DIR / name
    image.save(path, "WEBP", lossless=True, quality=100, method=6)
    return path


def write_svg(name: str, body: str, view_box: str, *, title: str) -> Path:
    path = OUT_DIR / name
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view_box}" role="img" '
        f'aria-label="{escape(title)}">\n'
        f"  <title>{escape(title)}</title>\n"
        f"{body}\n"
        "</svg>\n"
    )
    path.write_text(svg, encoding="utf-8")
    return path


def line_tag(label: str, amount: str, name: str) -> str:
    title = f"Milestone unlock tag {amount}"
    body = f"""
  <path d="M8 1.5h84a6.5 6.5 0 0 1 6.5 6.5v45a6.5 6.5 0 0 1-6.5 6.5H57L50 68l-7-8.5H8A6.5 6.5 0 0 1 1.5 53V8A6.5 6.5 0 0 1 8 1.5Z" fill="#fbfbf6" stroke="#9db6a4" stroke-width="1.5"/>
  <text x="13" y="20" fill="#2f6f48" font-family="Inter, Arial, sans-serif" font-size="8" font-weight="800" letter-spacing=".8">UNLOCKED</text>
  <text x="13" y="42" fill="#2f6f48" font-family="Inter, Arial, sans-serif" font-size="16" font-weight="800">{escape(amount)}</text>"""
    return str(write_svg(name, body, "0 0 100 70", title=title).relative_to(ROOT))


def build_assets() -> list[dict[str, object]]:
    source = Image.open(SOURCE).convert("RGB")
    assets: list[dict[str, object]] = []

    def add_webp(
        slug: str,
        label: str,
        bbox: tuple[int, int, int, int],
        image: Image.Image,
        notes: str,
    ) -> None:
        filename = f"{slug}.webp"
        path = save_webp(image, filename)
        assets.append(
            {
                "name": slug,
                "label": label,
                "type": "transparent-webp",
                "path": str(path.relative_to(ROOT)),
                "sourceRegion": {"x": bbox[0], "y": bbox[1], "width": bbox[2] - bbox[0], "height": bbox[3] - bbox[1]},
                "notes": notes,
            }
        )

    def add_svg(slug: str, label: str, filename: str, source_region: tuple[int, int, int, int] | None, notes: str) -> None:
        assets.append(
            {
                "name": slug,
                "label": label,
                "type": "svg",
                "path": str((OUT_DIR / filename).relative_to(ROOT)),
                "sourceRegion": None
                if source_region is None
                else {
                    "x": source_region[0],
                    "y": source_region[1],
                    "width": source_region[2] - source_region[0],
                    "height": source_region[3] - source_region[1],
                },
                "notes": notes,
            }
        )

    webp_specs = [
        (
            "draw-note-1-upfront",
            "Rigid schedule draw note: Draw 1",
            (188, 430, 322, 606),
            [(2, 28), (118, 11), (133, 166), (15, 174)],
            "Polygon extraction keeps the paper note, pin, stamp, and internal typography with transparent outside corners.",
        ),
        (
            "draw-note-2-midpoint",
            "Rigid schedule draw note: Draw 2",
            (399, 426, 531, 596),
            [(0, 16), (116, 2), (130, 154), (13, 168)],
            "Polygon extraction keeps the paper note, pin, stamp, and internal typography with transparent outside corners.",
        ),
        (
            "draw-note-3-final",
            "Rigid schedule draw note: Draw 3",
            (597, 410, 729, 584),
            [(0, 20), (116, 3), (131, 164), (15, 173)],
            "Polygon extraction keeps the paper note, pin, stamp, and internal typography with transparent outside corners.",
        ),
    ]
    for slug, label, bbox, points, notes in webp_specs:
        add_webp(slug, label, bbox, polygon_crop(source, bbox, points), notes)

    ink_specs = [
        (
            "drawflow-logo-lockup",
            "DrawFlow logo lockup",
            (1415, 48, 1608, 105),
            14,
            "Ink-only extraction of the brand mark, wordmark, and BY FAIRLEND line.",
        ),
        (
            "build-smarter-stamp",
            "Build smarter stamp",
            (1338, 120, 1610, 258),
            11,
            "Ink-only extraction of the tilted stamp, grid, words, border, and signature.",
        ),
    ]
    for slug, label, bbox, threshold, notes in ink_specs:
        add_webp(slug, label, bbox, ink_mask_crop(source, bbox, threshold=threshold), notes)

    blueprint_specs = [
        (
            "left-building-blueprint",
            "Left partial building blueprint",
            (0, 510, 170, 704),
            "Blue-line-only extraction of the partial blueprint linework on the left edge.",
        ),
        (
            "modern-home-blueprint",
            "Modern home blueprint",
            (940, 546, 1594, 730),
            "Blue-line-only extraction of the large home blueprint linework under the milestone draw plan.",
        ),
    ]
    for slug, label, bbox, notes in blueprint_specs:
        add_webp(slug, label, bbox, blueprint_mask_crop(source, bbox), notes)

    svg_defs: list[tuple[str, str, str, str, tuple[int, int, int, int] | None, str]] = [
        (
            "drawflow-logo-mark",
            "DrawFlow house logo mark",
            "drawflow-logo-mark.svg",
            """
  <g fill="none" stroke="#f15a49" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M7 29V15L24 3l17 12v26"/>
    <path d="M15 41V22h11v19"/>
    <path d="M31 41V26h8v15"/>
    <path d="M24 3v13"/>
    <path d="M3 18 24 3l21 15"/>
  </g>""",
            "0 0 48 48",
            (1418, 50, 1458, 91),
            "Clean SVG recreation of the source logo mark for scalable reuse.",
        ),
        (
            "push-pin",
            "Pinned note push pin",
            "push-pin.svg",
            """
  <g fill="none" stroke="#0b2149" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="24" cy="10" r="7" fill="#d6dde7"/>
    <path d="M20 16 18 32M28 16l2 16M17 32h14M24 32v15"/>
    <path d="M20 9c2.5-3 7-3 9 0" stroke="#6d7f9d"/>
  </g>""",
            "0 0 48 52",
            (241, 424, 260, 463),
            "Reusable pin from the three released draw notes.",
        ),
        (
            "released-stamp",
            "Released stamp",
            "released-stamp.svg",
            """
  <g transform="rotate(-8 61 22)" fill="none" stroke="#f15a49" stroke-width="2">
    <rect x="8" y="7" width="106" height="30" rx="2"/>
    <text x="20" y="28" fill="#f15a49" stroke="none" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="900" letter-spacing="1.6">RELEASED</text>
  </g>""",
            "0 0 122 52",
            (219, 548, 300, 580),
            "Reusable red released stamp from the draw-note cards.",
        ),
        (
            "cash-stress-dashed-curve",
            "Cash stress dashed curve",
            "cash-stress-dashed-curve.svg",
            """
  <path d="M2 69 C110 73 154 82 238 70 S360 54 470 69 S615 84 728 67" fill="none" stroke="#f15a49" stroke-width="3" stroke-linecap="round" stroke-dasharray="8 7"/>""",
            "0 0 735 105",
            (130, 570, 834, 619),
            "Source-matched vector curve for early/late cash stress in the rigid-draw section.",
        ),
        (
            "rigid-schedule-axis",
            "Rigid three draw schedule axis",
            "rigid-schedule-axis.svg",
            """
  <path d="M6 31H690" fill="none" stroke="#071b43" stroke-width="5" stroke-linecap="round"/>
  <g fill="#fbfbf6" stroke="#071b43" stroke-width="4">
    <circle cx="6" cy="31" r="8"/>
    <circle cx="138" cy="31" r="8"/>
    <circle cx="360" cy="31" r="8"/>
    <circle cx="586" cy="31" r="8"/>
  </g>""",
            "0 0 700 62",
            (123, 600, 825, 622),
            "Dark baseline and draw-release milestone nodes from the rigid schedule.",
        ),
        (
            "aligned-capital-curve",
            "Aligned capital milestone curve",
            "aligned-capital-curve.svg",
            """
  <path d="M2 92 C58 60 100 48 158 44 S267 22 365 28 S493 20 605 25 S724 31 795 34" fill="none" stroke="#2f6f48" stroke-width="4" stroke-linecap="round"/>
  <g fill="#2f6f48" stroke="#fbfbf6" stroke-width="4">
    <circle cx="84" cy="61" r="16"/><circle cx="159" cy="43" r="16"/><circle cx="300" cy="30" r="16"/>
    <circle cx="442" cy="25" r="16"/><circle cx="575" cy="28" r="16"/><circle cx="716" cy="33" r="16"/>
  </g>
  <g fill="none" stroke="#fbfbf6" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
    <path d="m76 60 7 7 14-15"/><path d="m151 42 7 7 14-15"/><path d="m292 29 7 7 14-15"/>
    <path d="m434 24 7 7 14-15"/><path d="m567 27 7 7 14-15"/><path d="m708 32 7 7 14-15"/>
  </g>""",
            "0 0 805 112",
            (840, 462, 1594, 522),
            "Vector extraction of the green progress curve and approved milestone check markers.",
        ),
        (
            "timeline-break-marker",
            "Schedule transition break marker",
            "timeline-break-marker.svg",
            """
  <g fill="none" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 23c6 0 6-14 12-14s6 14 12 14 6-14 12-14" stroke="#071b43"/>
    <path d="M52 23H80" stroke="#2f6f48"/>
  </g>""",
            "0 0 90 38",
            (817, 598, 853, 624),
            "Break between the rigid calendar and milestone draw plan.",
        ),
        (
            "warning-triangle",
            "Warning triangle",
            "warning-triangle.svg",
            """
  <path d="M24 4 46 42H2L24 4Z" fill="none" stroke="#f15a49" stroke-width="2.6" stroke-linejoin="round"/>
  <path d="M24 16v13" stroke="#f15a49" stroke-width="3" stroke-linecap="round"/>
  <circle cx="24" cy="35" r="2.2" fill="#f15a49"/>""",
            "0 0 48 48",
            (187, 651, 217, 681),
            "Reusable red warning icon used in callouts and the cash-gap panel.",
        ),
        (
            "cash-out-too-early",
            "Cash out too early icon",
            "cash-out-too-early.svg",
            """
  <g fill="none" stroke="#f15a49" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 30c9-6 18-5 26 2l12 10"/>
    <path d="M13 42h16c7 0 12-2 17-7l14-13c4-3 9 2 5 7L47 48c-4 4-9 6-15 6H18L5 47"/>
    <path d="M7 25c4 0 8 2 12 6"/>
    <path d="M36 21c3-8 11-12 20-9-1 10-7 16-17 18"/>
    <path d="M31 19c-2-7-8-11-16-10 0 8 5 13 13 15"/>
  </g>""",
            "0 0 72 64",
            (83, 821, 137, 850),
            "Red hand/capital icon from the cash gap risk panel.",
        ),
        (
            "idle-cash-clock-coin",
            "Idle cash clock and coin icon",
            "idle-cash-clock-coin.svg",
            """
  <g fill="none" stroke="#f15a49" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="29" cy="29" r="24"/>
    <path d="M29 12v17l-11 7"/>
    <path d="M16 9 12 4M46 9l4-5M29 4V1M8 29H3M55 29h5"/>
    <circle cx="52" cy="49" r="13" fill="#fbfbf6"/>
    <path d="M52 41v18M57 45c-4-3-12-1-12 4 0 7 14 3 14 10 0 5-8 7-14 3"/>
  </g>""",
            "0 0 68 68",
            (322, 810, 374, 860),
            "Clock plus dollar coin from the idle-cash callout.",
        ),
        (
            "broken-chain",
            "Broken chain icon",
            "broken-chain.svg",
            """
  <g fill="none" stroke="#f15a49" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M25 42 15 52c-6 6-15-3-9-9l13-13c4-4 10-5 15-1"/>
    <path d="M43 24 56 11c6-6 15 3 9 9L55 30c-4 4-10 5-15 1"/>
    <path d="m30 37 14-14"/>
    <path d="M12 15 5 8M24 10V1M39 14l7-8M50 47l7 7M38 52v9M23 48l-7 8"/>
  </g>""",
            "0 0 72 68",
            (571, 812, 609, 858),
            "Broken-chain icon from the gaps-before-next-draw callout.",
        ),
        (
            "approved-check-circle",
            "Approved check circle",
            "approved-check-circle.svg",
            """
  <circle cx="24" cy="24" r="22" fill="#2f6f48"/>
  <path d="m14 24 7 7 15-17" fill="none" stroke="#fbfbf6" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>""",
            "0 0 48 48",
            (893, 759, 919, 785),
            "Green approved status marker from the capital-unlocks panel.",
        ),
        (
            "right-time-calendar-check",
            "Right capital right time calendar icon",
            "right-time-calendar-check.svg",
            """
  <g fill="none" stroke="#2f6f48" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <rect x="7" y="10" width="50" height="50" rx="5"/>
    <path d="M7 22h50M18 5v13M46 5v13"/>
    <path d="m16 39 6 6 11-14M38 40l5 5 10-13"/>
    <path d="M18 29h6M39 29h7"/>
  </g>""",
            "0 0 64 66",
            (894, 811, 941, 858),
            "Checklist calendar icon from the approved-work panel.",
        ),
        (
            "stronger-cash-flow-chart",
            "Stronger cash flow chart icon",
            "stronger-cash-flow-chart.svg",
            """
  <g fill="none" stroke="#2f6f48" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 56h54"/>
    <rect x="11" y="43" width="7" height="13"/>
    <rect x="27" y="33" width="7" height="23"/>
    <rect x="43" y="23" width="7" height="33"/>
    <path d="M9 34c17-9 29-18 47-32"/>
    <path d="M47 3h10v10"/>
  </g>""",
            "0 0 68 64",
            (1135, 812, 1187, 858),
            "Rising bar chart icon from the stronger-cash-flow callout.",
        ),
        (
            "build-confidence-shield",
            "Build with confidence shield icon",
            "build-confidence-shield.svg",
            """
  <g fill="none" stroke="#2f6f48" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M32 4 58 14v20c0 18-12 30-26 38C18 64 6 52 6 34V14L32 4Z"/>
    <path d="m20 36 8 8 18-21"/>
  </g>""",
            "0 0 64 74",
            (1361, 812, 1405, 859),
            "Shield-check icon from the build-with-confidence callout.",
        ),
        (
            "handoff-arrow-circle",
            "Middle handoff arrow circle",
            "handoff-arrow-circle.svg",
            """
  <circle cx="32" cy="32" r="30" fill="#fbfbf6" stroke="#071b43" stroke-width="2"/>
  <path d="M20 32h22M34 22l10 10-10 10" fill="none" stroke="#071b43" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>""",
            "0 0 64 64",
            (812, 806, 862, 855),
            "Circular arrow bridging the red risk panel and green approved-work panel.",
        ),
    ]
    for slug, label, filename, body, view_box, source_region, notes in svg_defs:
        write_svg(filename, body, view_box, title=label)
        add_svg(slug, label, filename, source_region, notes)

    tag_regions = [
        ("unlock-tag-foundation-220k", "Foundation Complete unlock tag", "$220,000", (893, 441, 973, 492)),
        ("unlock-tag-framing-250k", "Framing Complete unlock tag", "$250,000", (1016, 404, 1094, 456)),
        ("unlock-tag-roof-180k", "Roof Complete unlock tag", "$180,000", (1140, 392, 1219, 442)),
        ("unlock-tag-dry-in-210k", "Dry-In Complete unlock tag", "$210,000", (1265, 382, 1345, 432)),
        ("unlock-tag-interiors-200k", "Interiors Complete unlock tag", "$200,000", (1386, 388, 1465, 439)),
        ("unlock-tag-final-300k", "Final Inspection unlock tag", "$300,000", (1507, 397, 1585, 448)),
    ]
    for slug, label, amount, region in tag_regions:
        path = line_tag(label, amount, f"{slug}.svg")
        assets.append(
            {
                "name": slug,
                "label": label,
                "type": "svg",
                "path": path,
                "sourceRegion": {"x": region[0], "y": region[1], "width": region[2] - region[0], "height": region[3] - region[1]},
                "notes": "Scalable recreation of the rounded milestone amount tag from the mockup.",
            }
        )

    return assets


def write_manifest(assets: list[dict[str, object]]) -> None:
    manifest = {
        "source": str(SOURCE),
        "sourceSize": {"width": 1672, "height": 941},
        "outputDirectory": str(OUT_DIR.relative_to(ROOT)),
        "assetCount": len(assets),
        "assets": assets,
    }
    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    lines = [
        "# Builders Squeezed Mockup Assets",
        "",
        f"Source: `{SOURCE}`",
        f"Output directory: `{OUT_DIR.relative_to(ROOT)}`",
        f"Asset count: {len(assets)}",
        "",
        "These files extract the reusable visual pieces from the mockup. Complex, textured artwork is exported as transparent WebP. Simple line icons and UI marks are exported as SVG for scalable reuse.",
        "",
        "| Asset | Format | Source region | Notes |",
        "|---|---:|---|---|",
    ]
    for asset in assets:
        region = asset["sourceRegion"]
        region_text = "n/a"
        if isinstance(region, dict):
            region_text = f'{region["x"]},{region["y"]} {region["width"]}x{region["height"]}'
        lines.append(
            f'| [{asset["label"]}]({Path(asset["path"]).name}) | {asset["type"]} | {region_text} | {asset["notes"]} |'
        )
    lines.append("")
    lines.append("Layout-only prose, giant headline text, panel borders, grid texture, and dimension guide rules are intentionally left as CSS/text concerns rather than exported image assets.")
    (OUT_DIR / "README.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def validate_outputs(assets: list[dict[str, object]]) -> None:
    failures: list[str] = []
    for asset in assets:
        path = ROOT / str(asset["path"])
        if not path.exists():
            failures.append(f"missing: {path}")
            continue
        if path.stat().st_size == 0:
            failures.append(f"empty: {path}")
            continue
        if path.suffix == ".webp":
            image = Image.open(path).convert("RGBA")
            alpha = image.getchannel("A")
            if alpha.getextrema()[0] >= 255:
                failures.append(f"webp lacks transparent pixels: {path}")
            if alpha.getextrema()[1] <= 0:
                failures.append(f"webp fully transparent: {path}")
        elif path.suffix == ".svg":
            text = path.read_text(encoding="utf-8")
            if "<svg" not in text or "</svg>" not in text:
                failures.append(f"invalid svg wrapper: {path}")
    if failures:
        raise SystemExit("\n".join(failures))


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"Source image not found: {SOURCE}")
    ensure_dirs()
    assets = build_assets()
    write_manifest(assets)
    validate_outputs(assets)
    print(f"Extracted and validated {len(assets)} assets into {OUT_DIR}")


if __name__ == "__main__":
    main()
