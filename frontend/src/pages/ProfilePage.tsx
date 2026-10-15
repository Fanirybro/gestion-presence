import { useState } from "react";
import {
  User,
  Lock,
  Eye,
  EyeOff,
  Save,
  KeyRound,
  ShieldCheck,
} from "lucide-react";
import { z } from "zod";
import { useApp } from "../app/context";
import { Field, Heading } from "../components/ui";
import { initials } from "../utils";

type ProfileTab = "general" | "security";

export default function ProfilePage() {
  const { user, db, update, notify } = useApp();
  const [activeTab, setActiveTab] = useState<ProfileTab>("general");

  // Personal info state
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [infoSaving, setInfoSaving] = useState(false);
  const [infoError, setErrorInfo] = useState("");

  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdError, setPwdError] = useState("");

  const isCoordinator = user?.role === "COORDINATOR";

  // Handle saving personal info
  const handleSaveInfo = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName || trimmedName.length < 2) {
      setErrorInfo("Le nom complet doit comporter au moins 2 caractères.");
      return;
    }

    if (!z.string().email().safeParse(trimmedEmail).success) {
      setErrorInfo("Veuillez saisir une adresse email valide.");
      return;
    }

    const duplicate = db.users.some(
      (u) =>
        u.id !== user?.id &&
        u.email.toLowerCase() === trimmedEmail.toLowerCase(),
    );
    if (duplicate) {
      setErrorInfo("Cette adresse email est déjà utilisée par un autre compte.");
      return;
    }

    setInfoSaving(true);
    setErrorInfo("");
    try {
      update((d) => {
        const target = d.users.find((u) => u.id === user!.id);
        if (target) {
          target.name = trimmedName;
          target.email = trimmedEmail;
        }
      });
      notify("Informations du profil mises à jour avec succès.");
    } catch (err) {
      setErrorInfo((err as Error).message);
      notify((err as Error).message, true);
    } finally {
      setInfoSaving(false);
    }
  };

  // Handle changing password
  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError("");

    if (!currentPassword) {
      setPwdError("Veuillez renseigner votre mot de passe actuel.");
      return;
    }

    if (currentPassword !== db.credentials[user!.id]) {
      setPwdError("Le mot de passe actuel est incorrect.");
      return;
    }

    if (newPassword.length < 10) {
      setPwdError("Le nouveau mot de passe doit comporter au moins 10 caractères.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPwdError("La confirmation ne correspond pas au nouveau mot de passe.");
      return;
    }

    setPwdSaving(true);
    try {
      update((d) => {
        d.credentials[user!.id] = newPassword;
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      notify("Votre mot de passe a été modifié avec succès.");
    } catch (err) {
      setPwdError((err as Error).message);
      notify((err as Error).message, true);
    } finally {
      setPwdSaving(false);
    }
  };

  return (
    <div className="profile-page-clean">
      <Heading
        eyebrow="ESPACE UTILISATEUR"
        title="Mon profil"
        subtitle="Gérez vos informations de compte et vos accès de connexion."
      >
        <div className="profile-identity-strip">
          <span className="avatar tone-0">
            {initials(user?.name || "")}
          </span>
          <div className="profile-identity-meta">
            <strong>{user?.name}</strong>
            <small>
              <ShieldCheck size={12} style={{ display: "inline-block", verticalAlign: "-1px", marginRight: 3 }} />
              {isCoordinator ? "Coordinateur" : "Secrétaire"} · {db.settings.organization}
            </small>
          </div>
        </div>
      </Heading>

      {/* Clean Tabs Navigation */}
      <div className="profile-clean-tabs" role="tablist" aria-label="Sections du profil">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "general"}
          aria-controls="panel-general"
          id="tab-general"
          className={`profile-tab-item ${activeTab === "general" ? "active" : ""}`}
          onClick={() => setActiveTab("general")}
        >
          <User size={15} />
          <span>Informations générales</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "security"}
          aria-controls="panel-security"
          id="tab-security"
          className={`profile-tab-item ${activeTab === "security" ? "active" : ""}`}
          onClick={() => setActiveTab("security")}
        >
          <Lock size={15} />
          <span>Sécurité &amp; Mot de passe</span>
        </button>
      </div>

      {/* Tab 1: Informations personnelles */}
      {activeTab === "general" && (
        <form
          id="panel-general"
          role="tabpanel"
          aria-labelledby="tab-general"
          className="settings-form"
          onSubmit={handleSaveInfo}
        >
          <section className="settings-section">
            <h2>Informations personnelles</h2>
            <div className="form-grid">
              <Field label="Nom complet">
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={infoSaving}
                  placeholder="Votre nom complet"
                />
              </Field>

              <Field label="Adresse email">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={infoSaving}
                  placeholder="adresse@organisation.mg"
                />
              </Field>

              <Field label="Rôle système">
                <input
                  readOnly
                  disabled
                  value={
                    isCoordinator
                      ? "Coordinateur (Droits d'administration)"
                      : "Secrétaire (Opérations de pointage)"
                  }
                />
              </Field>

              <Field label="Organisation">
                <input
                  readOnly
                  disabled
                  value={db.settings.organization}
                />
              </Field>
            </div>

            {infoError && (
              <p className="form-error" role="alert" style={{ marginTop: 14 }}>
                {infoError}
              </p>
            )}

            <div className="form-actions" style={{ marginTop: 20 }}>
              <button
                type="submit"
                className="button primary"
                disabled={infoSaving}
              >
                <Save size={16} />
                {infoSaving ? "Enregistrement…" : "Enregistrer les modifications"}
              </button>
            </div>
          </section>
        </form>
      )}

      {/* Tab 2: Sécurité & Mot de passe */}
      {activeTab === "security" && (
        <form
          id="panel-security"
          role="tabpanel"
          aria-labelledby="tab-security"
          className="settings-form"
          onSubmit={handleChangePassword}
        >
          <section className="settings-section">
            <h2>Sécurité &amp; Mot de passe</h2>
            <div className="form-grid">
              <Field label="Mot de passe actuel">
                <div className="password-input-row">
                  <input
                    type={showCurrent ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    disabled={pwdSaving}
                    placeholder="Mot de passe actuel"
                  />
                  <button
                    type="button"
                    className="icon-button password-toggle-btn"
                    onClick={() => setShowCurrent(!showCurrent)}
                    title={showCurrent ? "Masquer" : "Afficher"}
                    aria-label={showCurrent ? "Masquer le mot de passe actuel" : "Afficher le mot de passe actuel"}
                  >
                    {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </Field>

              <Field label="Nouveau mot de passe" hint="10 caractères minimum">
                <div className="password-input-row">
                  <input
                    type={showNew ? "text" : "password"}
                    required
                    minLength={10}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={pwdSaving}
                    placeholder="Nouveau mot de passe"
                  />
                  <button
                    type="button"
                    className="icon-button password-toggle-btn"
                    onClick={() => setShowNew(!showNew)}
                    title={showNew ? "Masquer" : "Afficher"}
                    aria-label={showNew ? "Masquer le nouveau mot de passe" : "Afficher le nouveau mot de passe"}
                  >
                    {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </Field>

              <Field label="Confirmation du mot de passe">
                <div className="password-input-row">
                  <input
                    type={showConfirm ? "text" : "password"}
                    required
                    minLength={10}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={pwdSaving}
                    placeholder="Répétez le mot de passe"
                  />
                  <button
                    type="button"
                    className="icon-button password-toggle-btn"
                    onClick={() => setShowConfirm(!showConfirm)}
                    title={showConfirm ? "Masquer" : "Afficher"}
                    aria-label={showConfirm ? "Masquer la confirmation du mot de passe" : "Afficher la confirmation du mot de passe"}
                  >
                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </Field>
            </div>

            {pwdError && (
              <p className="form-error" role="alert" style={{ marginTop: 14 }}>
                {pwdError}
              </p>
            )}

            <div className="form-actions" style={{ marginTop: 20 }}>
              <button
                type="submit"
                className="button primary"
                disabled={pwdSaving}
              >
                <KeyRound size={16} />
                {pwdSaving ? "Mise à jour…" : "Mettre à jour le mot de passe"}
              </button>
            </div>
          </section>
        </form>
      )}
    </div>
  );
}


