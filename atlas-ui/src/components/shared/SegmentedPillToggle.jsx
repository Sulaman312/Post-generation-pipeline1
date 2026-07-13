import "./SegmentedPillToggle.css";

export default function SegmentedPillToggle({
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel,
  className = "",
}) {
  const list = Array.isArray(options) ? options : [];
  const selectedIndex = Math.max(
    0,
    list.findIndex((option) => option.value === value)
  );
  const columns = Math.max(list.length, 1);

  return (
    <div
      className={`pill-toggle${className ? ` ${className}` : ""}`}
      role="group"
      aria-label={ariaLabel}
      style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
    >
      <span
        className="pill-toggle-thumb"
        style={{
          width: `calc(${100 / columns}% - 4px)`,
          transform: `translateX(${selectedIndex * 100}%)`,
        }}
        aria-hidden
      />
      {list.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            className={`pill-toggle-option${active ? " is-active" : ""}`}
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange?.(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
