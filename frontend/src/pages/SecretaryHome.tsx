import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarPlus,
  CalendarDays,
  ChevronRight,
  CircleHelp,
  Printer,
  ScanLine,
  UsersRound,
} from "lucide-react";
import { useApp } from "../app/context";
import { dateLabel, nowTime, today } from "../utils";

const actions = [
  {
    to: "/conges-permissions",
    title: "Congés et permissions",
    description: "Recenser les absences déjà autorisées",
    icon: CalendarDays,
  },
  {
    to: "/scan",
    title: "Ouvrir le pointage",
    description: "Scanner les badges du personnel",
    icon: ScanLine,
  },
  {
    to: "/presences",
    title: "Voir les présences",
    description: "Consulter les arrivées et départs du jour",
    icon: UsersRound,
  },
  {
    to: "/reports?period=1",
    title: "Imprimer une fiche",
    description: "Présences et absences sur une période",
    icon: Printer,
  },
  {
    to: "/presences/ajouter",
    title: "Ajouter un pointage",
    description: "Faire régulariser un oubli de badge avec un motif",
    icon: CalendarPlus,
  },
];

export default function SecretaryHome() {
  const { user } = useApp();
  const [clock, setClock] = useState(() => ({ day: today(), time: nowTime() }));
  useEffect(() => {
    const timer = setInterval(
      () => setClock({ day: today(), time: nowTime() }),
      10000,
    );
    return () => clearInterval(timer);
  }, []);
  return (
    <section className="secretary-home">
      <div className="secretary-date">
        <span>{dateLabel(clock.day, true)}</span>
        <time>{clock.time}</time>
      </div>
      <div className="secretary-welcome">
        <h1>Bonjour {user?.name.split(" ")[0]}</h1>
        <p>Que souhaitez-vous faire ?</p>
      </div>
      <nav className="secretary-actions" aria-label="Actions courantes">
        {actions.map(({ to, title, description, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className={`secretary-action ${to === "/scan" ? "featured" : ""}`}
          >
            <Icon
              className="action-symbol"
              aria-hidden="true"
              strokeWidth={1.7}
            />
            <span>
              <strong>{title}</strong>
              <span>{description}</span>
            </span>
            <ChevronRight aria-hidden="true" className="action-arrow" />
          </Link>
        ))}
      </nav>
      <details className="secretary-help">
        <summary>
          <CircleHelp size={23} aria-hidden="true" />
          Besoin d’aide ?
        </summary>
        <p>
          Choisissez une action ci-dessus. Vous pouvez revenir à l’accueil à
          tout moment. Pour retrouver les filtres avancés et l’historique,
          choisissez « Expert ». Un oubli de badge doit être régularisé par le
          coordinateur.
        </p>
      </details>
    </section>
  );
}
