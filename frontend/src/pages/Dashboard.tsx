import { useSecretaryMode } from "../app/secretaryMode";
import SecretaryHome from "./SecretaryHome";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  CalendarDays,
  ScanLine,
  Users,
  UserCheck,
  UserX,
  Clock3,
  ArrowRight,
} from "lucide-react";
import { useApp } from "../app/context";
import { Badge, Heading, Person, Table } from "../components/ui";
import { dateLabel, today, fullName } from "../utils";
import {
  AnimatedMeter,
  ReactiveMetric,
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
        subtitle="Voici le point sur la présence de votre équipe aujourd’hui."
      >
        <span className="date-chip">
          <CalendarDays size={16} />
          {dateLabel(day)}
        </span>
        <Link className="button primary" to="/scan">
          <ScanLine size={18} />
          Ouvrir le pointage
        </Link>
      </Heading>
      <div className="day-strip">
        <span>
          <i className="online-dot" />
          Journée du <strong>{dateLabel(day, true)}</strong>
        </span>
        <span>{db.settings.organization}</span>
      </div>
      <div className="stats-grid">
        {[
          {
            label: "Effectif total",
            value: total,
            icon: Users,
            color: "neutral",
            note: "Agents actifs",
            to: user?.role === "COORDINATOR" ? "/agents" : "/presences",
          },
          {
            label: "Présents aujourd’hui",
            value: present,
            icon: UserCheck,
            color: "green",
            note: `${total ? Math.round((present / total) * 100) : 0} % de l’effectif`,
            to: "/presences",
          },
          {
            label: "En retard",
            value: late,
            icon: Clock3,
            color: "amber",
            note: "Inclus dans les présents",
            to: "/retards",
          },
          {
            label: "Absents",
            value: absent,
            icon: UserX,
            color: "rose",
            note: "Hors absences justifiées",
            to: "/absences",
          },
        ].map((s) => (
          <ReactiveMetric
            to={s.to}
            className={`stat-card ${s.color}`}
            key={s.label}
          >
            <div>
              <span>{s.label}</span>
              <s.icon size={20} />
            </div>
            <strong>
              <RollingNumber value={s.value} />
            </strong>
            <footer>
              <span>{s.note}</span>
              <ArrowUpRight size={16} />
            </footer>
          </ReactiveMetric>
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
      <section className="data-section">
        <div className="section-heading">
          <div>
            <h2>Derniers pointages</h2>
            <p>Les arrivées et départs de la journée</p>
          </div>
          <Link className="text-link" to="/history">
            Tout l’historique <ArrowRight size={16} />
          </Link>
        </div>
        <Table
          headers={["AGENT", "SERVICE", "ARRIVÉE", "DÉPART", "STATUT", ""]}
          rows={records
            .filter((p) => p.arrivalAt)
            .sort((a, b) => b.arrivalAt.localeCompare(a.arrivalAt))
            .slice(0, 5)
            .map((p) => {
              const a = db.agents.find((a) => a.id === p.agentId);
              return [
                <Person key="agent" agent={a} />,
                db.departments.find((d) => d.id === a?.departmentId)?.name,
                <span key="arrival" className="time">
                  {p.arrivalAt}
                </span>,
                p.departureAt || "—",
                <Badge key="status" status={p.status} />,
                <Link
                  className="icon-button"
                  key="detail"
                  aria-label={`Voir la présence de ${fullName(a)}`}
                  to={`/presences/${p.id}`}
                >
                  <ArrowUpRight size={17} />
                </Link>,
              ];
            })}
        />
      </section>
    </>
  );
}
