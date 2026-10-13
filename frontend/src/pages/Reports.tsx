import { useState, useMemo } from "react";
import {
  Download,
  FileText,
  FileSpreadsheet,
  User,
  LoaderCircle,
  ChevronDown,
} from "lucide-react";
import { useApp } from "../app/context";
import { Heading, Field } from "../components/ui";
import { dateLabel, fullName, exportCsv } from "../utils";
import { useSecretaryMode } from "../app/secretaryMode";

/* ═══════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════ */
function currentYM() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function monthBounds(ym: string): [string, string] {
  const [y, m] = ym.split("-").map(Number);
  const start = `${ym}-01`;
  const end = new Date(y, m, 0).toISOString().slice(0, 10);
  return [start, end];
}
function presetBounds(preset: string): [string, string] {
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  if (preset === "3m") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 3);
    return [d.toISOString().slice(0, 10), end];
  }
  if (preset === "year") return [`${now.getFullYear()}-01-01`, end];
  // current month (default)
  return monthBounds(currentYM());
}
function fmtDuration(minutes: number) {
  if (!minutes) return "0 min";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h${m.toString().padStart(2, "0")}` : `${m} min`;
}

/* ═══════════════════════════════════════════════════════════════
   Tab 1 — Rapport Mensuel de Paie
   ═══════════════════════════════════════════════════════════════ */
function MonthlyPayrollPanel() {
  const { db, notify } = useApp();
  const [month, setMonth] = useState(currentYM());
  const [department, setDepartment] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);

  const [start, end] = monthBounds(month);

  const monthLabel = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${month}-15`));

  const rows = useMemo(() => {
    const agents = db.agents.filter(
      (a) => a.isActive && (!department || a.departmentId === department),
    );
    return agents.map((a) => {
      const records = db.attendance.filter(
        (p) => p.agentId === a.id && p.date >= start && p.date <= end,
      );
      const worked = records.filter((p) =>
        ["PRESENT", "LATE"].includes(p.status),
      ).length;
      const lateMin = records.reduce((s, p) => s + (p.lateMinutes || 0), 0);
      const absences = records.filter((p) => p.status === "ABSENT").length;
      const justified = records.filter((p) => p.status === "JUSTIFIED").length;
      const dept =
        db.departments.find((d) => d.id === a.departmentId)?.name ?? "—";
      return { agent: a, dept, worked, lateMin, absences, justified };
    });
  }, [db, start, end, department]);

  const deptName = department
    ? (db.departments.find((d) => d.id === department)?.name ?? "")
    : "Tous les services";

  /* ── CSV export ── */
  const handleCsv = () => {
    exportCsv(
      [
        ["Agent", "Service", "Jours travaillés", "Cumul retards", "Abs. injustifiées", "Abs. justifiées"],
        ...rows.map((r) => [
          fullName(r.agent),
          r.dept,
          String(r.worked),
          fmtDuration(r.lateMin),
          String(r.absences),
          String(r.justified),
        ]),
      ],
      `paie-${month}.csv`,
    );
    notify("CSV téléchargé.");
  };

  /* ── PDF export ── */
  const handlePdf = async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text(db.settings.organization, 14, 22);
      doc.setFontSize(10);
      doc.text(db.settings.address, 14, 30);
      doc.setFontSize(14);
      doc.text(`Rapport mensuel de paie — ${monthLabel}`, 14, 45);
      doc.setFontSize(10);
      doc.text(`${rows.length} agents · ${deptName}`, 14, 54);
      autoTable(doc, {
        startY: 62,
        head: [["Agent", "Service", "Jours trav.", "Retards", "Abs. inject.", "Abs. just."]],
        body: rows.map((r) => [
          fullName(r.agent),
          r.dept,
          r.worked,
          fmtDuration(r.lateMin),
          r.absences,
          r.justified,
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [34, 112, 87] },
        margin: { bottom: 25 },
        didDrawPage: () => {
          doc.setFontSize(9);
          doc.text(
            `Généré le ${new Date().toLocaleDateString("fr-FR")} · Démonstration · Page ${doc.getNumberOfPages()}`,
            14,
            285,
          );
        },
      });
      doc.save(`paie-${month}.pdf`);
      notify("PDF téléchargé.");
    } catch {
      notify("Le PDF n'a pas pu être généré.", true);
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="rp-panel">
      {/* description */}
      <p className="rp-panel-desc">
        Agrège les données de présence du mois sélectionné pour faciliter le
        calcul des salaires et l'export vers votre logiciel de paie.
      </p>

      {/* filters */}
      <div className="filters rp-filters">
        <Field label="Mois / Année">
          <input
            type="month"
            value={month}
            max={currentYM()}
            onChange={(e) => setMonth(e.target.value)}
          />
        </Field>
        <Field label="Service">
          <select value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">Tous les services</option>
            {db.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* summary table */}
      {rows.length > 0 ? (
        <div className="rp-table-wrap">
          <table className="rp-table">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Service</th>
                <th>Jours trav.</th>
                <th>Cumul retards</th>
                <th>Abs. injust.</th>
                <th>Abs. just.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.agent.id}>
                  <td className="rp-name">{fullName(r.agent)}</td>
                  <td>{r.dept}</td>
                  <td className="rp-num">{r.worked}</td>
                  <td className={`rp-num${r.lateMin > 0 ? " rp-warn" : ""}`}>
                    {fmtDuration(r.lateMin)}
                  </td>
                  <td className={`rp-num${r.absences > 0 ? " rp-danger" : ""}`}>
                    {r.absences}
                  </td>
                  <td className="rp-num">{r.justified}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rp-empty">Aucune donnée pour cette période.</p>
      )}

      {/* actions */}
      <div className="rp-actions">
        <button className="button" onClick={handleCsv} disabled={rows.length === 0}>
          <Download size={15} />
          Exporter CSV
        </button>
        <button
          className="button primary"
          onClick={handlePdf}
          disabled={rows.length === 0 || pdfBusy}
          aria-busy={pdfBusy}
        >
          {pdfBusy ? <LoaderCircle className="busy-icon" size={15} /> : <FileText size={15} />}
          {pdfBusy ? "Génération…" : "Télécharger PDF de synthèse"}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Tab 2 — Bilan d'Assiduité Agent
   ═══════════════════════════════════════════════════════════════ */
