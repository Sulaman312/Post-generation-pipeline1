import DeleteWorkspaceButton from "../shared/DeleteWorkspaceButton";
import ManualSocialForm from "./ManualSocialForm";
import PageHeader from "../shared/PageHeader";
import { useLocale } from "../../context/LocaleContext";
import "./ContentPipelineBoard.css";

export default function SocialPipelineBoard({ client, onOpenRun, onClientDeleted }) {
  const { t } = useLocale();
  return (
    <div className="page cpb-page">
      <PageHeader
        title={t("socialBoard.title")}
        subtitle={t("socialBoard.subtitle")}
        actions={
          onClientDeleted ? (
            <DeleteWorkspaceButton client={client} onDeleted={onClientDeleted} />
          ) : null
        }
      />

      <section className="cpb-section" aria-label={t("socialBoard.title")}>
        <ManualSocialForm client={client} onOpenRun={onOpenRun} />
      </section>
    </div>
  );
}
