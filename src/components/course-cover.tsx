import { courseGradient, courseCoverLabel } from "@/lib/course-theme";
import { cn } from "@/lib/utils";

/**
 * The colored "spine" of a course card: a gradient band with the course
 * monogram, giving each course a stable, recognizable identity. `topRight`
 * holds a status badge or actions menu.
 */
export function CourseCover({
  id,
  title,
  className,
  topRight,
}: {
  id: string;
  title: string;
  className?: string;
  topRight?: React.ReactNode;
}) {
  const gradient = courseGradient(id);
  const label = courseCoverLabel(title);
  const size = label.length <= 6 ? "text-2xl" : label.length <= 9 ? "text-xl" : "text-lg";

  return (
    <div
      className={cn(
        "relative flex h-20 items-center overflow-hidden bg-gradient-to-br px-5",
        gradient,
        className
      )}
    >
      {/* subtle decorative rings for depth */}
      <div className="pointer-events-none absolute -right-6 -top-10 h-28 w-28 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -bottom-12 right-10 h-24 w-24 rounded-full bg-white/5" />
      <span className={cn("max-w-[70%] truncate font-bold tracking-tight text-white drop-shadow-sm", size)}>
        {label}
      </span>
      {topRight && <div className="absolute right-3 top-3 flex items-center gap-1">{topRight}</div>}
    </div>
  );
}
