import { useState, useEffect, useRef } from "react";
import { ShieldCheck, Lock, Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";
import { useApp } from "../../app/context";
import { isSuperAdmin } from "../../types";

interface KioskExitModalProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: (password: string) => Promise<boolean>;
  error?: string;
  isVerifying?: boolean;
}

export function KioskExitModal({
  isOpen,
  onCancel,
  onConfirm,
  error = "",
  isVerifying = false,
}: KioskExitModalProps) {
  const { user } = useApp();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPassword("");
      setShowPassword(false);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || isVerifying) return;
    await onConfirm(password);
  };

  const roleLabel =
    isSuperAdmin(user?.role) ? "SuperAdmin" : "Responsable de division";

  return (
    <div className="kiosk-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="kiosk-exit-title">
      <div className="kiosk-modal-card">
        <div className="kiosk-modal-icon-wrap">
          <ShieldCheck size={32} />
        </div>

        <h2 id="kiosk-exit-title" className="kiosk-modal-title">
          Sortie du Mode Borne
        </h2>

        <p className="kiosk-modal-subtitle">
          Ce terminal est sécurisé. Saisissez le mot de passe de votre compte pour déverrouiller la navigation.
        </p>

        {user && (
          <div className="kiosk-user-badge">
            <span className="kiosk-user-name">{user.name}</span>
            <span className="kiosk-user-role">{roleLabel}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="kiosk-modal-form">
          <div className="kiosk-input-wrap">
            <Lock size={16} className="kiosk-field-icon" />
            <input
              ref={inputRef}
              type={showPassword ? "text" : "password"}
              placeholder="Mot de passe du compte"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isVerifying}
              autoComplete="current-password"
              required
              className="kiosk-password-input"
            />
            <button
              type="button"
              className="kiosk-toggle-pwd"
              onClick={() => setShowPassword((prev) => !prev)}
              tabIndex={-1}
              aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {error && (
            <div className="kiosk-modal-error" role="alert">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          <div className="kiosk-modal-actions">
            <button
              type="button"
              onClick={onCancel}
              disabled={isVerifying}
              className="button kiosk-cancel-btn"
            >
              Rester en borne
            </button>
            <button
              type="submit"
              disabled={isVerifying || !password.trim()}
              className="button primary kiosk-unlock-btn"
            >
              {isVerifying ? (
                <>
                  <Loader2 size={16} className="spin" />
                  <span>Vérification…</span>
                </>
              ) : (
                <span>Déverrouiller</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
