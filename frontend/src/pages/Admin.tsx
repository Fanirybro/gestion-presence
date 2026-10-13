import Departments from "../components/Departments";
import OrganisationCode from "../components/OrganisationCode";
import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Save, KeyRound } from "lucide-react";
import { z } from "zod";
import { useApp } from "../app/context";
import { Back, Confirm, Field, Heading, Modal, Table } from "../components/ui";
import type { Role } from "../types";
import { periodLabels, schedulesError } from "../services/schedules";
export function UsersPage() {
  const { db, user, update, notify, audit } = useApp();
  const [target, setTarget] = useState("");
  const [reset, setReset] = useState("");
  const [error, setError] = useState("");
  return (
    <>
      <Heading
        title="Utilisateurs"
        subtitle="Comptes internes et autorisations"
      >
        <Link className="button primary" to="/users/new">
          <Plus size={17} />
          Nouvel utilisateur
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
  const { db, organisation, saveSettings, schedulesConfigured, notify } =
    useApp();
  const [settings, setSettings] = useState(() => structuredClone(db.settings));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <>
      <Heading
        title="Paramètres"
        subtitle="Organisation, horaires de travail et services"
      />
      <OrganisationCode />
      <form
        className="settings-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (saving) return;
          const validationError = schedulesError(settings.schedules);
          if (validationError) {
            setError(validationError);
            notify(validationError, true);
            return;
          }
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
          <section className="settings-section">
            <h2>Horaires hebdomadaires</h2>
            <p>
              Activez les créneaux matin, après-midi et soir pour chaque jour.
              Le soir peut se terminer le lendemain ; un seuil antérieur au
              début s’applique alors le lendemain.
            </p>
            {!schedulesConfigured && (
              <p role="status">
                Les horaires ne sont pas encore configurés. Sélectionnez les
                créneaux travaillés et enregistrez la semaine.
              </p>
            )}
            <div className="table-scroll">
              <table className="schedule-table">
                <thead>
                  <tr>
                    <th>JOUR</th>
                    <th>CRÉNEAU</th>
                    <th>TRAVAILLÉ</th>
                    <th>DÉBUT</th>
                    <th>FIN</th>
                    <th>TOLÉRANCE (MIN)</th>
                    <th>SEUIL D’ABSENCE</th>
                  </tr>
                </thead>
                {Array.from(new Set(settings.schedules.map((s) => s.day))).map(
                  (day) => (
                    <tbody key={day} className="schedule-day">
                      {settings.schedules
                        .map((s, i) => ({ s, i }))
                        .filter(({ s }) => s.day === day)
                        .map(({ s, i }, periodIndex) => (
                          <tr key={`${s.day}-${s.period}`}>
                            {periodIndex === 0 && (
                              <th
                                className="schedule-day-name"
                                scope="rowgroup"
                                rowSpan={
                                  settings.schedules.filter(
                                    (slot) => slot.day === day,
                                  ).length
                                }
                              >
                                {s.day}
                              </th>
                            )}
                            <td>{periodLabels[s.period]}</td>
                            <td>
                              <input
                                type="checkbox"
                                aria-label={`${s.day} ${periodLabels[s.period]} travaillé`}
                                checked={s.working}
                                onChange={(e) =>
                                  setSettings({
                                    ...settings,
                                    schedules: settings.schedules.map((x, j) =>
                                      j === i
                                        ? {
                                            ...x,
                                            working: e.target.checked,
                                            overnight:
                                              e.target.checked && x.overnight,
                                          }
                                        : x,
                                    ),
                                  })
                                }
                              />
                            </td>
                            {(
                              ["start", "end", "tolerance", "cutoff"] as const
                            ).map((key) => (
                              <td key={key}>
                                <input
                                  aria-label={`${s.day} ${periodLabels[s.period]} ${key}`}
                                  type={key === "tolerance" ? "number" : "time"}
                                  min={key === "tolerance" ? 0 : undefined}
                                  max={key === "tolerance" ? 1439 : undefined}
                                  required
                                  disabled={!s.working}
                                  value={s[key]}
                                  onChange={(e) =>
                                    setSettings({
                                      ...settings,
                                      schedules: settings.schedules.map(
                                        (x, j) =>
                                          j === i
                                            ? {
                                                ...x,
                                                [key]:
                                                  key === "tolerance"
                                                    ? Number(e.target.value)
                                                    : e.target.value,
                                              }
                                            : x,
                                      ),
                                    })
                                  }
                                />
                                {key === "end" && s.period === "SOIR" && (
                                  <label className="check-field">
                                    <input
                                      type="checkbox"
                                      aria-label={`${s.day} Soir fin le lendemain`}
                                      disabled={!s.working}
                                      checked={s.overnight}
                                      onChange={(e) =>
                                        setSettings({
                                          ...settings,
                                          schedules: settings.schedules.map(
                                            (x, j) =>
                                              j === i
                                                ? {
                                                    ...x,
                                                    overnight: e.target.checked,
                                                  }
                                                : x,
                                          ),
                                        })
                                      }
                                    />
                                    Fin le lendemain
                                  </label>
                                )}
                                {key === "cutoff" &&
                                  s.overnight &&
                                  s.cutoff < s.start && (
                                    <small>Lendemain</small>
                                  )}
                              </td>
                            ))}
                          </tr>
                        ))}
                    </tbody>
                  ),
                )}
              </table>
            </div>
          </section>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button className="button primary">
              <Save size={17} />
              {saving ? "Enregistrement…" : "Enregistrer les paramètres"}
            </button>
          </div>
        </fieldset>
      </form>
      <Departments />
    </>
  );
}
export function Profile() {
  const { user, db, update, notify } = useApp();
  const [error, setError] = useState("");
  return (
    <>
      <Heading
        title="Mon profil"
        subtitle={user?.role === "COORDINATOR" ? "Coordinateur" : "Secrétaire"}
      />
      <form
        className="form-surface"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const name = String(form.get("name")).trim();
          const email = String(form.get("email")).trim();
          if (
            !name ||
            !z.email().safeParse(email).success ||
            db.users.some(
              (u) =>
                u.id !== user?.id &&
                u.email.toLowerCase() === email.toLowerCase(),
            )
          ) {
            notify("Nom ou email invalide, ou email déjà utilisé.", true);
            return;
          }
          update((d) => {
            Object.assign(
              d.users.find((u) => u.id === user!.id)!,
              { name, email },
            );
          });
          notify("Profil enregistré.");
        }}
      >
        <h2>Informations personnelles</h2>
        <div className="form-grid">
          <Field label="Nom complet">
            <input name="name" required defaultValue={user?.name} />
          </Field>
          <Field label="Email">
            <input
              name="email"
              type="email"
              required
              defaultValue={user?.email}
            />
          </Field>
        </div>
        <div className="form-actions">
          <button className="button primary">Enregistrer le profil</button>
        </div>
      </form>
      <form
        className="form-surface"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          if (String(form.get("current")) !== db.credentials[user!.id]) {
            setError("Le mot de passe actuel est incorrect.");
            return;
          }
          const password = String(form.get("password"));
          if (password.length < 10 || password !== form.get("confirm")) {
            setError(
              "Les mots de passe doivent correspondre et contenir au moins 10 caractères.",
            );
            return;
          }
          update((d) => {
            d.credentials[user!.id] = password;
          });
          setError("");
          e.currentTarget.reset();
          notify("Mot de passe modifié.");
        }}
      >
        <h2>Changer le mot de passe</h2>
        <div className="form-grid">
          <Field label="Mot de passe actuel">
            <input
              name="current"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>
          <Field label="Nouveau mot de passe">
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
            />
          </Field>
          <Field label="Confirmer le mot de passe">
            <input
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
            />
          </Field>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button className="button primary">Modifier le mot de passe</button>
        </div>
      </form>
    </>
  );
}
