from __future__ import annotations

import base64
import binascii
import io
import json
from dataclasses import dataclass
from pathlib import Path

from . import artifacts

_MAX_UPLOAD_IMAGE_BYTES = 8 * 1024 * 1024


@dataclass(frozen=True)
class ImageIndex:
    images: list[str]
    selected_primary: str | None
    meta: dict[str, dict[str, str]]


def images_root(client_id: str, run_id: str) -> Path:
    run_dir = artifacts.get_run_dir(client_id, run_id)
    root = run_dir / "images"
    (root / "generated").mkdir(parents=True, exist_ok=True)
    (root / "formats").mkdir(parents=True, exist_ok=True)
    return root


def _index_path(client_id: str, run_id: str) -> Path:
    return images_root(client_id, run_id) / "image_generation.json"


def _formats_path(client_id: str, run_id: str) -> Path:
    return images_root(client_id, run_id) / "image_formats.json"


def _parse_index(data: dict) -> ImageIndex:
    images = data.get("images") if isinstance(data.get("images"), list) else []
    images = [str(x) for x in images if isinstance(x, str) and x.strip()]
    sel = data.get("selected_primary")
    sel = sel.strip() if isinstance(sel, str) and sel.strip() else None
    meta_raw = data.get("meta")
    meta: dict[str, dict[str, str]] = {}
    if isinstance(meta_raw, dict):
        for fn, info in meta_raw.items():
            if isinstance(fn, str) and isinstance(info, dict):
                meta[fn] = {
                    "style_key": str(info.get("style_key") or ""),
                    "style_label": str(info.get("style_label") or ""),
                }
    return ImageIndex(images=images, selected_primary=sel, meta=meta)


def _write_index(client_id: str, run_id: str, payload: dict) -> ImageIndex:
    _index_path(client_id, run_id).write_text(
        json.dumps(payload, indent=2), encoding="utf-8"
    )
    return _parse_index(payload)


def save_generated_images(
    client_id: str,
    run_id: str,
    *,
    png_blobs: list[bytes] | None = None,
    styled_items: list[tuple[bytes, dict[str, str]]] | None = None,
) -> ImageIndex:
    root = images_root(client_id, run_id) / "generated"
    names: list[str] = []
    meta: dict[str, dict[str, str]] = {}

    if styled_items:
        for i, (blob, style) in enumerate(styled_items):
            fn = f"image_{i + 1:02d}.png"
            (root / fn).write_bytes(blob)
            names.append(fn)
            meta[fn] = {
                "style_key": str(style.get("style_key") or ""),
                "style_label": str(style.get("style_label") or ""),
            }
    elif png_blobs:
        for i, blob in enumerate(png_blobs):
            fn = f"image_{i + 1:02d}.png"
            (root / fn).write_bytes(blob)
            names.append(fn)
    else:
        raise ValueError("png_blobs or styled_items is required")

    return _write_index(
        client_id,
        run_id,
        {"images": names, "selected_primary": None, "meta": meta},
    )


def replace_style_image(
    client_id: str,
    run_id: str,
    *,
    style_key: str,
    style_label: str,
    png_blob: bytes,
) -> ImageIndex:
    idx = load_image_index(client_id, run_id)
    filename = None
    if idx:
        for fn, info in idx.meta.items():
            if info.get("style_key") == style_key:
                filename = fn
                break

    root = images_root(client_id, run_id) / "generated"
    if filename:
        (root / filename).write_bytes(png_blob)
    else:
        next_num = len(idx.images) + 1 if idx else 1
        filename = f"image_{next_num:02d}.png"
        (root / filename).write_bytes(png_blob)

    images = list(idx.images) if idx else []
    meta = dict(idx.meta) if idx else {}
    if filename not in images:
        images.append(filename)
    meta[filename] = {"style_key": style_key, "style_label": style_label}
    selected = idx.selected_primary if idx else None

    return _write_index(
        client_id,
        run_id,
        {"images": images, "selected_primary": selected, "meta": meta},
    )


def load_image_index(client_id: str, run_id: str) -> ImageIndex | None:
    p = _index_path(client_id, run_id)
    if not p.is_file():
        return None
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    return _parse_index(data)


