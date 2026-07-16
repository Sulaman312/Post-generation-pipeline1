"""Client-specific fixed social image templates rendered with Pillow."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont

from . import artifacts, config

logger = logging.getLogger(__name__)

FONT_DIR = Path(__file__).resolve().parent / "fonts"
RUN_TEMPLATE_FILENAME = "template.json"
DEFAULT_TEMPLATE_ID = "social_post"


def _template_display_name(client_id: str, template_id: str, spec: dict[str, Any] | None = None) -> str:
    name = str((spec or {}).get("name") or "").strip()
    generic_name = f"{client_id} Social Post"
    if name and name != generic_name:
        return name
    return template_id


def list_client_templates(client_id: str) -> list[dict[str, str]]:
    root = config.CLIENTS_DIR / client_id / "templates"
    if not root.is_dir():
        return []
    rows: list[dict[str, str]] = []
    for path in sorted(root.iterdir(), key=lambda p: p.name.lower()):
        if not path.is_dir():
            continue
        template_path = path / "template.json"
        if not template_path.is_file():
            continue
        name = path.name
        try:
            data = json.loads(template_path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                name = _template_display_name(client_id, path.name, data)
        except json.JSONDecodeError:
            pass
        rows.append({"id": path.name, "name": name})
    return rows


def client_template_dir(client_id: str, template_id: str = DEFAULT_TEMPLATE_ID) -> Path:
    return config.CLIENTS_DIR / client_id / "templates" / template_id


def client_template_path(client_id: str, template_id: str = DEFAULT_TEMPLATE_ID) -> Path:
    return client_template_dir(client_id, template_id) / "template.json"


def _source_template_label(path: Path) -> str:
    try:
        rel = path.relative_to(config.REPO_ROOT)
    except ValueError:
        # Mongo mode hydrates client data into a disposable cache outside the repo.
        rel = Path("clients") / path.relative_to(config.CLIENTS_DIR)
    return rel.as_posix()


def run_template_path(client_id: str, run_id: str) -> Path:
    root = artifacts.get_run_dir(client_id, run_id) / "images"
    root.mkdir(parents=True, exist_ok=True)
    return root / RUN_TEMPLATE_FILENAME


def load_client_template(
    client_id: str,
    template_id: str = DEFAULT_TEMPLATE_ID,
) -> dict[str, Any] | None:
    path = client_template_path(client_id, template_id)
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        logger.warning("Invalid template JSON at %s", path)
        return None
    return data if isinstance(data, dict) else None


def save_run_template(
    client_id: str,
    run_id: str,
    *,
    template_id: str = DEFAULT_TEMPLATE_ID,
) -> dict[str, Any]:
    spec = load_client_template(client_id, template_id)
    if not spec:
        raise RuntimeError(
            f"No social template found at {client_template_path(client_id, template_id)}"
        )

    headline = spec.get("headline") if isinstance(spec.get("headline"), dict) else {}
    lines = headline.get("lines") if isinstance(headline.get("lines"), list) else []
    payload = {
        "version": 1,
        "template_id": template_id,
        "template_name": _template_display_name(client_id, template_id, spec),
        "source_template": _source_template_label(
            client_template_path(client_id, template_id)
        ),
        "headline": {"lines": lines},
        "formats": spec.get("formats") if isinstance(spec.get("formats"), dict) else {},
        "created_at": datetime.now().isoformat(timespec="seconds"),
    }
    run_template_path(client_id, run_id).write_text(
        json.dumps(payload, indent=2), encoding="utf-8"
    )
    return payload


def load_run_template(client_id: str, run_id: str) -> dict[str, Any] | None:
    path = run_template_path(client_id, run_id)
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def ensure_run_template(
    client_id: str,
    run_id: str,
    *,
    template_id: str = DEFAULT_TEMPLATE_ID,
) -> dict[str, Any]:
    if template_id == DEFAULT_TEMPLATE_ID and not client_template_path(client_id, template_id).is_file():
        templates = list_client_templates(client_id)
        if templates:
            template_id = templates[0]["id"]
    current = load_run_template(client_id, run_id)
    if current and str(current.get("template_id") or "") != template_id:
        return save_run_template(
            client_id,
            run_id,
            template_id=template_id,
        )
    client_path = client_template_path(client_id, template_id)
    run_path = run_template_path(client_id, run_id)
    if current and client_path.is_file() and run_path.is_file():
        if client_path.stat().st_mtime <= run_path.stat().st_mtime:
            return current
    return save_run_template(
        client_id,
        run_id,
        template_id=template_id,
    )


def save_template_layout(
    client_id: str,
    run_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    template_id = str(payload.get("template_id") or DEFAULT_TEMPLATE_ID).strip()
    current = ensure_run_template(client_id, run_id, template_id=template_id)
    formats = payload.get("formats")
    if isinstance(formats, dict):
        current["formats"] = formats
    headline = payload.get("headline")
    if isinstance(headline, dict):
        current["headline"] = headline
    current["updated_at"] = datetime.now().isoformat(timespec="seconds")
    run_template_path(client_id, run_id).write_text(
        json.dumps(current, indent=2), encoding="utf-8"
    )
    return current


def _hex_to_rgb(color: str) -> tuple[int, int, int]:
    c = str(color or "#ffffff").strip().lstrip("#")
    if len(c) == 3:
        c = "".join(ch * 2 for ch in c)
    try:
        return int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)
    except (ValueError, IndexError):
        return 255, 255, 255


def _font(size: int, *, bold: bool) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    path = FONT_DIR / name
    if path.is_file():
        try:
            return ImageFont.truetype(str(path), size)
        except OSError:
            pass
    return ImageFont.load_default()


def _text_width(text: str, font: ImageFont.ImageFont) -> int:
    bbox = font.getbbox(text)
    return bbox[2] - bbox[0]


def _line_height(font: ImageFont.ImageFont) -> int:
    bbox = font.getbbox("Ag")
    return bbox[3] - bbox[1]


def _fit_fonts(
    lines: list[dict[str, Any]],
    *,
    font_size: int,
    max_width: int,
    max_height: int | None,
    line_gap: int,
) -> tuple[int, list[ImageFont.ImageFont]]:
    size = max(12, int(font_size))
    while size >= 12:
        fonts = [
            _font(size, bold=str(line.get("weight") or "").lower() == "bold")
            for line in lines
        ]
        widths = [_text_width(str(line.get("text") or ""), fonts[i]) for i, line in enumerate(lines)]
        heights = [_line_height(f) for f in fonts]
        total_h = sum(heights) + line_gap * max(0, len(lines) - 1)
        if max(widths or [0]) <= max_width and (max_height is None or total_h <= max_height):
            return size, fonts
        size -= 2
    return 12, [
        _font(12, bold=str(line.get("weight") or "").lower() == "bold")
        for line in lines
    ]


def _load_template_logo(
    client_id: str,
    template_dir: Path,
    spec: dict[str, Any],
) -> Image.Image | None:
    logo = spec.get("logo") if isinstance(spec.get("logo"), dict) else {}
    filename = str(logo.get("file") or "logo.png").strip()
    candidates: list[Path] = []
    assets_dir = template_dir / str(spec.get("assets_dir") or "assets")
    if filename and ".." not in filename and "/" not in filename and "\\" not in filename:
        candidates.append(assets_dir / filename)
    if bool(logo.get("fallback_workspace_logo", True)):
        workspace_logo = artifacts.client_logo_path(client_id)
        if workspace_logo:
            candidates.append(workspace_logo)

    for path in candidates:
        if not path.is_file():
            continue
        try:
            with Image.open(path) as im:
                return im.convert("RGBA")
        except Exception as e:
            logger.warning("Could not load template logo %s: %s", path, e)
    return None


def _safe_asset_filename(raw: Any) -> str | None:
    filename = str(raw or "").strip()
    if not filename or ".." in filename or "/" in filename or "\\" in filename:
        return None
    return filename


def _load_asset_rgba(template_dir: Path, spec: dict[str, Any], filename: Any) -> Image.Image | None:
    safe = _safe_asset_filename(filename)
    if not safe:
        return None
    path = template_dir / str(spec.get("assets_dir") or "assets") / safe
    if not path.is_file():
        return None
    try:
        with Image.open(path) as im:
            return im.convert("RGBA")
    except Exception as e:
        logger.warning("Could not load template asset %s: %s", path, e)
        return None


def _draw_imported_layers(
    out: Image.Image,
    *,
    layers: list[Any],
    template_dir: Path,
    spec: dict[str, Any],
    omit_text: bool = False,
) -> Image.Image:
    draw = ImageDraw.Draw(out, "RGBA")
    for layer in layers:
        if not isinstance(layer, dict) or layer.get("visible") is False:
            continue
        kind = str(layer.get("kind") or "").strip()
        x = int(round(float(layer.get("x") or 0)))
        y = int(round(float(layer.get("y") or 0)))
        w = max(1, int(round(float(layer.get("width") or 1))))
        h = max(1, int(round(float(layer.get("height") or 1))))

        if kind == "asset":
            asset = _load_asset_rgba(template_dir, spec, layer.get("asset"))
            if not asset:
                continue
            asset = asset.resize((w, h), Image.LANCZOS)
            opacity = float(layer.get("opacity", 1.0))
            if opacity < 0.999:
                alpha = asset.split()[3]
                alpha = alpha.point(lambda p: int(p * max(0.0, min(1.0, opacity))))
                asset.putalpha(alpha)
            out.alpha_composite(asset, (x, y))
            continue

        if kind == "shape":
            fill = _hex_to_rgb(str(layer.get("fill") or "#111827"))
            alpha = int(max(0.0, min(1.0, float(layer.get("opacity", 1.0)))) * 255)
            radius = int(round(float(layer.get("radius") or 0)))
            if radius > 0:
                draw.rounded_rectangle((x, y, x + w, y + h), radius=radius, fill=fill + (alpha,))
            else:
                draw.rectangle((x, y, x + w, y + h), fill=fill + (alpha,))
            continue

        if kind == "text":
            if omit_text:
                continue
            text = str(layer.get("text") or "").strip()
            if not text:
                continue
            font_size = max(8, int(round(float(layer.get("fontSize") or 36))))
            weight = str(layer.get("fontWeight") or "").lower()
            font = _font(font_size, bold=weight in ("bold", "700", "800", "900"))
            fill = _hex_to_rgb(str(layer.get("fill") or "#ffffff"))
            align = str(layer.get("textAlign") or "left").lower()
            lines = text.replace("\r", "").splitlines() or [text]
            yy = y
            line_gap = max(2, int(font_size * 0.18))
            for line in lines:
                line = line.strip()
                if not line:
                    yy += _line_height(font) + line_gap
                    continue
                tw = _text_width(line, font)
                if align == "center":
                    xx = x + max(0, (w - tw) // 2)
                elif align == "right":
                    xx = x + max(0, w - tw)
                else:
                    xx = x
                draw.text((xx, yy), line, font=font, fill=fill + (255,))
                yy += _line_height(font) + line_gap
    return out


def _layer_bounds(layer: dict[str, Any]) -> tuple[int, int, int, int]:
    x = int(round(float(layer.get("x") or 0)))
    y = int(round(float(layer.get("y") or 0)))
    w = max(0, int(round(float(layer.get("width") or 0))))
    h = max(0, int(round(float(layer.get("height") or 0))))
    return x, y, w, h


def _format_needs_full_bleed_photo(
    fmt: dict[str, Any] | None,
    frame_h: int,
) -> bool:
    """True for slanted footer shapes that must sit on a full-bleed photo.

    Rectangular footer bars (e.g. Schneiter green-footer-bg) keep the clipped
    photo zone so the image fits the content band between header and footer.
    """
    if not isinstance(fmt, dict) or frame_h < 1:
        return False
    layers = fmt.get("layers")
    if not isinstance(layers, list):
        return False
    for layer in layers:
        if not isinstance(layer, dict) or layer.get("visible") is False:
            continue
        if str(layer.get("kind") or "") != "asset":
            continue
        asset = str(layer.get("asset") or "").lower()
        name = str(layer.get("name") or "").lower()
        if "bottom-shape" in asset or "bottom-shape" in name:
            return True
    return False


def footer_top_from_format(
    fmt: dict[str, Any] | None,
    frame_h: int,
) -> int:
    """Return the Y coordinate where the bottom template (footer) begins."""
    if not isinstance(fmt, dict) or frame_h < 1:
        return frame_h

    layers = fmt.get("layers")
    if isinstance(layers, list) and layers:
        footer_top = frame_h
        for layer in layers:
            if layer.get("visible") is False:
                continue
            y = int(round(float(layer.get("y") or 0)))
            asset = str(layer.get("asset") or "").lower()
            if "footer" in asset or y >= int(frame_h * 0.58):
                footer_top = min(footer_top, y)
        return footer_top if footer_top < frame_h else frame_h

    card = fmt.get("card") if isinstance(fmt.get("card"), dict) else {}
    if card:
        return min(frame_h, int(card.get("y") or frame_h))
    return frame_h


def photo_zone_from_format(
    fmt: dict[str, Any] | None,
    frame_h: int,
    *,
    pad: int = 2,
) -> tuple[int, int] | None:
    """Photo area from frame top to the footer overlay (logo/footer drawn on top)."""
    if not isinstance(fmt, dict) or frame_h < 1:
        return None

    # Slanted Figma footer shapes (bottom-shape) need a full-bleed photo underneath.
    if _format_needs_full_bleed_photo(fmt, frame_h):
        return None

    footer_y = footer_top_from_format(fmt, frame_h)
    if footer_y <= 0 or footer_y >= frame_h:
        return None

    bottom = max(pad + 1, footer_y - pad)
    if bottom < int(frame_h * 0.25):
        return None
    return (0, bottom)


def content_band_from_format(
    fmt: dict[str, Any] | None,
    frame_h: int,
    *,
    pad: int = 6,
) -> tuple[int, int] | None:
    """Return (top, bottom) pixel band where photo content should stay visible.

    Derived from template overlay layers (header logo, footer bars, headline cards).
    """
    if not isinstance(fmt, dict) or frame_h < 1:
        return None

    layers = fmt.get("layers")
    if isinstance(layers, list) and layers:
        top = 0
        bottom = frame_h
        for layer in layers:
            if layer.get("visible") is False:
                continue
            _x, y, _w, h = _layer_bounds(layer)
            bottom_y = y + h
            asset = str(layer.get("asset") or "").lower()
            kind = str(layer.get("kind") or "").strip()

            is_header = y < int(frame_h * 0.28) or (
                kind == "asset" and "logo" in asset and y < int(frame_h * 0.35)
            )
            is_footer = "footer" in asset or y >= int(frame_h * 0.58)

            if is_header:
                top = max(top, bottom_y)
            if is_footer:
                bottom = min(bottom, y)

        top = min(top + pad, frame_h - 2)
        bottom = max(bottom - pad, top + 8)
        if bottom - top < int(frame_h * 0.2):
            return None
        if top <= pad and bottom >= frame_h - pad:
            return None
        return (top, bottom)

    logo_cfg = fmt.get("logo") if isinstance(fmt.get("logo"), dict) else {}
    card = fmt.get("card") if isinstance(fmt.get("card"), dict) else {}
    top = 0
    bottom = frame_h
    if logo_cfg:
        top = max(top, int(logo_cfg.get("y") or 0) + int(logo_cfg.get("height") or 0))
    if card:
        bottom = min(bottom, int(card.get("y") or frame_h))
    top = min(top + pad, frame_h - 2)
    bottom = max(bottom - pad, top + 8)
    if bottom - top < int(frame_h * 0.2):
        return None
    if top <= pad and bottom >= frame_h - pad:
        return None
    return (top, bottom)


def photo_zone_bottom_from_format(
    fmt: dict[str, Any] | None,
    frame_h: int,
) -> int:
    """Return the Y coordinate where the photo zone ends and the footer begins."""
    if not isinstance(fmt, dict) or frame_h < 1:
        return frame_h
    band = content_band_from_format(fmt, frame_h)
    if band:
        return band[1]
    footer_top = footer_top_from_format(fmt, frame_h)
    return footer_top if 0 < footer_top < frame_h else frame_h


def layout_format_key(platform_key: str) -> str:
    """Reuse Instagram layout for platforms that share the same export size."""
    from . import social_channels

    ch = social_channels.CHANNEL_BY_KEY.get(platform_key)
    if not ch or platform_key == "instagram":
        return platform_key
    ig = social_channels.CHANNEL_BY_KEY.get("instagram")
    if not ig:
        return platform_key
    if int(ch["width"]) == int(ig["width"]) and int(ch["height"]) == int(ig["height"]):
        return "instagram"
    return platform_key


def _format_for_platform(
    formats: dict[str, Any] | None,
    platform_key: str,
) -> dict[str, Any] | None:
    if not isinstance(formats, dict):
        return None
    layout_key = layout_format_key(platform_key)
    fmt = formats.get(layout_key)
    if isinstance(fmt, dict):
        return fmt
    fmt = formats.get(platform_key)
    return fmt if isinstance(fmt, dict) else None


def format_spec_for_platform(
    client_id: str,
    run_template: dict[str, Any] | None,
    platform_key: str,
) -> dict[str, Any] | None:
    if not run_template:
        return None
    template_id = str(run_template.get("template_id") or DEFAULT_TEMPLATE_ID).strip()
    spec = load_client_template(client_id, template_id)
    if not spec:
        return None
    formats = run_template.get("formats") if isinstance(run_template.get("formats"), dict) else None
    if not formats:
        formats = spec.get("formats") if isinstance(spec.get("formats"), dict) else {}
    return _format_for_platform(formats, platform_key)


def apply_template(
    image: Image.Image,
    *,
    client_id: str,
    run_template: dict[str, Any] | None,
    platform_key: str,
    omit_text: bool = False,
) -> Image.Image:
    if not run_template:
        return image.convert("RGB")

    template_id = str(run_template.get("template_id") or DEFAULT_TEMPLATE_ID).strip()
    spec = load_client_template(client_id, template_id)
    if not spec:
        return image.convert("RGB")

    formats = run_template.get("formats") if isinstance(run_template.get("formats"), dict) else None
    if not formats:
        formats = spec.get("formats") if isinstance(spec.get("formats"), dict) else {}
    fmt = _format_for_platform(formats, platform_key)
    if not isinstance(fmt, dict):
        logger.warning("Template %s has no format config for %s", template_id, platform_key)
        return image.convert("RGB")

    out = image.convert("RGBA")
    draw = ImageDraw.Draw(out, "RGBA")
    template_dir = client_template_dir(client_id, template_id)

    imported_layers = fmt.get("layers")
    if isinstance(imported_layers, list):
        return _draw_imported_layers(
            out,
            layers=imported_layers,
            template_dir=template_dir,
            spec=spec,
            omit_text=omit_text,
        ).convert("RGB")

    logo_cfg = fmt.get("logo") if isinstance(fmt.get("logo"), dict) else {}
    logo = _load_template_logo(client_id, template_dir, spec)
    if logo and logo_cfg:
        target_w = max(1, int(logo_cfg.get("width") or 0))
        if target_w > 0:
            scale = target_w / max(1, logo.width)
            target_h = max(1, int(round(logo.height * scale)))
            logo = logo.resize((target_w, target_h), Image.LANCZOS)
            opacity = float((spec.get("logo") or {}).get("opacity", 1.0))
            if opacity < 0.999:
                alpha = logo.split()[3]
                alpha = alpha.point(lambda p: int(p * max(0.0, min(1.0, opacity))))
                logo.putalpha(alpha)
            out.alpha_composite(
                logo,
                (int(logo_cfg.get("x") or 0), int(logo_cfg.get("y") or 0)),
            )

    card = fmt.get("card") if isinstance(fmt.get("card"), dict) else {}
    if card:
        x = int(card.get("x") or 0)
        y = int(card.get("y") or 0)
        w = int(card.get("width") or 0)
        h = int(card.get("height") or 0)
        radius = int(card.get("radius") or 0)
        fill = _hex_to_rgb(str(card.get("fill") or "#111827"))
        alpha = int(max(0.0, min(1.0, float(card.get("opacity", 1.0)))) * 255)
        draw.rounded_rectangle((x, y, x + w, y + h), radius=radius, fill=fill + (alpha,))

    if omit_text:
        return out.convert("RGB")

    headline = run_template.get("headline") if isinstance(run_template.get("headline"), dict) else {}
    lines = headline.get("lines") if isinstance(headline.get("lines"), list) else []
    lines = [line for line in lines if isinstance(line, dict) and str(line.get("text") or "").strip()]
    text_cfg = fmt.get("text") if isinstance(fmt.get("text"), dict) else {}
    if lines and text_cfg:
        x = int(text_cfg.get("x") or 0)
        y = int(text_cfg.get("y") or 0)
        max_w = max(1, int(text_cfg.get("width") or 1))
        font_size = int(text_cfg.get("fontSize") or 36)
        line_gap = int(text_cfg.get("lineGap") or max(4, font_size // 6))
        fill = _hex_to_rgb(str(text_cfg.get("fill") or "#ffffff"))
        max_h = None
        if card:
            max_h = max(1, int(card.get("height") or 0) - max(0, y - int(card.get("y") or 0)) - 18)
        _size, fonts = _fit_fonts(
            lines,
            font_size=font_size,
            max_width=max_w,
            max_height=max_h,
            line_gap=line_gap,
        )
        yy = y
        for i, line in enumerate(lines):
            text = str(line.get("text") or "").strip()
            draw.text((x, yy), text, font=fonts[i], fill=fill + (255,))
            yy += _line_height(fonts[i]) + line_gap

    return out.convert("RGB")


def template_summary(client_id: str, run_id: str) -> str:
    data = load_run_template(client_id, run_id)
    if not data:
        return "No run template selected."
    lines = (data.get("headline") or {}).get("lines") or []
    headline = " / ".join(
        str(line.get("text") or "").strip()
        for line in lines
        if isinstance(line, dict) and str(line.get("text") or "").strip()
    )
    return f"{data.get('template_name') or data.get('template_id')} with headline: {headline}"


def apply_run_template_to_formats(client_id: str, run_id: str) -> dict[str, Any]:
    from . import image_artifacts, image_overlay, social_channels

    idx = image_artifacts.load_image_index(client_id, run_id)
    if not idx or not idx.selected_primary:
        raise RuntimeError("No primary image selected.")

    src_path = image_artifacts.generated_image_path(client_id, run_id, idx.selected_primary)
    if not src_path.is_file():
        raise RuntimeError("Selected primary image file is missing on disk.")

    run_template = load_run_template(client_id, run_id)
    if not run_template:
        templates = list_client_templates(client_id)
        template_id = templates[0]["id"] if templates else DEFAULT_TEMPLATE_ID
        run_template = ensure_run_template(client_id, run_id, template_id=template_id)
    import importlib

    importlib.reload(image_overlay)

    outputs: dict[str, dict] = {}

    with Image.open(src_path) as im0:
        base = im0.convert("RGB")

        def _band_for_channel(ch: dict) -> tuple[int, int] | None:
            fmt = format_spec_for_platform(
                client_id, run_template, str(ch["key"])
            )
            return photo_zone_from_format(fmt, int(ch["height"]))

        def _apply_template_overlay(rendered: Image.Image, ch: dict) -> Image.Image:
            return apply_template(
                rendered,
                client_id=client_id,
                run_template=run_template,
                platform_key=str(ch["key"]),
            )

        rendered_by_key = image_overlay.render_branded_channel_exports(
            base,
            content_band_for=_band_for_channel,
            post_render=_apply_template_overlay,
        )
        for ch in social_channels.SOCIAL_CHANNELS:
            key = str(ch["key"])
            rendered = rendered_by_key[key]
            fn = str(ch["filename"])
            out_path = image_artifacts.format_image_path(client_id, run_id, fn)
            rendered.save(out_path, format="PNG", optimize=True)
            base_fn = f"base_{fn}"
            outputs[key] = {
                "filename": fn,
                "base_filename": base_fn,
                "width": int(ch["width"]),
                "height": int(ch["height"]),
                "label": str(ch["label"]),
            }

    payload = {
        "selected_primary": idx.selected_primary,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "resize_policy": image_overlay.TEMPLATE_EXPORT_POLICY,
        "overlay_applied": False,
        "template_applied": True,
        "template": run_template,
        "outputs": outputs,
    }
    image_artifacts.save_formats_index(client_id, run_id, payload)
    return payload


def render_canvas_preview_png(
    client_id: str,
    run_id: str,
    *,
    platform_key: str = "instagram",
    omit_text: bool = True,
) -> bytes:
    """Render one branded format in-memory for the live canvas editor (no disk write)."""
    import io

    from . import image_artifacts, image_overlay, social_channels

    idx = image_artifacts.load_image_index(client_id, run_id)
    if not idx or not idx.selected_primary:
        raise RuntimeError("No primary image selected.")

    src_path = image_artifacts.generated_image_path(client_id, run_id, idx.selected_primary)
    if not src_path.is_file():
        raise RuntimeError("Selected primary image file is missing on disk.")

    run_template = load_run_template(client_id, run_id)
    if not run_template:
        templates = list_client_templates(client_id)
        template_id = templates[0]["id"] if templates else DEFAULT_TEMPLATE_ID
        run_template = ensure_run_template(client_id, run_id, template_id=template_id)

    channel = next(
        (ch for ch in social_channels.SOCIAL_CHANNELS if str(ch["key"]) == platform_key),
        social_channels.SOCIAL_CHANNELS[0],
    )
    key = str(channel["key"])

    with Image.open(src_path) as im0:
        base = im0.convert("RGB")

        def _band_for_channel(ch: dict) -> tuple[int, int] | None:
            fmt = format_spec_for_platform(client_id, run_template, str(ch["key"]))
            return photo_zone_from_format(fmt, int(ch["height"]))

        def _apply_template_overlay(rendered: Image.Image, ch: dict) -> Image.Image:
            return apply_template(
                rendered,
                client_id=client_id,
                run_template=run_template,
                platform_key=str(ch["key"]),
                omit_text=omit_text,
            )

        # Only render the requested channel for speed.
        single = [channel]
        rendered_by_key = image_overlay.render_branded_channel_exports(
            base,
            content_band_for=_band_for_channel,
            post_render=_apply_template_overlay,
            channels=single,
        )
        rendered = rendered_by_key[key]
        buf = io.BytesIO()
        rendered.save(buf, format="PNG", optimize=True)
        return buf.getvalue()
