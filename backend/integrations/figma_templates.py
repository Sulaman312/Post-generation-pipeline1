"""Import client social templates from named Figma frames."""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from backend import config
from backend.social_channels import CHANNEL_BY_KEY

FIGMA_API_BASE = "https://api.figma.com/v1"
SUPPORTED_FORMATS = {
    "instagram": (1080, 1350),
    "linkedin": (1200, 628),
    "facebook": (1200, 630),
}


@dataclass(frozen=True)
class FigmaRef:
    file_key: str
    node_id: str | None = None


class FigmaHTTPError(RuntimeError):
    def __init__(self, *, method: str, url: str, status: int, reason: str, headers: dict[str, str], body: str):
        self.method = method
        self.url = url
        self.status = status
        self.reason = reason
        self.headers = headers
        self.body = body
        super().__init__(self._message())

    def _message(self) -> str:
        headers = json.dumps(self.headers, indent=2, sort_keys=True)
        body = self.body if self.body else "<empty>"
        return (
            f"Figma HTTP {self.status} {self.reason}\n"
            f"Endpoint: {self.method} {_safe_error_url(self.url)}\n"
            f"Headers:\n{headers}\n"
            f"Body:\n{body}"
        )


def _safe_error_url(url: str) -> str:
    if url.startswith(FIGMA_API_BASE):
        return url
    parsed = urllib.parse.urlparse(url)
    if not parsed.scheme or not parsed.netloc:
        return url
    clean = parsed._replace(query="[redacted]", fragment="")
    return urllib.parse.urlunparse(clean)


def _read_http_error_body(err: urllib.error.HTTPError) -> str:
    try:
        raw = err.read()
    except Exception:
        return ""
    if not raw:
        return ""
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("utf-8", errors="replace")


def _raise_figma_http_error(err: urllib.error.HTTPError, *, method: str, url: str) -> None:
    raise FigmaHTTPError(
        method=method,
        url=url,
        status=int(err.code),
        reason=str(err.reason),
        headers={str(k): str(v) for k, v in err.headers.items()},
        body=_read_http_error_body(err),
    ) from err


def parse_figma_url(raw: str) -> FigmaRef:
    url = urllib.parse.urlparse((raw or "").strip())
    parts = [p for p in url.path.split("/") if p]
    file_key = ""
    for i, part in enumerate(parts):
        if part in ("file", "design", "proto") and i + 1 < len(parts):
            file_key = parts[i + 1]
            break
    if not file_key and raw and "/" not in raw:
        file_key = raw.strip()
    if not file_key:
        raise ValueError("Could not find Figma file key in the link.")

    qs = urllib.parse.parse_qs(url.query)
    node_id = (qs.get("node-id") or [None])[0]
    if node_id:
        node_id = node_id.replace("-", ":")
    return FigmaRef(file_key=file_key, node_id=node_id)


