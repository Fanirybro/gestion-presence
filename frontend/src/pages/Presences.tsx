import { useSecretaryMode } from "../app/secretaryMode";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence } from "motion/react";
import { Link, useParams } from "react-router-dom";
import { ArrowUpRight, RotateCcw, Search, Pencil } from "lucide-react";
import { useApp } from "../app/context";
import {
  Back,
  Badge,
  Empty,
  ExportButton,
  Field,
  Heading,
  Modal,
  Person,
  Table,
} from "../components/ui";
import {
  dateLabel,
  exportCsv,
  fullName,
  statusLabels,
  today,
} from "../utils";
import { presencesApi } from "../services/presences";
export function Presences({
  mode = "presences",
}: {
  mode?: "presences" | "absences" | "retards" | "history";
}) {
  const { db } = useApp();
  const { simple } = useSecretaryMode();
  const [date, setDate] = useState(today());
  const [end, setEnd] = useState(today());
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState("");
  const records = useQuery({ queryKey: ["presences", date, mode === "history" ? end : date], queryFn: () => presencesApi.list(date, mode === "history" ? end : date), enabled: date <= end });
  const rows = (records.data?.attendance ?? [])
    .filter((p) => {
      const a = db.agents.find((a) => a.id === p.agentId);
      return (
        (mode === "history"
          ? p.date >= date && p.date <= end
          : p.date === date) &&
        (simple || !department || a?.departmentId === department) &&
        fullName(a)
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (simple || !status || p.status === status) &&
        (mode !== "absences" || ["ABSENT", "JUSTIFIED"].includes(p.status)) &&
        (mode !== "retards" || p.status === "LATE")
      );
    })
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        fullName(db.agents.find((x) => x.id === a.agentId)).localeCompare(
          fullName(db.agents.find((x) => x.id === b.agentId)),
        ),
    );
  const title = {
    presences: "Présences",
    absences: "Absences",
    retards: "Retards",
    history: "Historique",
  }[mode];
  const download = () =>
    exportCsv(
      [
        [
          "Date",
          "Agent",
          "Service",
          "Arrivée",
          "Départ",
          "Statut",
          "Retard (min)",
          "Motif",
        ],
        ...rows.map((p) => {
          const a = db.agents.find((a) => a.id === p.agentId);
          return [
            p.date,
            fullName(a),
            db.departments.find((d) => d.id === a?.departmentId)?.name || "",
            p.arrivalAt,
            p.departureAt,
            statusLabels[p.status],
            String(p.lateMinutes),
            p.note,
          ];
        }),
      ],
      `${mode}-${date}.csv`,
    );
  return (
    <>
      <Heading
        eyebrow="SUIVI DU PERSONNEL"
        title={title}
        subtitle={
          mode === "history"
            ? "Retrouvez les pointages sur la période de votre choix."
            : "Consultez les relevés et le détail de chaque journée."
        }
      >
        {!simple && <ExportButton onClick={download} />}
      </Heading>
      <div className="filters">
        <Field label={mode === "history" ? "Du" : "Date"}>
          <input
            aria-label="Date de début"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </Field>
        {mode === "history" && (
          <Field label="Au">
            <input
              aria-label="Date de fin"
              type="date"
              min={date}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
        )}
        <label className="search-input">
          <Search size={17} />
          <input
            aria-label="Rechercher une présence"
            placeholder="Rechercher un nom…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {!simple && (
          <select
            aria-label="Service"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          >
            <option value="">Tous les services</option>
            {db.departments.map((d) => (
              <option value={d.id} key={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
        {!simple && mode !== "retards" && (
          <select
            aria-label="Statut"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Tous les statuts</option>
            {Object.entries(statusLabels)
              .filter(
                ([s]) =>
                  mode !== "absences" || ["ABSENT", "JUSTIFIED"].includes(s),
              )
              .map(([s, label]) => (
                <option key={s} value={s}>
                  {label}
                </option>
              ))}
          </select>
        )}
        <button
          className="icon-button"
          title="Réinitialiser les filtres"
          aria-label="Réinitialiser les filtres"
          onClick={() => {
            setDate(today());
            setEnd(today());
            setSearch("");
            setDepartment("");
            setStatus("");
          }}
        >
          <RotateCcw size={17} />
        </button>
      </div>
      {date > end && mode === "history" && (
        <p className="form-error">
          La date de fin doit suivre la date de début.
        </p>
      )}
      <section className="data-section">
        <div className="section-heading">
          <h2>
            {rows.length} relevé{rows.length > 1 ? "s" : ""}
          </h2>
          <span className="muted">
            {mode === "history"
              ? "Période sélectionnée"
              : date
                ? dateLabel(date)
                : "Choisir une date"}
          </span>
        </div>
        {records.isError ? <p className="form-error" role="alert">{records.error.message}</p> : <Table
          headers={[
            "AGENT",
            ...(!simple ? ["DATE", "SERVICE"] : []),
            "ARRIVÉE",
            "DÉPART",
            "STATUT",
            ...(!simple ? ["RETARD"] : []),
            "",
          ]}
          rowKeys={rows.map((p) => p.id)}
          rows={rows.map((p) => {
            const a = db.agents.find((a) => a.id === p.agentId);
            return [
              <Person key="agent" agent={a} />,
              ...(!simple
                ? [
                    dateLabel(p.date),
                    db.departments.find((d) => d.id === a?.departmentId)?.name,
                  ]
                : []),
              <span key="arrival" className="time">
                {p.arrivalAt || "—"}
              </span>,
              <span key="departure" className="time">
                {p.departureAt || "—"}
              </span>,
              <Badge key="status" status={p.status} />,
              ...(!simple
                ? [p.lateMinutes ? `${p.lateMinutes} min` : "—"]
                : []),
              <Link
                className="icon-button"
                key="detail"
                aria-label={`Détail de ${fullName(a)}`}
                to={`/presences/${p.id}`}
              >
                <ArrowUpRight size={17} />
              </Link>,
            ];
          })}
        />}
      </section>
    </>
  );
}
export function PresenceDetails() {
  const { id } = useParams();
  const { db, user, notify } = useApp();
  const client = useQueryClient();
  const [modal, setModal] = useState<"correct" | "justify" | null>(null);
  const [error, setError] = useState("");
  const detail = useQuery({ queryKey: ["presence", id], queryFn: () => presencesApi.get(id!), enabled: Boolean(id) });
  if (detail.isPending) return <p role="status">Chargement du relevé…</p>;
  if (detail.isError || !detail.data) return <Empty text={detail.error?.message || "Présence introuvable"} />;
  const p = detail.data.attendance;
  const a = db.agents.find((a) => a.id === p.agentId);
  const save = async (form: HTMLFormElement) => {
    const values = new FormData(form);
    const reason = String(values.get("reason") || "").trim();
    try {
      const result = modal === "justify"
        ? await presencesApi.justify(p.id, { reason, version: p.version })
        : await presencesApi.correct(p.id, {
            arrival: String(values.get("arrival") || ""), departure: String(values.get("departure") || ""),
            arrivalDate: String(values.get("arrivalDate") || p.date), departureDate: String(values.get("departureDate") || p.date),
            reason, version: p.version,
          });
      client.setQueryData(["presence", id], { ...detail.data, attendance: result.attendance });
      await client.invalidateQueries({ queryKey: ["presences"] });
      setModal(null); setError(""); notify("Relevé mis à jour.");
    } catch (err) { setError((err as Error).message); }
  };
  return (
    <>
      <Back to="/presences" />
      <Heading
        title={fullName(a)}
        subtitle={dateLabel(p.date, true)}
      >
        <Badge status={p.status} />
        {["ABSENT", "JUSTIFIED"].includes(p.status) && (
          <button
            className="button"
            onClick={() => {
              setError("");
              setModal("justify");
            }}
          >
            Justifier l’absence
          </button>
        )}
        {user?.role === "COORDINATOR" && (
          <button
            className="button primary"
            onClick={() => {
              setError("");
              setModal("correct");
            }}
          >
            <Pencil size={16} />
            Corriger
          </button>
        )}
      </Heading>
      <div className="detail-strip">
        <div>
          <small>ARRIVÉE</small>
          <strong>{p.arrivalAt || "—"}</strong>
        </div>
        <div>
          <small>DÉPART</small>
          <strong>{p.departureAt || "—"}</strong>
        </div>
        <div>
          <small>RETARD</small>
          <strong>{p.lateMinutes} min</strong>
        </div>
        <div>
          <small>ORIGINE</small>
          <strong>
            {p.source === "QR_SCAN"
              ? "Pointage QR"
              : p.source === "MANUAL"
                ? "Correction manuelle"
                : "Automatique"}
          </strong>
        </div>
      </div>
      {p.note && (
        <div className="note">
          <strong>Motif</strong>
          <p>{p.note}</p>
        </div>
      )}
      <section className="data-section">
        <div className="section-heading">
          <h2>Journal des modifications</h2>
        </div>
        <Table
          headers={["DATE", "AUTEUR", "ACTION", "MOTIF"]}
          rows={detail.data.audit
            .map((log) => [
              new Date(log.at).toLocaleString("fr-FR", {
                timeZone: "Indian/Antananarivo",
              }),
              log.actor,
              log.action,
              log.reason,
            ])}
          empty="Aucune modification enregistrée"
        />
      </section>
      <AnimatePresence>
        {modal && (
          <Modal
            key="presence-edit"
            title={
              modal === "correct"
                ? "Corriger la présence"
                : "Justifier l’absence"
            }
            close={() => setModal(null)}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save(e.currentTarget);
              }}
            >
              {modal === "correct" && (
                <div className="form-grid">
                  <Field label="Arrivée">
                    <input
                      name="arrival"
                      type="time"
                      defaultValue={p.arrivalAt}
                    />
                  </Field>
                  <Field label="Date d’arrivée"><input name="arrivalDate" type="date" defaultValue={p.arrivalDate || p.date} /></Field>
                  <Field label="Départ">
                    <input
                      name="departure"
                      type="time"
                      defaultValue={p.departureAt}
                    />
                  </Field>
                  <Field label="Date de départ"><input name="departureDate" type="date" defaultValue={p.departureDate || p.date} /></Field>
                </div>
              )}
              <Field label="Motif obligatoire">
                <textarea
                  name="reason"
                  required
                  minLength={5}
                  maxLength={500}
                  defaultValue={p.note}
                  rows={4}
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
                  onClick={() => setModal(null)}
                >
                  Annuler
                </button>
                <button className="button primary">Enregistrer</button>
              </footer>
            </form>
          </Modal>
        )}
      </AnimatePresence>
    </>
  );
}
