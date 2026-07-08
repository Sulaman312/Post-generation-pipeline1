import { useEffect, useState } from "react";
import * as api from "../../services/api";
import ImageComposer from "./ImageComposer";
import "./ImageGenerationStep.css";

export default function ImageComposePanel({ client, runId, toast }) {
  const [loading, setLoading] = useState(true);
  const [primaryImage, setPrimaryImage] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listRunImages(client, runId)
      .then((data) => {
        if (cancelled) return;
        setPrimaryImage(data.selected_primary || null);
      })
      .catch(() => {
        if (cancelled) return;
        setPrimaryImage(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, runId]);

  if (loading) {
    return (
      <div className="empty-state empty-state-inline">
        <span className="spinner" /> loading…
      </div>
    );
  }

  if (!primaryImage) {
    return (
      <div className="step4-shell">
        <div className="step4-empty-hint">
          No primary image selected. Go back to <strong>Step 4 — Image generation</strong> and
          choose one first.
        </div>
      </div>
    );
  }

  return (
    <ImageComposer
      key={primaryImage}
      client={client}
      runId={runId}
      primaryImage={primaryImage}
      toast={toast}
    />
  );
}
