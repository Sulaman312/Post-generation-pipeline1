import ClientHome from "./ClientHome";
import RunView from "../run/RunView";
import SocialStepMatrixScreen from "../run/SocialStepMatrixScreen";
import PostStatusScreen from "../run/PostStatusScreen";
import SocialPipelineBoard from "./SocialPipelineBoard";

export default function WorkspaceMain({
  client,
  runId,
  workspaceView,
  artifactFilename,
  onArtifactFilenameChange,
  activeStepKey,
  stepStatusOverrides,
  onOpenRun,
  onClientDeleted,
  onSelectStep,
  onBackFromRun,
  onBackToBoard,
}) {
  if (!runId && workspaceView === "artifacts") {
    return (
      <ClientHome
        client={client}
        onOpenRun={onOpenRun}
        onClientDeleted={onClientDeleted}
        workspaceView={workspaceView}
        artifactFilename={artifactFilename}
        onArtifactFilenameChange={onArtifactFilenameChange}
      />
    );
  }

  if (!runId && workspaceView === "matrix") {
    return (
      <SocialStepMatrixScreen
        client={client}
        onOpenRun={onOpenRun}
        onClientDeleted={onClientDeleted}
        onBackToBoard={onBackToBoard}
      />
    );
  }

  if (!runId && workspaceView === "post_status") {
    return (
      <PostStatusScreen
        client={client}
        onOpenRun={onOpenRun}
        onClientDeleted={onClientDeleted}
      />
    );
  }

  if (!runId && workspaceView === "overview") {
    return (
      <SocialPipelineBoard
        client={client}
        onOpenRun={onOpenRun}
        onClientDeleted={onClientDeleted}
      />
    );
  }

  if (!runId) {
    return (
      <ClientHome
        client={client}
        onOpenRun={onOpenRun}
        onClientDeleted={onClientDeleted}
        workspaceView={workspaceView}
        artifactFilename={artifactFilename}
        onArtifactFilenameChange={onArtifactFilenameChange}
      />
    );
  }

  return (
    <RunView
      client={client}
      runId={runId}
      activeStepKey={activeStepKey}
      statusOverrides={stepStatusOverrides}
      onSelectStep={onSelectStep}
      onBack={onBackFromRun}
    />
  );
}
