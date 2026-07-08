export default function PlatformSwitch({ checked, disabled, onChange, label }) {
  return (
    <label className="ppc-switch">
      <input
        type="checkbox"
        className="ppc-switch-input"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="ppc-switch-track" aria-hidden />
      <span className="visually-hidden">{label}</span>
    </label>
  );
}