def _api_get(path: str, token: str, params: dict[str, str] | None = None) -> dict:
    query = f"?{urllib.parse.urlencode(params)}" if params else ""
    url = f"{FIGMA_API_BASE}{path}{query}"
    req = urllib.request.Request(
        url,
        headers={"X-Figma-Token": token},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        _raise_figma_http_error(err, method="GET", url=url)


def _download(url: str) -> bytes:
    try:
        with urllib.request.urlopen(url, timeout=90) as resp:
            return resp.read()
    except urllib.error.HTTPError as err:
        _raise_figma_http_error(err, method="GET", url=url)


def _walk(node: dict[str, Any]):
    yield node
    for child in node.get("children") or []:
        if isinstance(child, dict):
            yield from _walk(child)


def _node_box(node: dict[str, Any]) -> dict[str, float] | None:
    box = node.get("absoluteBoundingBox")
    if not isinstance(box, dict):
        box = node.get("absoluteRenderBounds")
    if not isinstance(box, dict):
        return None
    try:
        return {
            "x": float(box.get("x") or 0),
            "y": float(box.get("y") or 0),
            "width": float(box.get("width") or 0),
            "height": float(box.get("height") or 0),
        }
    except (TypeError, ValueError):
        return None


def _frame_key(node: dict[str, Any]) -> str | None:
    name = str(node.get("name") or "").lower()
    for key in SUPPORTED_FORMATS:
        if key in name:
            return key
    tokens = set(re.split(r"[^a-z0-9]+", name))
    if "ig" in tokens:
        return "instagram"
    if "li" in tokens:
        return "linkedin"
    if "fb" in tokens:
        return "facebook"

    box = _node_box(node)
    if not box:
        return None
    w = round(box["width"])
    h = round(box["height"])
    for key, (tw, th) in SUPPORTED_FORMATS.items():
        if abs(w - tw) <= 2 and abs(h - th) <= 2:
            return key
    return None


def _find_frames(root: dict[str, Any]) -> dict[str, dict[str, Any]]:
    frames: dict[str, dict[str, Any]] = {}
    for node in _walk(root):
        if node.get("type") not in ("FRAME", "COMPONENT", "INSTANCE", "SECTION", "GROUP"):
            continue
        key = _frame_key(node)
        if key and key not in frames:
            frames[key] = node
    return frames


def _fetch_file_document(file_key: str, token: str, node_id: str | None) -> dict[str, Any]:
    params = {"geometry": "paths"}
    if node_id:
        params["ids"] = node_id
    data = _api_get(f"/files/{file_key}", token, params)
    root = data.get("document")
    if not isinstance(root, dict):
        raise RuntimeError("Figma response did not include a document.")
    return root


def _safe_slug(raw: str, fallback: str) -> str:
    slug = re.sub(r"[^a-z0-9_-]+", "_", raw.lower()).strip("_")
    return slug or fallback


def _hex_from_figma_color(fill: dict[str, Any]) -> str | None:
    color = fill.get("color") if isinstance(fill, dict) else None
    if not isinstance(color, dict):
        return None
    try:
        r = round(float(color.get("r", 0)) * 255)
        g = round(float(color.get("g", 0)) * 255)
        b = round(float(color.get("b", 0)) * 255)
    except (TypeError, ValueError):
        return None
    return f"#{r:02x}{g:02x}{b:02x}"


def _first_solid_fill(node: dict[str, Any]) -> tuple[str | None, float]:
    fills = node.get("fills")
    if not isinstance(fills, list):
        return None, 1.0
    for fill in fills:
        if not isinstance(fill, dict) or fill.get("visible") is False:
            continue
        if fill.get("type") == "SOLID":
            return _hex_from_figma_color(fill), float(fill.get("opacity", 1.0))
    return None, 1.0


def _text_align(style: dict[str, Any]) -> str:
    align = str(style.get("textAlignHorizontal") or "LEFT").lower()
    if align in ("center", "right"):
        return align
    return "left"


def _relative_box(node: dict[str, Any], frame_box: dict[str, float]) -> dict[str, int] | None:
    box = _node_box(node)
    if not box or box["width"] <= 0 or box["height"] <= 0:
        return None
    return {
        "x": round(box["x"] - frame_box["x"]),
        "y": round(box["y"] - frame_box["y"]),
        "width": round(box["width"]),
        "height": round(box["height"]),
    }


def _collect_layers(
    frame: dict[str, Any],
    *,
    platform_key: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    frame_box = _node_box(frame)
    if not frame_box:
        return [], []
    layers: list[dict[str, Any]] = []
    export_nodes: list[dict[str, Any]] = []
    used_asset_filenames: set[str] = set()

    for node in _walk(frame):
        if node is frame:
            continue
        name = str(node.get("name") or "").strip()
        if not name or name == "GENERATED_BG":
            continue
        box = _relative_box(node, frame_box)
        if not box:
            continue

        if name.startswith("[ASSET]"):
            clean_name = name.replace("[ASSET]", "", 1).strip()
            asset_slug = _safe_slug(clean_name, str(node.get("id") or "asset"))
            filename = f"{platform_key}_{asset_slug}.png"
            if filename in used_asset_filenames:
                node_slug = _safe_slug(str(node.get("id") or ""), "asset")
                filename = f"{platform_key}_{asset_slug}_{node_slug}.png"
            used_asset_filenames.add(filename)
            layers.append(
                {
                    "kind": "asset",
                    "name": clean_name or filename,
                    "asset": filename,
                    "node_id": node.get("id"),
                    "opacity": float(node.get("opacity", 1.0)),
                    **box,
                }
            )
            export_nodes.append({"id": str(node.get("id")), "filename": filename})
            continue

        if name.startswith("[TEXT]") or node.get("type") == "TEXT":
            style = node.get("style") if isinstance(node.get("style"), dict) else {}
            fill, opacity = _first_solid_fill(node)
            layers.append(
                {
                    "kind": "text",
                    "name": name.replace("[TEXT]", "", 1).strip() or name,
                    "text": str(node.get("characters") or ""),
                    "fontSize": round(float(style.get("fontSize") or 36)),
                    "fontWeight": str(style.get("fontWeight") or "normal"),
                    "fontFamily": str(style.get("fontFamily") or ""),
                    "textAlign": _text_align(style),
                    "fill": fill or "#ffffff",
                    "opacity": opacity,
                    **box,
                }
            )
            continue

        fill, opacity = _first_solid_fill(node)
        if fill:
            layers.append(
                {
                    "kind": "shape",
                    "name": name,
                    "fill": fill,
                    "opacity": opacity,
                    "radius": round(float(node.get("cornerRadius") or 0)),
                    **box,
                }
            )
    return layers, export_nodes


def _export_assets(
    *,
    file_key: str,
    token: str,
    export_nodes: list[dict[str, str]],
    assets_dir: Path,
) -> None:
    if not export_nodes:
        return
    ids = ",".join(node["id"] for node in export_nodes if node.get("id"))
    if not ids:
        return
    data = _api_get(
        f"/images/{file_key}",
        token,
        {"ids": ids, "format": "png", "scale": "1"},
    )
    images = data.get("images") if isinstance(data.get("images"), dict) else {}
    assets_dir.mkdir(parents=True, exist_ok=True)
    by_id = {node["id"]: node["filename"] for node in export_nodes}
    for node_id, url in images.items():
        if not url:
            continue
        filename = by_id.get(node_id)
        if not filename:
            continue
        (assets_dir / filename).write_bytes(_download(str(url)))


def import_social_template(
    *,
    client_id: str,
    figma_link: str,
    token: str | None = None,
    template_id: str = "social_post",
) -> Path:
    token = token or config.FIGMA_ACCESS_TOKEN
    if not token:
        raise RuntimeError("FIGMA_ACCESS_TOKEN is required in the root .env file.")

    ref = parse_figma_url(figma_link)
    root = _fetch_file_document(ref.file_key, token, ref.node_id)

    frames = _find_frames(root)
    missing = [key for key in SUPPORTED_FORMATS if key not in frames]
    if missing and ref.node_id:
        root = _fetch_file_document(ref.file_key, token, None)
        frames = _find_frames(root)
        missing = [key for key in SUPPORTED_FORMATS if key not in frames]
    if missing:
        seen = sorted(
            str(node.get("name") or "")
            for node in _walk(root)
            if _node_box(node) and node.get("type") not in ("DOCUMENT", "CANVAS")
        )
        sample = ", ".join(seen[:20])
        raise RuntimeError(
            f"Missing platform frame(s): {', '.join(missing)}. "
            f"Detected named nodes include: {sample}"
        )

    template_dir = config.CLIENTS_DIR / client_id / "templates" / template_id
    assets_dir = template_dir / "assets"
    formats: dict[str, Any] = {}
    all_exports: list[dict[str, str]] = []
    seen_assets: set[tuple[str, str]] = set()

    for key, frame in frames.items():
        layers, exports = _collect_layers(frame, platform_key=key)
        formats[key] = {
            "width": int(CHANNEL_BY_KEY[key]["width"]),
            "height": int(CHANNEL_BY_KEY[key]["height"]),
            "layers": layers,
        }
        for export in exports:
            pair = (export["id"], export["filename"])
            if pair not in seen_assets:
                seen_assets.add(pair)
                all_exports.append(export)

    _export_assets(
        file_key=ref.file_key,
        token=token,
        export_nodes=all_exports,
        assets_dir=assets_dir,
    )

    template = {
        "id": f"{client_id}_{template_id}",
        "name": template_id,
        "source": {
            "type": "figma",
            "file_key": ref.file_key,
            "node_id": ref.node_id,
            "link": figma_link,
        },
        "assets_dir": "assets",
        "formats": formats,
    }
    template_dir.mkdir(parents=True, exist_ok=True)
    out_path = template_dir / "template.json"
    out_path.write_text(json.dumps(template, indent=2), encoding="utf-8")
    return out_path
