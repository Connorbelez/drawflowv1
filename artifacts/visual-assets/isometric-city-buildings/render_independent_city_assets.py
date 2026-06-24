#!/usr/bin/env python3
"""Render independent transparent WebP assets for each city building and surface."""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


AssetKind = Literal["building", "surface"]
RenderKind = Literal["generic", "lowrise", "pavilion", "art_deco", "dome", "cn_tower", "surface", "water_surface"]


@dataclass(frozen=True)
class Asset:
    id: str
    label: str
    kind: AssetKind
    render: RenderKind
    bbox: tuple[int, int, int, int]


ASSETS: list[Asset] = [
    Asset("building-left-pavilion", "Left low pavilion", "building", "pavilion", (168, 442, 76, 62)),
    Asset("building-far-left-highrise", "Far-left high-rise", "building", "generic", (240, 276, 70, 226)),
    Asset("building-left-slim-highrise", "Left slim high-rise", "building", "generic", (313, 336, 65, 168)),
    Asset("building-left-central-block", "Left central block", "building", "generic", (303, 396, 100, 111)),
    Asset("building-left-front-lowrise", "Left front low-rise", "building", "lowrise", (389, 443, 98, 90)),
    Asset("building-mid-left-highrise", "Mid-left high-rise", "building", "generic", (482, 322, 76, 188)),
    Asset("building-central-tall-tower", "Central tall tower", "building", "generic", (586, 217, 73, 292)),
    Asset("building-central-front-highrise", "Central front high-rise", "building", "generic", (551, 366, 90, 158)),
    Asset("building-central-side-lowrise", "Central side low-rise", "building", "generic", (628, 379, 54, 128)),
    Asset("building-mid-rear-highrise", "Mid rear high-rise", "building", "generic", (676, 305, 70, 198)),
    Asset("building-mid-front-highrise", "Mid front high-rise", "building", "lowrise", (658, 452, 78, 112)),
    Asset("building-mid-rear-highrise-two", "Mid rear high-rise two", "building", "generic", (755, 318, 70, 186)),
    Asset("building-mid-front-block", "Mid front block", "building", "lowrise", (612, 496, 80, 94)),
    Asset("building-mid-front-highrise-two", "Mid front high-rise two", "building", "lowrise", (733, 497, 80, 98)),
    Asset("building-art-deco-left", "Left art-deco tower", "building", "art_deco", (833, 207, 77, 300)),
    Asset("building-art-deco-front-block", "Art-deco front block", "building", "lowrise", (805, 441, 90, 116)),
    Asset("building-left-of-dome-highrise", "Left-of-dome high-rise", "building", "generic", (897, 345, 68, 153)),
    Asset("building-dome-side-front-block", "Dome-side front block", "building", "lowrise", (886, 443, 94, 132)),
    Asset("building-dome-rear-highrise", "Dome rear high-rise", "building", "generic", (951, 340, 58, 156)),
    Asset("building-dome-front-lowrise", "Dome front low-rise", "building", "pavilion", (917, 533, 102, 99)),
    Asset("building-waterfront-lowrise", "Waterfront low-rise", "building", "pavilion", (877, 602, 134, 99)),
    Asset("building-columned-tower", "Columned landmark tower", "building", "art_deco", (1005, 288, 88, 272)),
    Asset("building-right-of-dome-midrise", "Right-of-dome mid-rise", "building", "generic", (1077, 389, 64, 98)),
    Asset("building-domed-arena", "Domed arena", "building", "dome", (994, 444, 284, 218)),
    Asset("building-right-rear-highrise", "Right rear high-rise", "building", "generic", (1165, 368, 70, 154)),
    Asset("building-right-rear-highrise-two", "Right rear high-rise two", "building", "generic", (1270, 404, 66, 174)),
    Asset("building-right-small-block", "Right small block", "building", "lowrise", (1272, 491, 67, 96)),
    Asset("building-cn-left-tall-highrise", "CN-left tall high-rise", "building", "generic", (1288, 389, 72, 213)),
    Asset("building-cn-left-midrise", "CN-left mid-rise", "building", "lowrise", (1354, 487, 75, 116)),
    Asset("building-cn-tower", "CN-style tower", "building", "cn_tower", (1388, 14, 123, 702)),
    Asset("building-cn-front-left-lowrise", "CN front-left low-rise", "building", "pavilion", (1192, 628, 98, 96)),
    Asset("building-cn-west-pavilion", "CN west pavilion", "building", "pavilion", (1284, 593, 122, 104)),
    Asset("building-cn-east-rear-highrise", "CN east rear high-rise", "building", "generic", (1492, 457, 72, 150)),
    Asset("building-cn-east-front-highrise", "CN east front high-rise", "building", "lowrise", (1486, 544, 98, 136)),
    Asset("building-right-front-midrise", "Right front mid-rise", "building", "lowrise", (1520, 610, 76, 72)),
    Asset("building-right-east-rear-highrise", "Right east rear high-rise", "building", "generic", (1564, 392, 78, 216)),
    Asset("building-right-mid-lowrise", "Right mid low-rise", "building", "lowrise", (1543, 537, 94, 94)),
    Asset("building-far-right-highrise", "Far-right high-rise", "building", "generic", (1650, 458, 78, 148)),
    Asset("building-far-right-lowrise", "Far-right low-rise", "building", "lowrise", (1626, 531, 121, 98)),
    Asset("building-far-right-edge-lowrise", "Far-right edge low-rise", "building", "generic", (1698, 529, 49, 144)),
    Asset("surface-left-main-platform", "Left main platform slab", "surface", "surface", (14, 493, 392, 91)),
    Asset("surface-left-water-basin", "Left water basin", "surface", "water_surface", (247, 499, 245, 119)),
    Asset("surface-center-left-roadway", "Center-left roadway slab", "surface", "surface", (402, 488, 258, 91)),
    Asset("surface-front-left-water-channel", "Front-left water channel", "surface", "water_surface", (386, 551, 260, 94)),
    Asset("surface-center-front-landing", "Center front landing", "surface", "surface", (520, 599, 96, 70)),
    Asset("surface-mid-water-slab", "Mid water slab", "surface", "water_surface", (664, 570, 255, 111)),
    Asset("surface-mid-road-plaza", "Mid road plaza", "surface", "surface", (705, 500, 254, 92)),
    Asset("surface-dome-front-water", "Dome front water slab", "surface", "water_surface", (831, 652, 258, 74)),
    Asset("surface-dome-plaza", "Dome plaza surface", "surface", "surface", (984, 555, 315, 139)),
    Asset("surface-cn-west-water", "CN west water slab", "surface", "water_surface", (1197, 670, 260, 78)),
    Asset("surface-cn-circular-plaza", "CN circular plaza", "surface", "surface", (1349, 635, 185, 129)),
    Asset("surface-right-main-platform", "Right main platform", "surface", "surface", (1490, 604, 247, 126)),
    Asset("surface-right-front-pad", "Right front pad", "surface", "surface", (1501, 669, 121, 71)),
    Asset("surface-far-right-pad", "Far-right pad", "surface", "surface", (1600, 618, 142, 88)),
]


