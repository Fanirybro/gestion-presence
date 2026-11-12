import React from "react";
import { Building2, Save, Trash2, Upload } from "lucide-react";
import OrganisationCode from "../../components/OrganisationCode";
import { Field } from "../../components/ui";
import type { Settings } from "../../types";
import type { Organisation } from "../../services/auth";

export function OngletGeneral({
  settings,
  setSettings,
  logoPreview,
  setLogoPreview,
  enSauvegarde,
  erreur,
  organisation,
  surEnregistrement,
  surTeleversementLogo,
}: {
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
  logoPreview: string | null;
  setLogoPreview: React.Dispatch<React.SetStateAction<string | null>>;
  enSauvegarde: boolean;
  erreur: string;
  organisation: Organisation | null;
  surEnregistrement: (e: React.FormEvent) => void;
  surTeleversementLogo: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <>
      <OrganisationCode />
      <form className="settings-form" onSubmit={surEnregistrement}>
        <fieldset disabled={enSauvegarde} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <section className="settings-section">
            <h2>Identité de l'organisation</h2>
            <div className="form-grid">
              <Field label="Nom de l’organisation">
                <input
                  required
                  maxLength={100}
                  value={settings.organization}
                  onChange={(e) => setSettings({ ...settings, organization: e.target.value })}
                />
              </Field>
              <Field label="Adresse">
                <input
                  maxLength={500}
                  value={settings.address}
                  onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                />
              </Field>
              <Field label="Fuseau horaire">
                <input readOnly value={organisation?.fuseau_horaire ?? "Indian/Antananarivo"} />
              </Field>
            </div>
          </section>

          <section className="settings-section" style={{ marginTop: "1.5rem" }}>
            <h2>Logo de l'organisation</h2>
            <p className="text-secondary" style={{ fontSize: "0.875rem", marginBottom: "1rem" }}>
              Ce logo apparaîtra sur vos en-têtes de rapports, badges QR et dans la barre de navigation.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
              {logoPreview ? (
                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                  <img
                    src={logoPreview}
                    alt="Logo"
                    style={{
                      width: "72px",
                      height: "72px",
                      objectFit: "contain",
                      borderRadius: "10px",
                      border: "1px solid #e2e8f0",
                      padding: "4px",
                      background: "#fff",
                    }}
                  />
                  <div>
                    <button
                      type="button"
                      className="button"
                      style={{ color: "#e11d48", fontSize: "0.85rem" }}
                      onClick={() => {
                        setLogoPreview(null);
                        setSettings({ ...settings, logo_url: null });
                      }}
                    >
                      <Trash2 size={14} /> Supprimer le logo
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    width: "72px",
                    height: "72px",
                    borderRadius: "10px",
                    border: "2px dashed #cbd5e1",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#94a3b8",
                  }}
                >
                  <Building2 size={28} />
                </div>
              )}

              <label className="button" style={{ cursor: "pointer" }}>
                <Upload size={15} />
                <span>{logoPreview ? "Remplacer l'image" : "Importer un logo"}</span>
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={surTeleversementLogo}
                />
              </label>
            </div>
          </section>

          {erreur && <p className="form-error" role="alert">{erreur}</p>}

          <div className="form-actions" style={{ marginTop: "1.5rem" }}>
            <button className="button primary" disabled={enSauvegarde}>
              <Save size={16} />
              {enSauvegarde ? "Enregistrement…" : "Enregistrer les modifications"}
            </button>
          </div>
        </fieldset>
      </form>
    </>
  );
}

// Alias de rétrocompatibilité
export { OngletGeneral as GeneralTab };
