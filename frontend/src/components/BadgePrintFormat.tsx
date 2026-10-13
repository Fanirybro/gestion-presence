import { useEffect, useRef, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
export type BadgePrintFormat = "cr80" | "a6";
export function BadgeFormatMenu({
  label,
  icon,
  disabled,
  primary,
  onSelect,
}: {
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  primary?: boolean;
  onSelect: (format: BadgePrintFormat) => void;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node))
        menu.current?.removeAttribute("open");
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  return (
    <details
      className="badge-action-menu"
      ref={menu}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          menu.current?.removeAttribute("open");
          menu.current?.querySelector("summary")?.focus();
        }
      }}
    >
      <summary
        className={"button " + (primary ? "primary" : "")}
        aria-disabled={disabled}
        onClick={(event) => {
          if (disabled) event.preventDefault();
        }}
      >
        {icon}
        {label}
        <ChevronDown size={16} />
      </summary>
      <div className="badge-format-options" aria-label="Choisir le format">
        <span>Choisir le format</span>
        {(["cr80", "a6"] as const).map((format) => (
          <button
            key={format}
            type="button"
            disabled={disabled}
            onClick={() => {
              menu.current?.removeAttribute("open");
              onSelect(format);
            }}
          >
            <strong>
              {format === "cr80" ? "86 × 54 mm · Paysage" : "A6 · 105 × 148 mm"}
            </strong>
            <small>
              {format === "cr80"
                ? "Format carte professionnelle"
                : "Badge centré sur une feuille A6"}
            </small>
          </button>
        ))}
      </div>
    </details>
  );
}
