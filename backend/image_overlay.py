"""Apply saved logo/text overlays onto generated images (Pillow)."""

from __future__ import annotations

import json
import logging
import os
import sys
import textwrap
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

from . import artifacts

logger = logging.getLogger(__name__)

FONT_DIR = Path(__file__).resolve().parent / "fonts"

FONT_MAP: dict[str, str] = {
    # Sans-serif → DejaVu Sans
    "Arial": "DejaVuSans.ttf",
    "Helvetica": "DejaVuSans.ttf",
    "Verdana": "DejaVuSans.ttf",
    "Tahoma": "DejaVuSans.ttf",
    "Trebuchet MS": "DejaVuSans.ttf",
    "Calibri": "DejaVuSans.ttf",
    "Segoe UI": "DejaVuSans.ttf",
    "Open Sans": "DejaVuSans.ttf",
    "Roboto": "DejaVuSans.ttf",
    "Montserrat": "DejaVuSans.ttf",
    "Lato": "DejaVuSans.ttf",
    # Serif → DejaVu Serif
    "Georgia": "DejaVuSerif.ttf",
    "Times New Roman": "DejaVuSerif.ttf",
    "Palatino": "DejaVuSerif.ttf",
    "Garamond": "DejaVuSerif.ttf",
    "Merriweather": "DejaVuSerif.ttf",
    "Playfair Display": "DejaVuSerif.ttf",
    # Display → DejaVu Sans Bold
    "Impact": "DejaVuSans-Bold.ttf",
    "Arial Black": "DejaVuSans-Bold.ttf",
    "Bebas Neue": "DejaVuSans-Bold.ttf",
    "Oswald": "DejaVuSans-Bold.ttf",
    "Anton": "DejaVuSans-Bold.ttf",
    # Monospace → DejaVu Sans (fallback)
    "Courier New": "DejaVuSans.ttf",
    "Consolas": "DejaVuSans.ttf",
    "Monaco": "DejaVuSans.ttf",
    "Lucida Console": "DejaVuSans.ttf",
}

DISPLAY_BOLD_FONTS: frozenset[str] = frozenset(
    {"Impact", "Arial Black", "Bebas Neue", "Oswald", "Anton"}
)

DEFAULT_OVERLAY: dict[str, Any] = {
    "version": 1,
    "logo": {"visible": False},
    "text": {"visible": False, "content": ""},
}


def overlay_path(client_id: str, run_id: str) -> Path:
    run_dir = artifacts.get_run_dir(client_id, run_id)
    images_dir = run_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)
    return images_dir / "overlay.json"


def load_overlay(client_id: str, run_id: str) -> dict[str, Any] | None:
    path = overlay_path(client_id, run_id)
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    return _sanitize_overlay(data)