CREAM = (238, 227, 201, 255)
CREAM_LIGHT = (251, 245, 229, 255)
CREAM_DARK = (202, 185, 151, 255)
EDGE = (155, 135, 102, 210)
WINDOW = (118, 104, 82, 210)
GOLD = (215, 157, 61, 255)
GOLD_LIGHT = (244, 202, 105, 255)
WATER = (182, 224, 228, 225)
WATER_EDGE = (124, 178, 184, 180)


def new_canvas(width: int, height: int, pad: int = 10) -> Image.Image:
    return Image.new("RGBA", (max(8, width + pad * 2), max(8, height + pad * 2)), (0, 0, 0, 0))


def draw_soft_shadow(image: Image.Image, points: list[tuple[float, float]], blur: int = 5) -> None:
    shadow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(shadow)
    draw.polygon(points, fill=(72, 58, 35, 55))
    shadow = shadow.filter(ImageFilter.GaussianBlur(blur))
    image.alpha_composite(shadow)


def draw_windows(draw: ImageDraw.ImageDraw, face: list[tuple[float, float]], cols: int, rows: int, skew: float = 0.0) -> None:
    xs = [p[0] for p in face]
    ys = [p[1] for p in face]
    left, right = min(xs), max(xs)
    top, bottom = min(ys), max(ys)
    if cols <= 0 or rows <= 0 or bottom - top < 22:
        return
    margin_x = max(4, (right - left) * 0.16)
    margin_y = max(6, (bottom - top) * 0.08)
    cell_w = (right - left - margin_x * 2) / cols
    cell_h = (bottom - top - margin_y * 2) / rows
    dot_w = max(1, min(4, cell_w * 0.28))
    dot_h = max(2, min(6, cell_h * 0.32))
    for row in range(rows):
        for col in range(cols):
            cx = left + margin_x + cell_w * (col + 0.5) + skew * row
            cy = top + margin_y + cell_h * (row + 0.5)
            draw.rounded_rectangle((cx - dot_w, cy - dot_h, cx + dot_w, cy + dot_h), radius=1, fill=WINDOW)


