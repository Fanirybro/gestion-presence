import { useState } from "react";
import {
  Calendar,
  Layers,
  Clock,
  MapPin,
  LoaderCircle,
  Download,
} from "lucide-react";
import { Modal } from "./ui";
import { useApp } from "../app/context";
import {
  exporterFicheDivisionPortrait,
  exporterFicheConsolideePaysage,
} from "../services/exportFichePresencePdf";
import { authorizedAbsences } from "../services/authorizedAbsences";
import { presencesApi } from "../services/presences";

interface ModalExportFichePresenceProps {
  onClose: () => void;
  defaultDate?: string;
  defaultDivisionId?: string;
}

export function ModalExportFichePresence({
  onClose,
  defaultDate,
  defaultDivisionId,
}: ModalExportFichePresenceProps) {
  const { db, user, organisation, notify } = useApp();

  const isCoordinator = user?.role === "COORDINATOR";
  const managedDivisions = Array.isArray(user?.managed_division_ids)
    ? user.managed_division_ids.map(String)
    : [];

  // Divisions accessibles à l'utilisateur
  const accessibleDepartments = isCoordinator
    ? db.departments
    : db.departments.filter((d) => managedDivisions.includes(String(d.id)));

  const [date, setDate] = useState(
    defaultDate || new Date().toISOString().slice(0, 10),
  );
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>(
    defaultDivisionId || "",
  );

  const isGlobal = !selectedDivisionId;
  const [periode, setPeriode] = useState<"MATIN" | "APRES_MIDI" | "JOURNEE">("MATIN");
  const [lieu, setLieu] = useState(
    organisation?.adresse?.split(",")[0]?.trim() || db.settings.address?.split(",")[0]?.trim() || "Toliara",
  );
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      // 1. Récupérer les pointages et absences autorisées pour la date choisie
      const [presencesRes, absencesList] = await Promise.all([
        presencesApi.list(date, date).catch(() => ({ attendance: [] })),
        authorizedAbsences.list().catch(() => []),
      ]);

      const attendances = presencesRes.attendance || [];
      const orgNom = organisation?.nom || db.settings.organization || "Ministère de l'Économie et des Finances";
      const orgLogo = organisation?.logo_url || db.settings.logo_url || null;

      if (!isGlobal) {
        // Format Portrait : Division spécifique
        const targetDiv = accessibleDepartments.find((d) => String(d.id) === String(selectedDivisionId));
        const divNom = targetDiv?.name || "Division";
        const targetAgents = db.agents.filter(
          (a) => a.isActive && String(a.departmentId) === String(selectedDivisionId),
        );

        await exporterFicheDivisionPortrait({
          format: "portrait",
          date,
          periode,
          divisionId: selectedDivisionId,
          divisionNom: divNom,
          nomOrganisation: orgNom,
          logoUrl: orgLogo,
          agents: targetAgents,
          attendances,
          absencesAutorisees: absencesList,
        });

        notify("Fiche de présence générée.");
      } else {
        // Format Toutes les divisions
        let targetAgents = db.agents.filter((a) => a.isActive);
        const divNom = "Toutes les divisions";

        if (!isCoordinator) {
          // Si responsable de division non-coordinateur, restreindre à son périmètre
          targetAgents = targetAgents.filter((a) =>
            managedDivisions.includes(String(a.departmentId)),
          );
        }

        await exporterFicheConsolideePaysage({
          format: "paysage",
          date,
          divisionNom: divNom,
          nomOrganisation: orgNom,
          logoUrl: orgLogo,
          lieu,
          agents: targetAgents,
          attendances,
          absencesAutorisees: absencesList,
          divisions: db.departments,
        });

        notify("Fiche de présence générée.");
      }

      onClose();
    } catch (err) {
      console.error("Erreur génération PDF fiche de présence:", err);
      notify("Échec de la génération du PDF.", true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Fiche de présence" close={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Date */}
        <div className="field">
          <label htmlFor="export-date">
            <Calendar size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
            Date
          </label>
          <input
            id="export-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={loading}
          />
        </div>

        {/* Division */}
        <div className="field">
          <label htmlFor="export-division">
            <Layers size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
            Division
          </label>
          <select
            id="export-division"
            value={selectedDivisionId}
            onChange={(e) => setSelectedDivisionId(e.target.value)}
            disabled={loading}
          >
            {isCoordinator && (
              <option value="">Toutes les divisions</option>
            )}
            {accessibleDepartments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} {d.isActive === false ? "(Inactif)" : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Créneau pour une division spécifique */}
        {!isGlobal ? (
          <div className="field">
            <label htmlFor="export-periode">
              <Clock size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
              Créneau
            </label>
            <select
              id="export-periode"
              value={periode}
              onChange={(e) => setPeriode(e.target.value as any)}
              disabled={loading}
            >
              <option value="MATIN">Matin</option>
              <option value="APRES_MIDI">Après-midi</option>
              <option value="JOURNEE">Toute la journée</option>
            </select>
          </div>
        ) : null}

        {isGlobal && (
          <div className="field">
            <label htmlFor="export-lieu">
              <MapPin size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
              Lieu
            </label>
            <input
              id="export-lieu"
              type="text"
              placeholder="Ex: Toliara"
              value={lieu}
              onChange={(e) => setLieu(e.target.value)}
              disabled={loading}
            />
          </div>
        )}

        <footer style={{ marginTop: 10 }}>
          <button type="button" className="button" onClick={onClose} disabled={loading}>
            Annuler
          </button>
          <button
            type="button"
            className="button primary"
            onClick={handleExport}
            disabled={loading}
          >
            {loading ? (
              <>
                <LoaderCircle className="busy-icon" size={15} />
                <span>Génération du PDF…</span>
              </>
            ) : (
              <>
                <Download size={15} />
                <span>Générer le PDF</span>
              </>
            )}
          </button>
        </footer>
      </div>
    </Modal>
  );
}

