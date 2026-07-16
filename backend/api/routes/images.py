from __future__ import annotations

from pathlib import Path

from flask import jsonify, request, send_file, send_from_directory

from backend import config, image_artifacts, image_overlay, image_templates, mongo_storage
from backend.api.blueprint import api_bp
from backend.api.helpers import reject_client, reject_run_id, safe_run_id
from backend.integrations import openai_chat


def _safe_template_id(raw: str | None) -> str:
    value = str(raw or image_templates.DEFAULT_TEMPLATE_ID).strip()
    if not value or ".." in value or "/" in value or "\\" in value:
        return image_templates.DEFAULT_TEMPLATE_ID
    return value


def _png_response(path, *, filename: str, attachment: bool = False):
    resp = send_file(
        path,
        mimetype="image/png",
        as_attachment=attachment,
        download_name=filename if attachment else None,
    )
    if attachment:
        resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    elif request.args.get("v"):
        # Versioned URLs — private because image routes require auth (avoid CDN
        # caching 401/empty responses as anonymous "public" assets).
        resp.headers["Cache-Control"] = "private, max-age=86400, immutable"
    else:
        resp.headers["Cache-Control"] = "private, max-age=300"
    return resp


@api_bp.get("/clients/<client_id>/runs/<run_id>/images")
def list_run_images(client_id: str, run_id: str):
    bad = reject_client(client_id)
    if bad:
        return bad
    bad_run = reject_run_id(run_id)
    if bad_run:
        return bad_run
    idx = image_artifacts.load_image_index(client_id, run_id)
    if not idx:
        return jsonify(images=[], selected_primary=None, image_meta={})
    return jsonify(
        images=idx.images,
        selected_primary=idx.selected_primary,
        image_meta=idx.meta or {},
    )


@api_bp.get("/clients/<client_id>/runs/<run_id>/images/style-plan")
def image_style_plan(client_id: str, run_id: str):
    """Style labels and prompts from image_prompt.md for progressive Step 4 UI."""
    bad = reject_client(client_id)
    if bad:
        return bad
    bad_run = reject_run_id(run_id)
    if bad_run:
        return bad_run
    from backend import social_image_generation

    styles = social_image_generation.list_style_plan(client_id, run_id)
    return jsonify(
        styles=[
            {
                "style_key": s.get("style_key") or "",
                "style_label": s.get("style_label") or "",
                "prompt": s.get("prompt") or "",
            }
            for s in styles
        ]
    )


@api_bp.post("/clients/<client_id>/runs/<run_id>/images/select")
def select_run_image(client_id: str, run_id: str):
    bad = reject_client(client_id)
    if bad:
        return bad
    bad_run = reject_run_id(run_id)
    if bad_run:
        return bad_run
    body = request.get_json(silent=True) or {}
    filename = body.get("filename") or ""
    try:
        idx = image_artifacts.select_primary_image(client_id, run_id, str(filename))
    except ValueError as e:
        return jsonify(detail=str(e)), 400
    return jsonify(
        images=idx.images,
        selected_primary=idx.selected_primary,
        image_meta=idx.meta or {},
    )


@api_bp.post("/clients/<client_id>/runs/<run_id>/images/upload")
def upload_run_image(client_id: str, run_id: str):
    bad = reject_client(client_id)
    if bad:
        return bad
    bad_run = reject_run_id(run_id)
    if bad_run:
        return bad_run
    body = request.get_json(silent=True) or {}
    image_b64 = body.get("image_base64")
    if not image_b64:
        return jsonify(detail="image_base64 is required"), 400
    set_primary = body.get("set_primary", True)
    if not isinstance(set_primary, bool):
        set_primary = str(set_primary).lower() in ("1", "true", "yes")
    try:
        idx = image_artifacts.add_uploaded_image_from_base64(
            client_id,
            run_id,
            image_base64=str(image_b64),
            set_primary=set_primary,
        )
    except ValueError as e:
        return jsonify(detail=str(e)), 400
    except RuntimeError as e:
        return jsonify(detail=str(e)), 502
    return jsonify(
        images=idx.images,
        selected_primary=idx.selected_primary,
        image_meta=idx.meta or {},
    )


