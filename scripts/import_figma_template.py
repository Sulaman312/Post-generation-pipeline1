#!/usr/bin/env python3
"""CLI importer for client social templates from Figma."""

from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend import config, mongo_storage  # noqa: E402
from backend.integrations.figma_templates import import_social_template  # noqa: E402


def _clients() -> list[str]:
    root = Path(config.CLIENTS_DIR)
    if not root.is_dir():
        return []
    return sorted(p.name for p in root.iterdir() if p.is_dir() and not p.name.startswith("_"))


def _choose_client(clients: list[str]) -> str:
    print("\nClients:")
    for i, client in enumerate(clients, start=1):
        print(f"  {i}. {client}")
    while True:
        raw = input("\nChoose client number: ").strip()
        try:
            idx = int(raw)
        except ValueError:
            print("Enter a number from the list.")
            continue
        if 1 <= idx <= len(clients):
            return clients[idx - 1]
        print("Number out of range.")


def main() -> int:
    if mongo_storage.enabled():
        mongo_storage.initialize_runtime_cache()
    clients = _clients()
    if not clients:
        print(f"No clients found in {config.CLIENTS_DIR}")
        return 1

    if not config.FIGMA_ACCESS_TOKEN:
        print("Missing FIGMA_ACCESS_TOKEN in root .env")
        return 1

    client_id = _choose_client(clients)
    figma_link = input("\nPaste Figma file/frame link: ").strip()
    if not figma_link:
        print("Figma link is required.")
        return 1

    template_id = input("\nTemplate folder name [social_post]: ").strip() or "social_post"

    try:
        out_path = import_social_template(
            client_id=client_id,
            figma_link=figma_link,
            template_id=template_id,
        )
    except Exception as e:
        print(f"\nImport failed: {type(e).__name__}: {e}")
        return 1

    if mongo_storage.enabled():
        mongo_storage.sync_cache()

    try:
        rel = out_path.relative_to(config.REPO_ROOT)
    except ValueError:
        rel = out_path
    print("\nImported template:")
    print(f"  {rel}")
    print(f"  {rel.parent / 'assets'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
