import OrganisationCode from "../components/OrganisationCode";
import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Save, KeyRound } from "lucide-react";
import { z } from "zod";
import { useApp } from "../app/context";
import { Back, Confirm, Field, Heading, Modal, Table } from "../components/ui";
import type { Role } from "../types";
export function UsersPage() {
  const { db, user, update, notify, audit } = useApp();
  const [target, setTarget] = useState("");
  const [reset, setReset] = useState("");
  const [error, setError] = useState("");
  return (
    <>
      <Heading
        eyebrow="ADMINISTRATION SYSTÈME"
        title="Utilisateurs"
        subtitle="Gestion des comptes internes et des autorisations d'accès"
      >
        <Link className="button primary" to="/users/new">
          <Plus size={16} />
          <span>Nouvel utilisateur</span>
        </Link>
      </Heading>
      <section className="data-section">
        <Table
          headers={["UTILISATEUR", "EMAIL", "RÔLE", "STATUT", "ACTIONS"]}
          rows={db.users.map((u) => [
            <strong key="name">{u.name}</strong>,
            u.email,
            <select
              key="role"
              aria-label={`Rôle de ${u.name}`}
              value={u.role}
              disabled={u.id === user?.id}
              onChange={(e) => {
                update((d) => {
                  d.users.find((x) => x.id === u.id)!.role = e.target
                    .value as Role;
                  audit(d, u.id, "Modification du rôle", e.target.value);
                });
                notify("Rôle mis à jour.");
              }}
            >
              <option value="COORDINATOR">Coordinateur</option>
              <option value="SECRETARY">Secrétaire</option>
            </select>,
            <span
              key="status"
              className={`badge ${u.isActive ? "present" : "absent"}`}
            >
              {u.isActive ? "Actif" : "Inactif"}
            </span>,
            <div key="actions" className="actions">
              <button
                className="icon-button"
                title="Réinitialiser le mot de passe"
                aria-label={`Réinitialiser le mot de passe de ${u.name}`}
                onClick={() => {
                  setReset(u.id);
                  setError("");
                }}
              >
                <KeyRound size={17} />
              </button>
              <button
                className="button compact"
                disabled={u.id === user?.id}
                onClick={() => setTarget(u.id)}
              >
                {u.isActive ? "Désactiver" : "Activer"}
              </button>
            </div>,
          ])}
        />
      </section>
      <AnimatePresence>
        {target && (
          <Confirm
            key="access"
            title="Modifier l’accès au compte ?"
            text="Le changement sera appliqué à cet utilisateur."
            close={() => setTarget("")}
            confirm={() => {
              update((d) => {
                const u = d.users.find((u) => u.id === target)!;
                u.isActive = !u.isActive;
                audit(
                  d,
                  target,
                  "Modification de l’accès",
                  u.isActive ? "Activation" : "Désactivation",
                );
              });
              notify("Accès mis à jour.");
            }}
          />
        )}
        {reset && (
          <Modal
            key="password-reset"
            title="Réinitialiser le mot de passe"
            close={() => setReset("")}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const p = String(new FormData(e.currentTarget).get("password"));
                if (p.length < 10) {
                  setError(
                    "Le mot de passe doit contenir au moins 10 caractères.",
                  );
                  return;
                }
                update((d) => {
                  d.credentials[reset] = p;
                  audit(d, reset, "Réinitialisation du mot de passe", "");
                });
                setReset("");
                notify("Mot de passe réinitialisé.");
              }}
            >
              <Field label="Nouveau mot de passe">
                <input
                  name="password"
                  type="password"
                  minLength={10}
                  required
                  autoComplete="new-password"
                />
              </Field>
              {error && <p className="form-error">{error}</p>}
              <footer>
                <button className="button primary">Enregistrer</button>
              </footer>
            </form>
          </Modal>
        )}
      </AnimatePresence>
    </>
  );
}
export function UserCreate() {
  const { db, update, notify, audit } = useApp();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  return (
    <>
      <Back to="/users" />
      <Heading title="Nouvel utilisateur" />
      <form
        className="form-surface"
        onSubmit={(e) => {
          e.preventDefault();
          const form = Object.fromEntries(new FormData(e.currentTarget));
          const parsed = z
            .object({
              name: z.string().trim().min(2),
              email: z.email(),
              password: z.string().min(10),
              role: z.enum(["COORDINATOR", "SECRETARY"]),
            })
            .safeParse(form);
          if (!parsed.success) {
            setError(
              "Vérifiez les champs : nom, email et mot de passe de 10 caractères minimum.",
            );
            return;
          }
          if (
            db.users.some(
              (u) => u.email.toLowerCase() === parsed.data.email.toLowerCase(),
            )
          ) {
            setError("Cet email est déjà utilisé.");
            return;
          }
          const id = crypto.randomUUID();
          update((d) => {
            d.users.push({
              id,
              name: parsed.data.name,
              email: parsed.data.email,
              role: parsed.data.role,
              isActive: true,
            });
            d.credentials[id] = parsed.data.password;
            audit(d, id, "Création d’un utilisateur", parsed.data.role);
          });
          notify("Utilisateur créé.");
          navigate("/users");
        }}
      >
        <div className="form-grid">
          <Field label="Nom complet">
            <input name="name" required />
          </Field>
          <Field label="Email">
            <input name="email" type="email" required />
          </Field>
          <Field label="Rôle">
            <select name="role">
              <option value="SECRETARY">Secrétaire</option>
              <option value="COORDINATOR">Coordinateur</option>
            </select>
          </Field>
          <Field label="Mot de passe" hint="10 caractères minimum">
            <input
              name="password"
              type="password"
              minLength={10}
              required
              autoComplete="new-password"
            />
          </Field>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <Link className="button" to="/users">
            Annuler
          </Link>
          <button className="button primary">Créer l’utilisateur</button>
        </div>
      </form>
    </>
  );
}
export function SettingsPage() {
  const { db, organisation, saveSettings, notify } = useApp();
  const [settings, setSettings] = useState(() => structuredClone(db.settings));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <>
      <Heading
        eyebrow="CONFIGURATION SYSTÈME"
        title="Paramètres"
        subtitle="Informations générales et identifiants de l'organisation"
      />
      <OrganisationCode />
      <form
        className="settings-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (saving) return;
          setError("");
          setSaving(true);
          try {
            await saveSettings(settings);
            notify("Paramètres enregistrés.");
          } catch (error) {
            setError((error as Error).message);
            notify((error as Error).message, true);
          } finally {
            setSaving(false);
          }
        }}
      >
        <fieldset
          disabled={saving}
          style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
        >
          <section className="settings-section">
            <h2>Organisation</h2>
            <div className="form-grid">
              <Field label="Nom de l’organisation">
                <input
                  required
                  maxLength={100}
                  value={settings.organization}
                  onChange={(e) =>
                    setSettings({ ...settings, organization: e.target.value })
                  }
                />
              </Field>
              <Field label="Adresse">
                <input
                  maxLength={500}
                  value={settings.address}
                  onChange={(e) =>
                    setSettings({ ...settings, address: e.target.value })
                  }
                />
              </Field>
              <Field label="Fuseau horaire">
                <input readOnly value={organisation?.fuseau_horaire ?? ""} />
              </Field>
            </div>
          </section>

          <section className="settings-section" style={{ marginTop: "1.5rem" }}>
            <h2>Modes de pointage autorisés</h2>
            <p className="text-secondary" style={{ fontSize: "0.875rem", marginBottom: "1rem" }}>
              Activez ou désactivez les méthodes de pointage selon les besoins opérationnels de votre entreprise. Au moins une méthode doit rester active.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer", fontWeight: 500 }}>
                <input
                  type="checkbox"
                  checked={settings.pointage_qr ?? true}
                  onChange={(e) => {
                    const next = e.target.checked;
                    if (!next && !(settings.pointage_facial ?? true)) {
                      notify("Au moins un mode de pointage (QR code ou reconnaissance faciale) doit être activé.", true);
                      return;
                    }
                    setSettings({ ...settings, pointage_qr: next });
                  }}
                />
                <span>Pointage par QR Code (Scanners mobiles & bornes badges)</span>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer", fontWeight: 500 }}>
                <input
                  type="checkbox"
                  checked={settings.pointage_facial ?? true}
                  onChange={(e) => {
                    const next = e.target.checked;
                    if (!next && !(settings.pointage_qr ?? true)) {
                      notify("Au moins un mode de pointage (QR code ou reconnaissance faciale) doit être activé.", true);
                      return;
                    }
                    setSettings({ ...settings, pointage_facial: next });
                  }}
                />
                <span>Pointage par Reconnaissance Faciale (Borne Kiosk biométrique)</span>
              </label>
            </div>
          </section>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <div className="form-actions">
            <button className="button primary" disabled={saving}>
              <Save size={16} />
              {saving ? "Enregistrement…" : "Enregistrer les modifications"}
            </button>
          </div>
        </fieldset>
      </form>
    </>
  );
}
export { default as Profile } from "./ProfilePage";
