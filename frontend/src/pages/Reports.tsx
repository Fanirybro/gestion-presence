import { useState, useMemo } from "react";
import {
  FileText,
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
import { Heading } from "../components/ui";
import { fullName } from "../utils";
import { hasPermission } from "../types";

/* ═══════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════ */
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

// Palette for department comparison lines
const DEPT_COLORS = [
  "#227057", // Emerald Primary
  "#2563eb", // Blue
  "#d97706", // Amber
  "#9333ea", // Purple
  "#e11d48", // Rose
  "#0891b2", // Cyan
  "#4f46e5", // Indigo
];

/* ═══════════════════════════════════════════════════════════════
   Interactive SVG Line Chart Component
   ═══════════════════════════════════════════════════════════════ */
interface TrendSeries {
  id: string;
  name: string;
  color: string;
  points: number[]; // rates per day (0-100)
}

function AttendanceTrendChart({
  days,
  seriesList,
  selectedDayIndex,
  onSelectDay,
}: {
  days: string[];
  seriesList: TrendSeries[];
  selectedDayIndex: number | null;
  onSelectDay: (index: number | null) => void;
}) {
  const width = 800;
  const height = 240;
  const padding = { top: 20, right: 30, bottom: 35, left: 45 };

  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const numDays = days.length;
  const getX = (i: number) => padding.left + (numDays > 1 ? (i / (numDays - 1)) * chartW : chartW / 2);
  const getY = (val: number) => padding.top + chartH - (val / 100) * chartH;

  const yTicks = [0, 25, 50, 75, 100];

  return (
    <div className="rp-chart-container">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="rp-chart-svg"
        preserveAspectRatio="none"
        onMouseLeave={() => onSelectDay(null)}
      >
        <defs>
          {seriesList.map((s) => (
            <linearGradient key={`grad-${s.id}`} id={`grad-${s.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0.0" />
            </linearGradient>
          ))}
        </defs>

        {/* Y-axis gridlines & labels */}
        {yTicks.map((tick) => {
          const y = getY(tick);
          return (
            <g key={tick} className="rp-chart-grid">
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#e4e9e5" strokeDasharray="3 3" />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#8f9991">
                {tick}%
              </text>
            </g>
          );
        })}

        {/* X-axis labels (every 5 days + last day) */}
        {days.map((dayStr, i) => {
          const dayNum = i + 1;
          const showLabel = dayNum === 1 || dayNum % 5 === 0 || dayNum === numDays;
          if (!showLabel) return null;
          const x = getX(i);
          return (
            <text key={dayStr} x={x} y={height - 12} textAnchor="middle" fontSize="10" fill="#8f9991">
              {dayNum}
            </text>
          );
        })}

        {/* Series area & line */}
        {seriesList.map((s) => {
          const pointsStr = s.points.map((pt, i) => `${getX(i)},${getY(pt)}`).join(" ");
          const areaStr = `${pointsStr} ${getX(numDays - 1)},${getY(0)} ${getX(0)},${getY(0)}`;

          return (
            <g key={s.id}>
              {/* Shaded area (only if single main series or active) */}
              {seriesList.length === 1 && (
                <polygon points={areaStr} fill={`url(#grad-${s.id})`} />
              )}
              {/* Trend line */}
              <polyline
                fill="none"
                stroke={s.color}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={pointsStr}
              />
              {/* Small point markers */}
              {s.points.map((pt, i) => (
                <circle
                  key={i}
                  cx={getX(i)}
                  cy={getY(pt)}
                  r={selectedDayIndex === i ? 5 : 2.5}
                  fill={selectedDayIndex === i ? "#fff" : s.color}
                  stroke={s.color}
                  strokeWidth="2"
                />
              ))}
            </g>
          );
        })}

        {/* Active hover crosshair vertical line */}
        {selectedDayIndex !== null && (
          <line
            x1={getX(selectedDayIndex)}
            y1={padding.top}
            x2={getX(selectedDayIndex)}
            y2={height - padding.bottom}
            stroke="#227057"
            strokeWidth="1.5"
            strokeDasharray="2 2"
          />
        )}

        {/* Transparent hover capture rects for each day */}
        {days.map((_, i) => {
          const x = getX(i);
          const colW = chartW / numDays;
          return (
            <rect
              key={i}
              x={x - colW / 2}
              y={padding.top}
              width={colW}
              height={chartH}
              fill="transparent"
              style={{ cursor: "crosshair" }}
              onMouseEnter={() => onSelectDay(i)}
            />
          );
        })}
      </svg>
    </div>
  );
}

/**
 * Offscreen Canvas renderer for generating crisp, high-resolution chart images for PDF reports
 */
