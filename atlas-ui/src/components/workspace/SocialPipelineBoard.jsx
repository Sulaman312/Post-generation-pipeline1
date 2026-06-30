import DeleteWorkspaceButton from "../shared/DeleteWorkspaceButton";
import ManualSocialForm from "./ManualSocialForm";
import PageHeader from "../shared/PageHeader";
import "./ContentPipelineBoard.css";

export default function SocialPipelineBoard({ client, onOpenRun, onClientDeleted }) {
  return (
    <div className="page cpb-page">
      <PageHeader
        title="New social post"
        subtitle="Fill in the details below to start a social media pipeline run."
        actions={
          onClientDeleted ? (
            <DeleteWorkspaceButton client={client} onDeleted={onClientDeleted} />
          ) : null
        }
      />

      <section className="cpb-section" aria-label="New social post">
        <ManualSocialForm client={client} onOpenRun={onOpenRun} />
      </section>
    </div>
  );
}

