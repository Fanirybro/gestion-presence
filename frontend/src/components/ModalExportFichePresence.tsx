import { useState } from "react";
import {
  Calendar,
  Layers,
  Clock,
  MapPin,
  Building,
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
  const [serviceNom, setServiceNom] = useState("Direction du Budget");
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
          serviceNom,
          nomOrganisation: orgNom,
          agents: targetAgents,
          attendances,
          absencesAutorisees: absencesList,
        });

        notify(`Fiche de présence (${divNom}) générée en Portrait.`);
      } else {
        // Format Paysage : Consolidé (Toutes les divisions)
        let targetAgents = db.agents.filter((a) => a.isActive);
        const divNom = "Toutes les divisions (Vue consolidée)";

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
          serviceNom,
          nomOrganisation: orgNom,
          lieu,
          agents: targetAgents,
          attendances,
          absencesAutorisees: absencesList,
          divisions: db.departments,
        });

        notify("Fiche de présence consolidée générée en Paysage.");
      }

      onClose();
    } catch (err) {
      console.error("Erreur génération PDF fiche de présence:", err);
      notify("Échec de la génération du document officiel PDF.", true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Édition de la Fiche de Présence Officielle" close={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Date de la fiche */}
        <div className="field">
          <label htmlFor="export-date">
            <Calendar size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
            Date de la fiche de présence
          </label>
          <input
            id="export-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={loading}
          />
        </div>

        {/* Division / Niveau (Détermine automatiquement le format portrait ou paysage) */}
        <div className="field">
          <label htmlFor="export-division">
            <Layers size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
            Périmètre de division
          </label>
          <select
            id="export-division"
            value={selectedDivisionId}
            onChange={(e) => setSelectedDivisionId(e.target.value)}
            disabled={loading}
          >
            {isCoordinator && (
              <option value="">Toutes les divisions (Vue globale — Paysage)</option>
            )}
            {accessibleDepartments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} {d.isActive === false ? "(Inactif)" : ""} — Portrait
              </option>
            ))}
          </select>
        </div>

        {/* Paramètres contextuels : Créneau pour division (portrait) ou Lieu pour consolidé (paysage) */}
        {!isGlobal ? (
          <div className="field">
            <label htmlFor="export-periode">
              <Clock size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
              Créneau horaire à cocher
            </label>
            <select
              id="export-periode"
              value={periode}
              onChange={(e) => setPeriode(e.target.value as any)}
              disabled={loading}
            >
              <option value="MATIN">[X] MATIN</option>
              <option value="APRES_MIDI">[X] APRÈS-MIDI</option>
              <option value="JOURNEE">[X] MATIN et APRÈS-MIDI (Journée)</option>
            </select>
          </div>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: isGlobal ? "1fr 1fr" : "1fr", gap: 10 }}>
          {isGlobal && (
            <div className="field">
              <label htmlFor="export-lieu">
                <MapPin size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
                Lieu d'édition (Fait à...)
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

          <div className="field">
            <label htmlFor="export-service">
              <Building size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
              Direction / Service
            </label>
            <input
              id="export-service"
              type="text"
              placeholder="Ex: Direction du Budget"
              value={serviceNom}
              onChange={(e) => setServiceNom(e.target.value)}
              disabled={loading}
            />
          </div>
        </div>

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
                <span>
                  Générer le PDF {isGlobal ? "Paysage (Consolidé)" : "Portrait (Division)"}
                </span>
              </>
            )}
          </button>
        </footer>
      </div>
    </Modal>
  );
}

