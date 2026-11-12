import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Check,
  IdCard,
  Phone,
  SlidersHorizontal,
} from "lucide-react";
import { useApp } from "../../app/context";
import { Back, Field, Heading } from "../../components/ui";
import { fullName } from "../../utils";
import { personnelApi, type PersonnelInput } from "../../services/personnel";
import type { Agent } from "../../types";
import "../onboarding.css";

const STANDARD_METADATA_KEYS = new Set([
  "im",
  "matricule",
  "structure",
  "cin",
  "telephone",
  "email",
  "localite",
  "adresse_professionnelle",
  "sexe",
  "categorie",
  "statut_administratif",
  "date_entree_administration",
  "date_prise_service",
]);

const CATEGORIES_ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"] as const;

const transitionConfig = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: 0.22, ease: "easeOut" as const },
};

export function FormulairePersonnel({ agent }: { agent?: Agent }) {
  const { db, user, refreshPersonnel, notify, organisation } = useApp();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  const currentDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: organisation?.fuseau_horaire || "Indian/Antananarivo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const managedDivisions = Array.isArray(user?.managed_division_ids)
    ? user.managed_division_ids.map(String)
    : [];

  const [formulaire, setFormulaire] = useState<PersonnelInput>({
    nom: agent?.lastName ?? "",
    prenom: agent?.firstName ?? "",
    departement_id:
      agent?.departmentId ??
      (managedDivisions.length === 1 ? managedDivisions[0] : ""),
    utilisateur_id: null,
    date_naissance: agent?.birthDate ?? "",
    date_embauche: agent?.hireDate || null,
    poste: agent?.position ?? "",
    actif: agent?.isActive ?? true,
  });

  const [metadata, setMetadata] = useState<Record<string, any>>(() => {
    const initial: Record<string, any> = {
      statut_administratif: "FONCTIONNAIRE",
      sexe: "H",
      ...(agent?.metadata || {}),
    };
    if (!initial.im && initial.matricule) {
      initial.im = initial.matricule;
    }
    delete initial.compte_autorite;
    delete initial.role_evaluateur;
    return initial;
  });

  const champsPersonnalises: any[] = (() => {
    const raw = organisation?.custom_fields_schema || db.settings.custom_fields_schema || [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        return [];
      }
    }
    return [];
  })();

  const champsAdditionnels = champsPersonnalises.filter(
    (field) => !STANDARD_METADATA_KEYS.has(field.name),
  );

  const [erreur, setErreur] = useState("");
  const [enAttente, setEnAttente] = useState(false);

  const isCoordinator = user?.role === "COORDINATOR";
  const departements = isCoordinator
    ? db.departments
    : db.departments.filter((d) => managedDivisions.includes(String(d.id)));

  const allerEtape = (cible: 1 | 2 | 3) => {
    if (cible > 1 && (!formulaire.nom.trim() || !formulaire.prenom.trim())) {
      setErreur("Veuillez renseigner le nom et le prénom à l'étape 1.");
      setCurrentStep(1);
      return;
    }
    if (cible > 1 && !formulaire.date_naissance) {
      setErreur("Veuillez renseigner la date de naissance à l'étape 1.");
      setCurrentStep(1);
      return;
    }
    setErreur("");
    setCurrentStep(cible);
  };

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formulaire.nom.trim() || !formulaire.prenom.trim()) {
      setErreur("Le nom et le prénom sont obligatoires.");
      setCurrentStep(1);
      return;
    }
    if (!formulaire.date_naissance) {
      setErreur("La date de naissance est obligatoire.");
      setCurrentStep(1);
      return;
    }
    if (!formulaire.departement_id) {
      setErreur("Veuillez sélectionner une structure / division à l'étape 3.");
      setCurrentStep(3);
      return;
    }
    setEnAttente(true);
    setErreur("");

    try {
      const selectedDept = db.departments.find((d) => String(d.id) === String(formulaire.departement_id));
      const cleanMetadata: Record<string, any> = {
        statut_administratif: metadata.statut_administratif || "FONCTIONNAIRE",
        sexe: metadata.sexe || "H",
        ...metadata,
        structure: selectedDept?.name || metadata.structure || "",
        date_prise_service: formulaire.date_embauche || metadata.date_prise_service || null,
      };

      if (cleanMetadata.im) {
        cleanMetadata.im = String(cleanMetadata.im).trim();
        cleanMetadata.matricule = cleanMetadata.im;
      }
      if (cleanMetadata.cin) {
        cleanMetadata.cin = String(cleanMetadata.cin).trim();
      }
      if (cleanMetadata.telephone) {
        cleanMetadata.telephone = String(cleanMetadata.telephone).trim();
      }
      if (cleanMetadata.email) {
        cleanMetadata.email = String(cleanMetadata.email).trim();
      }
      if (cleanMetadata.localite) {
        cleanMetadata.localite = String(cleanMetadata.localite).trim();
      }
      if (cleanMetadata.adresse_professionnelle) {
        cleanMetadata.adresse_professionnelle = String(cleanMetadata.adresse_professionnelle).trim();
      }
      delete cleanMetadata.compte_autorite;
      delete cleanMetadata.role_evaluateur;

      const payload = { ...formulaire, metadata: cleanMetadata };
      if (agent) {
        await personnelApi.update(agent.id, payload);
        notify("Fiche de l'agent mise à jour avec succès.");
      } else {
        await personnelApi.create(payload);
        notify("Nouvel agent enregistré avec succès.");
      }
      await refreshPersonnel();
      navigate("/agents");
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnAttente(false);
    }
  };

  const stepLabels: Record<1 | 2 | 3, string> = {
    1: "État civil & Identification",
    2: "Coordonnées de contact",
    3: "Carrière & Situation administrative",
  };

  return (
    <>
      <Back to="/agents" label="Personnel" />
      <Heading
        title={agent ? `Modifier ${fullName(agent)}` : "Nouvel agent"}
        subtitle="Fiche administrative officielle DRBF · Identification, coordonnées et situation administrative."
      />

      <div style={{ maxWidth: 840, margin: "0 0 2rem 0" }}>
        {/* Carte principale reprenant le style épuré de l'onboarding */}
        <div className="onboarding-card-clean" style={{ maxWidth: "100%", padding: "2.25rem 2.5rem" }}>
          {/* Header de progression façon Onboarding */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "1rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "#064e3b",
                  background: "#ecfdf5",
                  padding: "3px 10px",
                  borderRadius: "999px",
                  border: "1px solid #a7f3d0",
                }}
              >
                Étape {currentStep} sur 3
              </span>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#64748b" }}>
                {stepLabels[currentStep]}
              </span>
            </div>

            {/* Pastilles de progression Onboarding cliquables */}
            <div className="onboarding-steps-track" role="tablist" aria-label="Progression du formulaire">
              {[1, 2, 3].map((step) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => allerEtape(step as 1 | 2 | 3)}
                  className={`step-dot ${step === currentStep ? "active" : step < currentStep ? "done" : ""}`}
                  title={`Aller à l'étape ${step}`}
                  aria-label={`Étape ${step}`}
                  style={{ cursor: "pointer", border: "none", padding: 0 }}
                />
              ))}
            </div>
          </div>

          {/* Barre de progression continue animée en haut */}
          <div
            style={{
              width: "100%",
              height: "4px",
              background: "#e2e8f0",
              borderRadius: "999px",
              overflow: "hidden",
              marginBottom: "2rem",
            }}
          >
            <div
              style={{
                height: "100%",
                width: currentStep === 1 ? "33.33%" : currentStep === 2 ? "66.66%" : "100%",
                background: "#064e3b",
                borderRadius: "999px",
                transition: "width 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            />
          </div>

          <form onSubmit={soumettre}>
            <fieldset disabled={enAttente} style={{ border: "none", padding: 0, margin: 0 }}>
              <AnimatePresence mode="wait">
                {currentStep === 1 && (
                  <motion.div key="step-1" {...transitionConfig} className="onboarding-step-body">
                    <div className="onboarding-step-header">
                      <h2 className="step-hero-title">État civil &amp; Identification</h2>
                      <p className="step-hero-subtitle">
                        Renseignez l'immatriculation administrative (IM), l'identité civile et la date de naissance.
                      </p>
                    </div>

                    <div
                      style={{
                        background: "#fafcfb",
                        border: "1px solid #e8edf2",
                        borderRadius: "14px",
                        padding: "18px 20px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          marginBottom: "14px",
                          borderBottom: "1px solid #edf2ee",
                          paddingBottom: "10px",
                        }}
                      >
                        <div
                          style={{
                            width: "32px",
                            height: "32px",
                            borderRadius: "8px",
                            background: "#e8f5ed",
                            color: "#1e6b52",
                            display: "grid",
                            placeItems: "center",
                          }}
                        >
                          <IdCard size={18} />
                        </div>
                        <div>
                          <h3
                            style={{
                              fontSize: "13px",
                              fontWeight: 700,
                              color: "#1a2720",
                              margin: 0,
                              textTransform: "uppercase",
                              letterSpacing: "0.03em",
                            }}
                          >
                            Identification &amp; État civil (DRBF)
                          </h3>
                          <p style={{ fontSize: "12px", color: "#6e8275", margin: "2px 0 0" }}>
                            Numéro IM, Nom, Prénoms, Sexe et Date de naissance.
                          </p>
                        </div>
                      </div>

                      <div className="form-grid">
                        <Field label="IM (Numéro Matricule)" hint="Ex: 354.730">
                          <input
                            placeholder="Ex: 354.730"
                            value={metadata.im ?? ""}
                            onChange={(e) => setMetadata({ ...metadata, im: e.target.value })}
                          />
                        </Field>
                        <Field label="Numéro CIN" hint="Carte d'Identité Nationale (12 chiffres)">
                          <input
                            placeholder="Ex: 519031000182"
                            value={metadata.cin ?? ""}
                            onChange={(e) => setMetadata({ ...metadata, cin: e.target.value })}
                          />
                        </Field>
                        <Field label="Nom">
                          <input
                            required
                            placeholder="Ex: TSIENGENY"
                            value={formulaire.nom}
                            onChange={(e) => setFormulaire({ ...formulaire, nom: e.target.value })}
                          />
                        </Field>
                        <Field label="Prénoms">
                          <input
                            required
                            placeholder="Ex: Safidy Jaspar"
                            value={formulaire.prenom}
                            onChange={(e) => setFormulaire({ ...formulaire, prenom: e.target.value })}
                          />
                        </Field>
                        <Field label="Sexe (H/F)">
                          <select
                            value={metadata.sexe || "H"}
                            onChange={(e) => setMetadata({ ...metadata, sexe: e.target.value })}
                          >
                            <option value="H">H - Masculin</option>
                            <option value="F">F - Féminin</option>
                          </select>
                        </Field>
                        <Field label="Date de naissance">
                          <input
                            type="date"
                            required
                            max={currentDate}
                            value={formulaire.date_naissance}
                            onChange={(e) =>
                              setFormulaire({ ...formulaire, date_naissance: e.target.value })
                            }
                          />
                        </Field>
                      </div>
                    </div>
                  </motion.div>
                )}

                {currentStep === 2 && (
                  <motion.div key="step-2" {...transitionConfig} className="onboarding-step-body">
                    <div className="onboarding-step-header">
                      <h2 className="step-hero-title">Coordonnées de contact</h2>
                      <p className="step-hero-subtitle">
                        Numéro de téléphone direct (issu de la liste DRBF), adresse e-mail et lieu de résidence.
                      </p>
                    </div>

                    <div
                      style={{
                        background: "#fafcfb",
                        border: "1px solid #e8edf2",
                        borderRadius: "14px",
                        padding: "18px 20px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          marginBottom: "14px",
                          borderBottom: "1px solid #edf2ee",
                          paddingBottom: "10px",
                        }}
                      >
                        <div
                          style={{
                            width: "32px",
                            height: "32px",
                            borderRadius: "8px",
                            background: "#eef6ff",
                            color: "#2563eb",
                            display: "grid",
                            placeItems: "center",
                          }}
                        >
                          <Phone size={18} />
                        </div>
                        <div>
                          <h3
                            style={{
                              fontSize: "13px",
                              fontWeight: 700,
                              color: "#1a2720",
                              margin: 0,
                              textTransform: "uppercase",
                              letterSpacing: "0.03em",
                            }}
                          >
                            Contact &amp; Localisation
                          </h3>
                          <p style={{ fontSize: "12px", color: "#6e8275", margin: "2px 0 0" }}>
                            Téléphone joignable et résidence de l'agent.
                          </p>
                        </div>
                      </div>

                      <div className="form-grid">
                        <Field label="Numéro de téléphone" hint="Ex: 032 11 082 54">
                          <input
                            type="tel"
                            placeholder="Ex: 032 11 082 54"
                            value={metadata.telephone ?? ""}
                            onChange={(e) => setMetadata({ ...metadata, telephone: e.target.value })}
                          />
                        </Field>
                        <Field label="Adresse e-mail">
                          <input
                            type="email"
                            placeholder="Ex: agent@mef.gov.mg"
                            value={metadata.email ?? ""}
                            onChange={(e) => setMetadata({ ...metadata, email: e.target.value })}
                          />
                        </Field>
                        <div style={{ gridColumn: "1 / -1" }}>
                          <Field label="Localité / Résidence" hint="Ex: Toliara">
                            <input
                              placeholder="Ex: Toliara"
                              value={metadata.localite ?? ""}
                              onChange={(e) => setMetadata({ ...metadata, localite: e.target.value })}
                            />
                          </Field>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {currentStep === 3 && (
                  <motion.div key="step-3" {...transitionConfig} className="onboarding-step-body">
                    <div className="onboarding-step-header">
                      <h2 className="step-hero-title">Carrière &amp; Situation administrative</h2>
                      <p className="step-hero-subtitle">
                        Structure d'affectation, poste, catégorie, statut administratif et dates d'entrée / prise de service.
                      </p>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                      <div
                        style={{
                          background: "#fafcfb",
                          border: "1px solid #e8edf2",
                          borderRadius: "14px",
                          padding: "18px 20px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            marginBottom: "14px",
                            borderBottom: "1px solid #edf2ee",
                            paddingBottom: "10px",
                          }}
                        >
                          <div
                            style={{
                              width: "32px",
                              height: "32px",
                              borderRadius: "8px",
                              background: "#fef8ee",
                              color: "#b45309",
                              display: "grid",
                              placeItems: "center",
                            }}
                          >
                            <Briefcase size={18} />
                          </div>
                          <div>
                            <h3
                              style={{
                                fontSize: "13px",
                                fontWeight: 700,
                                color: "#1a2720",
                                margin: 0,
                                textTransform: "uppercase",
                                letterSpacing: "0.03em",
                              }}
                            >
                              Structure &amp; Situation administrative (DRBF)
                            </h3>
                            <p style={{ fontSize: "12px", color: "#6e8275", margin: "2px 0 0" }}>
                              Rattachement par structure, statut administratif et catégorie.
                            </p>
                          </div>
                        </div>

                        <div className="form-grid">
                          <Field label="Structure / Division" hint="Structure officielle de rattachement">
                            <select
                              required
                              value={formulaire.departement_id}
                              onChange={(e) =>
                                setFormulaire({ ...formulaire, departement_id: e.target.value })
                              }
                            >
                              <option value="">Sélectionner une structure</option>
                              {departements.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name}
                                  {d.isActive === false ? " (inactif)" : ""}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Poste occupé">
                            <input
                              value={formulaire.poste || ""}
                              placeholder="Ex: Chef de Service, Secretaire, Comptable…"
                              onChange={(e) => setFormulaire({ ...formulaire, poste: e.target.value })}
                            />
                          </Field>

                          <Field label="Statut administratif (ELD / EFA / FONCT)">
                            <select
                              value={metadata.statut_administratif || "FONCTIONNAIRE"}
                              onChange={(e) =>
                                setMetadata({ ...metadata, statut_administratif: e.target.value })
                              }
                            >
                              <option value="FONCTIONNAIRE">FONCTIONNAIRE</option>
                              <option value="EFA">EFA (Employé Fonctionnaire Assimilé)</option>
                              <option value="ELD">ELD (Employé de Courte Durée)</option>
                            </select>
                          </Field>

                          <Field label="Catégorie">
                            <select
                              value={metadata.categorie ?? ""}
                              onChange={(e) =>
                                setMetadata({
                                  ...metadata,
                                  categorie: e.target.value || null,
                                })
                              }
                            >
                              <option value="">Sélectionner une catégorie</option>
                              {CATEGORIES_ROMAN.map((cat) => (
                                <option key={cat} value={cat}>
                                  {cat}
                                </option>
                              ))}
                              {metadata.categorie &&
                                !CATEGORIES_ROMAN.includes(metadata.categorie as any) && (
                                  <option value={metadata.categorie}>
                                    {metadata.categorie}
                                  </option>
                                )}
                            </select>
                          </Field>

                          <Field label="Date d'entrée dans l'administration">
                            <input
                              type="date"
                              max={currentDate}
                              value={metadata.date_entree_administration || ""}
                              onChange={(e) =>
                                setMetadata({ ...metadata, date_entree_administration: e.target.value || null })
                              }
                            />
                          </Field>

                          <Field label="Date de prise de service (Prise de sce)">
                            <input
                              type="date"
                              max={currentDate}
                              value={formulaire.date_embauche || ""}
                              onChange={(e) =>
                                setFormulaire({ ...formulaire, date_embauche: e.target.value || null })
                              }
                            />
                          </Field>

                          <div style={{ gridColumn: "1 / -1" }}>
                            <Field
                              label="Adresse professionnelle"
                              hint="Ex: Bloc Ex-Faritany Toliara, Andaboly Toliara, Sans fil Toliara"
                            >
                              <input
                                placeholder="Ex: Bloc Ex-Faritany Toliara"
                                value={metadata.adresse_professionnelle ?? ""}
                                onChange={(e) =>
                                  setMetadata({ ...metadata, adresse_professionnelle: e.target.value })
                                }
                              />
                            </Field>
                          </div>
                        </div>
                      </div>

                      {/* Champs additionnels dynamiques si existants */}
                      {champsAdditionnels.length > 0 && (
                        <div
                          style={{
                            background: "#fafcfb",
                            border: "1px solid #e8edf2",
                            borderRadius: "14px",
                            padding: "18px 20px",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "10px",
                              marginBottom: "14px",
                              borderBottom: "1px solid #edf2ee",
                              paddingBottom: "10px",
                            }}
                          >
                            <div
                              style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "8px",
                                background: "#f1f3f2",
                                color: "#4e5e54",
                                display: "grid",
                                placeItems: "center",
                              }}
                            >
                              <SlidersHorizontal size={18} />
                            </div>
                            <div>
                              <h3
                                style={{
                                  fontSize: "13px",
                                  fontWeight: 700,
                                  color: "#1a2720",
                                  margin: 0,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.03em",
                                }}
                              >
                                Champs Personnalisés Additionnels
                              </h3>
                              <p style={{ fontSize: "12px", color: "#6e8275", margin: "2px 0 0" }}>
                                Attributs spécifiques configurés dans les paramètres de l'organisation.
                              </p>
                            </div>
                          </div>

                          <div className="form-grid">
                            {champsAdditionnels.map((field) => (
                              <Field key={field.id} label={field.label}>
                                <input
                                  type={
                                    field.type === "number"
                                      ? "number"
                                      : field.type === "date"
                                        ? "date"
                                        : "text"
                                  }
                                  value={metadata[field.name] ?? ""}
                                  required={field.required}
                                  onChange={(e) =>
                                    setMetadata({ ...metadata, [field.name]: e.target.value })
                                  }
                                />
                              </Field>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {erreur && (
                <p className="onboarding-error-inline" role="alert" style={{ marginTop: "1.5rem" }}>
                  {erreur}
                </p>
              )}

              {/* Footer de navigation épuré façon Onboarding */}
              <div
                className="onboarding-step-footer spaced"
                style={{
                  marginTop: "2.25rem",
                  paddingTop: "1.25rem",
                  borderTop: "1px solid #f1f5f9",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  {currentStep > 1 ? (
                    <button
                      type="button"
                      className="clean-btn-ghost"
                      onClick={() => allerEtape((currentStep - 1) as 1 | 2)}
                    >
                      <ArrowLeft size={16} />
                      <span>Précédent</span>
                    </button>
                  ) : (
                    <Link className="clean-btn-ghost" to="/agents">
                      Annuler
                    </Link>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  {/* Raccourci de sauvegarde rapide lors d'une modification */}
                  {agent && currentStep < 3 && (
                    <button
                      className="button"
                      type="submit"
                      disabled={enAttente}
                      title="Sauvegarder directement sans passer aux étapes suivantes"
                    >
                      Enregistrer maintenant
                    </button>
                  )}

                  {currentStep === 1 && (
                    <motion.button
                      type="button"
                      className="clean-btn-primary"
                      onClick={() => allerEtape(2)}
                      whileTap={{ scale: 0.98 }}
                    >
                      <span>Continuer vers les coordonnées</span>
                      <ArrowRight size={17} />
                    </motion.button>
                  )}

                  {currentStep === 2 && (
                    <motion.button
                      type="button"
                      className="clean-btn-primary"
                      onClick={() => allerEtape(3)}
                      whileTap={{ scale: 0.98 }}
                    >
                      <span>Continuer vers la carrière</span>
                      <ArrowRight size={17} />
                    </motion.button>
                  )}

                  {currentStep === 3 && (
                    <motion.button
                      type="submit"
                      className="clean-btn-primary"
                      disabled={enAttente}
                      whileTap={{ scale: 0.98 }}
                    >
                      <span>
                        {enAttente
                          ? "Enregistrement…"
                          : agent
                          ? "Enregistrer les modifications"
                          : "Enregistrer l’agent"}
                      </span>
                      <Check size={17} />
                    </motion.button>
                  )}
                </div>
              </div>
            </fieldset>
          </form>
        </div>
      </div>
    </>
  );
}

// Alias de rétrocompatibilité
export { FormulairePersonnel as PersonnelForm };
