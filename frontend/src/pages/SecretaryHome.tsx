import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Camera,
  ChevronRight,
  CircleHelp,
  Printer,
  ScanLine,
  UsersRound,
} from "lucide-react";
import { useApp } from "../app/context";
import { SecretaryModeSelector } from "../app/secretaryMode";
import { dateLabel, nowTime, today } from "../utils";
import { hasPermission } from "../types";

export default function SecretaryHome() {
  const { db, user, organisation } = useApp();
  const [clock, setClock] = useState(() => ({ day: today(), time: nowTime() }));

  const qrEnabled = (organisation?.pointage_qr ?? db.settings.pointage_qr ?? true) && hasPermission(user, "scan");
  const facialEnabled = (organisation?.pointage_facial ?? db.settings.pointage_facial ?? true) && hasPermission(user, "kiosk");
  const presencesEnabled = hasPermission(user, "presences");
  const reportsEnabled = hasPermission(user, "reports");

  const actions = [
    ...(qrEnabled
      ? [
          {
            to: "/scan",
            title: "Ouvrir le pointage QR Code",
            description: "Scanner les badges du personnel",
            icon: ScanLine,
            featured: true,
          },
        ]
      : []),
    ...(facialEnabled
      ? [
          {
            to: "/kiosk",
            title: "Ouvrir le pointage par Visage",
            description: "Borne de reconnaissance faciale en direct",
            icon: Camera,
            featured: !qrEnabled,
          },
        ]
      : []),
    ...(presencesEnabled
      ? [
          {
            to: "/presences",
            title: "Voir les présences",
            description: "Consulter les arrivées et départs du jour",
            icon: UsersRound,
            featured: false,
          },
        ]
      : []),
    ...(reportsEnabled
      ? [
          {
            to: "/reports?period=1",
            title: "Imprimer un rapport ou fiche de présence",
            description: "Générer et imprimer le rapport et la fiche de présence",
            icon: Printer,
            featured: false,
          },
        ]
      : []),
  ];
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
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <time>{clock.time}</time>
          <SecretaryModeSelector />
        </div>
      </div>
      <div className="secretary-welcome">
        <h1>Bonjour {user?.name.split(" ")[0]}</h1>
        <p>Que souhaitez-vous faire ?</p>
      </div>
      <nav className="secretary-actions" aria-label="Actions courantes">
        {actions.map(({ to, title, description, icon: Icon, featured }) => (
          <Link
            key={to}
            to={to}
            className={`secretary-action ${featured ? "featured" : ""}`}
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