@api_bp.post("/clients/<client_id>/runs/<run_id>/images/regenerate")
def regenerate_run_image(client_id: str, run_id: str):
    bad = reject_client(client_id)
    if bad:
        return bad
    bad_run = reject_run_id(run_id)
    if bad_run:
        return bad_run
    body = request.get_json(silent=True) or {}
    style_key = str(body.get("style_key") or "").strip()
    if not style_key:
        return jsonify(detail="style_key is required"), 400
    from backend import social_image_generation

    try:
        idx = social_image_generation.regenerate_style(client_id, run_id, style_key)
    except ValueError as e:
        return jsonify(detail=str(e)), 400
    except RuntimeError as e:
        return jsonify(detail=str(e)), 502
    return jsonify(
        images=idx.images,
        selected_primary=idx.selected_primary,
        image_meta=idx.meta or {},
    )


@api_bp.post("/clients/<client_id>/runs/<run_id>/images/delete")
def delete_run_image(client_id: str, run_id: str):
    bad = reject_client(client_id)
    if bad:
        return bad
    bad_run = reject_run_id(run_id)
    if bad_run:
        return bad_run
    body = request.get_json(silent=True) or {}
    filename = body.get("filename") or ""
    try:
        idx = image_artifacts.delete_generated_image(client_id, run_id, str(filename))
    except ValueError as e:
        return jsonify(detail=str(e)), 400
    return jsonify(
        images=idx.images,
        selected_primary=idx.selected_primary,
        image_meta=idx.meta or {},
    )


@api_bp.get("/clients/<client_id>/runs/<run_id>/images/generated/<filename>")
def get_generated_image(client_id: str, run_id: str, filename: str):
    bad = reject_client(client_id)
    if bad:
        return bad
    bad_run = reject_run_id(run_id)
    if bad_run:
        return bad_run
    try:
        path = image_artifacts.generated_image_path(client_id, run_id, filename)
    except ValueError as e:
        return jsonify(detail=str(e)), 400
    if not path.is_file() and not mongo_storage.ensure_cached_file(path):
        return jsonify(detail="image not found"), 404
    return _png_response(path, filename=filename)


_BATCH_FORMATS_MAX_RUNS = 24


@api_bp.post("/clients/<client_id>/runs/image-formats/batch")
def batch_formats_index(client_id: str):
    """Load format export metadata for many runs in one request (Publishing queue)."""
    bad = reject_client(client_id)
    if bad:
        return bad
    body = request.get_json(silent=True) or {}
    raw_ids = body.get("run_ids")
    if not isinstance(raw_ids, list):
        return jsonify(detail="run_ids must be a list"), 400
    if len(raw_ids) > _BATCH_FORMATS_MAX_RUNS:
        return jsonify(
            detail=f"run_ids exceeds maximum of {_BATCH_FORMATS_MAX_RUNS}"
        ), 400

    runs: dict[str, dict] = {}
    for raw in raw_ids:
        ok, _err = safe_run_id(str(raw or ""))
        if not ok:
            continue
        run_id = str(raw).strip()
        data = image_artifacts.load_formats_index(client_id, run_id)
        runs[run_id] = data if isinstance(data, dict) else {}

    return jsonify(runs=runs)


@api_bp.get("/clients/<client_id>/runs/<run_id>/images/formats")
def get_formats_index(client_id: str, run_id: str):
    bad = reject_client(client_id)
    if bad:
        return bad
    bad_run = reject_run_id(run_id)
    if bad_run:
        return bad_run
    data = image_artifacts.load_formats_index(client_id, run_id)
    return jsonify(data or {})


@api_bp.post("/clients/<client_id>/runs/<run_id>/images/format-exports/regenerate")
def regenerate_formats(client_id: str, run_id: str):
    """Re-export platform images using the current contain (no-crop) resize policy."""
    bad = reject_client(client_id)
    if bad:
        return bad
    bad_run = reject_run_id(run_id)
    if bad_run:
        return bad_run
    import importlib

    from backend.social_steps import export_channel_formats
    try:
        idx = image_artifacts.load_formats_index(client_id, run_id) or {}
        body = request.get_json(silent=True) or {}
        base_only = bool(body.get("base_only"))
        had_template = bool(idx.get("template_applied"))
        if idx.get("template_applied") and not base_only:
            from backend import image_templates

            importlib.reload(image_templates)
            data = image_templates.apply_run_template_to_formats(client_id, run_id)
        else:
            export_channel_formats(client_id, run_id)
            if base_only and had_template:
                from backend import image_templates

                importlib.reload(image_templates)
                data = image_templates.apply_run_template_to_formats(client_id, run_id)
            else:
                data = image_artifacts.load_formats_index(client_id, run_id) or {}
    except RuntimeError as e:
        return jsonify(detail=str(e)), 400
    return jsonify(data)


