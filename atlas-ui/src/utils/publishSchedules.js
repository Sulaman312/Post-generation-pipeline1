export function schedulesAreSynced(schedules, platforms) {
  if (!platforms.length) return true;

  const times = platforms.map((platform) => {
    const iso = schedules[platform];
    return typeof iso === "string" && iso.trim() ? iso.trim() : null;
  });

  const scheduled = times.filter(Boolean);
  if (!scheduled.length) return true;
  if (scheduled.length !== platforms.length) return false;
  return scheduled.every((time) => time === scheduled[0]);
}