def draw_roof_cap(draw: ImageDraw.ImageDraw, cx: float, y: float, scale: float) -> None:
    w = max(8, scale)
    h = max(6, scale * 0.55)
    draw.polygon([(cx, y - h), (cx + w * 0.5, y - h * 0.55), (cx + w * 0.5, y + h * 0.3), (cx, y + h), (cx - w * 0.5, y + h * 0.3), (cx - w * 0.5, y - h * 0.55)], fill=GOLD_LIGHT, outline=EDGE)
    draw.polygon([(cx - w * 0.5, y + h * 0.3), (cx, y + h), (cx, y + h * 0.2), (cx - w * 0.5, y - h * 0.55)], fill=GOLD, outline=EDGE)


def render_generic(asset: Asset) -> Image.Image:
    _, _, source_w, source_h = asset.bbox
    w = max(42, source_w)
    h = max(54, source_h)
    pad = 12
    image = new_canvas(w, h, pad)
    draw = ImageDraw.Draw(image)

    x0 = pad + w * 0.16
    x1 = pad + w * 0.52
    x2 = pad + w * 0.86
    top = pad + max(8, w * 0.12)
    roof_h = max(10, min(22, w * 0.2))
    bottom = pad + h - max(8, w * 0.12)
    left_face = [(x0, top + roof_h), (x1, top + roof_h * 1.9), (x1, bottom), (x0, bottom - roof_h * 0.8)]
    right_face = [(x1, top + roof_h * 1.9), (x2, top + roof_h), (x2, bottom - roof_h * 0.8), (x1, bottom)]
    top_face = [(x0, top + roof_h), (x1, top), (x2, top + roof_h), (x1, top + roof_h * 1.9)]
    draw_soft_shadow(image, [(x0, bottom - 3), (x1, bottom + 7), (x2, bottom - 3), (x1, bottom - 12)], 5)
    draw.polygon(left_face, fill=CREAM_LIGHT, outline=EDGE)
    draw.polygon(right_face, fill=CREAM, outline=EDGE)
    draw.polygon(top_face, fill=(249, 241, 220, 255), outline=EDGE)
    rows = max(3, min(18, int(h / 14)))
    cols = max(2, min(5, int(w / 18)))
    draw_windows(draw, left_face, cols, rows, skew=-0.08)
    draw_windows(draw, right_face, max(1, cols - 1), rows, skew=0.08)
    draw_roof_cap(draw, x1, top + 2, max(10, w * 0.28))
    return trim(image)


def render_lowrise(asset: Asset) -> Image.Image:
    _, _, source_w, source_h = asset.bbox
    w = max(62, source_w)
    h = max(52, source_h)
    pad = 12
    image = new_canvas(w, h, pad)
    draw = ImageDraw.Draw(image)
    x0 = pad + w * 0.1
    x1 = pad + w * 0.52
    x2 = pad + w * 0.92
    top = pad + h * 0.10
    roof_h = max(12, h * 0.18)
    bottom = pad + h * 0.88
    left_face = [(x0, top + roof_h), (x1, top + roof_h * 1.8), (x1, bottom), (x0, bottom - roof_h)]
    right_face = [(x1, top + roof_h * 1.8), (x2, top + roof_h), (x2, bottom - roof_h), (x1, bottom)]
    top_face = [(x0, top + roof_h), (x1, top), (x2, top + roof_h), (x1, top + roof_h * 1.8)]
    draw_soft_shadow(image, [(x0, bottom - 3), (x1, bottom + 8), (x2, bottom - 4), (x1, bottom - 12)], 4)
    draw.polygon(left_face, fill=CREAM_LIGHT, outline=EDGE)
    draw.polygon(right_face, fill=CREAM, outline=EDGE)
    draw.polygon(top_face, fill=(249, 242, 224, 255), outline=EDGE)
    draw_windows(draw, left_face, max(2, int(w / 24)), max(2, int(h / 18)))
    draw_windows(draw, right_face, max(1, int(w / 30)), max(2, int(h / 18)))
    draw_roof_cap(draw, x1, top + 2, max(10, w * 0.23))
    return trim(image)