@api_bp.get("/clients/<client_id>/runs/<run_id>/images/formats/<filename>")
def get_formatted_image(client_id: str, run_id: str, filename: str):
    bad = reject_client(client_id)
    if bad:
        return bad
    bad_run = reject_run_id(run_id)
    if bad_run:
        return bad_run
    try:
        path = image_artifacts.format_image_path(client_id, run_id, filename)
    except ValueError as e:
        return jsonify(detail=str(e)), 400
    if not path.is_file() and not mongo_storage.ensure_cached_file(path):
        return jsonify(detail="image not found"), 404
    attachment = request.args.get("download") in ("1", "true", "yes")
    return _png_response(path, filename=filename, attachment=attachment)


OVERLAY_TEXT_SYSTEM = """You write short, punchy text overlays for social media images.
Given the client brief, return ONLY the overlay headline text (max 8 words).
No quotes, no hashtags, no explanation — just the text to print on the image."""


@api_bp.get("/clients/<client_id>/runs/<run_id>/images/overlay")
def get_image_overlay(client_id: str, run_id: str):
    bad = reject_client(client_id)
    if bad:
        return bad
    bad_run = reject_run_id(run_id)
    if bad_run:
        return bad_run
    overlay = image_overlay.load_overlay(client_id, run_id)
    return jsonify(overlay=overlay or image_overlay.DEFAULT_OVERLAY)


@api_bp.put("/clients/<client_id>/runs/<run_id>/images/overlay")
def put_image_overlay(client_id: str, run_id: str):
    bad = reject_client(client_id)
    if bad:
        return bad
    bad_run = reject_run_id(run_id)
    if bad_run:
        return bad_run
    body = request.get_json(silent=True) or {}
    raw = body.get("overlay")
    if not isinstance(raw, dict):
        return jsonify(detail="overlay object is required"), 400
    try:
        saved = image_overlay.save_overlay(client_id, run_id, raw)
    except (TypeError, ValueError) as e:
        return jsonify(detail=str(e)), 400
    return jsonify(overlay=saved)


@api_bp.post("/clients/<client_id>/runs/<run_id>/images/overlay/suggest-text")
def suggest_overlay_text(client_id: str, run_id: str):
    bad = reject_client(client_id)
    if bad:
        return bad
    bad_run = reject_run_id(run_id)
    if bad_run:
        return bad_run
    from backend import artifacts
    from backend.social_steps import load_angle_intent

    profile = ""
    angle = ""
    try:
        profile = artifacts.load_artifact(client_id, run_id, "client_profile_topic")
    except Exception:
        pass
    try:
        angle = load_angle_intent(client_id, run_id)
    except Exception:
        pass
    brief_block = (
        f"---TOPIC BRIEF---\n{profile.strip()}\n"
        + (f"\n{angle.strip()}\n" if angle.strip() and angle.strip() not in profile else "")
        + "---END---\n"
    )
    user_msg = brief_block
    try:
        text = openai_chat.chat_complete(
            OVERLAY_TEXT_SYSTEM,
            user_msg,
            step_label="Overlay text suggest",
            max_tokens=60,
            temperature=0.8,
        )
    except Exception as e:
        return jsonify(detail=str(e)), 502
    cleaned = " ".join(text.strip().splitlines()[0].split())[:120]
    return jsonify(text=cleaned)


@api_bp.get("/clients/<client_id>/templates")
def list_social_templates(client_id: str):
    bad = reject_client(client_id)
    if bad:
        return bad
    templates = image_templates.list_client_templates(client_id)
    return jsonify(templates=templates)


