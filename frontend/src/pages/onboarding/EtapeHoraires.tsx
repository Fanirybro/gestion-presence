import { ArrowLeft, ArrowRight, Check, Moon, Sun, Sunset } from "lucide-react";
import { motion } from "motion/react";

export interface ConfigurationCreneau {
  actif: boolean;
  debut: string;
  fin: string;
}

export interface ConfigurationHorairesJournee {
  joursTravailles: string[];
  matin: ConfigurationCreneau;
  apresMidi: ConfigurationCreneau;
  soir: ConfigurationCreneau;
}

interface PropsEtapeHoraires {
  configuration: ConfigurationHorairesJournee;
  setConfiguration: (cfg: ConfigurationHorairesJournee) => void;
  erreur: string;
  setErreur: (msg: string) => void;
  surPrecedent: () => void;
  surSuivant: () => void;
}

const TOUS_LES_JOURS: { code: string; label: string; court: string }[] = [
  { code: "Lundi", label: "Lundi", court: "Lun" },
  { code: "Mardi", label: "Mardi", court: "Mar" },
  { code: "Mercredi", label: "Mercredi", court: "Mer" },
  { code: "Jeudi", label: "Jeudi", court: "Jeu" },
  { code: "Vendredi", label: "Vendredi", court: "Ven" },
  { code: "Samedi", label: "Samedi", court: "Sam" },
  { code: "Dimanche", label: "Dimanche", court: "Dim" },
];