function generateTrendChartImage(
  days: string[],
  seriesList: TrendSeries[],
  globalRate: number,
): string {
  try {
    const canvas = document.createElement("canvas");
    const dpr = 2;
    const w = 900;
    const h = 270;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);

    const padding = { top: 32, right: 35, bottom: 42, left: 52 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;
    const numDays = days.length;

    const getX = (i: number) =>
      padding.left + (numDays > 1 ? (i / (numDays - 1)) * chartW : chartW / 2);
    const getY = (val: number) =>
      padding.top + chartH - (Math.max(0, Math.min(100, val)) / 100) * chartH;

    // Gridlines & Y-axis labels
    const yTicks = [0, 25, 50, 75, 100];
    ctx.strokeStyle = "#e8edea";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.fillStyle = "#7c8981";
    ctx.font = "11px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    for (const tick of yTicks) {
      const y = getY(tick);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();

      ctx.fillText(`${tick}%`, padding.left - 10, y);
    }
    ctx.setLineDash([]);

    // Reference average line if single series and rate > 0
    if (seriesList.length === 1 && globalRate > 0) {
      const avgY = getY(globalRate);
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(padding.left, avgY);
      ctx.lineTo(w - padding.right, avgY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "#047857";
      ctx.font = "bold 10px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`Moyenne : ${globalRate}%`, padding.left + 8, avgY - 8);
    }

    // X-axis labels (days)
    ctx.fillStyle = "#7c8981";
    ctx.font = "11px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    days.forEach((_, i) => {
      const dayNum = i + 1;
      const showLabel = dayNum === 1 || dayNum % 5 === 0 || dayNum === numDays;
      if (showLabel) {
        ctx.fillText(String(dayNum), getX(i), h - padding.bottom + 10);
      }
    });

    // Draw series
    for (const s of seriesList) {
      if (!s.points.length) continue;

      // Shaded area under curve (if single series)
      if (seriesList.length === 1) {
        const grad = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
        grad.addColorStop(0, "rgba(34, 112, 87, 0.20)");
        grad.addColorStop(1, "rgba(34, 112, 87, 0.01)");

        ctx.beginPath();
        ctx.moveTo(getX(0), getY(s.points[0]));
        for (let i = 1; i < numDays; i++) {
          ctx.lineTo(getX(i), getY(s.points[i]));
        }
        ctx.lineTo(getX(numDays - 1), getY(0));
        ctx.lineTo(getX(0), getY(0));
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Trend stroke
      ctx.beginPath();
      ctx.moveTo(getX(0), getY(s.points[0]));
      for (let i = 1; i < numDays; i++) {
        ctx.lineTo(getX(i), getY(s.points[i]));
      }
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();

      // Data point nodes
      for (let i = 0; i < numDays; i++) {
        const cx = getX(i);
        const cy = getY(s.points[i]);
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // Legend
    if (seriesList.length > 1) {
      let legendX = w - padding.right;
      ctx.font = "11px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (let idx = seriesList.length - 1; idx >= 0; idx--) {
        const s = seriesList[idx];
        const textWidth = ctx.measureText(s.name).width;
        ctx.fillStyle = "#2d3832";
        ctx.fillText(s.name, legendX, 16);

        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(legendX - textWidth - 10, 16, 4, 0, Math.PI * 2);
        ctx.fill();

        legendX -= textWidth + 28;
      }
    } else if (seriesList.length === 1) {
      const s = seriesList[0];
      ctx.font = "11px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      const legendText = `${s.name} (${globalRate}%)`;
      const textWidth = ctx.measureText(legendText).width;
      const lx = w - padding.right;

      ctx.fillStyle = "#2d3832";
      ctx.fillText(legendText, lx, 16);

      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(lx - textWidth - 10, 16, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    return canvas.toDataURL("image/png");
  } catch (err) {
    console.warn("Failed to generate chart image for PDF:", err);
    return "";
  }
}

type ReportTab = "summary" | "payroll";

/* ═══════════════════════════════════════════════════════════════
   Main Reports Page Component
   ═══════════════════════════════════════════════════════════════ */
export default function Reports() {
  const { db, user, notify } = useApp();

  const [activeTab, setActiveTab] = useState<ReportTab>("summary");
  const [month, setMonth] = useState(currentYM());
  const [department, setDepartment] = useState("");
  const [showDeptComparison, setShowDeptComparison] = useState(false);
  const [hoveredDayIdx, setHoveredDayIdx] = useState<number | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

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

  // Filtered Attendance for target agents in month
  const monthAttendance = useMemo(() => {
    return db.attendance.filter(
      (p) => targetAgentIds.has(p.agentId) && p.date >= monthStart && p.date <= monthEnd,
    );
  }, [db.attendance, targetAgentIds, monthStart, monthEnd]);

  // Active Departments
  const activeDepartments = useMemo(() => {
    const idsWithAgents = new Set(db.agents.filter((a) => a.isActive).map((a) => a.departmentId));
    return db.departments.filter((d) => idsWithAgents.has(d.id));
  }, [db.agents, db.departments]);

  // 1. Table Data per Agent
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

  // 2. Global KPIs
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

  // 3. Trend Series Calculation
  const trendSeries = useMemo<TrendSeries[]>(() => {
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
          color: DEPT_COLORS[idx % DEPT_COLORS.length],
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
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);

      const doc = new jsPDF();
      const orgName = db.settings.organization || "Présence RH";
      const orgAddress = db.settings.address || "";
      const deptFilterLabel = department
        ? (db.departments.find((d) => d.id === department)?.name ?? "")
        : "Tous les services";

      // Header
      doc.setFontSize(16);
      doc.setTextColor(34, 112, 87);
      doc.text(orgName, 14, 18);

      doc.setFontSize(9);
      doc.setTextColor(120, 130, 125);
      if (orgAddress) doc.text(orgAddress, 14, 24);

      doc.setFontSize(14);
      doc.setTextColor(30, 40, 35);
      doc.text(`Rapport de Paie & Synthèse RH — ${monthLabel}`, 14, 36);

      doc.setFontSize(10);
      doc.setTextColor(90, 100, 95);
      doc.text(`Filtre : ${deptFilterLabel} | Date d'émission : ${new Date().toLocaleDateString("fr-FR")}`, 14, 43);

      // Draw KPI Box
      doc.setDrawColor(220, 230, 225);
      doc.setFillColor(245, 248, 246);
      doc.roundedRect(14, 48, 182, 22, 2, 2, "FD");

      doc.setFontSize(9);
      doc.setTextColor(90, 100, 95);
      doc.text("EFFECTIF TOTAL", 20, 56);
      doc.text("TAUX DE PRÉSENCE", 65, 56);
      doc.text("CUMUL RETARDS", 115, 56);
      doc.text("ABSENCES TOTALES", 160, 56);

      doc.setFontSize(12);
      doc.setTextColor(30, 40, 35);
      doc.text(String(totalEffectif), 20, 64);
      doc.text(`${globalPresenceRate}%`, 65, 64);
      doc.text(fmtDuration(totalRetardsMin), 115, 64);
      doc.text(String(totalAbsences), 160, 64);

      // Section: Graphique Évaluation de l'assiduité
      let tableStartY = 78;
      const chartImg = generateTrendChartImage(daysInMonth, trendSeries, globalPresenceRate);
      if (chartImg) {
        doc.setFontSize(11);
        doc.setTextColor(34, 112, 87);
        doc.text("Évaluation de l'assiduité — Taux de présence journalier", 14, 78);

        doc.setFontSize(8.5);
        doc.setTextColor(120, 130, 125);
        doc.text("Évolution quotidienne du taux de présence sur l'ensemble du mois", 14, 82.5);

        // Chart container frame
        doc.setDrawColor(225, 232, 228);
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(14, 85, 182, 54, 2, 2, "FD");

        doc.addImage(chartImg, "PNG", 14.5, 85.5, 181, 53);

        // Section: Tableau Récapitulatif
        doc.setFontSize(11);
        doc.setTextColor(34, 112, 87);
        doc.text("Bilan Détaillé par Agent", 14, 147);

        tableStartY = 151;
      } else {
        doc.setFontSize(11);
        doc.setTextColor(34, 112, 87);
        doc.text("Bilan Détaillé par Agent", 14, 78);
        tableStartY = 82;
      }

      autoTable(doc, {
        startY: tableStartY,
        head: [["Agent", "Service", "Jours trav.", "Cumul retards", "Abs. injust.", "Abs. just."]],
        body: tableRows.map((r) => [
          fullName(r.agent),
          r.dept,
          r.worked,
          fmtDuration(r.lateMin),
          r.absences,
          r.justified,
        ]),
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: [34, 112, 87], textColor: 255 },
        alternateRowStyles: { fillColor: [248, 250, 249] },
        margin: { bottom: 25 },
        didDrawPage: () => {
          doc.setFontSize(8);
          doc.setTextColor(140, 145, 140);
          doc.text(
            `Document officiel RH — ${orgName} · Page ${doc.getNumberOfPages()}`,
            14,
            285,
          );
        },
      });

      doc.save(`rapport-presence-${month}.pdf`);
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
              <AttendanceTrendChart
                days={daysInMonth}
                seriesList={trendSeries}
                selectedDayIndex={hoveredDayIdx}
                onSelectDay={setHoveredDayIdx}
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

              {tableRows.length > 0 ? (
                <div className="rp-table-container">
                  <table className="rp-data-table">
                    <thead>
                      <tr>
                        <th>Agent</th>
                        <th>Service</th>
                        <th className="num">Jours travaillés</th>
                        <th className="num">Cumul retards</th>
                        <th className="num">Abs. injustifiées</th>
                        <th className="num">Abs. justifiées</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map((r) => (
                        <tr key={r.agent.id}>
                          <td className="agent-col">
                            <strong>{fullName(r.agent)}</strong>
                            <small>{r.agent.position || "Employé"}</small>
                          </td>
                          <td>{r.dept}</td>
                          <td className="num">{r.worked} j</td>
                          <td className={`num${r.lateMin > 0 ? " warn" : ""}`}>
                            {fmtDuration(r.lateMin)}
                          </td>
                          <td className={`num${r.absences > 0 ? " danger" : ""}`}>
                            {r.absences} j
                          </td>
                          <td className="num">{r.justified} j</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="rp-empty">Aucun agent ou donnée de présence trouvé pour cette sélection.</p>
              )}
            </section>
          )}
        </div>
    </>
  );
}
