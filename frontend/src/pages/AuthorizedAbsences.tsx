import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence } from "motion/react";
import {
  Building2,
  Calendar,
  CalendarCheck,
  CalendarDays,
  Clock3,
  Pencil,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { useApp } from "../app/context";
import { useSecretaryMode } from "../app/secretaryMode";
import { Field, Heading, Modal, Person, Table } from "../components/ui";
import { AgentAutocomplete } from "../components/AgentAutocomplete";
import {
  authorizedAbsences,
  type AuthorizedAbsence,
} from "../services/authorizedAbsences";
import { dateLabel, fullName, today } from "../utils";
import "./authorizedAbsences.css";

const label = (r: AuthorizedAbsence) =>
  r.type === "LEAVE" ? "Congé autorisé" : "Permission autorisée";
const period = (r: AuthorizedAbsence) =>
  r.type === "LEAVE"
    ? `${dateLabel(r.start)} — ${dateLabel(r.end)}`
    : `${dateLabel(r.start)} · ${r.from} — ${r.to}`;

export default function AuthorizedAbsences() {
  const { db, notify, user } = useApp();
  const canManage = user?.role === "COORDINATOR";
  const { simple } = useSecretaryMode();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["authorized-absences", user?.organisationId, user?.id],
    queryFn: authorizedAbsences.list,
    retry: false,
  });
  const [filters, setFilters] = useState({
    start: "",
    end: "",
    agent: "",
    department: "",
    type: "LEAVE",
  });
  const [editing, setEditing] = useState<AuthorizedAbsence | "new" | null>(
    null,
  );
  const [cancelling, setCancelling] = useState<AuthorizedAbsence | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const invalidPeriod = Boolean(
    filters.start && filters.end && filters.end < filters.start,
  );
  const agents = [...db.agents].sort((a, b) =>
    fullName(a).localeCompare(fullName(b)),
  );
  const rows = (query.data || [])
    .filter((r) => {
      const agent = db.agents.find((a) => a.id === r.agentId);
      return (
        !invalidPeriod &&
        (!filters.start || r.end >= filters.start) &&
        (!filters.end || r.start <= filters.end) &&
        (!filters.agent || r.agentId === filters.agent) &&
        (!filters.department || agent?.departmentId === filters.department) &&
        (!filters.type || r.type === filters.type)
      );
    })
    .sort((a, b) => b.start.localeCompare(a.start));
  const filter = (name: keyof typeof filters, value: string) =>
    setFilters((f) => ({ ...f, [name]: value }));
  const open = (record: AuthorizedAbsence | "new") => {
    setError("");
    setEditing(record);
  };
  const leaveCount = (query.data || []).filter((r) => r.type === "LEAVE").length;
  const permissionCount = (query.data || []).filter((r) => r.type === "PERMISSION").length;
  const hasActiveFilters = Boolean(
    filters.start || filters.end || filters.agent || filters.department,
  );
  return (
    <div className={`authorized-absences ${simple ? "authorized-simple" : ""}`}>
      <Heading
        eyebrow="RH & PLANNING"
        title="Congés et permissions"
        subtitle="Recensez et gérez les absences préalablement autorisées au sein de l'organisation."
      >
        {canManage && (
          <button
            className="button primary"
            disabled={!query.data || query.isError}
            onClick={() => open("new")}
          >
            <Plus size={16} />
            <span>Ajouter une absence</span>
          </button>
        )}
      </Heading>

      {/* Clean Tabs for Absence Types */}
      <div className="profile-clean-tabs" role="tablist" aria-label="Type d'absence">
        <button
          type="button"
          role="tab"
          aria-selected={filters.type === "LEAVE"}
          className={`profile-tab-item ${filters.type === "LEAVE" ? "active" : ""}`}
          onClick={() => filter("type", "LEAVE")}
        >
          <CalendarDays size={14} />
          <span>Congés ({leaveCount})</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={filters.type === "PERMISSION"}
          className={`profile-tab-item ${filters.type === "PERMISSION" ? "active" : ""}`}
          onClick={() => filter("type", "PERMISSION")}
        >
          <Clock3 size={14} />
          <span>Permissions ({permissionCount})</span>
        </button>
      </div>

      {/* Unified Search & Filter Bar (modern capsule style matching screenshot) */}
      <section aria-label="Filtres" className="unified-filter-bar">
        {/* 1. Employé : Recherche instantanée avec auto-suggestions */}
        <div className="unified-filter-segment segment-agent">
          <AgentAutocomplete
            agents={agents}
            departments={db.departments}
            value={filters.agent}
            onChange={(agentId) => filter("agent", agentId)}
            placeholder="Rechercher un employé…"
            embedded
          />
        </div>

        <div className="unified-filter-divider" aria-hidden="true" />

        {/* 2. Période du (Date de début) */}
        <div className="unified-filter-segment segment-date">
          <Calendar size={16} className="segment-icon" aria-hidden="true" />
          <div className="segment-input-group">
            <span className="segment-label">Du</span>
            <input
              type="date"
              aria-label="Date de début"
              value={filters.start}
              onChange={(e) => filter("start", e.target.value)}
              className="unified-date-input"
            />
          </div>
          {filters.start && (
            <button
              type="button"
              className="segment-clear-btn"
              onClick={() => filter("start", "")}
              title="Effacer la date de début"
              aria-label="Effacer la date de début"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="unified-filter-divider" aria-hidden="true" />

        {/* 3. Au (Date de fin) */}
        <div className="unified-filter-segment segment-date">
          <CalendarCheck size={16} className="segment-icon" aria-hidden="true" />
          <div className="segment-input-group">
            <span className="segment-label">Au</span>
            <input
              type="date"
              aria-label="Date de fin"
              value={filters.end}
              onChange={(e) => filter("end", e.target.value)}
              className="unified-date-input"
            />
          </div>
          {filters.end && (
            <button
              type="button"
              className="segment-clear-btn"
              onClick={() => filter("end", "")}
              title="Effacer la date de fin"
              aria-label="Effacer la date de fin"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="unified-filter-divider" aria-hidden="true" />

        {/* 4. Service / Département */}
        <div className="unified-filter-segment segment-dept">
          <Building2 size={16} className="segment-icon" aria-hidden="true" />
          <div className="segment-input-group">
            <span className="segment-label">Service</span>
            <select
              aria-label="Filtrer par service"
              value={filters.department}
              onChange={(e) => filter("department", e.target.value)}
              className="unified-select"
            >
              <option value="">Tous les services</option>
              {db.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          {filters.department && (
            <button
              type="button"
              className="segment-clear-btn"
              onClick={() => filter("department", "")}
              title="Effacer le filtre service"
              aria-label="Effacer le filtre service"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* 5. Réinitialiser (si filtres actifs) */}
        {hasActiveFilters && (
          <>
            <div className="unified-filter-divider" aria-hidden="true" />
            <button
              type="button"
              className="unified-reset-btn"
              title="Réinitialiser tous les filtres"
              onClick={() =>
                setFilters({
                  start: "",
                  end: "",
                  agent: "",
                  department: "",
                  type: "LEAVE",
                })
              }
            >
              <RotateCcw size={13} />
              <span>Réinitialiser</span>
            </button>
          </>
        )}
      </section>
      {invalidPeriod && (
        <p role="alert" className="form-error">
          La fin de période doit être postérieure ou égale au début.
        </p>
      )}
      <section className="data-section">
        <div className="section-heading">
          <h2>Absences autorisées</h2>
          <span>{rows.length} enregistrement(s)</span>
        </div>
        {query.isError ? (
          <div className="absence-error" role="alert">
            <p>
              Impossible de charger les enregistrements de ce navigateur.
              Réessayez sans effacer vos données.
            </p>
            <button className="button" onClick={() => void query.refetch()}>
              Réessayer
            </button>
          </div>
        ) : (
          <Table
            key={JSON.stringify(filters)}
            loading={query.isPending}
            headers={[
              "EMPLOYÉ",
              "TYPE",
              "PÉRIODE",
              ...(!simple ? ["SERVICE"] : []),
              "REMARQUE",
              "ACTIONS",
            ]}
            empty={
              query.data?.length
                ? "Aucun enregistrement ne correspond aux filtres."
                : "Aucune absence autorisée enregistrée. Utilisez le bouton Ajouter une absence autorisée."
            }
            rowKeys={rows.map((r) => r.id)}
            rows={rows.map((r) => {
              const agent = db.agents.find((a) => a.id === r.agentId);
              return [
                agent ? (
                  <Person key="person" agent={agent} />
                ) : (
                  "Employé indisponible"
                ),
                <div key="type" className="absence-type">
                  <span
                    className={`badge ${r.type === "LEAVE" ? "present" : "justified"}`}
                  >
                    {r.type === "LEAVE" ? (
                      <CalendarDays size={16} />
                    ) : (
                      <Clock3 size={16} />
                    )}
                    {label(r)}
                  </span>
                  {r.cancelled && (
                    <strong className="absence-cancelled">
                      Enregistrement annulé
                    </strong>
                  )}
                </div>,
                period(r),
                ...(!simple
                  ? [
                      db.departments.find((d) => d.id === agent?.departmentId)
                        ?.name || "—",
                    ]
                  : []),
                <span key="remark" className="absence-remark">
                  {r.remark || "—"}
                </span>,
                r.cancelled || !canManage ? (
                  "Annulé"
                ) : (
                  <div key="actions" className="actions">
                    <button className="button" onClick={() => open(r)}>
                      <Pencil size={16} />
                      Modifier
                    </button>
                    <button
                      className="button agent-delete"
                      onClick={() => {
                        setError("");
                        setCancelling(r);
                      }}
                    >
                      <X size={16} />
                      Annuler
                    </button>
                  </div>
                ),
              ];
            })}
          />
        )}
      </section>
      <AnimatePresence>
        {editing && (
          <AbsenceForm
            key={editing === "new" ? "new" : editing.id}
            record={editing === "new" ? undefined : editing}
            close={() => setEditing(null)}
            saved={(rows) => {
              client.setQueryData(["authorized-absences", user?.organisationId, user?.id], rows);
              setEditing(null);
              notify("Absence autorisée enregistrée.");
            }}
          />
        )}
        {cancelling && (
          <Modal
            key="cancel"
            title="Annuler cet enregistrement ?"
            close={() => {
              if (!busy) setCancelling(null);
            }}
          >
            <p>
              {fullName(db.agents.find((a) => a.id === cancelling.agentId))} ·{" "}
              {label(cancelling)} · {period(cancelling)}
            </p>
            <p>L’enregistrement restera visible avec la mention « Annulé ».</p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <footer>
              <button
                className="button"
                disabled={busy}
                onClick={() => setCancelling(null)}
              >
                Conserver
              </button>
              <button
                className="button primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    client.setQueryData(
                      ["authorized-absences", user?.organisationId, user?.id],
                      await authorizedAbsences.cancel(cancelling.id, cancelling.version),
                    );
                    setCancelling(null);
                    notify("Enregistrement annulé.");
                  } catch {
                    setError(
                      "L’annulation n’a pas pu être enregistrée. Réessayez.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Annulation…" : "Confirmer l’annulation"}
              </button>
            </footer>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

function AbsenceForm({
  record,
  close,
  saved,
}: {
  record?: AuthorizedAbsence;
  close: () => void;
  saved: (rows: AuthorizedAbsence[]) => void;
}) {
  const { db } = useApp();
  const [type, setType] = useState<"LEAVE" | "PERMISSION">(
    record?.type || "LEAVE",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) || "").trim();
    const start = value("start"),
      end = type === "LEAVE" ? value("end") : start;
    if (
      end < start ||
      (type === "PERMISSION" && value("to") <= value("from"))
    ) {
      setError(
        "La fin doit suivre le début (heures strictement croissantes pour une permission).",
      );
      return;
    }
    if (
      !db.agents.some(
        (a) =>
          a.id === value("agentId") && (a.isActive || a.id === record?.agentId),
      )
    ) {
      setError("Sélectionnez un employé disponible.");
      return;
    }
    const common = {
      agentId: value("agentId"),
      start,
      end,
      remark: value("remark"),
      version: record?.version,
      from: type === "PERMISSION" ? value("from") : null,
      to: type === "PERMISSION" ? value("to") : null,
    };
    const next =
      type === "LEAVE"
        ? { ...common, type }
        : { ...common, type };
    setBusy(true);
    setError("");
    try {
      saved(await authorizedAbsences.save(next, record?.id));
    } catch {
      setError(
        "Impossible d’enregistrer l’absence. Vérifiez les champs, puis réessayez.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        record
          ? "Modifier l’absence autorisée"
          : "Ajouter une absence autorisée"
      }
      close={() => {
        if (!busy) close();
      }}
    >
      <form className="absence-form" onSubmit={submit}>
        <Field label="Employé">
          <select name="agentId" defaultValue={record?.agentId || ""} required>
            <option value="" disabled>
              Choisir un employé
            </option>
            {db.agents
              .filter((a) => a.isActive || a.id === record?.agentId)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {fullName(a)}
                  {!a.isActive ? " (inactif)" : ""}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Type">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
          >
            <option value="LEAVE">Congé</option>
            <option value="PERMISSION">Permission</option>
          </select>
        </Field>
        <div className="form-grid">
          <Field label={type === "LEAVE" ? "Date de début" : "Date"}>
            <input
              name="start"
              type="date"
              required
              defaultValue={record?.start || today()}
            />
          </Field>
          {type === "LEAVE" && (
            <Field label="Date de fin">
              <input
                name="end"
                type="date"
                required
                defaultValue={record?.end || today()}
              />
            </Field>
          )}
        </div>
        {type === "PERMISSION" && (
          <div className="form-grid">
            <Field label="Heure de début">
              <input
                name="from"
                type="time"
                required
                defaultValue={record?.type === "PERMISSION" ? record.from ?? "" : ""}
              />
            </Field>
            <Field label="Heure de fin">
              <input
                name="to"
                type="time"
                required
                defaultValue={record?.type === "PERMISSION" ? record.to ?? "" : ""}
              />
            </Field>
          </div>
        )}
        <Field label="Remarque (facultatif)">
          <textarea
            name="remark"
            rows={3}
            maxLength={500}
            defaultValue={record?.remark || ""}
          />
        </Field>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={close}
          >
            Annuler
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
