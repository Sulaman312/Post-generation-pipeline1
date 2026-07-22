export function statusClass(s) {
  if (s === "done" || s === "running" || s === "error" || s === "skipped")
    return s;
  return "";
}

export function statusLabel(s, t) {
  const translate = typeof t === "function" ? t : null;
  if (s === "done") return translate ? translate("status.done") : "Done";
  if (s === "running") return translate ? translate("status.running") : "Running";
  if (s === "error") return translate ? translate("status.error") : "Error";
  if (s === "skipped") return translate ? translate("status.skipped") : "Skipped";
  return translate ? translate("status.pending") : "Pending";
}