export function EtapeHoraires({
  configuration,
  setConfiguration,
  erreur,
  setErreur,
  surPrecedent,
  surSuivant,
}: PropsEtapeHoraires) {
  const basculerJour = (jour: string) => {
    const existe = configuration.joursTravailles.includes(jour);
    if (existe && configuration.joursTravailles.length === 1) {
      setErreur("Votre entreprise doit avoir au moins un jour ouvré.");
      return;
    }
    const nouveauxJours = existe
      ? configuration.joursTravailles.filter((j) => j !== jour)
      : [...configuration.joursTravailles, jour];

    setConfiguration({
      ...configuration,
      joursTravailles: nouveauxJours,
    });
    setErreur("");
  };

  const validerEtContinuer = () => {
    const { matin, apresMidi, soir } = configuration;
    if (!matin.actif && !apresMidi.actif && !soir.actif) {
      setErreur("Veuillez activer au moins un créneau (Matin, Après-midi ou Soir).");
      return;
    }
    if (matin.actif && matin.debut >= matin.fin) {
      setErreur("Créneau Matin : l'heure de fin doit être supérieure à l'heure de début.");
      return;
    }
    if (apresMidi.actif && apresMidi.debut >= apresMidi.fin) {
      setErreur("Créneau Après-midi : l'heure de fin doit être supérieure à l'heure de début.");
      return;
    }
    if (soir.actif && soir.debut >= soir.fin) {
      setErreur("Créneau Soir : l'heure de fin doit être supérieure à l'heure de début.");
      return;
    }
    if (matin.actif && apresMidi.actif && matin.fin > apresMidi.debut) {
      setErreur("Le créneau du matin ne peut pas chevaucher celui de l'après-midi.");
      return;
    }
    if (apresMidi.actif && soir.actif && apresMidi.fin > soir.debut) {
      setErreur("Le créneau de l'après-midi ne peut pas chevaucher celui du soir.");
      return;
    }
    setErreur("");
    surSuivant();
  };

  return (
    <div className="onboarding-step-body">
      <div className="onboarding-step-header">
        <h1 className="step-hero-title">Horaires de travail journaliers</h1>
        <p className="step-hero-subtitle">
          Sélectionnez les jours d'activité de votre entreprise et ajustez les créneaux quotidiens.
        </p>
      </div>

      {/* Jours travaillés cliquables */}
      <div className="schedule-section-block">
        <label className="section-field-label">Jours d'activité de l'entreprise</label>
        <div className="week-pills-row">
          {TOUS_LES_JOURS.map((j) => {
            const actif = configuration.joursTravailles.includes(j.code);
            return (
              <button
                key={j.code}
                type="button"
                className={`week-day-selector ${actif ? "selected" : ""}`}
                onClick={() => basculerJour(j.code)}
              >
                <span className="day-name-short">{j.court}</span>
                {actif && <Check size={12} className="day-check-icon" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Configuration des créneaux Matin / Après-midi / Soir */}
      <div className="periods-config-stack">
        <label className="section-field-label">Créneaux de la journée</label>

        {/* Matin */}
        <div className={`period-setting-card ${configuration.matin.actif ? "active" : ""}`}>
          <div className="period-card-header">
            <div className="period-icon-wrap morning">
              <Sun size={18} />
            </div>
            <div className="period-meta">
              <strong>Créneau du Matin</strong>
              <span>Début de journée</span>
            </div>
            <button
              type="button"
              className={`clean-switch ${configuration.matin.actif ? "active" : ""}`}
              onClick={() =>
                setConfiguration({
                  ...configuration,
                  matin: { ...configuration.matin, actif: !configuration.matin.actif },
                })
              }
              aria-label="Activer le créneau matin"
            >
              <span className="clean-switch-dot" />
            </button>
          </div>

          {configuration.matin.actif && (
            <div className="period-time-inputs">
              <div className="time-input-group">
                <span>Début</span>
                <input
                  type="time"
                  className="time-input-styled"
                  value={configuration.matin.debut}
                  onChange={(e) =>
                    setConfiguration({
                      ...configuration,
                      matin: { ...configuration.matin, debut: e.target.value },
                    })
                  }
                />
              </div>
              <span className="time-separator">à</span>
              <div className="time-input-group">
                <span>Fin</span>
                <input
                  type="time"
                  className="time-input-styled"
                  value={configuration.matin.fin}
                  onChange={(e) =>
                    setConfiguration({
                      ...configuration,
                      matin: { ...configuration.matin, fin: e.target.value },
                    })
                  }
                />
              </div>
            </div>
          )}
        </div>

        {/* Après-midi */}
        <div className={`period-setting-card ${configuration.apresMidi.actif ? "active" : ""}`}>
          <div className="period-card-header">
            <div className="period-icon-wrap afternoon">
              <Sunset size={18} />
            </div>
            <div className="period-meta">
              <strong>Créneau de l'Après-midi</strong>
              <span>Deuxième partie de journée</span>
            </div>
            <button
              type="button"
              className={`clean-switch ${configuration.apresMidi.actif ? "active" : ""}`}
              onClick={() =>
                setConfiguration({
                  ...configuration,
                  apresMidi: { ...configuration.apresMidi, actif: !configuration.apresMidi.actif },
                })
              }
              aria-label="Activer le créneau après-midi"
            >
              <span className="clean-switch-dot" />
            </button>
          </div>

          {configuration.apresMidi.actif && (
            <div className="period-time-inputs">
              <div className="time-input-group">
                <span>Début</span>
                <input
                  type="time"
                  className="time-input-styled"
                  value={configuration.apresMidi.debut}
                  onChange={(e) =>
                    setConfiguration({
                      ...configuration,
                      apresMidi: { ...configuration.apresMidi, debut: e.target.value },
                    })
                  }
                />
              </div>
              <span className="time-separator">à</span>
              <div className="time-input-group">
                <span>Fin</span>
                <input
                  type="time"
                  className="time-input-styled"
                  value={configuration.apresMidi.fin}
                  onChange={(e) =>
                    setConfiguration({
                      ...configuration,
                      apresMidi: { ...configuration.apresMidi, fin: e.target.value },
                    })
                  }
                />
              </div>
            </div>
          )}
        </div>

        {/* Soir */}
        <div className={`period-setting-card ${configuration.soir.actif ? "active" : ""}`}>
          <div className="period-card-header">
            <div className="period-icon-wrap evening">
              <Moon size={18} />
            </div>
            <div className="period-meta">
              <strong>Créneau du Soir</strong>
              <span>Équipes de garde ou nocturnes</span>
            </div>
            <button
              type="button"
              className={`clean-switch ${configuration.soir.actif ? "active" : ""}`}
              onClick={() =>
                setConfiguration({
                  ...configuration,
                  soir: { ...configuration.soir, actif: !configuration.soir.actif },
                })
              }
              aria-label="Activer le créneau soir"
            >
              <span className="clean-switch-dot" />
            </button>
          </div>

          {configuration.soir.actif && (
            <div className="period-time-inputs">
              <div className="time-input-group">
                <span>Début</span>
                <input
                  type="time"
                  className="time-input-styled"
                  value={configuration.soir.debut}
                  onChange={(e) =>
                    setConfiguration({
                      ...configuration,
                      soir: { ...configuration.soir, debut: e.target.value },
                    })
                  }
                />
              </div>
              <span className="time-separator">à</span>
              <div className="time-input-group">
                <span>Fin</span>
                <input
                  type="time"
                  className="time-input-styled"
                  value={configuration.soir.fin}
                  onChange={(e) =>
                    setConfiguration({
                      ...configuration,
                      soir: { ...configuration.soir, fin: e.target.value },
                    })
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
          <span>Continuer vers Ponctualité</span>
          <ArrowRight size={17} />
        </motion.button>
      </div>
    </div>
  );
}

export { EtapeHoraires as StepSchedules };