def render_pavilion(asset: Asset) -> Image.Image:
    image = render_lowrise(asset)
    draw = ImageDraw.Draw(image)
    w, h = image.size
    # Add an inset doorway/colonnade for the civic low-rise feel.
    draw.rectangle((w * 0.18, h * 0.58, w * 0.34, h * 0.82), fill=(164, 130, 84, 180))
    for x in np.linspace(w * 0.45, w * 0.78, 3):
        draw.rounded_rectangle((x - 1.5, h * 0.54, x + 1.5, h * 0.80), radius=1, fill=(180, 154, 116, 210))
    return trim(image)


def render_art_deco(asset: Asset) -> Image.Image:
    _, _, source_w, source_h = asset.bbox
    w = max(70, source_w)
    h = max(150, source_h)
    pad = 12
    image = new_canvas(w, h, pad)
    draw = ImageDraw.Draw(image)
    cx = pad + w * 0.50
    top = pad + 4
    bottom = pad + h - 10
    body_w = w * 0.56
    side = w * 0.18
    draw_soft_shadow(image, [(cx - body_w / 2, bottom), (cx + body_w / 2, bottom), (cx, bottom + 10)], 5)
    draw.polygon([(cx - body_w / 2, top + 18), (cx, top + 4), (cx + body_w / 2, top + 18), (cx + body_w / 2, bottom - 12), (cx, bottom), (cx - body_w / 2, bottom - 12)], fill=CREAM, outline=EDGE)
    draw.polygon([(cx - body_w / 2 - side, top + h * 0.35), (cx - body_w / 2, top + h * 0.30), (cx - body_w / 2, bottom - 12), (cx - body_w / 2 - side, bottom - 24)], fill=CREAM_LIGHT, outline=EDGE)
    draw.polygon([(cx + body_w / 2, top + h * 0.30), (cx + body_w / 2 + side, top + h * 0.35), (cx + body_w / 2 + side, bottom - 24), (cx + body_w / 2, bottom - 12)], fill=CREAM_DARK, outline=EDGE)
    for offset in np.linspace(-body_w * 0.34, body_w * 0.34, 5):
        draw.line((cx + offset, top + 26, cx + offset, bottom - 18), fill=(153, 129, 92, 160), width=2)
    draw_roof_cap(draw, cx, top + 4, max(12, w * 0.26))
    return trim(image)


def render_dome(asset: Asset) -> Image.Image:
    _, _, source_w, source_h = asset.bbox
    w = max(220, source_w)
    h = max(150, source_h)
    pad = 14
    image = new_canvas(w, h, pad)
    draw = ImageDraw.Draw(image)
    cx = pad + w / 2
    base_y = pad + h * 0.70
    dome_box = (pad + w * 0.05, pad + h * 0.05, pad + w * 0.95, pad + h * 0.82)
    base_box = (pad + w * 0.08, base_y - h * 0.22, pad + w * 0.92, base_y + h * 0.12)
    draw_soft_shadow(image, [(pad + w * 0.10, base_y + h * 0.08), (cx, base_y + h * 0.20), (pad + w * 0.90, base_y + h * 0.08), (cx, base_y - h * 0.03)], 7)
    draw.ellipse(base_box, fill=CREAM_DARK, outline=EDGE)
    draw.rectangle((base_box[0], base_box[1], base_box[2], base_y + h * 0.04), fill=CREAM, outline=EDGE)
    draw.pieslice(dome_box, 180, 360, fill=CREAM_LIGHT, outline=EDGE)
    draw.arc((dome_box[0] + 4, dome_box[1] + 8, dome_box[2] - 4, dome_box[3] + 2), 184, 356, fill=(189, 171, 136, 170), width=2)
    for x in np.linspace(base_box[0] + w * 0.08, base_box[2] - w * 0.08, 9):
        draw.rounded_rectangle((x - 3, base_box[1] + 8, x + 3, base_y + h * 0.06), radius=2, fill=(176, 152, 114, 220))
    return trim(image)


