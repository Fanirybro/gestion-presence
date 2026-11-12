import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence } from "motion/react";
import { presencesApi } from "../services/presences";
import {
  FileText,
  FileSpreadsheet,
  Users,
  Percent,
  Clock3,
  UserX,
  LoaderCircle,
  TrendingUp,
  TableProperties,
  Calendar,
  Building2,
  X,
  RotateCcw,
} from "lucide-react";
import { useApp } from "../app/context";
import { Heading, Table } from "../components/ui";
import { fullName } from "../utils";
import { hasPermission } from "../types";
import { ModalExportFichePresence } from "../components/ModalExportFichePresence";

function currentYM() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getDaysInMonth(ym: string): string[] {
  const [y, m] = ym.split("-").map(Number);
  const totalDays = new Date(y, m, 0).getDate();
  const days: string[] = [];
  for (let d = 1; d <= totalDays; d++) {
    days.push(`${ym}-${String(d).padStart(2, "0")}`);
  }
  return days;
}

function fmtDuration(minutes: number) {
  if (!minutes) return "0 min";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h${m.toString().padStart(2, "0")}` : `${m} min`;
}

import {
  GraphiqueTendancePresence,
  COULEURS_DEPARTEMENTS,
  type SerieTendance,
} from "./reports/GraphiqueTendancePresence";
import { exporterRapportPdf } from "./reports/exportPdfRapport";

type ReportTab = "summary" | "payroll";

export default function Reports() {
  const { db, user, notify, personnelLoading } = useApp();

  const [activeTab, setActiveTab] = useState<ReportTab>("summary");
  const [month, setMonth] = useState(currentYM());
  const [department, setDepartment] = useState("");
  const [showDeptComparison, setShowDeptComparison] = useState(false);
  const [hoveredDayIdx, setHoveredDayIdx] = useState<number | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [showFicheModal, setShowFicheModal] = useState(false);

  // Month information
  const daysInMonth = useMemo(() => getDaysInMonth(month), [month]);
  const monthStart = `${month}-01`;
  const monthEnd = daysInMonth[daysInMonth.length - 1];

  const monthLabel = useMemo(() => {
    return new Intl.DateTimeFormat("fr-FR", {
      month: "long",
      year: "numeric",
    }).format(new Date(`${month}-15`));
  }, [month]);

  // Filtered Agents
  const targetAgents = useMemo(() => {
    return db.agents.filter(
      (a) => a.isActive && (!department || a.departmentId === department),
    );
  }, [db.agents, department]);

  const targetAgentIds = useMemo(
    () => new Set(targetAgents.map((a) => a.id)),
    [targetAgents],
  );

  const { data: serverPresences, isPending: presencesPending } = useQuery({
    queryKey: ["presences", monthStart, monthEnd],
    queryFn: () => presencesApi.list(monthStart, monthEnd),
    enabled: Boolean(monthStart && monthEnd),
  });

  const attendanceSource = serverPresences?.attendance ?? db.attendance;

  // Filtered Attendance for target agents in month
  const monthAttendance = useMemo(() => {
    return attendanceSource.filter(
      (p) => targetAgentIds.has(p.agentId) && p.date >= monthStart && p.date <= monthEnd,
    );
  }, [attendanceSource, targetAgentIds, monthStart, monthEnd]);

  // Active Departments
  const activeDepartments = useMemo(() => {
    const idsWithAgents = new Set(db.agents.filter((a) => a.isActive).map((a) => a.departmentId));
    return db.departments.filter((d) => idsWithAgents.has(d.id));
  }, [db.agents, db.departments]);

  // données par agent
  const tableRows = useMemo(() => {
    return targetAgents.map((a) => {
      const records = monthAttendance.filter((p) => p.agentId === a.id);
      const worked = records.filter((p) => ["PRESENT", "LATE"].includes(p.status)).length;
      const lateMin = records.reduce((s, p) => s + (p.lateMinutes || 0), 0);
      const absences = records.filter((p) => p.status === "ABSENT").length;
      const justified = records.filter((p) => p.status === "JUSTIFIED").length;
      const deptName = db.departments.find((d) => d.id === a.departmentId)?.name ?? "—";
      return { agent: a, dept: deptName, worked, lateMin, absences, justified };
    });
  }, [targetAgents, monthAttendance, db.departments]);

  // indicateurs globaux
  const totalEffectif = targetAgents.length;
  const totalRetardsMin = useMemo(() => {
    return monthAttendance.reduce((sum, p) => sum + (p.lateMinutes || 0), 0);
  }, [monthAttendance]);

  const totalAbsences = useMemo(() => {
    return monthAttendance.filter((p) => p.status === "ABSENT").length;
  }, [monthAttendance]);

  const globalPresenceRate = useMemo(() => {
    const presentRecords = monthAttendance.filter((p) => ["PRESENT", "LATE"].includes(p.status)).length;
    const totalExpected = monthAttendance.length;
    if (totalExpected === 0) return 0;
    return Math.round((presentRecords / totalExpected) * 100);
  }, [monthAttendance]);

  // calcul des tendances
  const trendSeries = useMemo<SerieTendance[]>(() => {
    if (!showDeptComparison) {
      // Single overall rate
      const points = daysInMonth.map((dayStr) => {
        const dayRecords = monthAttendance.filter((p) => p.date === dayStr);
        if (dayRecords.length === 0) return 0;
        const presentCount = dayRecords.filter((p) => ["PRESENT", "LATE"].includes(p.status)).length;
        return Math.round((presentCount / dayRecords.length) * 100);
      });

      return [
        {
          id: "global",
          name: department
            ? (db.departments.find((d) => d.id === department)?.name ?? "Service sélectionné")
            : "Tous les services",
          color: "#227057",
          points,
        },
      ];
    } else {
      // Multi-department comparison lines
      return activeDepartments.map((dept, idx) => {
        const deptAgents = new Set(
          db.agents.filter((a) => a.isActive && a.departmentId === dept.id).map((a) => a.id),
        );
        const points = daysInMonth.map((dayStr) => {
          const dayRecords = db.attendance.filter(
            (p) => deptAgents.has(p.agentId) && p.date === dayStr,
          );
          if (dayRecords.length === 0) return 0;
          const presentCount = dayRecords.filter((p) => ["PRESENT", "LATE"].includes(p.status)).length;
          return Math.round((presentCount / dayRecords.length) * 100);
        });

        return {
          id: dept.id,
          name: dept.name,
          color: COULEURS_DEPARTEMENTS[idx % COULEURS_DEPARTEMENTS.length],
          points,
        };
      });
    }
  }, [showDeptComparison, daysInMonth, monthAttendance, department, db.departments, activeDepartments, db.agents, db.attendance]);

  // Actions
  const handleExportPdf = async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      const orgName = db.settings.organization || "Présence RH";
      const orgAddress = db.settings.address || "";
      const deptFilterLabel = department
        ? (db.departments.find((d) => d.id === department)?.name ?? "")
        : "Tous les services";

      await exporterRapportPdf({
        nomOrganisation: orgName,
        adresseOrganisation: orgAddress,
        mois: month,
        libelleMois: monthLabel,
        libelleFiltreDepartement: deptFilterLabel,
        effectifTotal: totalEffectif,
        tauxPresenceGlobal: globalPresenceRate,
        cumulRetardsMin: totalRetardsMin,
        totalAbsences,
        joursDuMois: daysInMonth,
        seriesTendance: trendSeries,
        lignesTableau: tableRows,
        formaterDuree: fmtDuration,
      });
      notify("Rapport PDF généré avec succès.");
    } catch {
      notify("Échec de génération du PDF.", true);
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <>
      <Heading
        eyebrow="RH & PAIE"
        title="Rapports"
        subtitle="Agrégation des présences, indicateurs d'assiduité et préparation de la paie."
      >
        {hasPermission(user, "reports_print") && (
          <div className="rp-header-actions">
            <button
              className="button"
              onClick={() => setShowFicheModal(true)}
              title="Générer une fiche de présence officielle (Portrait ou Paysage)"
            >
              <FileSpreadsheet size={15} />
              <span>Imprimer une fiche de présence</span>
            </button>
            <button
              className="button primary"
              onClick={handleExportPdf}
              disabled={tableRows.length === 0 || pdfBusy}
              aria-busy={pdfBusy}
              title="Générer et télécharger le rapport officiel PDF"
            >
              {pdfBusy ? <LoaderCircle className="busy-icon" size={15} /> : <FileText size={15} />}
              <span>{pdfBusy ? "Génération…" : "Télécharger Rapport PDF"}</span>
            </button>
          </div>
        )}
      </Heading>

      <div className="rp-view-clean">
          {/* 1. Global Filter Toolbar (Unified Capsule Bar) */}
          <section aria-label="Filtres du rapport" className="unified-filter-bar">
            {/* 1. Période (Mois / Année) */}
            <div className="unified-filter-segment segment-date" style={{ flex: 1, minWidth: 180 }}>
              <Calendar size={16} className="segment-icon" aria-hidden="true" />
              <div className="segment-input-group">
                <span className="segment-label">Période (Mois / Année)</span>
                <input
                  type="month"
                  value={month}
                  max={currentYM()}
                  onChange={(e) => setMonth(e.target.value)}
                  className="unified-date-input"
                  aria-label="Période (Mois / Année)"
                />
              </div>
            </div>

            <div className="unified-filter-divider" aria-hidden="true" />

            {/* 2. Service / Département */}
            <div className="unified-filter-segment segment-dept" style={{ flex: 1.3, minWidth: 200 }}>
              <Building2 size={16} className="segment-icon" aria-hidden="true" />
              <div className="segment-input-group">
                <span className="segment-label">Service / Département</span>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="unified-select"
                  aria-label="Service / Département"
                >
                  <option value="">Tous les services</option>
                  {db.departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              {department && (
                <button
                  type="button"
                  className="segment-clear-btn"
                  onClick={() => setDepartment("")}
                  title="Effacer le filtre service"
                  aria-label="Effacer le filtre service"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {(department || month !== currentYM()) && (
              <>
                <div className="unified-filter-divider" aria-hidden="true" />
                <button
                  type="button"
                  className="unified-reset-btn"
                  title="Réinitialiser les filtres"
                  onClick={() => {
                    setMonth(currentYM());
                    setDepartment("");
                  }}
                >
                  <RotateCcw size={13} />
                  <span>Réinitialiser</span>
                </button>
              </>
            )}
          </section>

          {/* 2. KPI Metrics Flat Row */}
          <div className="rp-metrics-row">
            <div className="rp-metric-cell">
              <span className="rp-metric-label">
                <Users size={14} /> Total effectif
              </span>
              <strong className="rp-metric-value">{totalEffectif}</strong>
              <small className="rp-metric-sub">{department ? "Dans ce service" : "Agents actifs"}</small>
            </div>

            <div className="rp-metric-cell">
              <span className="rp-metric-label">
                <Percent size={14} /> Taux de présence
              </span>
              <strong className="rp-metric-value">{globalPresenceRate}%</strong>
              <small className="rp-metric-sub">Moyenne du mois</small>
            </div>

            <div className="rp-metric-cell">
              <span className="rp-metric-label">
                <Clock3 size={14} /> Cumul des retards
              </span>
              <strong className={`rp-metric-value ${totalRetardsMin > 0 ? "warn" : ""}`}>
                {fmtDuration(totalRetardsMin)}
              </strong>
              <small className="rp-metric-sub">Sur la période</small>
            </div>

            <div className="rp-metric-cell">
              <span className="rp-metric-label">
                <UserX size={14} /> Absences totales
              </span>
              <strong className={`rp-metric-value ${totalAbsences > 0 ? "danger" : ""}`}>
                {totalAbsences}
              </strong>
              <small className="rp-metric-sub">Jours non justifiés</small>
            </div>
          </div>

          {/* 3. Clean Tabs Navigation */}
          <div className="profile-clean-tabs" role="tablist" aria-label="Vues des rapports">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "summary"}
              aria-controls="rp-panel-summary"
              id="rp-tab-summary"
              className={`profile-tab-item ${activeTab === "summary" ? "active" : ""}`}
              onClick={() => setActiveTab("summary")}
            >
              <TrendingUp size={15} />
              <span>Évolution &amp; Assiduité</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "payroll"}
              aria-controls="rp-panel-payroll"
              id="rp-tab-payroll"
              className={`profile-tab-item ${activeTab === "payroll" ? "active" : ""}`}
              onClick={() => setActiveTab("payroll")}
            >
              <TableProperties size={15} />
              <span>Récapitulatif de Paie ({tableRows.length})</span>
            </button>
          </div>

          {/* Tab 1: Évolution de l'assiduité sur le mois */}
          {activeTab === "summary" && (
            <section
              id="rp-panel-summary"
              role="tabpanel"
              aria-labelledby="rp-tab-summary"
              className="settings-section rp-section-clean"
            >
              <div className="rp-section-header">
                <div>
                  <h2>Évolution de l'assiduité</h2>
                  <p className="rp-section-subtitle">
                    Taux de présence journalier {hoveredDayIdx !== null ? `au ${daysInMonth[hoveredDayIdx]}` : `pour ${monthLabel}`}
                  </p>
                </div>

                <label className="rp-checkbox-label">
                  <input
                    type="checkbox"
                    checked={showDeptComparison}
                    onChange={(e) => setShowDeptComparison(e.target.checked)}
                  />
                  <span>Comparer par département</span>
                </label>
              </div>

              {/* Chart Legend */}
              <div className="rp-chart-legend">
                {trendSeries.map((s) => (
                  <div key={s.id} className="rp-legend-item">
                    <span className="rp-legend-color" style={{ backgroundColor: s.color }} />
                    <span>{s.name}</span>
                    {hoveredDayIdx !== null && (
                      <strong style={{ color: s.color }}>
                        {s.points[hoveredDayIdx]}%
                      </strong>
                    )}
                  </div>
                ))}
              </div>

              {/* SVG Line Chart */}
              <GraphiqueTendancePresence
                jours={daysInMonth}
                listeSeries={trendSeries}
                indexJourSelectionne={hoveredDayIdx}
                surSelectionJour={setHoveredDayIdx}
              />
            </section>
          )}

          {/* Tab 2: Tableau récapitulatif de paie */}
          {activeTab === "payroll" && (
            <section
              id="rp-panel-payroll"
              role="tabpanel"
              aria-labelledby="rp-tab-payroll"
              className="settings-section rp-section-clean"
            >
              <div className="rp-section-header">
                <div>
                  <h2>Tableau Récapitulatif de Paie</h2>
                  <p className="rp-section-subtitle">
                    Données cumulées par employé pour la clôture salariale ({tableRows.length} employés)
                  </p>
                </div>
              </div>

              <Table
                loading={presencesPending || personnelLoading}
                pageSize={8}
                headers={[
                  "AGENT",
                  "SERVICE",
                  "JOURS TRAVAILLÉS",
                  "CUMUL RETARDS",
                  "ABS. INJUSTIFIÉES",
                  "ABS. JUSTIFIÉES",
                ]}
                empty="Aucun agent ou donnée de présence trouvé pour cette sélection."
                rowKeys={tableRows.map((r) => r.agent.id)}
                rows={tableRows.map((r) => [
                  <div key="agent" className="agent-col">
                    <strong>{fullName(r.agent)}</strong>
                    <small style={{ display: "block", color: "#64748b", fontSize: "11px" }}>
                      {r.agent.position || "Employé"}
                    </small>
                  </div>,
                  <span key="dept" style={{ fontWeight: 500, color: "#2d3748" }}>{r.dept}</span>,
                  <span key="worked" style={{ fontWeight: 600 }}>
                    {r.worked} j
                  </span>,
                  <span
                    key="late"
                    style={{
                      color: r.lateMin > 0 ? "#b45309" : undefined,
                      fontWeight: r.lateMin > 0 ? 600 : undefined,
                    }}
                  >
                    {fmtDuration(r.lateMin)}
                  </span>,
                  <span
                    key="absences"
                    style={{
                      color: r.absences > 0 ? "#dc2626" : undefined,
                      fontWeight: r.absences > 0 ? 600 : undefined,
                    }}
                  >
                    {r.absences} j
                  </span>,
                  <span key="justified" style={{ fontWeight: 500 }}>
                    {r.justified} j
                  </span>,
                ])}
              />
            </section>
          )}
        </div>

      <AnimatePresence>
        {showFicheModal && (
          <ModalExportFichePresence
            defaultDivisionId={department}
            onClose={() => setShowFicheModal(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
