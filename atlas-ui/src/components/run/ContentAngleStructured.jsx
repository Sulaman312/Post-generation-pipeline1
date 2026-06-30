import FormattedFieldText from "../shared/FormattedFieldText";
import { parseContentAngleIntent } from "../../utils/parseContentAngleIntent";

function renderAngleItem(text) {
  const m = String(text || "").match(/^\*\*([^*]+)\*\*\s*:?\s*(.*)$/s);
  if (!m) return text;
  const title = m[1].trim();
  const body = m[2].trim();
  if (!body) return <strong>{title}</strong>;
  return (
    <>
      <strong>{title}</strong>
      {body ? <> — {body}</> : null}
    </>
  );
}

export default function ContentAngleStructured({ text }) {
  const data = parseContentAngleIntent(text);
  if (!data) return null;

  const rows = [
    { label: "Primary intent", value: data.primaryIntent },
    { label: "Post format", value: data.postFormat },
    { label: "Short angle statement", value: data.shortAngle },
  ].filter((r) => r.value?.trim());

  return (
    <div className="topic-card-structured content-angle-structured">
      <div className="topic-card-structured-grid">
        {rows.map((row) => (
          <div className="topic-card-field" key={row.label}>
            <div className="topic-card-field-label">{row.label}</div>
            <div className="topic-card-field-value">
              <FormattedFieldText text={row.value} />
            </div>
          </div>
        ))}
        {data.alternatives.length > 0 ? (
          <div className="topic-card-field">
            <div className="topic-card-field-label">Alternative angles</div>
            <div className="topic-card-field-value">
              <ul className="content-angle-list">
                {data.alternatives.map((item, i) => (
                  <li key={i}>{renderAngleItem(item)}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
