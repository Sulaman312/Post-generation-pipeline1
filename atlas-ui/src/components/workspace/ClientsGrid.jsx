import { useEffect, useState } from "react";
import * as api from "../../services/api";
import PageHeader from "../shared/PageHeader";
import { workspaceDisplayName } from "../../utils/formatWorkspaceLabel";
import ClientCard from "./ClientCard";
import ClientCreateForm from "./ClientCreateForm";
import "./ClientsGrid.css";

export default function ClientsGrid({
  onOpenClient,
  logoVersions = {},
  onClientLogoSaved,
}) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const list = await api.getClients();
      setClients(list);
      setError(null);
    } catch (e) {
      const unreachable =
        e?.message?.includes("Failed to fetch") ||
        (e?.name === "TypeError" &&
          (String(e?.message).includes("fetch") ||
            String(e?.message).includes("NetworkError") ||
            String(e?.message).includes("NETWORK_ERROR"))) ||
        e?.message?.includes("timed out");
      setError(
        unreachable
          ? `Could not reach the API (${api.describeApiTargetForHumans()}). ` +
              `Terminal 1 (repo root): python main.py · ` +
              `Terminal 2 (atlas-ui): npm start · ` +
              `Then open http://localhost:3000 and click Retry.`
          : e?.message || String(e)
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="page">
      <PageHeader
        title="Workspaces"
        subtitle="Pick a client workspace to open the editorial pipeline."
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setAdding((v) => !v)}
          >
            + New Client
          </button>
        }
      />

      {adding ? (
        <ClientCreateForm
          onCancel={() => setAdding(false)}
          onError={setError}
          onCreated={async (name) => {
            await load();
            onOpenClient(name);
          }}
          onClientLogoSaved={onClientLogoSaved}
        />
      ) : null}

      {error ? (
        <div
          style={{
            background: "var(--error-soft)",
            border: "1px solid #fecaca",
            color: "var(--error-text)",
            padding: "12px 14px",
            borderRadius: 10,
            fontSize: 13.5,
            marginBottom: 16,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span style={{ flex: "1 1 280px" }}>{error}</span>
          <button type="button" className="btn btn-sm" onClick={() => load()}>
            Retry
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="empty-state">
          <span className="spinner" /> &nbsp; loading clients…
        </div>
      ) : clients.length === 0 ? (
        <div
          className="card"
          style={{
            textAlign: "center",
            color: "var(--text-muted)",
            padding: 36,
            borderStyle: "dashed",
          }}
          onClick={() => setAdding(true)}
        >
          No clients yet. Click{" "}
          <strong style={{ color: "var(--text)" }}>+ New Client</strong> to
          create your first workspace.
        </div>
      ) : (
        <div className="clients-grid">
          {clients.map((c) => (
            <ClientCard
              key={c.id}
              clientId={c.id}
              displayName={workspaceDisplayName(c.id, c.display_name)}
              logoVersion={logoVersions[c.id] || 0}
              onOpen={() => onOpenClient(c.id)}
              onUpdated={async () => {
                await load();
                onClientLogoSaved?.(c.id);
              }}
            />
          ))}
          <div className="card client-card-add" onClick={() => setAdding(true)}>
            + New workspace
          </div>
        </div>
      )}
    </div>
  );
}
