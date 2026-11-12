import { useState } from "react";
import { Building2, Camera, Clock, ShieldCheck, SlidersHorizontal } from "lucide-react";
import SchedulesPage from "./SchedulesPage";
import { useApp } from "../app/context";
import { Heading } from "../components/ui";
import { OngletGeneral } from "./settings/OngletGeneral";
import { OngletChampsPersonnalises } from "./settings/OngletChampsPersonnalises";
import { OngletModesPointage } from "./settings/OngletModesPointage";
import { GestionUtilisateurs, CreerUtilisateur } from "./settings/GestionUtilisateurs";

function extraireChampsPersonnalises(source: unknown): any[] {
  if (Array.isArray(source)) return source;
  if (typeof source === "string") {
    try {
      const parsed = JSON.parse(source);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [];
    }
  }
  return [];
}

export function SettingsPage() {
  const { db, organisation, saveSettings, notify } = useApp();
  const [activeTab, setActiveTab] = useState<"general" | "schedules" | "users" | "fields" | "modes">("general");
  const [settings, setSettings] = useState(() => structuredClone(db.settings));
  const [erreur, setErreur] = useState("");
  const [enSauvegarde, setEnSauvegarde] = useState(false);

  const [logoPreview, setLogoPreview] = useState<string | null>(organisation?.logo_url || settings.logo_url || null);

  const [champsPersonnalises, setChampsPersonnalises] = useState<any[]>(() =>
    extraireChampsPersonnalises(settings.custom_fields_schema || organisation?.custom_fields_schema)
  );

  const televerserLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      notify("Le logo ne doit pas dépasser 5 Mo.", true);
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
        const optimized = ctx
          ? (ctx.drawImage(img, 0, 0, width, height), canvas.toDataURL("image/webp", 0.85))
          : (reader.result as string);
        setLogoPreview(optimized);
        setSettings((prev) => ({ ...prev, logo_url: optimized }));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const mettreAJourChampsPersonnalises = (misAJour: any[]) => {
    setChampsPersonnalises(misAJour);
    setSettings((prev) => ({ ...prev, custom_fields_schema: misAJour }));
  };

  const enregistrerParametresGeneraux = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enSauvegarde) return;
    setErreur("");
    setEnSauvegarde(true);
    try {
      await saveSettings({
        ...settings,
        logo_url: logoPreview,
        custom_fields_schema: champsPersonnalises,
      });
      notify("Paramètres enregistrés avec succès.");
    } catch (err) {
      setErreur((err as Error).message);
      notify((err as Error).message, true);
    } finally {
      setEnSauvegarde(false);
    }
  };

  return (
    <>
      <Heading
        eyebrow="CONFIGURATION SYSTÈME"
        title="Paramètres"
        subtitle="Centre unifié de configuration de votre organisation"
      />

      <div className="profile-clean-tabs" role="tablist" style={{ marginBottom: "1.5rem" }}>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "general"}
          className={`profile-tab-item ${activeTab === "general" ? "active" : ""}`}
          onClick={() => setActiveTab("general")}
        >
          <Building2 size={15} />
          <span>Organisation & Logo</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "schedules"}
          className={`profile-tab-item ${activeTab === "schedules" ? "active" : ""}`}
          onClick={() => setActiveTab("schedules")}
        >
          <Clock size={15} />
          <span>Horaires de travail</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "users"}
          className={`profile-tab-item ${activeTab === "users" ? "active" : ""}`}
          onClick={() => setActiveTab("users")}
        >
          <ShieldCheck size={15} />
          <span>Utilisateurs & Rôles</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "fields"}
          className={`profile-tab-item ${activeTab === "fields" ? "active" : ""}`}
          onClick={() => setActiveTab("fields")}
        >
          <SlidersHorizontal size={15} />
          <span>Fiches personnalisées</span>
          <span className="badge" style={{ marginLeft: 6, fontSize: "11px", padding: "1px 6px" }}>
            {champsPersonnalises.length}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "modes"}
          className={`profile-tab-item ${activeTab === "modes" ? "active" : ""}`}
          onClick={() => setActiveTab("modes")}
        >
          <Camera size={15} />
          <span>Modes de pointage</span>
        </button>
      </div>

      {activeTab === "general" && (
        <OngletGeneral
          settings={settings}
          setSettings={setSettings}
          logoPreview={logoPreview}
          setLogoPreview={setLogoPreview}
          enSauvegarde={enSauvegarde}
          erreur={erreur}
          organisation={organisation}
          surEnregistrement={enregistrerParametresGeneraux}
          surTeleversementLogo={televerserLogo}
        />
      )}

      {activeTab === "schedules" && <SchedulesPage />}

      {activeTab === "users" && <GestionUtilisateurs />}

      {activeTab === "fields" && (
        <OngletChampsPersonnalises
          champsPersonnalises={champsPersonnalises}
          setChampsPersonnalises={mettreAJourChampsPersonnalises}
          enSauvegarde={enSauvegarde}
          surEnregistrement={enregistrerParametresGeneraux}
        />
      )}

      {activeTab === "modes" && (
        <OngletModesPointage
          settings={settings}
          setSettings={setSettings}
          enSauvegarde={enSauvegarde}
          erreur={erreur}
          surEnregistrement={enregistrerParametresGeneraux}
        />
      )}
    </>
  );
}

export { GestionUtilisateurs as UsersPage, CreerUtilisateur as UserCreate };
export { default as Profile } from "./ProfilePage";
