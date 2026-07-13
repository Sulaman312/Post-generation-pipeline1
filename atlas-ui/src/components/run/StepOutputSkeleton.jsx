import GeneratedImagesPanel from "./GeneratedImagesPanel";
import ImageComposePanel from "./ImageComposePanel";
import TemplatePlacementPanel from "./TemplatePlacementPanel";
import SocialPostReviewPreview from "./SocialPostReviewPreview";
import TextSkeleton from "../shared/TextSkeleton";

/** Step-appropriate placeholder while output is generating or not ready yet. */
export default function StepOutputSkeleton({ stepKey, client, runId, toast, label }) {
  switch (stepKey) {
    case "image_generation":
      return (
        <GeneratedImagesPanel
          client={client}
          runId={runId}
          toast={toast}
          skeletonOnly
        />
      );
    case "image_compose":
      return <ImageComposePanel client={client} runId={runId} toast={toast} skeletonOnly />;
    case "image_template":
      return (
        <TemplatePlacementPanel
          client={client}
          runId={runId}
          toast={toast}
          skeletonOnly
        />
      );
    case "review_checklist":
      return (
        <SocialPostReviewPreview
          client={client}
          runId={runId}
          toast={toast}
          skeletonOnly
        />
      );
    default:
      return (
        <div className="run-artifact-shell">
          <div className="run-artifact-card">
            <div className="run-artifact-body run-artifact-body--skeleton">
              {label ? (
                <p className="step-output-skeleton-label">{label}</p>
              ) : null}
              <TextSkeleton lines={8} variant="body" />
            </div>
          </div>
        </div>
      );
  }
}
