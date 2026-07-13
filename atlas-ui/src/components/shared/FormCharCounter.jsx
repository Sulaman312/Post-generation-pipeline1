import "./FormCharCounter.css";

export default function FormCharCounter({ value = "", max, id }) {
  const len = String(value || "").length;
  const remaining = max - len;
  const near = remaining <= 200 && remaining >= 0;

  return (
    <div
      id={id}
      className={`form-char-counter${near ? " is-near" : ""}`}
      aria-live="polite"
    >
      {len.toLocaleString()} / {max.toLocaleString()}
    </div>
  );
}
