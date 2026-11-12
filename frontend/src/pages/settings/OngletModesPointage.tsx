import React from "react";
import { Camera, QrCode, Save } from "lucide-react";
import { useApp } from "../../app/context";
import type { Settings } from "../../types";

export function OngletModesPointage({
  settings,
  setSettings,
  enSauvegarde,
  erreur,
  surEnregistrement,
}: {
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
  enSauvegarde: boolean;
  erreur: string;
  surEnregistrement: (e: React.FormEvent) => void;
}) {
  const { notify } = useApp();

  return (
    <form className="settings-form" onSubmit={surEnregistrement}>
      <fieldset disabled={enSauvegarde} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <section className="settings-section">
          <h2>Modes de pointage autorisés</h2>
          <p className="text-secondary" style={{ fontSize: "0.875rem", marginBottom: "1rem" }}>
            Sélectionnez les méthodes de badgeage actives pour votre organisation. Au moins une méthode doit rester active.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.8rem", cursor: "pointer", fontWeight: 500 }}>
              <input
                type="checkbox"
                checked={settings.pointage_qr ?? true}
                onChange={(e) => {
                  const next = e.target.checked;
                  if (!next && !(settings.pointage_facial ?? true)) {
                    notify("Au moins un mode de pointage doit rester actif.", true);
                    return;
                  }
                  setSettings({ ...settings, pointage_qr: next });
                }}
              />
              <QrCode size={20} color="#0284c7" />
              <div>
                <strong>Pointage par QR Code</strong>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b" }}>
                  Badges physiques scannés par webcam ou smartphones.
                </p>
              </div>
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: "0.8rem", cursor: "pointer", fontWeight: 500 }}>
              <input
                type="checkbox"
                checked={settings.pointage_facial ?? true}
                onChange={(e) => {
                  const next = e.target.checked;
                  if (!next && !(settings.pointage_qr ?? true)) {
                    notify("Au moins un mode de pointage doit rester actif.", true);
                    return;
                  }
                  setSettings({ ...settings, pointage_facial: next });
                }}
              />
              <Camera size={20} color="#059669" />
              <div>
                <strong>Pointage par Reconnaissance Faciale</strong>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b" }}>
                  Borne Kiosk biométrique avec vérification d'empreinte faciale par IA.
                </p>
              </div>
            </label>
          </div>
        </section>

        {erreur && <p className="form-error" role="alert">{erreur}</p>}

        <div className="form-actions" style={{ marginTop: "1.5rem" }}>
          <button className="button primary" disabled={enSauvegarde}>
            <Save size={16} />
            {enSauvegarde ? "Enregistrement…" : "Enregistrer les modes"}
          </button>
        </div>
      </fieldset>
    </form>
  );
}

// Alias de rétrocompatibilité
export { OngletModesPointage as AttendanceModesTab };
