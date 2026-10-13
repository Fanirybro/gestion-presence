import { useSecretaryMode } from "../app/secretaryMode";
import { useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  Download,
  FileText,
  Archive,
  LoaderCircle,
} from "lucide-react";
import { useApp } from "../app/context";
import { Badge, Field, Heading, Table } from "../components/ui";
import { dateLabel, fullName, statusLabels, today } from "../utils";
export default function Reports() {
  const { simple } = useSecretaryMode();
  const { db, user, update, notify } = useApp();
  const [params] = useSearchParams();
  const [selectedDate, setDate] = useState(params.get("date") || today());
  const [period, setPeriod] = useState(params.get("period") === "1");
  const [endDate, setEndDate] = useState(params.get("date") || today());
  const archived = db.archives.find((a) => a.id === params.get("archive"));
  const date = archived?.date || selectedDate;
  const source = archived?.snapshot || db;
  const [department, setDepartment] = useState("");
  const [exporting, setExporting] = useState(false);
  const location = useLocation();
  const daily = location.pathname.endsWith("/daily");
  const range = period && !archived;
  const valid = Boolean(date && (!range || (endDate && endDate >= date)));
  const periodLabel = valid
    ? range
      ? `${dateLabel(date)} au ${dateLabel(endDate)}`
      : dateLabel(date)
    : "Sélectionnez une période valide";
  const rows = source.attendance.filter(
    (p) =>
      valid &&
      (range ? p.date >= date && p.date <= endDate : p.date === date) &&
      (!department ||
        source.agents.find((a) => a.id === p.agentId)?.departmentId ===
          department),
  );
  const head = [
    ...(range ? ["Date"] : []),
    "Agent",
    "Service",
    "Arrivée",
    "Départ",
    "Statut",
  ];
  const body = rows.map((p) => {
    const a = source.agents.find((a) => a.id === p.agentId);
    return [
      ...(range ? [dateLabel(p.date)] : []),
      fullName(a),
      source.departments.find((d) => d.id === a?.departmentId)?.name || "",
      p.arrivalAt || "—",
      p.departureAt || "—",
      statusLabels[p.status],
    ];
  });
  const download = async () => {
    if (exporting || !valid) return;
    setExporting(true);
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text(source.settings.organization, 14, 22);
      doc.setFontSize(10);
      doc.text(source.settings.address, 14, 30);
      doc.setFontSize(14);
      doc.text(`Fiche de présence - ${periodLabel}`, 14, 45);
      doc.setFontSize(10);
      doc.text(
        `${rows.length} relevés - ${department ? source.departments.find((d) => d.id === department)?.name : "Tous les services"}`,
        14,
        54,
      );
      autoTable(doc, {
        startY: 62,
        head: [head],
        body,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [34, 112, 87] },
        margin: { bottom: 25 },
        didDrawPage: () => {
          doc.setFontSize(9);
          doc.text(
            `Établi par ${archived?.author || user?.name} | Démonstration | Page ${doc.getNumberOfPages()}`,
            14,
            285,
          );
        },
      });
      doc.save(`presence-${date}${range ? `-${endDate}` : ""}.pdf`);
      notify("PDF téléchargé.");
    } catch {
      notify("Le PDF n’a pas pu être généré. Réessayez.", true);
    } finally {
      setExporting(false);
    }
  };
  return (
    <>
      <Heading
        eyebrow="DOCUMENTS"
        title={
          archived
            ? "Fiche archivée"
            : simple
              ? "Imprimer une fiche"
              : daily
                ? "Fiche journalière"
                : "Rapports"
        }
        subtitle={
          simple
            ? "Choisissez une période, puis imprimez les présences et les absences."
            : "Relevés journaliers et archives de présence"
        }
      >
       
        <button
          className="button primary export-button"
          aria-busy={exporting}
          disabled={!valid || exporting}
          onClick={download}
        >
          {exporting ? (
            <LoaderCircle className="busy-icon" size={16} />
          ) : (
            <Download size={16} />
          )}
          {exporting ? "Préparation du PDF…" : "Télécharger PDF"}
        </button>
      </Heading>
      <div className="filters">
        {!archived && (
          <Field label="Type de fiche">
            <select
              value={period ? "period" : "day"}
              onChange={(e) => setPeriod(e.target.value === "period")}
            >
              <option value="day">Une journée</option>
              <option value="period">Une période</option>
            </select>
          </Field>
        )}
        <Field label={range ? "Du" : "Date du rapport"}>
          <input
            type="date"
            required
            disabled={Boolean(archived)}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        {range && (
          <Field label="Au">
            <input
              type="date"
              required
              min={date}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </Field>
        )}
        <Field label="Service">
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          >
            <option value="">Tous les services</option>
            {source.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        {!simple && !range && (
          <button
            className="button"
            disabled={
              !date ||
              Boolean(archived) ||
              db.archives.some((a) => a.date === date)
            }
            onClick={() => {
              update((data) => {
                if (!data.archives.some((a) => a.date === date))
                  data.archives.unshift({
                    id: crypto.randomUUID(),
                    date,
                    at: new Date().toISOString(),
                    author: user!.name,
                    snapshot: structuredClone({
                      agents: data.agents,
                      attendance: data.attendance.filter(
                        (p) => p.date === date,
                      ),
                      departments: data.departments,
                      settings: data.settings,
                    }),
                  });
              });
              notify("Journée ajoutée aux archives.");
            }}
          >
            <Archive size={16} />
            Archiver la journée
          </button>
        )}
      </div>
      {!valid && (
        <p className="form-error" role="alert">
          Choisissez une date de fin égale ou postérieure à la date de début.
        </p>
      )}
      <section className="report-paper print-area">
        <div className="report-heading">
          <div>
            <span className="eyebrow">{source.settings.organization}</span>
            <h2>
              {range
                ? "Fiche de présence et d’absence"
                : "Fiche journalière de présence"}
            </h2>
            <p>{source.settings.address}</p>
          </div>
          <FileText size={30} />
        </div>
        <div className="report-meta">
          <strong>{periodLabel}</strong>
          <span>
            {rows.length} relevés ·{" "}
            {department
              ? source.departments.find((d) => d.id === department)?.name
              : "Tous les services"}
          </span>
        </div>
        {!simple && (
          <div className="report-stats">
            {Object.entries(statusLabels).map(([key, label]) => (
              <div key={key}>
                <strong>{rows.filter((p) => p.status === key).length}</strong>
                <span>
                  {label}
                  {key !== "LATE" &&
                  rows.filter((p) => p.status === key).length > 1
                    ? "s"
                    : ""}
                </span>
              </div>
            ))}
          </div>
        )}
        <Table
          pageSize={10000}
          headers={head}
          rows={rows.map((p, i) => [
            ...body[i].slice(0, -1),
            <Badge key="status" status={p.status} />,
          ])}
        />
        <div className="report-signatures">
          <div>
            Établi par<strong>{archived?.author || user?.name}</strong>
          </div>
          <div>
            Visa du responsable
            <span className="signature-line" />
          </div>
        </div>
        <p className="report-demo">
          Démonstration · Document établi à partir des données locales
        </p>
      </section>
      {!daily && !simple && (
        <section className="data-section archives">
          <div className="section-heading">
            <h2>Journées archivées</h2>
          </div>
          <Table
            headers={["JOURNÉE", "ARCHIVÉ PAR", "DATE DE CRÉATION", ""]}
            rows={db.archives.map((a) => [
              dateLabel(a.date),
              a.author,
              new Date(a.at).toLocaleDateString("fr-FR"),
              <Link
                key="detail"
                className="text-link"
                to={`/reports/daily?archive=${a.id}`}
              >
                Ouvrir la fiche
              </Link>,
            ])}
            empty="Aucune journée archivée"
          />
        </section>
      )}
    </>
  );
}
