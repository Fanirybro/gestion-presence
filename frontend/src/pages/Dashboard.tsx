import { Link } from "react-router-dom";
import {
  CalendarDays,
  Users,
  UserCheck,
  UserX,
  Clock3,
  ArrowRight,
  Award,
} from "lucide-react";
import { useApp } from "../app/context";
import { Heading } from "../components/ui";
import { dateLabel, today } from "../utils";
import { RollingNumber } from "../components/MotionEffects";
import { motion } from "motion/react";
import { useMotionPreference as useReducedMotion } from "../components/useMotionPreference";
import { useQuery } from "@tanstack/react-query";
import { presencesApi } from "../services/presences";
import { useMemo } from "react";

export default function Dashboard() {
  const reduced = useReducedMotion();
  const { db, user } = useApp();
  const day = today();

  const startDate = useMemo(() => {
    const d = new Date(`${day}T12:00:00+03:00`);
    d.setDate(d.getDate() - 4);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Indian/Antananarivo",
    }).format(d);
  }, [day]);

  const { data: serverPresences } = useQuery({
    queryKey: ["presences", startDate, day],
    queryFn: () => presencesApi.list(startDate, day),
    refetchInterval: 15_000,
  });

  const attendanceSource = serverPresences?.attendance ?? db.attendance;

  const activeAgentIds = useMemo(
    () => new Set(db.agents.filter((a) => a.isActive).map((a) => a.id)),
    [db.agents],
  );

  const records = useMemo(
    () => attendanceSource.filter((p) => p.date === day && activeAgentIds.has(p.agentId)),
    [attendanceSource, day, activeAgentIds],
  );

  const total = activeAgentIds.size;

  // Décompte par agent distinct (évite de doubler les pointages matin et après-midi)
  const presentAgentIds = useMemo(
    () =>
      new Set(
        records
          .filter((p) => p.status === "PRESENT" || p.status === "LATE")
          .map((p) => p.agentId),
      ),
    [records],
  );

  const lateAgentIds = useMemo(
    () =>
      new Set(
        records
          .filter((p) => p.status === "LATE")
          .map((p) => p.agentId),
      ),
    [records],
  );

  const present = presentAgentIds.size;
  const late = lateAgentIds.size;
  const absent = Math.max(0, total - present);
  const presentOnTimeTotal = Math.max(0, present - late);
  const globalRate = total > 0 ? Math.round((present / total) * 100) : 0;

  // Statistiques de présence par division (comptage par agent distinct)
  const departmentStats = useMemo(() => {
    return db.departments.map((d) => {
      const deptAgents = db.agents.filter(
        (a) => a.departmentId === d.id && a.isActive,
      );
      const deptTotal = deptAgents.length;
      const deptPresentOnTime = deptAgents.filter(
        (a) => presentAgentIds.has(a.id) && !lateAgentIds.has(a.id),
      ).length;
      const deptLate = deptAgents.filter((a) => lateAgentIds.has(a.id)).length;
      const deptPresent = deptPresentOnTime + deptLate;
      const deptAbsent = Math.max(0, deptTotal - deptPresent);
      const rate = deptTotal > 0 ? Math.round((deptPresent / deptTotal) * 100) : 0;

      return {
        id: d.id,
        name: d.name,
        total: deptTotal,
        presentOnTime: deptPresentOnTime,
        late: deptLate,
        present: deptPresent,
        absent: deptAbsent,
        rate,
      };
    });
  }, [db.departments, db.agents, presentAgentIds, lateAgentIds]);

  // Division la plus assidue
  const topDivision = useMemo(() => {
    const populated = departmentStats.filter((d) => d.total > 0);
    if (!populated.length) return null;
    return [...populated].sort((a, b) => b.rate - a.rate || b.total - a.total)[0];
  }, [departmentStats]);

  return (
    <>
      <Heading
        eyebrow="VUE D’ENSEMBLE"
        title={`Bonjour, ${user?.name.split(" ")[0]}.`}
        subtitle={`Voici le point sur la présence de votre équipe aujourd'hui (${dateLabel(day, true)}).`}
      >
        <span className="date-chip">
          <CalendarDays size={15} />
          {dateLabel(day)}
        </span>
      </Heading>
      {/* KPI Metrics Strip (Model from Reports) */}
      <div className="rp-metrics-row">
        {[
          {
            label: "Effectif total",
            value: total,
            icon: Users,
            valueClass: "",
            note: "Agents actifs",
            to: user?.role === "COORDINATOR" ? "/agents" : "/presences",
          },
          {
            label: "Présents aujourd’hui",
            value: present,
            icon: UserCheck,
            valueClass: "green",
            note: `${total ? Math.round((present / total) * 100) : 0} % de l’effectif`,
            to: "/presences",
          },
          {
            label: "En retard",
            value: late,
            icon: Clock3,
            valueClass: late > 0 ? "warn" : "",
            note: "Inclus dans les présents",
            to: "/retards",
          },
          {
            label: "Absents",
            value: absent,
            icon: UserX,
            valueClass: absent > 0 ? "danger" : "",
            note: "Hors absences justifiées",
            to: "/absences",
          },
        ].map((s) => (
          <Link
            to={s.to}
            className="rp-metric-cell"
            key={s.label}
          >
            <span className="rp-metric-label">
              <s.icon size={14} /> {s.label}
            </span>
            <strong className={`rp-metric-value ${s.valueClass}`}>
              <RollingNumber value={s.value} />
            </strong>
            <small className="rp-metric-sub">{s.note}</small>
          </Link>
        ))}
      </div>
      <div className="dashboard-middle">
        {/* Section Gauche : Diagramme en barres horizontales par division */}
        <section className="chart-section">
          <div className="section-heading">
            <div>
              <h2>Présence par division</h2>
              <p>Répartition des effectifs aujourd'hui</p>
            </div>
            <div className="legend">
              <span>
                <UserCheck size={14} aria-hidden="true" className="green-text" />
                Présents à l'heure
              </span>
              <span>
                <Clock3 size={14} aria-hidden="true" color="#91600e" />
                Retards
              </span>
              <span>
                <UserX size={14} aria-hidden="true" color="#a4384c" />
                Absents
              </span>
            </div>
          </div>

          <div className="dept-chart-list">
            {departmentStats.map((d, i) => (
              <div className="dept-chart-row" key={d.id}>
                <div className="dept-chart-info">
                  <span className="dept-chart-name" title={d.name}>
                    {d.name}
                  </span>
                  <span className="dept-chart-ratio">
                    <strong>{d.present}</strong>
                    <small> / {d.total}</small>
                  </span>
                </div>
                <div className="dept-chart-bar-wrap">
                  <div className="dept-chart-bar-track">
                    {d.total > 0 ? (
                      <>
                        {d.presentOnTime > 0 && (
                          <motion.div
                            className="dept-bar-seg present"
                            initial={{ width: 0 }}
                            animate={{
                              width: `${(d.presentOnTime / d.total) * 100}%`,
                            }}
                            transition={{
                              duration: reduced ? 0.1 : 0.6,
                              delay: reduced ? 0 : i * 0.05,
                            }}
                            title={`Présents à l'heure : ${d.presentOnTime}`}
                          />
                        )}
                        {d.late > 0 && (
                          <motion.div
                            className="dept-bar-seg late"
                            initial={{ width: 0 }}
                            animate={{
                              width: `${(d.late / d.total) * 100}%`,
                            }}
                            transition={{
                              duration: reduced ? 0.1 : 0.6,
                              delay: reduced ? 0 : i * 0.05 + 0.1,
                            }}
                            title={`En retard : ${d.late}`}
                          />
                        )}
                        {d.absent > 0 && (
                          <motion.div
                            className="dept-bar-seg absent"
                            initial={{ width: 0 }}
                            animate={{
                              width: `${(d.absent / d.total) * 100}%`,
                            }}
                            transition={{
                              duration: reduced ? 0.1 : 0.6,
                              delay: reduced ? 0 : i * 0.05 + 0.2,
                            }}
                            title={`Absents : ${d.absent}`}
                          />
                        )}
                      </>
                    ) : (
                      <span className="dept-bar-empty">Aucun agent affecté</span>
                    )}
                  </div>
                  <span
                    className={`dept-chart-badge ${
                      d.total === 0
                        ? ""
                        : d.rate >= 90
                        ? "success"
                        : d.rate >= 60
                        ? "warning"
                        : "danger"
                    }`}
                  >
                    {d.total > 0 ? `${d.rate}%` : "—"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section Droite : Donut & Synthèse globale du jour */}
        <section className="department-section">
          <div className="section-heading">
            <div>
              <h2>Synthèse du jour</h2>
              <p>Performance d'assiduité globale</p>
            </div>
            <Award size={19} color="#1e6b52" />
          </div>

          <div className="donut-summary-container">
            {/* SVG Ring Donut */}
            <div className="donut-ring-wrap">
              <svg viewBox="0 0 100 100" className="donut-ring-svg">
                <circle
                  cx="50"
                  cy="50"
                  r="38"
                  fill="transparent"
                  stroke="#eef2f0"
                  strokeWidth="10"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="38"
                  fill="transparent"
                  stroke="#22c55e"
                  strokeWidth="10"
                  strokeDasharray={`${(globalRate / 100) * 238.76} 238.76`}
                  strokeDashoffset="0"
                  strokeLinecap="round"
                  style={{
                    transition: reduced ? "none" : "stroke-dasharray 0.8s ease",
                  }}
                />
              </svg>
              <div className="donut-ring-center">
                <strong className="donut-ring-val">{globalRate}%</strong>
                <span className="donut-ring-lbl">Présence</span>
              </div>
            </div>

            {/* Statistiques détaillées */}
            <div className="donut-breakdown-list">
              <div className="donut-stat-row">
                <span className="donut-dot present" />
                <span className="donut-stat-lbl">Présents à l'heure</span>
                <strong className="donut-stat-val">{presentOnTimeTotal}</strong>
              </div>
              <div className="donut-stat-row">
                <span className="donut-dot late" />
                <span className="donut-stat-lbl">En retard</span>
                <strong className="donut-stat-val">{late}</strong>
              </div>
              <div className="donut-stat-row">
                <span className="donut-dot absent" />
                <span className="donut-stat-lbl">Absents</span>
                <strong className="donut-stat-val">{absent}</strong>
              </div>
            </div>

            {/* Division leader */}
            {topDivision && (
              <div className="donut-top-dept">
                <div className="top-dept-icon">🏆</div>
                <div className="top-dept-meta">
                  <span className="top-dept-tag">Division la plus assidue</span>
                  <strong className="top-dept-name">{topDivision.name}</strong>
                  <small className="top-dept-rate">{topDivision.rate}% de présence ({topDivision.present}/{topDivision.total})</small>
                </div>
              </div>
            )}
          </div>

          <Link to="/presences" className="text-link" style={{ marginTop: "12px", display: "inline-flex" }}>
            Consulter les présences <ArrowRight size={15} />
          </Link>
        </section>
      </div>
    </>
  );
}