function IndividualPanel() {
  const { db, notify } = useApp();
  const [agentId, setAgentId] = useState("");
  const [preset, setPreset] = useState("month");
  const [pdfBusy, setPdfBusy] = useState(false);

  const [start, end] = useMemo(() => presetBounds(preset), [preset]);
  const agent = db.agents.find((a) => a.id === agentId);

  const records = useMemo(
    () =>
      agentId
        ? db.attendance.filter(
            (p) => p.agentId === agentId && p.date >= start && p.date <= end,
          )
        : [],
    [db, agentId, start, end],
  );

  const totalDays = records.length;
  const worked = records.filter((p) => ["PRESENT", "LATE"].includes(p.status)).length;
  const absences = records.filter((p) => p.status === "ABSENT").length;
  const justified = records.filter((p) => p.status === "JUSTIFIED").length;
  const lateCount = records.filter((p) => p.status === "LATE").length;
  const totalLateMin = records.reduce((s, p) => s + (p.lateMinutes || 0), 0);
  const presenceRate = totalDays > 0 ? Math.round((worked / totalDays) * 100) : 0;
  const dept = db.departments.find((d) => d.id === agent?.departmentId)?.name ?? "—";

  const handlePdf = async () => {
    if (!agent || pdfBusy) return;
    setPdfBusy(true);
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text(db.settings.organization, 14, 22);
      doc.setFontSize(10);
      doc.text(db.settings.address, 14, 30);
      doc.setFontSize(14);
      doc.text("Bilan d'assiduité individuel", 14, 45);
      doc.setFontSize(11);
      doc.text(`Agent : ${fullName(agent)} · ${dept}`, 14, 55);
      doc.text(`Période : ${dateLabel(start)} — ${dateLabel(end)}`, 14, 63);
      doc.setFontSize(10);
      doc.text(
        `Taux de présence : ${presenceRate}%   |   Retards cumulés : ${fmtDuration(totalLateMin)}   |   Absences : ${absences}   |   Justifiées : ${justified}`,
        14,
        75,
      );
      autoTable(doc, {
        startY: 84,
        head: [["Date", "Arrivée", "Départ", "Statut", "Retard"]],
        body: records.map((p) => [
          dateLabel(p.date),
          p.arrivalAt || "—",
          p.departureAt || "—",
          { PRESENT: "Présent", LATE: "En retard", ABSENT: "Absent", JUSTIFIED: "Justifié" }[p.status],
          fmtDuration(p.lateMinutes || 0),
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [34, 112, 87] },
        margin: { bottom: 25 },
        didDrawPage: () => {
          doc.setFontSize(9);
          doc.text(
            `Généré le ${new Date().toLocaleDateString("fr-FR")} · Démonstration · Page ${doc.getNumberOfPages()}`,
            14,
            285,
          );
        },
      });
      doc.save(`assiduité-${fullName(agent).replace(/ /g, "_")}-${start}.pdf`);
      notify("Fiche PDF téléchargée.");
    } catch {
      notify("Le PDF n'a pas pu être généré.", true);
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="rp-panel">
      <p className="rp-panel-desc">
        Génère le bilan complet de ponctualité d'un agent sur la période
        choisie — utile pour les entretiens individuels ou les rappels à
        l'ordre.
      </p>

      {/* filters */}
      <div className="filters rp-filters">
        <Field label="Agent">
          <div className="rp-select-wrap">
            <select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
              <option value="">Sélectionner un agent…</option>
              {db.agents
                .filter((a) => a.isActive)
                .sort((a, b) => fullName(a).localeCompare(fullName(b)))
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {fullName(a)}
                  </option>
                ))}
            </select>
            <ChevronDown size={13} className="rp-select-icon" aria-hidden="true" />
          </div>
        </Field>
        <Field label="Période">
          <select value={preset} onChange={(e) => setPreset(e.target.value)}>
            <option value="month">Mois en cours</option>
            <option value="3m">3 derniers mois</option>
            <option value="year">Année en cours</option>
          </select>
        </Field>
      </div>

      {/* KPIs */}
      {agent ? (
        <>
          <div className="rp-kpis">
            <div className="rp-kpi">
              <strong>{presenceRate}%</strong>
              <span>Taux de présence</span>
            </div>
            <div className="rp-kpi">
              <strong>{worked}</strong>
              <span>Jours travaillés</span>
            </div>
            <div className={`rp-kpi${totalLateMin > 0 ? " rp-kpi-warn" : ""}`}>
              <strong>{fmtDuration(totalLateMin)}</strong>
              <span>Retards cumulés ({lateCount} fois)</span>
            </div>
            <div className={`rp-kpi${absences > 0 ? " rp-kpi-danger" : ""}`}>
              <strong>{absences}</strong>
              <span>Abs. injustifiées</span>
            </div>
            <div className="rp-kpi">
              <strong>{justified}</strong>
              <span>Abs. justifiées</span>
            </div>
          </div>

          {records.length === 0 && (
            <p className="rp-empty">Aucune donnée sur cette période.</p>
          )}
        </>
      ) : (
        <p className="rp-empty">Sélectionnez un agent pour afficher son bilan.</p>
      )}

      {/* action */}
      <div className="rp-actions">
        <button
          className="button primary"
          onClick={handlePdf}
          disabled={!agent || records.length === 0 || pdfBusy}
          aria-busy={pdfBusy}
        >
          {pdfBusy ? (
            <LoaderCircle className="busy-icon" size={15} />
          ) : (
            <FileText size={15} />
          )}
          {pdfBusy ? "Génération…" : "Générer la fiche PDF"}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Root — tabbed container
   ═══════════════════════════════════════════════════════════════ */
const TABS = [
  { id: "payroll", label: "Rapport mensuel de paie", icon: <FileSpreadsheet size={15} /> },
  { id: "individual", label: "Bilan d'assiduité agent", icon: <User size={15} /> },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function Reports() {
  const { simple } = useSecretaryMode();
  const [activeTab, setActiveTab] = useState<TabId>("payroll");

  return (
    <>
      <Heading
        eyebrow="RH & PAIE"
        title="Rapports"
        subtitle="Consolidation et export des données de présence pour la paie et les entretiens RH."
      />

      {simple ? (
        <p className="rp-simple-notice">
          Les rapports sont réservés aux coordinateurs. Contactez votre
          responsable pour en obtenir un.
        </p>
      ) : (
        <div className="rp-container">
          {/* tab bar */}
          <div className="rp-tabs" role="tablist" aria-label="Sections des rapports">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={activeTab === tab.id}
                aria-controls={`panel-${tab.id}`}
                className={`rp-tab${activeTab === tab.id ? " active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* panels */}
          <div className="rp-panels">
            <div role="tabpanel" id="panel-payroll" aria-labelledby="tab-payroll" hidden={activeTab !== "payroll"}>
              <MonthlyPayrollPanel />
            </div>
            <div role="tabpanel" id="panel-individual" aria-labelledby="tab-individual" hidden={activeTab !== "individual"}>
              <IndividualPanel />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