def render_cn_tower(asset: Asset) -> Image.Image:
    _, _, source_w, source_h = asset.bbox
    w = max(110, source_w)
    h = max(620, source_h)
    pad = 10
    image = new_canvas(w, h, pad)
    draw = ImageDraw.Draw(image)
    cx = pad + w / 2
    top = pad + 2
    bottom = pad + h - 8
    draw.line((cx, top, cx, top + h * 0.12), fill=GOLD_LIGHT, width=2)
    draw.polygon([(cx - w * 0.07, top + h * 0.06), (cx + w * 0.07, top + h * 0.06), (cx + w * 0.035, top + h * 0.30), (cx - w * 0.035, top + h * 0.30)], fill=CREAM_LIGHT, outline=EDGE)
    pod_y = top + h * 0.30
    draw.ellipse((cx - w * 0.30, pod_y - h * 0.045, cx + w * 0.30, pod_y + h * 0.045), fill=CREAM_LIGHT, outline=EDGE)
    draw.ellipse((cx - w * 0.40, pod_y - h * 0.020, cx + w * 0.40, pod_y + h * 0.070), fill=CREAM, outline=EDGE)
    draw.line((cx - w * 0.34, pod_y + h * 0.035, cx + w * 0.34, pod_y + h * 0.035), fill=EDGE, width=2)
    draw.polygon([(cx - w * 0.10, pod_y + h * 0.055), (cx + w * 0.10, pod_y + h * 0.055), (cx + w * 0.30, bottom - h * 0.05), (cx, bottom), (cx - w * 0.30, bottom - h * 0.05)], fill=CREAM, outline=EDGE)
    draw.line((cx, pod_y + h * 0.06, cx, bottom - 4), fill=(163, 140, 102, 180), width=2)
    draw.ellipse((cx - w * 0.48, bottom - h * 0.08, cx + w * 0.48, bottom + h * 0.03), fill=(239, 231, 210, 255), outline=EDGE)
    return trim(image)


def render_surface(asset: Asset) -> Image.Image:
    _, _, source_w, source_h = asset.bbox
    w = max(90, source_w)
    h = max(50, source_h)
    pad = 10
    image = new_canvas(w, h, pad)
    draw = ImageDraw.Draw(image)
    top = [(pad + w * 0.06, pad + h * 0.36), (pad + w * 0.48, pad + h * 0.10), (pad + w * 0.95, pad + h * 0.36), (pad + w * 0.54, pad + h * 0.76)]
    side = [(pad + w * 0.06, pad + h * 0.36), (pad + w * 0.54, pad + h * 0.76), (pad + w * 0.54, pad + h * 0.90), (pad + w * 0.06, pad + h * 0.50)]
    right = [(pad + w * 0.54, pad + h * 0.76), (pad + w * 0.95, pad + h * 0.36), (pad + w * 0.95, pad + h * 0.50), (pad + w * 0.54, pad + h * 0.90)]
    draw_soft_shadow(image, [(pad + w * 0.08, pad + h * 0.52), (pad + w * 0.54, pad + h * 0.92), (pad + w * 0.98, pad + h * 0.52), (pad + w * 0.54, pad + h * 0.80)], 5)
    if asset.render == "water_surface":
        draw.polygon(side, fill=(185, 196, 182, 255), outline=EDGE)
        draw.polygon(right, fill=(167, 188, 184, 255), outline=EDGE)
        inset = [(pad + w * 0.16, pad + h * 0.38), (pad + w * 0.50, pad + h * 0.18), (pad + w * 0.84, pad + h * 0.39), (pad + w * 0.52, pad + h * 0.68)]
        draw.polygon(top, fill=CREAM_LIGHT, outline=EDGE)
        draw.polygon(inset, fill=WATER, outline=WATER_EDGE)
        draw.line((inset[0][0], inset[0][1] + 2, inset[2][0], inset[2][1] + 2), fill=(234, 255, 255, 90), width=1)
    else:
        draw.polygon(side, fill=(214, 203, 181, 255), outline=EDGE)
        draw.polygon(right, fill=(198, 185, 162, 255), outline=EDGE)
        draw.polygon(top, fill=CREAM_LIGHT, outline=EDGE)
        for frac in (0.33, 0.66):
            draw.line((pad + w * (0.08 + frac * 0.38), pad + h * 0.35, pad + w * (0.55 + frac * 0.38), pad + h * 0.75), fill=(210, 198, 170, 130), width=1)
    return trim(image)


