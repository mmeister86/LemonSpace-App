/**
 * Formatiert einen Timestamp als relative Zeitangabe.
 * Beispiele: "Gerade eben", "vor 5 Min.", "vor 3 Std.", "vor 2 Tagen", "12. Mär"
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Gerade eben";
  if (minutes < 60) return `vor ${minutes} Min.`;
  if (hours < 24) return `vor ${hours} Std.`;
  if (days < 7) return days === 1 ? "vor 1 Tag" : `vor ${days} Tagen`;
  return new Date(timestamp).toLocaleDateString("de-DE", {
    day: "numeric",
    month: "short",
  });
}
