import { Monitor } from "lucide-react";

interface KioskSwitchProps {
  isKiosk: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export function KioskSwitch({ isKiosk, onToggle, disabled = false }: KioskSwitchProps) {
  return (
    <div className={`kiosk-switch-control ${isKiosk ? "is-active" : ""}`}>
      <span className="kiosk-switch-text">
        <Monitor size={15} />
        <span>Mode Borne</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={isKiosk}
        aria-label="Activer ou désactiver le mode borne"
        title={isKiosk ? "Quitter le mode borne (mot de passe requis)" : "Activer le mode borne plein écran"}
        onClick={onToggle}
        disabled={disabled}
        className={`kiosk-toggle-track ${isKiosk ? "checked" : ""}`}
      >
        <span className="kiosk-toggle-thumb" />
      </button>
    </div>
  );
}
