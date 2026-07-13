import { useEffect, useState } from "react";
import * as api from "../../services/api";
import ImageSkeleton from "../shared/ImageSkeleton";
import TextSkeleton from "../shared/TextSkeleton";
import { pipelineStepLabel } from "../../constants/pipelineContract";
import ImageComposer from "./ImageComposer";
import "./ImageGenerationStep.css";

export default function ImageComposePanel({ client, runId, toast, skeletonOnly = false }) {
  const [loading, setLoading] = useState(!skeletonOnly);
  const [primaryImage, setPrimaryImage] = useState(null);

  useEffect(() => {
    if (skeletonOnly) return undefined;
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
  }, [client, runId, skeletonOnly]);

  if (skeletonOnly || loading) {
    return (
      <div className="step4-shell step4-shell--skeleton">
        <div className="image-composer-skeleton">
          <ImageSkeleton variant="media" className="image-composer-skeleton__canvas" />
          <TextSkeleton lines={5} variant="body" className="image-composer-skeleton__controls" />
        </div>
      </div>
    );
  }

  if (!primaryImage) {
    return (
      <div className="step4-shell">
        <div className="step4-empty-hint">
          No primary image selected. Go back to{" "}
          <strong>{pipelineStepLabel("image_generation")}</strong> and choose one first.
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
