import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";

export interface RowActionItem {
  key?: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  variant?: "default" | "danger" | "warning";
  disabled?: boolean;
  title?: string;
}

export interface RowActionsMenuProps {
  items: (RowActionItem | null | undefined | false)[];
  align?: "left" | "right";
  ariaLabel?: string;
}

interface DropdownCoords {
  top: number;
  left: number;
  isDropup?: boolean;
}

export function RowActionsMenu({
  items,
  align = "right",
  ariaLabel = "Menu d'actions",
}: RowActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<DropdownCoords | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const validItems = items.filter(
    (item): item is RowActionItem => Boolean(item) && typeof item === "object",
  );

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();

    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      setOpen(false);
      return;
    }

    const menuWidth = dropdownRef.current?.offsetWidth || 180;
    const menuHeight = dropdownRef.current?.offsetHeight || validItems.length * 36 + 12;

    const spaceBelow = window.innerHeight - rect.bottom;
    const isDropup = spaceBelow < menuHeight + 10 && rect.top > menuHeight;

    let top = isDropup ? rect.top - menuHeight - 4 : rect.bottom + 4;
    top = Math.max(8, Math.min(top, window.innerHeight - menuHeight - 8));

    let left = align === "left" ? rect.left : rect.right - menuWidth;
    left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));

    setCoords({ top, left, isDropup });
  }, [align, validItems.length]);

  useLayoutEffect(() => {
    if (open) {
      updatePosition();
    }
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    const handleScrollOrResize = () => {
      updatePosition();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScrollOrResize, { capture: true, passive: true });
    window.addEventListener("resize", handleScrollOrResize, { passive: true });

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [open, updatePosition]);

  if (!validItems.length) return null;

  return (
    <div
      ref={containerRef}
      className={`row-actions-menu ${align === "left" ? "align-left" : "align-right"}`}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        ref={buttonRef}
        type="button"
        className={`row-actions-trigger ${open ? "active" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={ariaLabel}
        onClick={() => setOpen((prev) => !prev)}
      >
        <MoreVertical size={16} aria-hidden="true" />
      </button>

      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            role="menu"
            aria-label={ariaLabel}
            className={`row-actions-dropdown ${coords?.isDropup ? "dropup" : ""}`}
            style={
              coords
                ? {
                    top: `${coords.top}px`,
                    left: `${coords.left}px`,
                  }
                : {
                    top: "-9999px",
                    left: "-9999px",
                  }
            }
            onClick={(e) => e.stopPropagation()}
          >
            {validItems.map((item, index) => (
              <button
                key={item.key || item.label || index}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                title={item.title}
                className={`row-action-item ${item.variant || "default"}`}
                onClick={() => {
                  if (item.disabled) return;
                  setOpen(false);
                  item.onClick();
                }}
              >
                {item.icon && <span className="row-action-icon">{item.icon}</span>}
                <span className="row-action-label">{item.label}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

