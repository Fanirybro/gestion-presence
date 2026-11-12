import { ArrowLeft, ArrowRight, Clock, UserX } from "lucide-react";
import { motion } from "motion/react";
import type { ConfigurationHorairesJournee } from "./EtapeHoraires";

export interface ConfigurationPonctualite {
  toleranceMinutes: number;
  cutoffMatin: string;
  cutoffApresMidi: string;
  cutoffSoir: string;
}

interface PropsEtapePonctualite {
  horaires: ConfigurationHorairesJournee;
  ponctualite: ConfigurationPonctualite;
  setPonctualite: (p: ConfigurationPonctualite) => void;
  erreur: string;
  setErreur: (msg: string) => void;
  surPrecedent: () => void;
  surSuivant: () => void;
}

const SUGGESTIONS_TOLERANCE = [0, 5, 10, 15, 30];

export function EtapePonctualite({
  horaires,
  ponctualite,
  setPonctualite,
  erreur,
  setErreur,
  surPrecedent,
  surSuivant,
}: PropsEtapePonctualite) {
  const validerEtContinuer = () => {
    const { toleranceMinutes, cutoffMatin, cutoffApresMidi, cutoffSoir } = ponctualite;
    if (toleranceMinutes < 0) {
      setErreur("La tolérance de retard ne peut pas être négative.");
      return;
    }

    // Vérifier cutoff pour le matin
    if (horaires.matin.actif) {
      if (cutoffMatin < horaires.matin.debut || cutoffMatin > horaires.matin.fin) {
        setErreur(`Matin : l'heure limite d'absence doit être comprise entre ${horaires.matin.debut} et ${horaires.matin.fin}.`);
        return;
      }
    }

    // Vérifier cutoff pour l'après-midi
    if (horaires.apresMidi.actif) {
      if (cutoffApresMidi < horaires.apresMidi.debut || cutoffApresMidi > horaires.apresMidi.fin) {
        setErreur(`Après-midi : l'heure limite d'absence doit être comprise entre ${horaires.apresMidi.debut} et ${horaires.apresMidi.fin}.`);
        return;
      }
    }

    // Vérifier cutoff pour le soir
    if (horaires.soir.actif) {
      if (cutoffSoir < horaires.soir.debut || cutoffSoir > horaires.soir.fin) {
        setErreur(`Soir : l'heure limite d'absence doit être comprise entre ${horaires.soir.debut} et ${horaires.soir.fin}.`);
        return;
      }
    }

    setErreur("");
    surSuivant();
  };

  return (
    <div className="onboarding-step-body">
      <div className="onboarding-step-header">
        <h1 className="step-hero-title">Ponctualité & Seuil d'absence</h1>
        <p className="step-hero-subtitle">
          Définissez la tolérance accordée aux retards et l'heure à partir de laquelle un agent non pointé est déclaré absent.
        </p>
      </div>

      {/* 1. Tolérance de retard */}
      <div className="ponctualite-block">
        <div className="ponctualite-block-header">
          <Clock size={18} className="ponctualite-icon" />
          <div className="ponctualite-meta">
            <strong>Seuil de tolérance au retard</strong>
            <span>Délai accordé après le début du créneau avant de marquer un retard.</span>
          </div>
        </div>

        <div className="tolerance-selector-row">
          {SUGGESTIONS_TOLERANCE.map((min) => (
            <button
              key={min}
              type="button"
              className={`tolerance-pill ${ponctualite.toleranceMinutes === min ? "active" : ""}`}
              onClick={() => {
                setPonctualite({ ...ponctualite, toleranceMinutes: min });
                setErreur("");
              }}
            >
              <span>{min === 0 ? "Aucune (0 min)" : `${min} min`}</span>
            </button>
          ))}
          <div className="tolerance-custom-input">
            <input
              type="number"
              min={0}
              max={120}
              value={ponctualite.toleranceMinutes}
              onChange={(e) => {
                const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                setPonctualite({ ...ponctualite, toleranceMinutes: val });
                setErreur("");
              }}
            />
            <span>min</span>
          </div>
        </div>
      </div>

      {/* 2. Heure limite d'absence (Cutoff) */}
      <div className="ponctualite-block">
        <div className="ponctualite-block-header">
          <UserX size={18} className="ponctualite-icon danger" />
          <div className="ponctualite-meta">
            <strong>Heure limite de constat d'absence</strong>
            <span>Au-delà de cette heure sans badgeage d'arrivée, l'agent est automatiquement compté absent.</span>
          </div>
        </div>

        <div className="cutoff-inputs-list">
          {horaires.matin.actif && (
            <div className="cutoff-row">
              <span className="cutoff-period-name">Matin ({horaires.matin.debut} - {horaires.matin.fin})</span>
              <div className="cutoff-field">
                <span className="cutoff-label-prefix">Absent après :</span>
                <input
                  type="time"
                  className="time-input-styled"
                  value={ponctualite.cutoffMatin}
                  onChange={(e) =>
                    setPonctualite({ ...ponctualite, cutoffMatin: e.target.value })
                  }
                />
              </div>
            </div>
          )}

          {horaires.apresMidi.actif && (
            <div className="cutoff-row">
              <span className="cutoff-period-name">Après-midi ({horaires.apresMidi.debut} - {horaires.apresMidi.fin})</span>
              <div className="cutoff-field">
                <span className="cutoff-label-prefix">Absent après :</span>
                <input
                  type="time"
                  className="time-input-styled"
                  value={ponctualite.cutoffApresMidi}
                  onChange={(e) =>
                    setPonctualite({ ...ponctualite, cutoffApresMidi: e.target.value })
                  }
                />
              </div>
            </div>
          )}

          {horaires.soir.actif && (
            <div className="cutoff-row">
              <span className="cutoff-period-name">Soir ({horaires.soir.debut} - {horaires.soir.fin})</span>
              <div className="cutoff-field">
                <span className="cutoff-label-prefix">Absent après :</span>
                <input
                  type="time"
                  className="time-input-styled"
                  value={ponctualite.cutoffSoir}
                  onChange={(e) =>
                    setPonctualite({ ...ponctualite, cutoffSoir: e.target.value })
                  }
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {erreur && <p className="onboarding-error-inline" role="alert">{erreur}</p>}

      <div className="onboarding-step-footer spaced">
        <button type="button" className="clean-btn-ghost" onClick={surPrecedent}>
          <ArrowLeft size={16} />
          <span>Retour</span>
        </button>
        <motion.button
          type="button"
          className="clean-btn-primary"
          onClick={validerEtContinuer}
          whileTap={{ scale: 0.98 }}
        >
          <span>Continuer vers Pointage</span>
          <ArrowRight size={17} />
        </motion.button>
      </div>
    </div>
  );
}

