import { ArrowLeft, ArrowRight, Camera, QrCode } from "lucide-react";
import { motion } from "motion/react";

export interface DefinitionChampPersonnalise {
  id: string;
  name: string;
  label: string;
  type: "text" | "number" | "date" | "select";
  required?: boolean;
}

export const SUGGESTIONS_PAR_DEFAUT: DefinitionChampPersonnalise[] = [
  { id: "phone", name: "telephone_urgence", label: "Contact d'urgence", type: "text" },
  { id: "cin", name: "numero_cin", label: "Numéro CIN", type: "text" },
];

interface PropsEtapePersonnalisation {
  pointageFacial: boolean;
  setPointageFacial: (v: boolean) => void;
  pointageQr: boolean;
  setPointageQr: (v: boolean) => void;
  champsPersonnalises: DefinitionChampPersonnalise[];
  setChampsPersonnalises: (champs: DefinitionChampPersonnalise[]) => void;
  enTraitement: boolean;
  erreur: string;
  setErreur: (v: string) => void;
  surPrecedent: () => void;
  surSoumettre: () => void;
}

export function EtapePersonnalisation({
  pointageFacial,
  setPointageFacial,
  pointageQr,
  setPointageQr,
  enTraitement,
  erreur,
  setErreur,
  surPrecedent,
  surSoumettre,
}: PropsEtapePersonnalisation) {
  const basculerFacial = () => {
    if (pointageFacial && !pointageQr) {
      setErreur("Au moins un mode de pointage doit rester activé.");
      return;
    }
    setPointageFacial(!pointageFacial);
    setErreur("");
  };

  const basculerQr = () => {
    if (pointageQr && !pointageFacial) {
      setErreur("Au moins un mode de pointage doit rester activé.");
      return;
    }
    setPointageQr(!pointageQr);
    setErreur("");
  };

  return (
    <div className="onboarding-step-body">
      <div className="onboarding-step-header">
        <h1 className="step-hero-title">Modes de pointage</h1>
      </div>

      <div className="clean-toggle-stack">
        <div className="clean-toggle-item" onClick={basculerFacial}>
          <div className="clean-toggle-icon">
            <Camera size={20} />
          </div>
          <div className="clean-toggle-info">
            <strong>Reconnaissance faciale</strong>
            <span>Borne Kiosk par caméra</span>
          </div>
          <button
            type="button"
            className={`clean-switch ${pointageFacial ? "active" : ""}`}
            aria-label="Activer la reconnaissance faciale"
          >
            <span className="clean-switch-dot" />
          </button>
        </div>

        <div className="clean-toggle-item" onClick={basculerQr}>
          <div className="clean-toggle-icon">
            <QrCode size={20} />
          </div>
          <div className="clean-toggle-info">
            <strong>Badges QR Code</strong>
            <span>Scan par smartphone ou douchette</span>
          </div>
          <button
            type="button"
            className={`clean-switch ${pointageQr ? "active" : ""}`}
            aria-label="Activer les badges QR"
          >
            <span className="clean-switch-dot" />
          </button>
        </div>
      </div>

      {erreur && <p className="onboarding-error-inline" role="alert">{erreur}</p>}

      <div className="onboarding-step-footer spaced">
        <button
          type="button"
          className="clean-btn-ghost"
          onClick={surPrecedent}
          disabled={enTraitement}
        >
          <ArrowLeft size={16} />
          <span>Retour</span>
        </button>
        <motion.button
          type="button"
          className="clean-btn-primary"
          onClick={surSoumettre}
          disabled={enTraitement}
          whileTap={{ scale: 0.98 }}
        >
          <span>{enTraitement ? "Création…" : "Terminer"}</span>
          <ArrowRight size={17} />
        </motion.button>
      </div>
    </div>
  );
}

export {
  EtapePersonnalisation as StepCustomization,
  SUGGESTIONS_PAR_DEFAUT as DEFAULT_SUGGESTIONS,
  type DefinitionChampPersonnalise as CustomFieldDefinition,
};
