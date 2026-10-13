import { useState } from "react";
import { useApp } from "../app/context";
import { personnelApi } from "../services/personnel";

export default function Departments() {
  const { db, refreshPersonnel, notify } = useApp();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function save(action: () => Promise<unknown>) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await action();
      await refreshPersonnel();
      setName("");
      setEditing(null);
      notify("Département enregistré.");
    } catch (err) {
      setError((err as Error).message);
      notify((err as Error).message, true);
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="settings-section">
      <div className="section-heading">
        <h2>Départements</h2>
      </div>
      <p>
        Les agents doivent appartenir à un département. Un département contenant
        des agents actifs ne peut pas être désactivé.
      </p>
      <div className="department-list">
        {db.departments.map((d) => (
          <div key={d.id}>
            <span>
              {d.name}
              {d.isActive === false ? " · Inactif" : ""}
            </span>
            <div className="actions">
              <button
                type="button"
                className="text-link"
                disabled={pending}
                onClick={() => {
                  setEditing(d.id);
                  setName(d.name);
                  setError("");
                }}
              >
                Renommer
              </button>
              <button
                type="button"
                className="button small"
                disabled={pending}
                onClick={() =>
                  void save(() =>
                    personnelApi.updateDepartment(d.id, {
                      actif: d.isActive === false,
                    }),
                  )
                }
              >
                {d.isActive === false ? "Réactiver" : "Désactiver"}
              </button>
            </div>
          </div>
        ))}
        {!db.departments.length && <p>Aucun département enregistré.</p>}
      </div>
      <form
        className="input-action"
        onSubmit={(event) => {
          event.preventDefault();
          void save(() =>
            editing
              ? personnelApi.updateDepartment(editing, { nom: name.trim() })
              : personnelApi.createDepartment(name.trim()),
          );
        }}
      >
        <input
          aria-label="Nom du département"
          placeholder="Nom du département"
          required
          maxLength={100}
          disabled={pending}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="button" disabled={pending}>
          {pending
            ? "Enregistrement…"
            : editing
              ? "Enregistrer"
              : "Ajouter un département"}
        </button>
        {editing && (
          <button
            type="button"
            className="button"
            disabled={pending}
            onClick={() => {
              setEditing(null);
              setName("");
            }}
          >
            Annuler
          </button>
        )}
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
