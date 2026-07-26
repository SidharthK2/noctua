import { cn } from "@/lib/utils"

export type BadgeStatus =
  | "open"
  | "filled"
  | "withdrawn"
  | "active"
  | "repaid"
  | "defaulted"
  | "pending"

const STATUS_CLASSES: Record<BadgeStatus, string> = {
  open: "bg-neutral-500/10 text-neutral-700 border-neutral-500/20",
  filled: "bg-success/10 text-success border-success/20",
  withdrawn: "bg-neutral-500/10 text-neutral-500 border-neutral-500/20",
  active: "bg-success/10 text-success border-success/20",
  repaid: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  defaulted: "bg-red-500/10 text-red-600 border-red-500/20",
  pending: "bg-amber-500/10 text-amber-600 border-amber-500/20",
}

export function StatusBadge({ status, className }: { status: BadgeStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.7rem] font-medium uppercase tracking-wide",
        STATUS_CLASSES[status],
        className,
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full bg-current opacity-60",
          status === "pending" && "animate-pulse",
        )}
      />
      {status}
    </span>
  )
}
