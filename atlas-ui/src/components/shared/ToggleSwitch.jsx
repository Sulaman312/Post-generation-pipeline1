import "./ToggleSwitch.css";

export default function ToggleSwitch({
  checked = false,
  onChange,
  disabled = false,
  ariaLabel,
  id,
  className = "",
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      className={`toggle-switch${checked ? " is-on" : ""}${
        className ? ` ${className}` : ""
      }`}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
    >
      <span className="toggle-switch-thumb" aria-hidden />
    </button>
  );
}