def save_overlay(client_id: str, run_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    cleaned = _sanitize_overlay(payload)
    cleaned["saved_at"] = datetime.now().isoformat(timespec="seconds")
    overlay_path(client_id, run_id).write_text(
        json.dumps(cleaned, indent=2), encoding="utf-8"
    )
    return cleaned


def _sanitize_overlay(raw: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {"version": 1}
    if isinstance(raw.get("primary_image"), str) and raw["primary_image"].strip():
        fn = raw["primary_image"].strip()
        if ".." not in fn and "/" not in fn and "\\" not in fn:
            out["primary_image"] = fn
    sw = raw.get("source_width")
    sh = raw.get("source_height")
    if isinstance(sw, (int, float)) and sw > 0:
        out["source_width"] = int(sw)
    if isinstance(sh, (int, float)) and sh > 0:
        out["source_height"] = int(sh)

    logo = raw.get("logo")
    if isinstance(logo, dict) and bool(logo.get("visible", False)):
        out["logo"] = {
            "visible": True,
            "x": _clamp(float(logo.get("x", 0)), 0.0, 1.0),
            "y": _clamp(float(logo.get("y", 0)), 0.0, 1.0),
            "width": _clamp(float(logo.get("width", 0.15)), 0.02, 0.6),
            "opacity": _clamp(float(logo.get("opacity", 1.0)), 0.05, 1.0),
        }
    else:
        out["logo"] = {"visible": False}

    text = raw.get("text")
    if isinstance(text, dict):
        content = str(text.get("content") or "").strip()[:500]
        text_visible = bool(text.get("visible", True)) and bool(content)
        out["text"] = {
            "visible": text_visible,
            "content": content if text_visible else "",
            "x": _clamp(float(text.get("x", 0.05)), 0.0, 1.0),
            "y": _clamp(float(text.get("y", 0.75)), 0.0, 1.0),
            "width": _clamp(float(text.get("width", 0.9)), 0.1, 1.0),
            "fontSize": int(_clamp(float(text.get("fontSize", 48)), 12, 200)),
            "fontFamily": _safe_font_name(text.get("fontFamily")),
            "fill": _safe_color(text.get("fill")),
            "fontWeight": "bold"
            if str(text.get("fontWeight") or "").lower() in ("bold", "700", "800", "900")
            else "normal",
            "textAlign": text.get("textAlign")
            if text.get("textAlign") in ("left", "center", "right")
            else "left",
            "backgroundEnabled": bool(text.get("backgroundEnabled")),
            "backgroundColor": _safe_color(text.get("backgroundColor") or "#000000"),
            "backgroundOpacity": _clamp(
                float(text.get("backgroundOpacity", 0.65)), 0.0, 1.0
            ),
        }
        tx, tw = out["text"]["x"], out["text"]["width"]
        if tx + tw > 1.0:
            out["text"]["width"] = max(0.1, 1.0 - tx)
        align = out["text"]["textAlign"]
        if align == "center" and (tx > 0.15 or tx + tw > 1.01):
            tw = min(tw, 0.9)
            out["text"]["width"] = tw
            out["text"]["x"] = max(0.0, (1.0 - tw) / 2.0)
    return out


def compute_crop_box(
    src_w: int, src_h: int, target_w: int, target_h: int
) -> tuple[int, int, int, int]:
    """Center-crop box (left, top, crop_w, crop_h) for target aspect ratio."""
    tw = float(target_w) / float(target_h)
    cur = float(src_w) / float(src_h)
    if abs(cur - tw) < 1e-6:
        return (0, 0, src_w, src_h)
    if cur > tw:
        new_w = int(src_h * tw)
        left = (src_w - new_w) // 2
        return (left, 0, new_w, src_h)
    new_h = int(src_w / tw)
    top = (src_h - new_h) // 2
    return (0, top, src_w, new_h)


def compute_fit_placement(
    src_w: int, src_h: int, target_w: int, target_h: int
) -> tuple[int, int, int, int]:
    """Return (paste_left, paste_top, paste_w, paste_h) — full source, never cropped."""
    scale = min(float(target_w) / float(src_w), float(target_h) / float(src_h))
    paste_w = max(1, int(round(src_w * scale)))
    paste_h = max(1, int(round(src_h * scale)))
    paste_left = (target_w - paste_w) // 2
    paste_top = (target_h - paste_h) // 2
    return (paste_left, paste_top, paste_w, paste_h)


def compute_fit_placement_in_band(
    src_w: int,
    src_h: int,
    target_w: int,
    band_top: int,
    band_bottom: int,
) -> tuple[int, int, int, int]:
    """Fit the source inside a horizontal band (e.g. below a template header)."""
    band_top = max(0, int(band_top))
    band_bottom = max(band_top + 1, int(band_bottom))
    band_h = band_bottom - band_top
    paste_left, _rel_top, paste_w, paste_h = compute_fit_placement(
        src_w, src_h, target_w, band_h
    )
    paste_top = band_top + _rel_top
    return (paste_left, paste_top, paste_w, paste_h)


def _blurred_cover_background(
    base: Image.Image,
    target_w: int,
    target_h: int,
) -> Image.Image:
    src_w, src_h = base.size
    cover_scale = max(float(target_w) / src_w, float(target_h) / src_h)
    cover_w = max(1, int(round(src_w * cover_scale)))
    cover_h = max(1, int(round(src_h * cover_scale)))
    cover = base.resize((cover_w, cover_h), Image.LANCZOS)
    crop_left = max(0, (cover_w - target_w) // 2)
    crop_top = max(0, (cover_h - target_h) // 2)
    canvas = cover.crop(
        (crop_left, crop_top, crop_left + target_w, crop_top + target_h)
    )
    blur_radius = max(10, min(target_w, target_h) // 28)
    canvas = canvas.filter(ImageFilter.GaussianBlur(radius=blur_radius))
    return ImageEnhance.Brightness(canvas).enhance(0.82)


def _fit_canvas_with_blurred_fill(
    base: Image.Image,
    target_w: int,
    target_h: int,
    *,
    content_band: tuple[int, int] | None = None,
) -> tuple[Image.Image, tuple[int, int, int, int]]:
    """Scale the entire source image inside the frame; blurred fill in empty margins."""
    if content_band is not None:
        band_top, band_bottom = content_band
        placement = compute_fit_placement_in_band(
            *base.size, target_w, band_top, band_bottom
        )
    else:
        placement = compute_fit_placement(*base.size, target_w, target_h)
    paste_left, paste_top, paste_w, paste_h = placement

    canvas = _blurred_cover_background(base, target_w, target_h)
    sharp = base.resize((paste_w, paste_h), Image.LANCZOS)
    canvas.paste(sharp, (paste_left, paste_top))
    return canvas, placement


def _estimate_layer_height(layer: dict[str, Any], *, is_text: bool) -> float:
    if is_text:
        lines = max(1, str(layer.get("content") or "").count("\n") + 1)
        fs = float(layer.get("fontSize", 48))
        return fs * lines * 1.35
    return float(layer.get("width", 0.15)) * 0.45 * 1024


def _layer_center_in_crop(
    layer: dict[str, Any],
    *,
    src_w: int,
    src_h: int,
    is_text: bool,
) -> tuple[float, float]:
    x = float(layer.get("x", 0)) * src_w
    y = float(layer.get("y", 0)) * src_h
    w = float(layer.get("width", 0.15)) * src_w
    h = _estimate_layer_height(layer, is_text=is_text)
    return x + w / 2.0, y + h / 2.0


def _transform_layer_for_export(
    layer: dict[str, Any],
    *,
    src_w: int,
    src_h: int,
    out_w: int,
    out_h: int,
    content_left: float,
    content_top: float,
    content_w: float,
    content_h: float,
    src_crop_left: float,
    src_crop_top: float,
    src_crop_w: float,
    src_crop_h: float,
    is_text: bool,
    allow_reposition: bool,
) -> dict[str, Any] | None:
    if not layer.get("visible"):
        return None

    cx, cy = _layer_center_in_crop(layer, src_w=src_w, src_h=src_h, is_text=is_text)
    crop_l, crop_t = src_crop_left, src_crop_top
    crop_r, crop_b = crop_l + src_crop_w, crop_t + src_crop_h

    out = dict(layer)
    scale = content_h / float(src_crop_h)

    if not (crop_l <= cx <= crop_r and crop_t <= cy <= crop_b):
        if not allow_reposition:
            return None
        if is_text:
            tw = min(float(layer.get("width", 0.9)), 0.9)
            align = layer.get("textAlign") or "left"
            out["width"] = tw
            out["x"] = (1.0 - tw) / 2.0 if align == "center" else 0.05
            out["y"] = 0.78
            out["fontSize"] = max(
                12, int(float(layer.get("fontSize", 48)) * scale)
            )
        else:
            out["x"] = 0.05
            out["y"] = 0.05
            out["width"] = float(layer.get("width", 0.18))
        return out

    sx = float(layer.get("x", 0)) * src_w
    sy = float(layer.get("y", 0)) * src_h
    sw = float(layer.get("width", 0.15)) * src_w

    rel_x = (sx - src_crop_left) / src_crop_w
    rel_y = (sy - src_crop_top) / src_crop_h
    out_px = content_left + rel_x * content_w
    out_py = content_top + rel_y * content_h

    out["x"] = _clamp(out_px / float(out_w), 0.0, 1.0)
    out["y"] = _clamp(out_py / float(out_h), 0.0, 1.0)
    out["width"] = _clamp((sw / src_crop_w * content_w) / float(out_w), 0.02, 1.0)
    if out["x"] + out["width"] > 1.0:
        out["width"] = max(0.1, 1.0 - out["x"])

    if is_text:
        out["fontSize"] = max(12, int(float(layer.get("fontSize", 48)) * scale))

    return out


def _transform_layer_for_format(
    layer: dict[str, Any],
    *,
    crop_box: tuple[int, int, int, int],
    src_w: int,
    src_h: int,
    out_w: int,
    out_h: int,
    is_text: bool,
) -> dict[str, Any] | None:
    left, top, cw, ch = crop_box
    return _transform_layer_for_export(
        layer,
        src_w=src_w,
        src_h=src_h,
        out_w=out_w,
        out_h=out_h,
        content_left=0.0,
        content_top=0.0,
        content_w=float(out_w),
        content_h=float(out_h),
        src_crop_left=float(left),
        src_crop_top=float(top),
        src_crop_w=float(cw),
        src_crop_h=float(ch),
        is_text=is_text,
        allow_reposition=True,
    )


def overlay_for_format(
    overlay: dict[str, Any] | None,
    *,
    crop_box: tuple[int, int, int, int],
    src_w: int,
    src_h: int,
    out_w: int,
    out_h: int,
) -> dict[str, Any] | None:
    """Remap overlay layers from source square coords to a cropped export."""
    if not overlay:
        return None

    remapped: dict[str, Any] = {"version": overlay.get("version", 1)}
    logo = overlay.get("logo")
    if isinstance(logo, dict):
        remapped["logo"] = _transform_layer_for_format(
            logo,
            crop_box=crop_box,
            src_w=src_w,
            src_h=src_h,
            out_w=out_w,
            out_h=out_h,
            is_text=False,
        ) or {"visible": False}

    text = overlay.get("text")
    if isinstance(text, dict):
        remapped["text"] = _transform_layer_for_format(
            text,
            crop_box=crop_box,
            src_w=src_w,
            src_h=src_h,
            out_w=out_w,
            out_h=out_h,
            is_text=True,
        ) or {"visible": False, "content": ""}

    return remapped if has_visible_overlay(remapped) else None


def overlay_for_fit(
    overlay: dict[str, Any] | None,
    *,
    placement: tuple[int, int, int, int],
    src_w: int,
    src_h: int,
    out_w: int,
    out_h: int,
) -> dict[str, Any] | None:
    """Remap overlay layers when the full source image is scaled to fit in the export."""
    if not overlay:
        return None

    paste_left, paste_top, paste_w, paste_h = placement
    remapped: dict[str, Any] = {"version": overlay.get("version", 1)}
    logo = overlay.get("logo")
    if isinstance(logo, dict):
        remapped["logo"] = _transform_layer_for_export(
            logo,
            src_w=src_w,
            src_h=src_h,
            out_w=out_w,
            out_h=out_h,
            content_left=float(paste_left),
            content_top=float(paste_top),
            content_w=float(paste_w),
            content_h=float(paste_h),
            src_crop_left=0.0,
            src_crop_top=0.0,
            src_crop_w=float(src_w),
            src_crop_h=float(src_h),
            is_text=False,
            allow_reposition=False,
        ) or {"visible": False}

    text = overlay.get("text")
    if isinstance(text, dict):
        remapped["text"] = _transform_layer_for_export(
            text,
            src_w=src_w,
            src_h=src_h,
            out_w=out_w,
            out_h=out_h,
            content_left=float(paste_left),
            content_top=float(paste_top),
            content_w=float(paste_w),
            content_h=float(paste_h),
            src_crop_left=0.0,
            src_crop_top=0.0,
            src_crop_w=float(src_w),
            src_crop_h=float(src_h),
            is_text=True,
            allow_reposition=False,
        ) or {"visible": False, "content": ""}

    return remapped if has_visible_overlay(remapped) else None


def _edge_row_color(image: Image.Image) -> tuple[int, int, int]:
    row = image.crop((0, image.size[1] - 1, image.size[0], image.size[1]))
    sample = row.resize((1, 1), Image.LANCZOS)
    return sample.getpixel((0, 0))


def export_for_brand_template(
    base: Image.Image,
    target_w: int,
    target_h: int,
    content_band: tuple[int, int] | None = None,
) -> Image.Image:
    """Stack layout: contain the full photo above the footer, never crop or cover it."""
    photo_h = target_h
    if content_band is not None:
        photo_h = max(1, min(target_h, int(content_band[1])))

    src_w, src_h = base.size
    paste_left, paste_top, paste_w, paste_h = compute_fit_placement(
        src_w, src_h, target_w, photo_h
    )

    bg = _edge_row_color(base)
    canvas = Image.new("RGB", (target_w, target_h), bg)
    scaled = base.resize((paste_w, paste_h), Image.LANCZOS)
    canvas.paste(scaled, (paste_left, paste_top))
    return canvas


TEMPLATE_EXPORT_POLICY = "template_stack_contain_v12"


def render_branded_channel_exports(
    base: Image.Image,
    *,
    content_band_for: Callable[[dict[str, str | int]], tuple[int, int] | None],
    post_render: Callable[[Image.Image, dict[str, str | int]], Image.Image] | None = None,
) -> dict[str, Image.Image]:
    """Export platform images: photo underlay + brand template on top."""
    from . import social_channels

    out: dict[str, Image.Image] = {}
    for ch in social_channels.SOCIAL_CHANNELS:
        band = content_band_for(ch)
        rendered = export_for_brand_template(
            base,
            int(ch["width"]),
            int(ch["height"]),
            band,
        )
        if post_render is not None:
            rendered = post_render(rendered, ch)
        out[str(ch["key"])] = rendered
    return out


EXPORT_RESIZE_POLICY = "contain_blur_v4"


def export_resize_mode() -> str:
    """Always contain — crop mode is disabled for platform exports."""
    return "fit"


def render_channel_exports(
    base: Image.Image,
    overlay: dict[str, Any] | None,
    *,
    logo_path: Path | None = None,
    post_render: Callable[[Image.Image, dict[str, str | int]], Image.Image] | None = None,
) -> dict[str, Image.Image]:
    """Export one image per social channel using the active resize policy."""
    from . import social_channels

    mode = export_resize_mode()
    out: dict[str, Image.Image] = {}
    for ch in social_channels.SOCIAL_CHANNELS:
        rendered = export_formatted_image(
            base,
            overlay,
            logo_path=logo_path,
            target_w=int(ch["width"]),
            target_h=int(ch["height"]),
            resize_mode=mode,
        )
        if post_render is not None:
            rendered = post_render(rendered, ch)
        out[str(ch["key"])] = rendered
    return out


def export_formatted_image(
    base: Image.Image,
    overlay: dict[str, Any] | None,
    *,
    logo_path: Path | None,
    target_w: int,
    target_h: int,
    resize_mode: str = "fit",
    content_band: tuple[int, int] | None = None,
) -> Image.Image:
    """Resize for a platform frame, then burn overlay using format-aware coordinates.

    The full source image is always scaled to fit inside the frame (or inside
    ``content_band`` when branding overlays reserve the top/bottom). Empty margins
    use a blurred extension of the image — nothing is cropped.
    """
    src_w, src_h = base.size
    canvas, placement = _fit_canvas_with_blurred_fill(
        base, target_w, target_h, content_band=content_band
    )
    fmt_overlay = overlay_for_fit(
        overlay,
        placement=placement,
        src_w=src_w,
        src_h=src_h,
        out_w=target_w,
        out_h=target_h,
    )

    if fmt_overlay:
        canvas = apply_overlay(canvas, fmt_overlay, logo_path=logo_path)

    return canvas.convert("RGB")


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _safe_font_name(raw: Any) -> str:
    name = str(raw or "Arial").strip()
    return name if name in FONT_MAP else "Arial"


def _safe_color(raw: Any) -> str:
    s = str(raw or "#ffffff").strip()
    if s.startswith("#") and len(s) in (4, 7):
        return s
    return "#ffffff"


def _get_font(family: str, size: int, *, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    use_bold = bold or family in DISPLAY_BOLD_FONTS
    candidates: list[Path] = []
    if use_bold:
        candidates.append(FONT_DIR / "DejaVuSans-Bold.ttf")
    fname = FONT_MAP.get(family, "DejaVuSans.ttf")
    candidates.append(FONT_DIR / fname)
    if not use_bold:
        candidates.append(FONT_DIR / "DejaVuSans-Bold.ttf")
    # Windows dev fallback (not used in production Linux deploys)
    if sys.platform == "win32":
        windir = Path(os.environ.get("WINDIR", r"C:\Windows"))
        win_fonts = windir / "Fonts"
        win_map = {
            "DejaVuSans.ttf": "arial.ttf",
            "DejaVuSans-Bold.ttf": "arialbd.ttf",
            "DejaVuSerif.ttf": "georgia.ttf",
        }
        for c in list(candidates):
            win_name = win_map.get(c.name)
            if win_name:
                candidates.append(win_fonts / win_name)

    for path in candidates:
        if path.is_file() and path.stat().st_size > 1000:
            try:
                return ImageFont.truetype(str(path), size)
            except OSError:
                continue
    logger.warning("Could not load font for %s size %s; using default", family, size)
    return ImageFont.load_default()


def _hex_to_rgb(color: str) -> tuple[int, int, int]:
    c = color.lstrip("#")
    if len(c) == 3:
        c = "".join(ch * 2 for ch in c)
    try:
        return int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)
    except ValueError:
        return 255, 255, 255


def _wrap_lines(text: str, font: ImageFont.ImageFont, max_px: int) -> list[str]:
    words = text.replace("\r", "").split()
    if not words:
        return []
    lines: list[str] = []
    current: list[str] = []
    for word in words:
        trial = " ".join(current + [word]) if current else word
        bbox = font.getbbox(trial)
        width = bbox[2] - bbox[0]
        if width <= max_px or not current:
            current.append(word)
        else:
            lines.append(" ".join(current))
            current = [word]
    if current:
        lines.append(" ".join(current))
    return lines


def _load_logo_rgba(logo_path: Path) -> Image.Image | None:
    """Load workspace logo as RGBA; supports raster formats Pillow can read."""
    suffix = logo_path.suffix.lower()
    if suffix == ".svg":
        try:
            import cairosvg
        except ImportError:
            logger.warning(
                "Workspace logo is SVG but cairosvg is not installed; skipping logo overlay"
            )
            return None
        try:
            import io

            png_bytes = cairosvg.svg2png(url=str(logo_path))
            return Image.open(io.BytesIO(png_bytes)).convert("RGBA")
        except Exception as e:
            logger.warning("Could not rasterize SVG logo %s: %s", logo_path, e)
            return None
    try:
        with Image.open(logo_path) as im:
            return im.convert("RGBA")
    except Exception as e:
        logger.warning("Could not load logo %s: %s", logo_path, e)
        return None


def _paste_logo(
    base: Image.Image, logo_path: Path, cfg: dict[str, Any]
) -> Image.Image:
    if not cfg.get("visible", True):
        return base
    if not logo_path.is_file():
        logger.warning("Logo not found at %s", logo_path)
        return base

    logo = _load_logo_rgba(logo_path)
    if logo is None:
        return base

    w, h = base.size
    target_w = max(8, int(float(cfg.get("width", 0.15)) * w))
    scale = target_w / max(1, logo.width)
    target_h = max(8, int(logo.height * scale))
    logo = logo.resize((target_w, target_h), Image.LANCZOS)

    opacity = float(cfg.get("opacity", 1.0))
    if opacity < 0.999:
        alpha = logo.split()[3]
        alpha = alpha.point(lambda p: int(p * opacity))
        logo.putalpha(alpha)

    x = int(float(cfg.get("x", 0.02)) * w)
    y = int(float(cfg.get("y", 0.02)) * h)
    x = max(0, min(x, w - target_w))
    y = max(0, min(y, h - target_h))

    out = base.convert("RGBA")
    out.alpha_composite(logo, (x, y))
    return out


def _draw_text(base: Image.Image, cfg: dict[str, Any]) -> Image.Image:
    if not cfg.get("visible", True):
        return base
    content = str(cfg.get("content") or "").strip()
    if not content:
        return base

    w, h = base.size
    font_size = int(cfg.get("fontSize", 48))
    bold = str(cfg.get("fontWeight") or "").lower() == "bold"
    font = _get_font(str(cfg.get("fontFamily") or "Arial"), font_size, bold=bold)
    fill = _hex_to_rgb(str(cfg.get("fill") or "#ffffff"))

    max_w = int(float(cfg.get("width", 0.9)) * w)
    x0 = int(float(cfg.get("x", 0.05)) * w)
    y0 = int(float(cfg.get("y", 0.75)) * h)
    x0 = max(0, min(x0, w - 1))
    max_w = max(8, min(max_w, w - x0))
    align = cfg.get("textAlign") or "left"

    lines = _wrap_lines(content, font, max_w)
    if not lines:
        return base

    line_heights = []
    line_widths = []
    for line in lines:
        bbox = font.getbbox(line)
        line_widths.append(bbox[2] - bbox[0])
        line_heights.append(bbox[3] - bbox[1])

    line_gap = max(4, font_size // 8)

    out = base.convert("RGBA")
    draw = ImageDraw.Draw(out)

    line_positions: list[tuple[int, int, int]] = []
    y = y0
    for i, line in enumerate(lines):
        lw = line_widths[i]
        if align == "center":
            x = x0 + (max_w - lw) // 2
        elif align == "right":
            x = x0 + max_w - lw
        else:
            x = x0
        line_positions.append((x, y, lw))
        y += line_heights[i] + line_gap

    bg_enabled = bool(cfg.get("backgroundEnabled"))
    if bg_enabled and line_positions:
        pad = max(6, font_size // 5)
        left = min(p[0] for p in line_positions) - pad
        right = max(p[0] + p[2] for p in line_positions) + pad
        top = line_positions[0][1] - pad
        bottom = line_positions[-1][1] + line_heights[-1] + pad
        left = max(0, left)
        top = max(0, top)
        right = min(w, right)
        bottom = min(h, bottom)
        bg_rgb = _hex_to_rgb(str(cfg.get("backgroundColor") or "#000000"))
        bg_alpha = int(
            _clamp(float(cfg.get("backgroundOpacity", 0.65)), 0.0, 1.0) * 255
        )
        radius = max(4, pad // 2)
        try:
            draw.rounded_rectangle(
                (left, top, right, bottom),
                radius=radius,
                fill=bg_rgb + (bg_alpha,),
            )
        except AttributeError:
            draw.rectangle((left, top, right, bottom), fill=bg_rgb + (bg_alpha,))

    shadow = (0, 0, 0, 160)
    for i, line in enumerate(lines):
        x, y, _lw = line_positions[i]
        if not bg_enabled:
            draw.text((x + 2, y + 2), line, font=font, fill=shadow)
        draw.text((x, y), line, font=font, fill=fill + (255,))

    return out


def apply_overlay(
    image: Image.Image,
    overlay: dict[str, Any] | None,
    *,
    logo_path: Path | None,
) -> Image.Image:
    """Return a new RGB image with logo + text applied."""
    if not overlay:
        return image.convert("RGB")

    out = image.convert("RGBA")
    logo_cfg = overlay.get("logo")
    if isinstance(logo_cfg, dict) and logo_cfg.get("visible") and logo_path:
        out = _paste_logo(out, logo_path, logo_cfg)

    text_cfg = overlay.get("text")
    if isinstance(text_cfg, dict) and text_cfg.get("visible"):
        out = _draw_text(out, text_cfg)

    return out.convert("RGB")


def overlay_apply_summary(
    overlay: dict[str, Any] | None,
    *,
    logo_path: Path | None,
    primary_image: str | None,
) -> str:
    """Human-readable note for Step 6 artifact output."""
    if not overlay:
        return "No overlay.json found — run Step 4 composer and click Save overlay first."
    if not has_visible_overlay(overlay):
        return "Overlay file exists but logo/text are hidden or empty."

    parts: list[str] = []
    saved = overlay.get("saved_at")
    if isinstance(saved, str) and saved.strip():
        parts.append(f"Overlay saved at {saved.strip()}")

    ov_primary = overlay.get("primary_image")
    if (
        isinstance(ov_primary, str)
        and primary_image
        and ov_primary.strip()
        and ov_primary.strip() != primary_image.strip()
    ):
        parts.append(
            f"Warning: overlay was saved for {ov_primary} but exporting {primary_image}"
        )

    logo = overlay.get("logo") or {}
    text = overlay.get("text") or {}
    if logo.get("visible"):
        if logo_path and logo_path.is_file():
            parts.append(f"Logo applied ({logo_path.name})")
        else:
            parts.append("Logo enabled but workspace logo file not found on server")
    if text.get("visible") and str(text.get("content") or "").strip():
        snippet = str(text.get("content") or "").strip()
        if len(snippet) > 40:
            snippet = snippet[:37] + "..."
        parts.append(f'Text applied: "{snippet}"')

    return " | ".join(parts) if parts else "Overlay applied."


def has_visible_overlay(overlay: dict[str, Any] | None) -> bool:
    if not overlay:
        return False
    logo = overlay.get("logo") or {}
    text = overlay.get("text") or {}
    if logo.get("visible"):
        return True
    if text.get("visible") and str(text.get("content") or "").strip():
        return True
    return False