def trim(image: Image.Image, padding: int = 3) -> Image.Image:
    rgba = image.convert("RGBA")
    bbox = rgba.getchannel("A").getbbox()
    if bbox is None:
        return rgba
    left, top, right, bottom = bbox
    left = max(0, left - padding)
    top = max(0, top - padding)
    right = min(rgba.width, right + padding)
    bottom = min(rgba.height, bottom + padding)
    trimmed = rgba.crop((left, top, right, bottom))
    padded = Image.new("RGBA", (trimmed.width + 4, trimmed.height + 4), (0, 0, 0, 0))
    padded.alpha_composite(trimmed, (2, 2))
    return padded


def render_asset(asset: Asset) -> Image.Image:
    if asset.render == "generic":
        return render_generic(asset)
    if asset.render == "lowrise":
        return render_lowrise(asset)
    if asset.render == "pavilion":
        return render_pavilion(asset)
    if asset.render == "art_deco":
        return render_art_deco(asset)
    if asset.render == "dome":
        return render_dome(asset)
    if asset.render == "cn_tower":
        return render_cn_tower(asset)
    return render_surface(asset)


def write_spec(out_dir: Path, source_path: Path) -> Path:
    spec = {
        "project": "isometric-city-independent-assets",
        "source_image": str(source_path),
        "notes": "Corrected run: source image used for inventory/proportions only; final production assets are independent transparent sprites, not screenshot crops.",
        "assets": [
            {
                "id": asset.id,
                "label": asset.label,
                "classification": "image",
                "role": f"Independent transparent {asset.kind} asset",
                "kind": asset.kind,
                "render_kind": asset.render,
                "bbox": {"x": asset.bbox[0], "y": asset.bbox[1], "width": asset.bbox[2], "height": asset.bbox[3]},
                "rationale": "This asset must stand alone on transparency with no neighboring city context.",
                "generation": {
                    "transparent": True,
                    "asset_type": asset.kind,
                    "output_basename": asset.id,
                    "prompt": f"Create an independent transparent isometric miniature-city {asset.kind}: {asset.label}.",
                },
            }
            for asset in ASSETS
        ],
    }
    path = out_dir / "asset-spec.json"
    path.write_text(json.dumps(spec, indent=2) + "\n", encoding="utf-8")
    return path


