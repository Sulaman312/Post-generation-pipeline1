#!/usr/bin/env python3
"""Re-import Figma templates from stored links for all (or selected) workspaces."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend import config, mongo_storage  # noqa: E402
from backend.integrations.figma_templates import import_social_template  # noqa: E402


def _template_dirs(client_dir: Path) -> list[tuple[str, Path]]:
    tpl_root = client_dir / "templates"
    if not tpl_root.is_dir():
        return []
    out: list[tuple[str, Path]] = []
    for folder in sorted(tpl_root.iterdir()):
        if folder.is_dir() and (folder / "template.json").is_file():
            out.append((folder.name, folder / "template.json"))
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--client",
        action="append",
        dest="clients",
        metavar="ID",
        help="Only re-import this workspace (repeatable). Default: all clients.",
    )
    args = parser.parse_args()

    if not config.FIGMA_ACCESS_TOKEN:
        print("Missing FIGMA_ACCESS_TOKEN in .env")
        return 1
    if mongo_storage.enabled():
        print("Hydrating MongoDB cache...")
        mongo_storage.initialize_runtime_cache()

    root = Path(config.CLIENTS_DIR)
    client_filter = {c.strip() for c in (args.clients or []) if c.strip()}
    ok = 0
    skipped = 0
    failed = 0

    for client in sorted(p.name for p in root.iterdir() if p.is_dir() and not p.name.startswith("_")):
        if client_filter and client not in client_filter:
            continue
        templates = _template_dirs(root / client)
        if not templates:
            print(f"[skip] {client}: no templates")
            skipped += 1
            continue
        for template_id, tpl_path in templates:
            data = json.loads(tpl_path.read_text(encoding="utf-8"))
            source = data.get("source") or {}
            if source.get("type") != "figma":
                print(f"[skip] {client}/{template_id}: not a Figma template")
                skipped += 1
                continue
            link = str(source.get("link") or "").strip()
            if not link:
                print(f"[skip] {client}/{template_id}: no Figma link")
                skipped += 1
                continue
            print(f"[import] {client}/{template_id} ...")
            try:
                out = import_social_template(
                    client_id=client,
                    figma_link=link,
                    template_id=template_id,
                )
                print(f"  ok -> {out}")
                ok += 1
            except Exception as exc:
                print(f"  failed: {type(exc).__name__}: {exc}")
                failed += 1

    if mongo_storage.enabled() and ok:
        print("Syncing to MongoDB...")
        mongo_storage.sync_cache(force=True)

    print(f"Done: {ok} imported, {skipped} skipped, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