def _decode_upload_base64(image_base64: str) -> bytes:
    raw = (image_base64 or "").strip()
    if raw.startswith("data:") and "," in raw:
        raw = raw.split(",", 1)[1]
    try:
        data = base64.b64decode(raw, validate=True)
    except (ValueError, binascii.Error) as e:
        raise ValueError("invalid image data") from e
    if len(data) > _MAX_UPLOAD_IMAGE_BYTES:
        raise ValueError("image must be 8 MB or smaller")
    if not data:
        raise ValueError("image data is empty")
    return data


def _bytes_to_png(image_bytes: bytes) -> bytes:
    try:
        from PIL import Image
    except ImportError as e:
        raise RuntimeError("Pillow not installed. Run: pip install pillow") from e

    with Image.open(io.BytesIO(image_bytes)) as im:
        if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
            out = im.convert("RGBA")
        else:
            out = im.convert("RGB")
        buf = io.BytesIO()
        out.save(buf, format="PNG")
        return buf.getvalue()


def add_uploaded_image(
    client_id: str,
    run_id: str,
    *,
    image_bytes: bytes,
    set_primary: bool = True,
) -> ImageIndex:
    png = _bytes_to_png(image_bytes)
    idx = load_image_index(client_id, run_id)
    images = list(idx.images) if idx else []
    meta = dict(idx.meta) if idx else {}

    n = 1
    while f"upload_{n:02d}.png" in images:
        n += 1
    fn = f"upload_{n:02d}.png"

    root = images_root(client_id, run_id) / "generated"
    (root / fn).write_bytes(png)
    images.append(fn)
    meta[fn] = {"style_key": "upload", "style_label": "Your upload"}

    selected = fn if set_primary else (idx.selected_primary if idx else None)
    return _write_index(
        client_id,
        run_id,
        {"images": images, "selected_primary": selected, "meta": meta},
    )


def add_uploaded_image_from_base64(
    client_id: str,
    run_id: str,
    *,
    image_base64: str,
    set_primary: bool = True,
) -> ImageIndex:
    data = _decode_upload_base64(image_base64)
    return add_uploaded_image(
        client_id, run_id, image_bytes=data, set_primary=set_primary
    )


def delete_generated_image(client_id: str, run_id: str, filename: str) -> ImageIndex:
    fn = (filename or "").strip()
    if not fn:
        raise ValueError("filename is required")
    if ".." in fn or "/" in fn or "\\" in fn:
        raise ValueError("invalid filename")
    idx = load_image_index(client_id, run_id)
    if not idx:
        raise ValueError("no generated images for this run")
    if fn not in idx.images:
        raise ValueError("filename is not one of the generated images")

    path = generated_image_path(client_id, run_id, fn)
    if path.is_file():
        path.unlink()

    images = [x for x in idx.images if x != fn]
    meta = {k: v for k, v in idx.meta.items() if k != fn}
    selected = idx.selected_primary if idx.selected_primary != fn else None

    return _write_index(
        client_id,
        run_id,
        {"images": images, "selected_primary": selected, "meta": meta},
    )


def select_primary_image(client_id: str, run_id: str, filename: str) -> ImageIndex:
    fn = (filename or "").strip()
    if not fn:
        raise ValueError("filename is required")
    if ".." in fn or "/" in fn or "\\" in fn:
        raise ValueError("invalid filename")
    idx = load_image_index(client_id, run_id)
    if not idx:
        raise ValueError("no generated images for this run")
    if fn not in idx.images:
        raise ValueError("filename is not one of the generated images")
    payload = {
        "images": idx.images,
        "selected_primary": fn,
        "meta": idx.meta,
    }
    return _write_index(client_id, run_id, payload)


def generated_image_path(client_id: str, run_id: str, filename: str) -> Path:
    fn = (filename or "").strip()
    if not fn or ".." in fn or "/" in fn or "\\" in fn:
        raise ValueError("invalid filename")
    path = images_root(client_id, run_id) / "generated" / fn
    return path


def format_image_path(client_id: str, run_id: str, filename: str) -> Path:
    fn = (filename or "").strip()
    if not fn or ".." in fn or "/" in fn or "\\" in fn:
        raise ValueError("invalid filename")
    path = images_root(client_id, run_id) / "formats" / fn
    return path


def save_formats_index(client_id: str, run_id: str, payload: dict) -> None:
    _formats_path(client_id, run_id).write_text(
        json.dumps(payload, indent=2), encoding="utf-8"
    )


def load_formats_index(client_id: str, run_id: str) -> dict | None:
    p = _formats_path(client_id, run_id)
    if not p.is_file():
        return None
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None
