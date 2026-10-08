import { cn } from "@/lib/utils";

/** Brand mark — a frosted metallic tile stamped with the Project O2 junction glyph. */
export function Logo({
  size = 36,
  className,
  rounded = "rounded-xl",
}: {
  size?: number;
  className?: string;
  rounded?: string;
}) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cn(
        "metallic relative inline-flex shrink-0 items-center justify-center shadow-[0_6px_16px_-6px_rgba(17,17,17,0.45)]",
        rounded,
        className,
      )}
    >
      <span className="absolute inset-0 rounded-[inherit] bg-[radial-gradient(60%_45%_at_32%_22%,rgba(255,255,255,0.9),transparent_60%)]" />
      <svg
        viewBox="0 0 512 512"
        width={size * 0.66}
        height={size * 0.66}
        fill="none"
        className="relative text-foreground/90"
      >
        <g stroke="currentColor" strokeWidth={38} strokeLinecap="round">
          <line x1="188" y1="70" x2="255" y2="264" />
          <line x1="470" y1="86" x2="255" y2="264" />
          <line x1="58" y1="300" x2="255" y2="264" />
          <line x1="330" y1="474" x2="255" y2="264" />
        </g>
      </svg>
    </span>
  );
}
