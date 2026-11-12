import React from "react";
import { ArrowRight, Camera, Trash2 } from "lucide-react";
import { motion } from "motion/react";

interface PropsEtapeIdentite {
  nom: string;
  setNom: (v: string) => void;
  logoPreview: string | null;
  setLogoPreview: (v: string | null) => void;
  erreur: string;
  setErreur: (v: string) => void;
  surSuivant: () => void;
  surTeleversementLogo: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function EtapeIdentite({
  nom,
  setNom,
  logoPreview,
  setLogoPreview,
  erreur,
  setErreur,
  surSuivant,
  surTeleversementLogo,
}: PropsEtapeIdentite) {
  const initiale = nom.trim().charAt(0).toUpperCase() || "E";

  return (
    <div className="onboarding-step-body">
      <div className="onboarding-step-header">
        <h1 className="step-hero-title">
          Comment s'appelle votre organisation ?
        </h1>
      </div>

      <div className="onboarding-field-clean">
        <input
          id="input-nom-organisation"
          className="clean-text-input"
          value={nom}
          onChange={(e) => {
            setNom(e.target.value);
            setErreur("");
          }}
          placeholder="Nom de l'organisation ou entreprise"
          maxLength={200}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && nom.trim()) {
              e.preventDefault();
              surSuivant();
            }
          }}
        />
      </div>

      <div className="clean-logo-row">
        <input
          id="logo-upload-input"
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={surTeleversementLogo}
        />

        <div
          className="clean-avatar-bubble"
          onClick={() => document.getElementById("logo-upload-input")?.click()}
          title="Ajouter un logo"
        >
          {logoPreview ? (
            <img src={logoPreview} alt="Logo" className="clean-avatar-img" />
          ) : (
            <span className="clean-avatar-letter">{initiale}</span>
          )}
          <div className="clean-avatar-icon">
            <Camera size={13} />
          </div>
        </div>

        <div className="clean-avatar-meta">
          <button
            type="button"
            className="clean-link-action"
            onClick={() => document.getElementById("logo-upload-input")?.click()}
          >
            {logoPreview ? "Changer le logo" : "Ajouter un logo"}
          </button>
          {logoPreview && (
            <button
              type="button"
              className="clean-danger-action"
              onClick={() => setLogoPreview(null)}
            >
              <Trash2 size={13} />
              <span>Retirer</span>
            </button>
          )}
        </div>
      </div>

      {erreur && <p className="onboarding-error-inline" role="alert">{erreur}</p>}

      <div className="onboarding-step-footer">
        <motion.button
          type="button"
          className="clean-btn-primary"
          onClick={surSuivant}
          disabled={!nom.trim()}
          whileTap={{ scale: 0.98 }}
        >
          <span>Continuer</span>
          <ArrowRight size={17} />
        </motion.button>
      </div>
    </div>
  );
}

export { EtapeIdentite as StepIdentity };
