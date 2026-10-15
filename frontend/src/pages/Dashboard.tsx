import { useSecretaryMode } from "../app/secretaryMode";
import SecretaryHome from "./SecretaryHome";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  ScanLine,
  Users,
  UserCheck,
  UserX,
  Clock3,
  ArrowRight,
} from "lucide-react";
import { useApp } from "../app/context";
import { Heading } from "../components/ui";
import { dateLabel, today } from "../utils";
import {
  AnimatedMeter,
  RollingNumber,
} from "../components/MotionEffects";
import { motion } from "motion/react";
import { useMotionPreference as useReducedMotion } from "../components/useMotionPreference";
export default function Dashboard() {
  const reduced = useReducedMotion();
  const { simple } = useSecretaryMode();
  const { db, user } = useApp();
  const day = today();
  const records = db.attendance.filter((p) => p.date === day);
  const total = db.agents.filter((a) => a.isActive).length;
  const present = records.filter(
    (p) => p.status === "PRESENT" || p.status === "LATE",
  ).length;
  const late = records.filter((p) => p.status === "LATE").length;
  const absent = records.filter((p) => p.status === "ABSENT").length;
  const week = Array.from({ length: 5 }, (_, i) => {
    const date = new Date(`${day}T12:00:00+03:00`);
    date.setDate(date.getDate() - 4 + i);
    const key = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Indian/Antananarivo",
    }).format(date);
    const list = db.attendance.filter((p) => p.date === key);
    return {
      key,
      label: date.toLocaleDateString("fr-FR", { weekday: "short" }),
      present: list.filter((p) => p.status === "PRESENT").length,
      late: list.filter((p) => p.status === "LATE").length,
      absent: list.filter((p) => p.status === "ABSENT").length,
    };
  });
  if (simple) return <SecretaryHome />;
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
        <Link className="button primary" to="/scan">
          <ScanLine size={16} />
          <span>Ouvrir le pointage</span>
        </Link>
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
        <section className="chart-section">
          <div className="section-heading">
            <div>
              <h2>Rythme de présence</h2>
              <p>Les cinq derniers jours</p>
            </div>
            <div className="legend">
              <span>
                <UserCheck size={14} aria-hidden="true" className="green-text" />
                Présents
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
          <div
            className="bar-chart"
            role="img"
            aria-label={week
              .map(
                (w) =>
                  `${w.label} : ${w.present} présents, ${w.late} retards, ${w.absent} absents`,
              )
              .join(". ")}
          >
            <div className="chart-y">
              <span>{total}</span>
              <span>{Math.round(total / 2)}</span>
              <span>0</span>
            </div>
            {week.map((w, dayIndex) => (
              <div
                className={`chart-column ${w.key === day ? "current" : ""}`}
                key={w.key}
              >
                <motion.div
                  className="bar-stack"
                  initial={{ scaleY: reduced ? 1 : 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{
                    duration: reduced ? 0.12 : 0.8,
                    delay: reduced ? 0 : dayIndex * 0.075,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                >
                  {[
                    ["green", w.present],
                    ["amber", w.late],
                    ["rose", w.absent],
                  ].map(([color, count]) => (
                    <div
                      key={color}
                      className={`chart-bar ${color}`}
                      style={{
                        height: `${(Number(count) / Math.max(1, total)) * 100}%`,
                      }}
                      title={`${count}`}
                    />
                  ))}
                </motion.div>
                <span>{w.label}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="department-section">
          <div className="section-heading">
            <div>
              <h2>Par service</h2>
              <p>Présents / effectif</p>
            </div>
            <Users size={19} />
          </div>
          {db.departments.map((d, i) => {
            const agents = db.agents.filter(
              (a) => a.departmentId === d.id && a.isActive,
            );
            const count = records.filter(
              (p) =>
                agents.some((a) => a.id === p.agentId) &&
                ["PRESENT", "LATE"].includes(p.status),
            ).length;
            return (
              <div className="department-row" key={d.id}>
                <div>
                  <span>{d.name}</span>
                  <strong>
                    {count}
                    <small> / {agents.length}</small>
                  </strong>
                </div>
                <AnimatedMeter
                  value={count}
                  max={agents.length}
                  label={d.name}
                  delay={i * 0.075}
                />
              </div>
            );
          })}
          <Link to="/presences" className="text-link">
            Consulter les présences <ArrowRight size={15} />
          </Link>
        </section>
      </div>
    </>
  );
}