def flatten_checker(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    bg = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
    draw = ImageDraw.Draw(bg)
    tile = 12
    for y in range(0, rgba.height, tile):
        for x in range(0, rgba.width, tile):
            if (x // tile + y // tile) % 2:
                draw.rectangle((x, y, x + tile - 1, y + tile - 1), fill=(224, 224, 224, 255))
    bg.alpha_composite(rgba)
    return bg.convert("RGB")


def draw_contact_sheet(entries: list[dict[str, Any]], out: Path) -> None:
    thumb_w = 200
    thumb_h = 170
    label_h = 46
    gap = 14
    cols = 5
    rows = math.ceil(len(entries) / cols)
    sheet = Image.new("RGB", (cols * thumb_w + (cols + 1) * gap, rows * (thumb_h + label_h) + (rows + 1) * gap), "white")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for index, entry in enumerate(entries):
        row, col = divmod(index, cols)
        x = gap + col * (thumb_w + gap)
        y = gap + row * (thumb_h + label_h + gap)
        image = Image.open(entry["raw_generated_path"]).convert("RGBA")
        image.thumbnail((thumb_w, thumb_h), Image.Resampling.LANCZOS)
        preview = flatten_checker(image)
        sheet.paste(preview, (x + (thumb_w - preview.width) // 2, y + (thumb_h - preview.height) // 2))
        draw.text((x, y + thumb_h + 6), f"{index + 1:02d} {entry['id']}"[:34], fill=(20, 20, 20), font=font)
        draw.text((x, y + thumb_h + 22), f"{entry['kind']} {entry['size']['width']}x{entry['size']['height']}", fill=(70, 70, 70), font=font)
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)


def render_all(out_dir: Path, source_path: Path, manifest_path: Path | None) -> Path:
    raw_dir = out_dir / "generated" / "raw"
    webp_dir = out_dir / "generated" / "webp"
    raw_dir.mkdir(parents=True, exist_ok=True)
    webp_dir.mkdir(parents=True, exist_ok=True)

    manifest_by_id: dict[str, dict[str, Any]] = {}
    if manifest_path and manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest_by_id = {asset["id"]: asset for asset in manifest.get("assets", [])}

    entries: list[dict[str, Any]] = []
    for asset in ASSETS:
        image = render_asset(asset)
        raw_path = raw_dir / f"{asset.id}.png"
        final_path = webp_dir / f"{asset.id}.webp"
        image.save(raw_path)
        image.save(final_path, "WEBP", lossless=True, method=6, exact=True)
        alpha = np.array(image.getchannel("A"))
        entries.append(
            {
                "id": asset.id,
                "label": asset.label,
                "kind": asset.kind,
                "render_kind": asset.render,
                "source_bbox": {"x": asset.bbox[0], "y": asset.bbox[1], "width": asset.bbox[2], "height": asset.bbox[3]},
                "reference_crop": manifest_by_id.get(asset.id, {}).get("crop_path"),
                "raw_generated_path": str(raw_path.resolve()),
                "final_webp_path": str(final_path.resolve()),
                "transparent": True,
                "extraction_method": "source-guided-independent-reconstruction",
                "size": {"width": image.width, "height": image.height},
                "opaque_pixel_count": int((alpha > 0).sum()),
            }
        )
    production = {
        "schema_version": 3,
        "source_image": str(source_path.resolve()),
        "manifest_path": str(manifest_path.resolve()) if manifest_path else None,
        "image_asset_count": len(entries),
        "building_asset_count": sum(1 for item in entries if item["kind"] == "building"),
        "surface_asset_count": sum(1 for item in entries if item["kind"] == "surface"),
        "assets": entries,
        "notes": "Final WebPs are independent transparent sprites generated from source inventory/proportions. They are not source-image screenshot crops.",
    }
    path = out_dir / "production-assets.json"
    path.write_text(json.dumps(production, indent=2) + "\n", encoding="utf-8")
    draw_contact_sheet(entries, out_dir / "verification" / "production-contact-sheet.png")
    return path


def verify(out_dir: Path) -> dict[str, Any]:
    production = json.loads((out_dir / "production-assets.json").read_text(encoding="utf-8"))
    errors: list[str] = []
    webps = list((out_dir / "generated" / "webp").glob("*.webp"))
    raws = list((out_dir / "generated" / "raw").glob("*.png"))
    if len(webps) != production["image_asset_count"]:
        errors.append(f"expected {production['image_asset_count']} webps, found {len(webps)}")
    if len(raws) != production["image_asset_count"]:
        errors.append(f"expected {production['image_asset_count']} raw pngs, found {len(raws)}")
    for asset in production["assets"]:
        final_path = Path(asset["final_webp_path"])
        raw_path = Path(asset["raw_generated_path"])
        crop_path = Path(asset["reference_crop"]) if asset.get("reference_crop") else None
        if crop_path and final_path.resolve() == crop_path.resolve():
            errors.append(f"{asset['id']}: final path reuses reference crop")
        if not raw_path.exists():
            errors.append(f"{asset['id']}: missing raw PNG")
        if not final_path.exists():
            errors.append(f"{asset['id']}: missing final WebP")
            continue
        with Image.open(final_path) as image:
            rgba = image.convert("RGBA")
            alpha = rgba.getchannel("A")
            amin, amax = alpha.getextrema()
            if amax == 0:
                errors.append(f"{asset['id']}: empty alpha")
            if amin > 0:
                errors.append(f"{asset['id']}: no transparent background")
            if rgba.size != (asset["size"]["width"], asset["size"]["height"]):
                errors.append(f"{asset['id']}: size mismatch")
    report = {
        "asset_count": production["image_asset_count"],
        "building_count": production["building_asset_count"],
        "surface_count": production["surface_asset_count"],
        "webp_count": len(webps),
        "raw_png_count": len(raws),
        "errors": errors,
    }
    report_path = out_dir / "verification" / "verification-report.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--write-spec", action="store_true")
    parser.add_argument("--render", action="store_true")
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()

    out_dir = args.out.expanduser().resolve()
    source_path = args.source.expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    result: dict[str, Any] = {}
    if args.write_spec:
        result["asset_spec"] = str(write_spec(out_dir, source_path).resolve())
    if args.render:
        result["production_assets"] = str(render_all(out_dir, source_path, args.manifest).resolve())
    if args.verify:
        result["verification"] = verify(out_dir)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
