export function statusClass(s) {
  if (s === "done" || s === "running" || s === "error" || s === "skipped")
    return s;
  return "";
}

export function statusLabel(s) {
  if (s === "done") return "Done";
  if (s === "running") return "Running";
  if (s === "error") return "Error";
  if (s === "skipped") return "Skipped";
  return "Pending";
}
