import { Link } from "react-router-dom";
import { CalendarPlus, ShieldCheck } from "lucide-react";
import { Heading } from "../components/ui";

export default function ForgottenAttendance() {
  return (
    <>
      <Heading
        title="Ajouter un pointage"
        subtitle="Faire régulariser un oubli de badge"
      />
      <section className="forgotten-attendance data-section">
        <ShieldCheck size={36} aria-hidden="true" />
        <h2>Une intervention du coordinateur est nécessaire</h2>
        <p>
          Votre compte secrétaire permet de scanner les badges et de consulter
          les relevés. L’ajout ou la correction d’un horaire oublié est réservé
          au coordinateur.
        </p>
        <p>
          Transmettez-lui le nom de l’agent, la date, l’heure d’arrivée ou de
          départ et le motif de l’oubli. Il pourra corriger le relevé et
          enregistrer le motif dans le journal des modifications.
        </p>
        <Link className="button primary" to="/presences">
          <CalendarPlus size={20} aria-hidden="true" />
          Consulter le relevé concerné
        </Link>
      </section>
    </>
  );
}
