import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowRight, LogOut, QrCode } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "../app/context";
import { apiClient } from "../services/api";
import type { Account, Organisation } from "../services/auth";
import type { Schedule, SchedulePeriod } from "../types";
import { settingsApi } from "../services/settings";
import { weekDays, periods, periodDefaults } from "../services/schedules";
import { EtapeIdentite } from "./onboarding/EtapeIdentite";
import {
  EtapeHoraires,
  type ConfigurationHorairesJournee,
} from "./onboarding/EtapeHoraires";
import {
  EtapePonctualite,
  type ConfigurationPonctualite,
} from "./onboarding/EtapePonctualite";
import {
  SUGGESTIONS_PAR_DEFAUT,
  EtapePersonnalisation,
  type DefinitionChampPersonnalise,
} from "./onboarding/EtapePersonnalisation";
import { ModalConfirmation } from "./onboarding/ModalConfirmation";
import "./onboarding.css";

export default function OrganisationSetup() {
  const { user, completeOrganisation, logout } = useApp();
  const navigate = useNavigate();

  const [mode, setMode] = useState<"wizard" | "join">("wizard");
  const [etape, setEtape] = useState<1 | 2 | 3 | 4>(1);

  // Étape 1 : Identité
  const [nom, setNom] = useState("");
  const fuseauHoraire = "Indian/Antananarivo";
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Étape 2 : Horaires journaliers
  const [configHoraires, setConfigHoraires] = useState<ConfigurationHorairesJournee>({
    joursTravailles: ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"],
    matin: { actif: true, debut: "08:00", fin: "12:00" },
    apresMidi: { actif: true, debut: "13:00", fin: "17:00" },
    soir: { actif: false, debut: "18:00", fin: "22:00" },
  });

  // Étape 3 : Ponctualité & Cutoff (Heure d'absence)
  const [configPonctualite, setConfigPonctualite] = useState<ConfigurationPonctualite>({
    toleranceMinutes: 15,
    cutoffMatin: "10:00",
    cutoffApresMidi: "15:00",
    cutoffSoir: "20:00",
  });

  // Étape 4 : Modes de pointage & Metadata
  const [pointageQr, setPointageQr] = useState(true);
  const [pointageFacial, setPointageFacial] = useState(true);
  const [champsPersonnalises, setChampsPersonnalises] = useState<DefinitionChampPersonnalise[]>([
    SUGGESTIONS_PAR_DEFAUT[0],
    SUGGESTIONS_PAR_DEFAUT[1],
  ]);

  // Join mode
  const [code, setCode] = useState("");
  const [enTraitement, setEnTraitement] = useState(false);
  const [erreur, setErreur] = useState("");
  const [organisationCreee, setOrganisationCreee] = useState<Organisation | null>(null);

  if (!user) return <Navigate to="/login" replace />;
  if (user.organisationId && !organisationCreee) return <Navigate to="/" replace />;

  const televerserLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setErreur("Le logo ne doit pas dépasser 5 Mo.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 400;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          setLogoPreview(canvas.toDataURL("image/webp", 0.85));
        } else {
          setLogoPreview(reader.result as string);
        }
        setErreur("");
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const construireSchedulesComplets = (): Schedule[] => {
    return weekDays.flatMap((day) => {
      const jourOuvre = configHoraires.joursTravailles.includes(day);

      return (periods as readonly SchedulePeriod[]).map((period: SchedulePeriod): Schedule => {
        let actif = false;
        let start = periodDefaults[period].start;
        let end = periodDefaults[period].end;
        let cutoff = periodDefaults[period].cutoff;

        if (period === "MATIN") {
          actif = jourOuvre && configHoraires.matin.actif;
          start = configHoraires.matin.debut;
          end = configHoraires.matin.fin;
          cutoff = configPonctualite.cutoffMatin;
        } else if (period === "APRES_MIDI") {
          actif = jourOuvre && configHoraires.apresMidi.actif;
          start = configHoraires.apresMidi.debut;
          end = configHoraires.apresMidi.fin;
          cutoff = configPonctualite.cutoffApresMidi;
        } else if (period === "SOIR") {
          actif = jourOuvre && configHoraires.soir.actif;
          start = configHoraires.soir.debut;
          end = configHoraires.soir.fin;
          cutoff = configPonctualite.cutoffSoir;
        }

        return {
          day,
          period,
          overnight: false,
          working: actif,
          start,
          end,
          cutoff,
          tolerance: configPonctualite.toleranceMinutes,
        };
      });
    });
  };

  const finaliserConfiguration = async () => {
    if (!nom.trim()) {
      setEtape(1);
      setErreur("Le nom de votre organisation ou entreprise est obligatoire.");
      return;
    }
    if (!pointageQr && !pointageFacial) {
      setErreur("Au moins un mode de pointage doit rester activé.");
      return;
    }

    setEnTraitement(true);
    setErreur("");
    try {
      const result = await apiClient.post<{ user: Account; organisation: Organisation }>(
        "/organisations",
        {
          nom: nom.trim(),
          adresse: null,
          fuseau_horaire: fuseauHoraire,
          logo_url: logoPreview,
          pointage_qr: pointageQr,
          pointage_facial: pointageFacial,
          custom_fields_schema: champsPersonnalises,
        }
      );

      const schedulesGeneres = construireSchedulesComplets();

      try {
        await settingsApi.save({
          organization: result.organisation.nom,
          address: "",
          logo_url: logoPreview,
          custom_fields_schema: champsPersonnalises,
          pointage_qr: pointageQr,
          pointage_facial: pointageFacial,
          schedules: schedulesGeneres,
        });
      } catch (scheduleErr) {
        console.warn("Avertissement sauvegarde horaires :", scheduleErr);
      }

      completeOrganisation(result);
      setOrganisationCreee(result.organisation);
    } catch (err) {
      setErreur((err as Error).message || "Erreur lors de la configuration.");
    } finally {
      setEnTraitement(false);
    }
  };

  const rejoindreOrganisation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enTraitement) return;
    setEnTraitement(true);
    setErreur("");
    try {
      const result = await apiClient.post<{ user: Account; organisation: Organisation }>(
        "/organisations/join",
        { organisation_code: code.trim().toUpperCase() }
      );
      completeOrganisation(result);
      navigate("/");
    } catch (err) {
      setErreur((err as Error).message || "Code invalide.");
    } finally {
      setEnTraitement(false);
    }
  };

  const transitionConfig = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
    transition: { duration: 0.22, ease: "easeOut" as const },
  };

  return (
    <div className="onboarding-root">
      {/* Barre supérieure épurée */}
      <header className="onboarding-header">
        <div className="onboarding-brand">
          <QrCode size={20} className="brand-icon" />
          <span className="brand-title">présence.</span>
        </div>

        {!organisationCreee && mode === "wizard" && (
          <div className="onboarding-steps-track">
            {[1, 2, 3, 4].map((step) => (
              <div
                key={step}
                className={`step-dot ${step === etape ? "active" : step < etape ? "done" : ""}`}
                title={`Étape ${step}`}
              />
            ))}
          </div>
        )}

        <div className="onboarding-user-info">
          <span className="user-email-label">{user.email}</span>
          <button
            type="button"
            className="logout-ghost-btn"
            onClick={logout}
            aria-label="Se déconnecter"
            title="Se déconnecter"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Carte centrale minimaliste */}
      <main className="onboarding-canvas">
        <div className="onboarding-card-clean">
          <AnimatePresence mode="wait">
            {organisationCreee ? (
              <motion.div key="success" {...transitionConfig}>
                <ModalConfirmation
                  organisationCreee={organisationCreee}
                  surErreur={setErreur}
                />
              </motion.div>
            ) : mode === "join" ? (
              <motion.div key="join" {...transitionConfig} className="onboarding-step-body">
                <div className="onboarding-step-header">
                  <h1 className="step-hero-title">Rejoindre une organisation</h1>
                </div>

                <form onSubmit={rejoindreOrganisation} className="join-clean-form">
                  <input
                    className="clean-text-input center-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="Code à 9 chiffres"
                    maxLength={15}
                    inputMode="numeric"
                    autoFocus
                  />

                  {erreur && <p className="onboarding-error-inline" role="alert">{erreur}</p>}

                  <div className="onboarding-step-footer spaced">
                    <button
                      type="button"
                      className="clean-btn-ghost"
                      onClick={() => {
                        setMode("wizard");
                        setErreur("");
                      }}
                    >
                      ← Créer une organisation
                    </button>
                    <motion.button
                      type="submit"
                      className="clean-btn-primary"
                      disabled={enTraitement || !code.trim()}
                      whileTap={{ scale: 0.98 }}
                    >
                      <span>{enTraitement ? "Connexion…" : "Rejoindre"}</span>
                      <ArrowRight size={17} />
                    </motion.button>
                  </div>
                </form>
              </motion.div>
            ) : etape === 1 ? (
              <motion.div key="step-1" {...transitionConfig}>
                <EtapeIdentite
                  nom={nom}
                  setNom={setNom}
                  logoPreview={logoPreview}
                  setLogoPreview={setLogoPreview}
                  erreur={erreur}
                  setErreur={setErreur}
                  surSuivant={() => {
                    if (!nom.trim()) {
                      setErreur("Veuillez renseigner le nom de votre organisation.");
                      return;
                    }
                    setErreur("");
                    setEtape(2);
                  }}
                  surTeleversementLogo={televerserLogo}
                />
                <div className="onboarding-alt-switch">
                  <span>Vous avez déjà un code d'invitation ?</span>{" "}
                  <button
                    type="button"
                    className="inline-link-btn"
                    onClick={() => {
                      setMode("join");
                      setErreur("");
                    }}
                  >
                    Rejoindre une organisation
                  </button>
                </div>
              </motion.div>
            ) : etape === 2 ? (
              <motion.div key="step-2" {...transitionConfig}>
                <EtapeHoraires
                  configuration={configHoraires}
                  setConfiguration={setConfigHoraires}
                  erreur={erreur}
                  setErreur={setErreur}
                  surPrecedent={() => setEtape(1)}
                  surSuivant={() => setEtape(3)}
                />
              </motion.div>
            ) : etape === 3 ? (
              <motion.div key="step-3" {...transitionConfig}>
                <EtapePonctualite
                  horaires={configHoraires}
                  ponctualite={configPonctualite}
                  setPonctualite={setConfigPonctualite}
                  erreur={erreur}
                  setErreur={setErreur}
                  surPrecedent={() => setEtape(2)}
                  surSuivant={() => setEtape(4)}
                />
              </motion.div>
            ) : (
              <motion.div key="step-4" {...transitionConfig}>
                <EtapePersonnalisation
                  pointageFacial={pointageFacial}
                  setPointageFacial={setPointageFacial}
                  pointageQr={pointageQr}
                  setPointageQr={setPointageQr}
                  champsPersonnalises={champsPersonnalises}
                  setChampsPersonnalises={setChampsPersonnalises}
                  enTraitement={enTraitement}
                  erreur={erreur}
                  setErreur={setErreur}
                  surPrecedent={() => setEtape(3)}
                  surSoumettre={finaliserConfiguration}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
