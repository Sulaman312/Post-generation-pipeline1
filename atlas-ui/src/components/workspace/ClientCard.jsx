import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as api from "../../services/api";
import WorkspaceLogo from "./WorkspaceLogo";
import LogoFitImage from "./LogoFitImage";
import { isImageFile, readImageFileAsBase64 } from "../../utils/readImageFile";
import "./WorkspaceForm.css";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export default function ClientCard({
  clientId,
  displayName,
  onOpen,
  logoVersion = 0,
  onUpdated,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(displayName);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState(null);
  const menuRef = useRef(null);
  const menuBtnRef = useRef(null);
  const logoInputRef = useRef(null);

  useEffect(() => {
    setEditName(displayName);
  }, [displayName]);

  const syncMenuPosition = useCallback(() => {
    const btn = menuBtnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const menuWidth = 220;
    setMenuPos({
      top: rect.bottom + 6,
      left: Math.max(
        8,
        Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)
      ),
    });
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    syncMenuPosition();
    function onDoc(e) {
      const target = e.target;
      if (
        menuRef.current?.contains(target) ||
        menuBtnRef.current?.contains(target)
      ) {
        return;
      }
      setMenuOpen(false);
    }
    function onReflow() {
      syncMenuPosition();
    }
    const timer = window.setTimeout(() => {
      document.addEventListener("click", onDoc);
    }, 0);
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("click", onDoc);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [menuOpen, syncMenuPosition]);

  function clearEditLogo() {
    setLogoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setLogoFile(null);
    if (logoInputRef.current) logoInputRef.current.value = "";
  }

  function openEditDialog() {
    setEditName(displayName);
    clearEditLogo();
    setEditError(null);
    setEditing(true);
    setMenuOpen(false);
  }

  function closeEditDialog() {
    if (saving) return;
    setEditing(false);
    clearEditLogo();
    setEditError(null);
  }

  function handleEditLogoChange(e) {
    const file = e.target.files?.[0];
    if (!file) {
      clearEditLogo();
      return;
    }
    if (!isImageFile(file)) {
      setEditError("Logo must be an image (PNG, JPG, WebP, GIF, or SVG).");
      clearEditLogo();
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setEditError("Logo must be 2 MB or smaller.");
      clearEditLogo();
      return;
    }
    setEditError(null);
    setLogoFile(file);
    setLogoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }

  async function handleSaveEdit(e) {
    e?.preventDefault();
    const name = editName.trim();
    if (!name) return;
    setSaving(true);
    setEditError(null);
    try {
      const payload = { display_name: name };
      if (logoFile) {
        payload.logo_base64 = await readImageFileAsBase64(logoFile);
        payload.logo_filename = logoFile.name;
      }
      await api.updateClientWorkspace(clientId, payload);
      setEditing(false);
      clearEditLogo();
      await onUpdated?.();
    } catch (err) {
      setEditError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  }


  return (
    <>
      <div className="card client-card" onClick={onOpen}>
        <div className="client-card-inner">
          <WorkspaceLogo clientId={clientId} size={44} cacheKey={logoVersion} />
          <div className="client-card-text">
            <div className="card-title client-card-name">{displayName}</div>
            <div className="client-card-action">Open workspace →</div>
          </div>
        </div>
        <div
          className={`client-card-menu-wrap${
            menuOpen ? " client-card-menu-wrap--open" : ""
          }`}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            ref={menuBtnRef}
            type="button"
            className={`client-card-menu-btn${
              menuOpen ? " client-card-menu-btn--open" : ""
            }`}
            aria-label="Workspace actions"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            ⋮
          </button>
        </div>
      </div>
      {menuOpen
        ? createPortal(
            <div
              ref={menuRef}
              className="client-card-menu client-card-menu--portal"
              style={{ top: menuPos.top, left: menuPos.left }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="client-card-menu-item"
                onClick={openEditDialog}
              >
                Edit workspace
              </button>
            </div>,
            document.body
          )
        : null}
      {editing
        ? createPortal(
            <div
              className="client-edit-overlay"
              onClick={saving ? undefined : closeEditDialog}
              role="presentation"
            >
              <form
                className="client-edit-dialog"
                onSubmit={handleSaveEdit}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-labelledby={`edit-workspace-${clientId}`}
              >
                <h2 id={`edit-workspace-${clientId}`} className="client-edit-title">
                  Edit workspace
                </h2>
                <label className="label" htmlFor={`edit-name-${clientId}`}>
                  Workspace name
                </label>
                <input
                  id={`edit-name-${clientId}`}
                  className="input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  autoFocus
                  disabled={saving}
                />
                <div className="workspace-form-logo-row client-edit-logo-row">
                  <div className="workspace-form-logo-preview" aria-hidden>
                    {logoPreview ? (
                      <LogoFitImage src={logoPreview} size={48} />
                    ) : (
                      <WorkspaceLogo
                        clientId={clientId}
                        size={48}
                        cacheKey={logoVersion}
                      />
                    )}
                  </div>
                  <div className="workspace-form-logo-fields">
                    <span className="label">Workspace logo</span>
                    <span className="workspace-form-logo-hint">
                      PNG, JPG, WebP, GIF, or SVG — max 2 MB.
                    </span>
                    <div className="workspace-form-logo-actions">
                      <input
                        ref={logoInputRef}
                        id={`edit-logo-${clientId}`}
                        type="file"
                        className="workspace-form-logo-input"
                        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                        onChange={handleEditLogoChange}
                        disabled={saving}
                      />
                      <label
                        htmlFor={`edit-logo-${clientId}`}
                        className="btn btn-secondary btn-sm"
                      >
                        {logoFile ? "Change logo" : "Upload logo"}
                      </label>
                      {logoFile ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={clearEditLogo}
                          disabled={saving}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
                {editError ? (
                  <p className="client-edit-error">{editError}</p>
                ) : null}
                <div className="client-edit-actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={closeEditDialog}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={!editName.trim() || saving}
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              </form>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