@api_bp.get("/clients/<client_id>/runs/<run_id>/images/template")
def get_image_template(client_id: str, run_id: str):
    bad = reject_client(client_id)
    if bad:
        return bad
    bad_run = reject_run_id(run_id)
    if bad_run:
        return bad_run
    try:
        template = image_templates.ensure_run_template(
            client_id,
            run_id,
            template_id=_safe_template_id(request.args.get("template_id")),
        )
    except RuntimeError as e:
        return jsonify(detail=str(e)), 404
    return jsonify(template=template)


@api_bp.put("/clients/<client_id>/runs/<run_id>/images/template")
def put_image_template(client_id: str, run_id: str):
    bad = reject_client(client_id)
    if bad:
        return bad
    bad_run = reject_run_id(run_id)
    if bad_run:
        return bad_run
    body = request.get_json(silent=True) or {}
    try:
        template = image_templates.save_template_layout(client_id, run_id, body)
    except RuntimeError as e:
        return jsonify(detail=str(e)), 404
    return jsonify(template=template)


@api_bp.post("/clients/<client_id>/runs/<run_id>/images/template/apply")
def apply_image_template(client_id: str, run_id: str):
    bad = reject_client(client_id)
    if bad:
        return bad
    bad_run = reject_run_id(run_id)
    if bad_run:
        return bad_run
    try:
        import importlib

        importlib.reload(image_overlay)
        importlib.reload(image_templates)
        formats = image_templates.apply_run_template_to_formats(client_id, run_id)
    except RuntimeError as e:
        return jsonify(detail=str(e)), 400
    return jsonify(formats=formats)


@api_bp.get("/clients/<client_id>/runs/<run_id>/images/template/canvas-preview")
def get_template_canvas_preview(client_id: str, run_id: str):
    """Live editor base: branded layout without baked text (Figma-like overlays)."""
    import io

    bad = reject_client(client_id)
    if bad:
        return bad
    bad_run = reject_run_id(run_id)
    if bad_run:
        return bad_run
    platform = str(request.args.get("platform") or "instagram").strip().lower()
    omit_text = str(request.args.get("omit_text") or "1").lower() not in ("0", "false", "no")
    try:
        png = image_templates.render_canvas_preview_png(
            client_id,
            run_id,
            platform_key=platform,
            omit_text=omit_text,
        )
    except RuntimeError as e:
        return jsonify(detail=str(e)), 400
    resp = send_file(
        io.BytesIO(png),
        mimetype="image/png",
        as_attachment=False,
        download_name="canvas-preview.png",
    )
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    return resp


@api_bp.get("/clients/<client_id>/templates/<template_id>/assets/<filename>")
def get_social_template_asset_for_template(client_id: str, template_id: str, filename: str):
    bad = reject_client(client_id)
    if bad:
        return bad
    tpl = _safe_template_id(template_id)
    fn = str(filename or "").strip()
    if not fn or ".." in fn or "/" in fn or "\\" in fn:
        return jsonify(detail="invalid filename"), 400
    root = Path(config.CLIENTS_DIR) / client_id / "templates" / tpl / "assets"
    path = root / fn
    if not path.is_file() and not mongo_storage.ensure_cached_file(path):
        return jsonify(detail="asset not found"), 404
    return send_from_directory(root, fn)


@api_bp.get("/clients/<client_id>/templates/social_post/assets/<filename>")
def get_social_template_asset(client_id: str, filename: str):
    return get_social_template_asset_for_template(client_id, "social_post", filename)

# TEMP — remove after testing
@api_bp.get("/_test/ig-post")
def _test_ig_post():
    import tempfile

    from PIL import Image, ImageDraw

    from backend.integrations import meta_graph
    img = Image.new("RGBA", (1080, 1350), (24, 90, 200, 255))  # PNG w/ alpha, like the pipeline
    ImageDraw.Draw(img).text((60, 60), "IG publish test", fill=(255, 255, 255, 255))
    tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    img.save(tmp.name, "PNG")
    try:
        media_id = meta_graph.publish_instagram_post(tmp.name, "Automated test post ✅")
        return jsonify(ok=True, media_id=media_id)
    except Exception as e:
        return jsonify(ok=False, error=str(e)), 500