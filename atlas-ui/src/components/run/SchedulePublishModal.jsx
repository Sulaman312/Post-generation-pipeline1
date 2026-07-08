import { useEffect, useMemo, useState } from "react";
import "./SchedulePublishModal.css";

function clampHour(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return 12;
  return Math.min(12, Math.max(1, Math.round(n)));
}

function clampMinute(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return 0;
  return Math.min(59, Math.max(0, Math.round(n)));
}

function localDateInputValue(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatTimeInputValue(hours, minutes) {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function to24Hour(hour12, period) {
  const base = hour12 % 12;
  return period === "PM" ? base + 12 : base;
}

function fromTimeHm(timeHm) {
  const [h, mi] = timeHm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  let hour12 = h % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour12, minute: clampMinute(mi), period };
}

function toTimeHm({ hour12, minute, period }) {
  return formatTimeInputValue(to24Hour(clampHour(hour12), period), clampMinute(minute));
}

function nextAvailableTimeHm(now = new Date()) {
  const candidate = new Date(now.getTime() + 60_000);
  return formatTimeInputValue(candidate.getHours(), candidate.getMinutes());
}

function parseScheduledParts(iso) {
  if (!iso) return null;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  return {
    date: localDateInputValue(dt),
    timeParts: fromTimeHm(formatTimeInputValue(dt.getHours(), dt.getMinutes())),
  };
}

export function buildScheduledISO(dateYmd, timeHm) {
  const [y, mo, d] = dateYmd.split("-").map(Number);
  const [h, mi] = timeHm.split(":").map(Number);
  return new Date(y, mo - 1, d, h, mi, 0, 0).toISOString();
}

export function formatScheduleLabel(iso) {
  if (!iso) return "";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function defaultScheduleState(existingIso) {
  const parsed = parseScheduledParts(existingIso);
  if (parsed) return parsed;

  const now = new Date();
  const today = localDateInputValue(now);
  const timeHm = nextAvailableTimeHm(now);
  const [h, mi] = timeHm.split(":").map(Number);
  const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, mi);
  if (candidate > now) {
    return { date: today, timeParts: fromTimeHm(timeHm) };
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return { date: localDateInputValue(tomorrow), timeParts: { hour12: 9, minute: 0, period: "AM" } };
}

function parseYmd(ymd) {
  const [y, mo, d] = String(ymd || "").split("-").map(Number);
  if (!y || !mo || !d) return null;
  return { y, mo, d };
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function formatMonthLabel(year, monthIndex) {
  return new Date(year, monthIndex, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function ScheduleDatePicker({ value, minDate, disabled, onChange }) {
  const selected = parseYmd(value);
  const min = parseYmd(minDate);
  const today = parseYmd(localDateInputValue());

  const initialMonth = selected ? selected.mo - 1 : (min?.mo || today.mo) - 1;
  const initialYear = selected?.y || min?.y || today.y;

  const [viewMonth, setViewMonth] = useState(initialMonth);
  const [viewYear, setViewYear] = useState(initialYear);

  useEffect(() => {
    if (!value) return;
    const parts = parseYmd(value);
    if (!parts) return;
    setViewMonth(parts.mo - 1);
    setViewYear(parts.y);
  }, [value]);

  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const totalDays = daysInMonth(viewYear, viewMonth);
  const cells = [];

  for (let i = 0; i < firstDow; i += 1) cells.push(null);
  for (let day = 1; day <= totalDays; day += 1) cells.push(day);

  function isDisabledDay(day) {
    if (!min) return false;
    if (viewYear < min.y) return true;
    if (viewYear === min.y && viewMonth + 1 < min.mo) return true;
    if (viewYear === min.y && viewMonth + 1 === min.mo && day < min.d) return true;
    return false;
  }

  function selectDay(day) {
    if (isDisabledDay(day)) return;
    const ymd = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    onChange?.(ymd);
  }

  function shiftMonth(delta) {
    const dt = new Date(viewYear, viewMonth + delta, 1);
    setViewMonth(dt.getMonth());
    setViewYear(dt.getFullYear());
  }

  function pickToday() {
    if (!today) return;
    onChange?.(localDateInputValue());
  }

  function pickTomorrow() {
    const dt = new Date();
    dt.setDate(dt.getDate() + 1);
    onChange?.(localDateInputValue(dt));
  }

  const weekdayLabels = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const selectedLabel =
    value && selected
      ? new Date(selected.y, selected.mo - 1, selected.d).toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
        })
      : null;

  return (
    <div className="schedule-date-picker">
      <div className="schedule-date-picker-head">
        <button
          type="button"
          className="schedule-date-nav"
          disabled={disabled}
          aria-label="Previous month"
          onClick={() => shiftMonth(-1)}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
            <path d="M10 3 5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="schedule-date-head-copy">
          <div className="schedule-date-month">{formatMonthLabel(viewYear, viewMonth)}</div>
          {selectedLabel ? (
            <div className="schedule-date-selected" aria-hidden>
              {selectedLabel}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="schedule-date-nav"
          disabled={disabled}
          aria-label="Next month"
          onClick={() => shiftMonth(1)}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
            <path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div className="schedule-date-weekdays" aria-hidden>
        {weekdayLabels.map((label) => (
          <span key={label} className="schedule-date-weekday">
            {label}
          </span>
        ))}
      </div>

      <div className="schedule-date-grid" role="grid" aria-label="Choose day">
        {cells.map((day, idx) => {
          if (day == null) {
            return <span key={`empty-${idx}`} className="schedule-date-cell schedule-date-cell--empty" />;
          }
          const isSelected =
            selected &&
            selected.y === viewYear &&
            selected.mo === viewMonth + 1 &&
            selected.d === day;
          const isToday =
            today &&
            today.y === viewYear &&
            today.mo === viewMonth + 1 &&
            today.d === day;
          const off = isDisabledDay(day);
          return (
            <button
              key={day}
              type="button"
              role="gridcell"
              disabled={disabled || off}
              className={[
                "schedule-date-cell",
                "schedule-date-cell--day",
                isSelected ? "schedule-date-cell--selected" : "",
                isToday && !isSelected ? "schedule-date-cell--today" : "",
                off ? "schedule-date-cell--disabled" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-selected={isSelected}
              onClick={() => selectDay(day)}
            >
              {day}
            </button>
          );
        })}
      </div>

      <div className="schedule-date-quick">
        <button type="button" className="schedule-date-quick-btn" disabled={disabled} onClick={pickToday}>
          Today
        </button>
        <button type="button" className="schedule-date-quick-btn" disabled={disabled} onClick={pickTomorrow}>
          Tomorrow
        </button>
      </div>
    </div>
  );
}

function ScheduleTimePicker({ value, onChange, disabled = false }) {
  function update(patch) {
    onChange?.({ ...value, ...patch });
  }

  return (
    <div className="schedule-time-picker">
      <div className="schedule-time-row">
        <label className="schedule-time-control">
          <span className="schedule-time-control-label">Hour</span>
          <input
            type="number"
            className="schedule-time-input"
            min={1}
            max={12}
            step={1}
            inputMode="numeric"
            aria-label="Hour"
            value={value.hour12}
            disabled={disabled}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                update({ hour12: 12 });
                return;
              }
              update({ hour12: clampHour(raw) });
            }}
            onBlur={(e) => {
              update({ hour12: clampHour(e.target.value) });
            }}
          />
        </label>

        <span className="schedule-time-colon" aria-hidden>
          :
        </span>

        <label className="schedule-time-control">
          <span className="schedule-time-control-label">Minute</span>
          <input
            type="number"
            className="schedule-time-input"
            min={0}
            max={59}
            step={1}
            inputMode="numeric"
            aria-label="Minute"
            value={value.minute}
            disabled={disabled}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                update({ minute: 0 });
                return;
              }
              update({ minute: clampMinute(raw) });
            }}
            onBlur={(e) => {
              update({ minute: clampMinute(e.target.value) });
            }}
          />
        </label>
      </div>

      <div className="schedule-period-toggle" role="group" aria-label="AM or PM">
        {["AM", "PM"].map((period) => {
          const active = value.period === period;
          return (
            <button
              key={period}
              type="button"
              className={`schedule-period-btn${active ? " schedule-period-btn--active" : ""}`}
              aria-pressed={active}
              disabled={disabled}
              onClick={() => update({ period })}
            >
              {period}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function SchedulePublishModal({
  open,
  onClose,
  onConfirm,
  saving = false,
  existingScheduledAt = null,
  platformCount = 0,
  platformLabel = null,
}) {
  const minDate = useMemo(() => localDateInputValue(), []);
  const [date, setDate] = useState(minDate);
  const [timeParts, setTimeParts] = useState({ hour12: 9, minute: 0, period: "AM" });
  const [error, setError] = useState(null);
  const time = useMemo(() => toTimeHm(timeParts), [timeParts]);

  useEffect(() => {
    if (!open) return;
    const next = defaultScheduleState(existingScheduledAt);
    setDate(next.date);
    setTimeParts(next.timeParts);
    setError(null);
  }, [open, existingScheduledAt]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape" && !saving) onClose?.();
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, saving, onClose]);

  if (!open) return null;

  function validateSelection() {
    if (!date || !time) {
      setError("Choose a date and time.");
      return null;
    }
    const iso = buildScheduledISO(date, time);
    if (new Date(iso) <= new Date()) {
      setError("Pick a date and time in the future.");
      return null;
    }
    setError(null);
    return iso;
  }

  function handleConfirm() {
    const iso = validateSelection();
    if (!iso) return;
    onConfirm?.(iso);
  }

  const previewLabel = date && time ? formatScheduleLabel(buildScheduledISO(date, time)) : "";

  return (
    <div className="schedule-modal-overlay" onClick={saving ? undefined : onClose} role="presentation">
      <div
        className="schedule-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="schedule-modal-header">
          <div>
            <h3 id="schedule-modal-title" className="schedule-modal-title">
              Schedule publish
            </h3>
            <p className="schedule-modal-subtitle">
              {platformLabel
                ? `Set publish time for ${platformLabel}`
                : platformCount > 0
                  ? `Same time for ${platformCount} selected platform${platformCount === 1 ? "" : "s"}`
                  : "Select platforms before scheduling"}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm schedule-modal-close"
            aria-label="Close"
            disabled={saving}
            onClick={onClose}
          >
            ✕
          </button>
        </header>

        <div className="schedule-modal-body">
          <div className="schedule-modal-field">
            <span className="schedule-modal-label">Day</span>
            <ScheduleDatePicker
              value={date}
              minDate={minDate}
              disabled={saving}
              onChange={(next) => {
                setDate(next);
                setError(null);
              }}
            />
          </div>

          <div className="schedule-modal-field">
            <span className="schedule-modal-label">Time</span>
            <ScheduleTimePicker
              value={timeParts}
              disabled={saving}
              onChange={(next) => {
                setTimeParts(next);
                setError(null);
              }}
            />
          </div>

          {error ? (
            <p className="schedule-modal-error schedule-modal-error--full" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="schedule-modal-footer">
          {previewLabel ? (
            <p className="schedule-modal-preview">
              Scheduled for <strong>{previewLabel}</strong>
            </p>
          ) : (
            <span className="schedule-modal-preview schedule-modal-preview--empty" aria-hidden />
          )}
          <div className="schedule-modal-footer-actions">
            <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={saving || platformCount === 0}
              onClick={handleConfirm}
            >
              {saving ? (
                <>
                  <span className="spinner spinner-light" /> Saving…
                </>
              ) : (
                "Confirm schedule"
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
