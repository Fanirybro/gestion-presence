import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence } from "motion/react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Plus, Search, Pencil, ArrowUpRight } from "lucide-react";
import { useApp } from "../app/context";
import {
  Back,
  Confirm,
  Empty,
  Field,
  Heading,
  Person,
  Table,
} from "../components/ui";
import { dateLabel, fullName } from "../utils";
import { personnelApi, type PersonnelInput } from "../services/personnel";
import type { Agent } from "../types";

function AgentStatus({ agent }: { agent: Agent }) {
  const { refreshPersonnel, notify } = useApp();
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const change = async () => {
    setPending(true);
    try {
      await personnelApi.update(agent.id, { actif: !agent.isActive });
      await refreshPersonnel();
      notify(
        agent.isActive
          ? "Agent désactivé. Historique conservé et badges révoqués."
          : "Agent réactivé.",
      );
    } catch (error) {
      notify((error as Error).message, true);
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      <button
        className="button small"
        disabled={pending}
        onClick={() => setConfirm(true)}
      >
        {pending
          ? "Enregistrement…"
          : agent.isActive
            ? "Désactiver"
            : "Réactiver"}
      </button>
      <AnimatePresence>
        {confirm && (
          <Confirm
            title={
              agent.isActive
                ? "Désactiver cet agent ?"
                : "Réactiver cet agent ?"
            }
            text={
              agent.isActive
                ? `${fullName(agent)} restera dans le personnel inactif. Ses badges seront révoqués et son historique sera conservé.`
                : "L’agent sera de nouveau actif. Les anciens badges restent révoqués."
            }
            close={() => setConfirm(false)}
            confirm={() => void change()}
          />
        )}
      </AnimatePresence>
    </>
  );
}
export function Agents() {
  const { db, organisation } = useApp();
  const currentDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: organisation?.fuseau_horaire || "Indian/Antananarivo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const age = (birthDate?: string) => {
    if (!birthDate || birthDate > currentDate) return null;
    const years = Number(currentDate.slice(0, 4)) - Number(birthDate.slice(0, 4));
    return years - (currentDate.slice(5) < birthDate.slice(5) ? 1 : 0);
  };
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("name");
  const agents = db.agents
    .filter(
      (a) =>
        fullName(a)
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (!department || a.departmentId === department) &&
        (!status || String(a.isActive) === status),
    )
    .sort((a, b) =>
      sort === "age"
        ? (age(a.birthDate) ?? Infinity) - (age(b.birthDate) ?? Infinity)
        : fullName(a).localeCompare(fullName(b)),
    );
  return (
    <>
      <Heading
        eyebrow="RÉFÉRENTIEL"
        title="Personnel"
        subtitle={`${db.agents.length} agents · Identité, affectation et statut`}
      >
        <Link className="button" to="/agents/badges">
          Imprimer les badges
        </Link>
        <Link className="button" to="/settings">
          Gérer les départements
        </Link>
        <Link className="button primary" to="/agents/new">
          <Plus size={18} />
          Nouvel agent
        </Link>
      </Heading>
      <div className="filters">
        <label className="search-input">
          <Search size={17} />
          <input
            aria-label="Rechercher un agent"
            placeholder="Rechercher un nom…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Département"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
        >
          <option value="">Tous les départements</option>
          {db.departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Statut de l’agent"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Tous les statuts</option>
          <option value="true">Actifs</option>
          <option value="false">Inactifs</option>
        </select>
        <select
          aria-label="Trier les agents"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="name">Trier par nom</option>
          <option value="age">Trier par âge</option>
        </select>
      </div>
      <section className="data-section">
        {!agents.length ? (
          <Empty
            text={
              db.agents.length
                ? "Aucun agent ne correspond aux filtres"
                : "Aucun agent enregistré"
            }
          />
        ) : (
          <Table
            headers={[
              "AGENT",
              "DÉPARTEMENT",
              "POSTE",
              "EMBAUCHE",
              "STATUT",
              "ACTIONS",
            ]}
            rowKeys={agents.map((a) => a.id)}
            rows={agents.map((a) => [
              <Person key="agent" agent={a} detail={age(a.birthDate) === null ? "Âge non renseigné" : `${age(a.birthDate)} ans`} />,
              db.departments.find((d) => d.id === a.departmentId)?.name ?? "—",
              a.position || "—",
              a.hireDate ? dateLabel(a.hireDate) : "—",
              <span
                key="status"
                className={`badge ${a.isActive ? "present" : "absent"}`}
              >
                <i />
                {a.isActive ? "Actif" : "Inactif"}
              </span>,
              <div key="actions" className="actions">
                <Link
                  to={`/agents/${a.id}/edit`}
                  className="button small"
                  aria-label={`Modifier ${fullName(a)}`}
                >
                  <Pencil size={16} />
                  Modifier
                </Link>
                <Link className="button small" to={`/agents/${a.id}/qr`}>
                  Badge QR
                </Link>
                <AgentStatus agent={a} />
                <Link
                  to={`/agents/${a.id}`}
                  className="icon-button"
                  aria-label={`Fiche de ${fullName(a)}`}
                >
                  <ArrowUpRight size={17} />
                </Link>
              </div>,
            ])}
          />
        )}
      </section>
    </>
  );
}
export function AgentForm() {
  const { id } = useParams();
  const { db } = useApp();
  const agent = db.agents.find((a) => a.id === id);
  if (id && !agent)
    return (
      <Empty text="Agent introuvable">
        <Link to="/agents">Retour au personnel</Link>
      </Empty>
    );
  return <PersonnelForm key={id ?? "new"} agent={agent} />;
}
function PersonnelForm({ agent }: { agent?: Agent }) {
  const { db, user, refreshPersonnel, notify } = useApp();
  const navigate = useNavigate();
  const [form, setForm] = useState<PersonnelInput>({
    nom: agent?.lastName ?? "",
    prenom: agent?.firstName ?? "",
    departement_id: agent?.departmentId ?? "",
    utilisateur_id: agent?.userId ?? null,
    date_naissance: agent?.birthDate ?? "",
    date_embauche: agent?.hireDate || null,
    poste: agent?.position ?? "",
    actif: agent?.isActive ?? true,
  });
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const members = useQuery({
    queryKey: ["personnel-members", user?.organisationId, user?.id],
    queryFn: personnelApi.members,
  });
  const departments = db.departments.filter(
    (d) => d.isActive !== false || d.id === agent?.departmentId,
  );
  const submit = async () => {
    if (pending) return;
    setError("");
    setPending(true);
    try {
      const result = agent
        ? await personnelApi.update(agent.id, form)
        : await personnelApi.create(form);
      await refreshPersonnel();
      notify(
        !agent && result.personnel.actif
          ? "Agent enregistré. Son badge QR est prêt."
          : "Agent enregistré.",
      );
      navigate(`/agents/${result.personnel.id}`);
    } catch (err) {
      setError((err as Error).message);
      notify((err as Error).message, true);
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      <Back to={agent ? `/agents/${agent.id}` : "/agents"} />
      <Heading
        title={agent ? "Modifier l’agent" : "Nouvel agent"}
        subtitle="Identité, informations professionnelles et affectation"
      />
      {!departments.length && (
        <Empty text="Créez d’abord un département">
          <Link className="button" to="/settings">
            Gérer les départements
          </Link>
        </Empty>
      )}
      <form
        className="form-surface"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h2>Identité de l’agent</h2>
        <fieldset
          disabled={pending}
          style={{ border: 0, padding: 0, margin: 0 }}
        >
          <div className="form-grid">
            {(
              [
                ["prenom", "Prénom"],
                ["nom", "Nom"],
                ["poste", "Poste (facultatif)"],
              ] as const
            ).map(([key, label]) => (
              <Field label={label} key={key}>
                <input
                  required={key !== "poste"}
                  maxLength={100}
                  value={form[key] ?? ""}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </Field>
            ))}
            <Field label="Date de naissance">
              <input
                required
                type="date"
                value={form.date_naissance}
                onChange={(e) =>
                  setForm({ ...form, date_naissance: e.target.value })
                }
              />
            </Field>
            <Field label="Date d’embauche (facultative)">
              <input
                type="date"
                min={form.date_naissance || undefined}
                value={form.date_embauche ?? ""}
                onChange={(e) =>
                  setForm({ ...form, date_embauche: e.target.value || null })
                }
              />
            </Field>
            <Field label="Département">
              <select
                required
                value={form.departement_id}
                onChange={(e) =>
                  setForm({ ...form, departement_id: e.target.value })
                }
              >
                <option value="">Sélectionner un département</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {d.isActive === false ? " (inactif)" : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Compte utilisateur lié (facultatif)"
              hint="Un compte ne peut être associé qu’à un seul agent dans cette organisation."
            >
              <select
                disabled={members.isPending || members.isError}
                value={form.utilisateur_id ?? ""}
                onChange={(e) =>
                  setForm({ ...form, utilisateur_id: e.target.value || null })
                }
              >
                <option value="">Aucun compte lié</option>
                {form.utilisateur_id &&
                  !members.data?.membres.some(
                    (m) => String(m.id) === form.utilisateur_id,
                  ) && (
                    <option value={form.utilisateur_id}>
                      Compte lié actuel
                    </option>
                  )}
                {members.data?.membres
                  .filter(
                    (m) =>
                      String(m.id) === agent?.userId ||
                      (m.actif &&
                        !db.agents.some(
                          (a) =>
                            a.id !== agent?.id && a.userId === String(m.id),
                        )),
                  )
                  .map((m) => (
                    <option key={m.id} value={String(m.id)}>
                      {m.prenom} {m.nom}
                      {!m.actif ? " (inactif)" : ""}
                    </option>
                  ))}
              </select>
            </Field>
            <label className="check-field">
              <input
                type="checkbox"
                checked={form.actif}
                onChange={(e) => setForm({ ...form, actif: e.target.checked })}
              />
              Agent actif
            </label>
          </div>
          {agent?.isActive && !form.actif && (
            <p>
              La désactivation révoquera les badges actifs. L’historique sera
              conservé.
            </p>
          )}
          {members.isError && (
            <p role="alert">
              Comptes liés indisponibles.{" "}
              <button
                type="button"
                className="text-link"
                onClick={() => void members.refetch()}
              >
                Réessayer
              </button>
            </p>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <Link
              className="button"
              to={agent ? `/agents/${agent.id}` : "/agents"}
            >
              Annuler
            </Link>
            <button
              disabled={!departments.length || pending}
              className="button primary"
              type="submit"
            >
              {pending ? "Enregistrement…" : "Enregistrer l’agent"}
            </button>
          </div>
        </fieldset>
      </form>
    </>
  );
}
export function AgentDetails() {
  const { id } = useParams();
  const { db, user } = useApp();
  const members = useQuery({
    queryKey: ["personnel-members", user?.organisationId, user?.id],
    queryFn: personnelApi.members,
  });
  const a = db.agents.find((a) => a.id === id);
  if (!a) return <Empty text="Agent introuvable" />;
  const member = members.data?.membres.find((m) => String(m.id) === a.userId);
  return (
    <>
      <Back to="/agents" label="Personnel" />
      <Heading
        title={fullName(a)}
        subtitle={a.position || undefined}
      >
        <Link className="button" to={`/agents/${id}/edit`}>
          <Pencil size={16} />
          Modifier
        </Link>
        <Link className="button small" to={`/agents/${a.id}/qr`}>
          Badge QR
        </Link>
        <AgentStatus agent={a} />
      </Heading>
      <div className="detail-strip">
        {[
          [
            "DÉPARTEMENT",
            db.departments.find((d) => d.id === a.departmentId)?.name ?? "—",
          ],
          ["NAISSANCE", a.birthDate ? dateLabel(a.birthDate) : "—"],
          ["EMBAUCHE", a.hireDate ? dateLabel(a.hireDate) : "—"],
          ["STATUT", a.isActive ? "Actif" : "Inactif"],
          [
            "COMPTE LIÉ",
            member
              ? `${member.prenom} ${member.nom}`
              : a.userId
                ? members.isError
                  ? "Indisponible"
                  : "Chargement…"
                : "Aucun",
          ],
          ["CRÉATION", dateLabel(a.createdAt)],
        ].map(([label, value]) => (
          <div key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </>
  );
}
export { default as AgentQr } from "./AgentQr";
