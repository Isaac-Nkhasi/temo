export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";

export const money = (value: number) =>
  `M${Number(value).toLocaleString("en-ZA", { maximumFractionDigits: 2 })}`;

export function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export const ROLE_LABEL: Record<string, string> = {
  farmer: "Farmer",
  buyer: "Buyer",
  agri_officer: "Agricultural officer",
  admin: "Administrator",
};

export const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  accepted: "Accepted",
  processing: "Processing",
  completed: "Completed",
  cancelled: "Cancelled",
  rejected: "Rejected",
};
