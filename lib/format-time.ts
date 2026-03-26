/**
 * Formatiert einen Timestamp als relative Zeitangabe.
 * Beispiele: "Just now", "5m ago", "3h ago", "2d ago", "12. Mär"
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString("de-DE", {
    day: "numeric",
    month: "short",
  });
}
