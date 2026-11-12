import { Link } from "react-router-dom";
import { ArrowUpRight, Building, Camera, Pencil, Phone } from "lucide-react";
import { fullName, initials } from "../../utils";
import type { Agent } from "../../types";

export function CarteAgent({
  agent,
  nomDepartement,
  ageAgent,
  surSelection,
  surEnrolement,
}: {
  agent: Agent;
  nomDepartement: string;
  ageAgent: number | null;
  surSelection: () => void;
  surEnrolement?: (agent: Agent) => void;
}) {
  const statutAdmin = agent.metadata?.statut_administratif;
  const categorie = agent.metadata?.categorie;
  const sexeStr = agent.metadata?.sexe === "H" ? "H" : agent.metadata?.sexe === "F" ? "F" : null;

  return (
    <div
      className="agent-card"
      tabIndex={0}
      role="button"
      aria-label={`Ouvrir la fiche de ${fullName(agent)}`}
      onClick={surSelection}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          surSelection();
        }
      }}
    >
      <div className="agent-card-header">
        <span className={`agent-card-avatar tone-${Number(agent.id.replace(/\D/g, "") || 0) % 4}`}>
          {initials(fullName(agent))}
        </span>
        <span
          className={`badge ${agent.isEnrolled ? "present" : "late"}`}
          title={agent.isEnrolled ? "Profil facial biométrique actif" : "Non enrôlé"}
        >
          <i />
          {agent.isEnrolled ? "Enrôlé" : "Non enrôlé"}
        </span>
      </div>

      <div className="agent-card-identity">
        <h3>{fullName(agent)}</h3>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "11px",
            fontWeight: 600,
            color: "#1e6b52",
            marginTop: "-3px",
            marginBottom: "3px",
          }}
        >
          {(agent.metadata?.im || agent.metadata?.matricule) && (
            <span>IM {agent.metadata.im || agent.metadata.matricule}</span>
          )}
          {sexeStr && <span>· {sexeStr}</span>}
          {ageAgent !== null && <span>· {ageAgent} ans</span>}
        </div>
        <p className="agent-card-position">{agent.position || "Poste non renseigné"}</p>
        <span className="agent-card-dept">
          <Building size={13} />
          {nomDepartement}
        </span>
      </div>

      <div className="agent-card-details">
        <div>
          <small>STATUT ADMIN.</small>
          <span>
            {statutAdmin || "—"}
            {categorie ? ` · Cat. ${categorie}` : ""}
          </span>
        </div>
        <div>
          <small>TÉLÉPHONE</small>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
            {agent.metadata?.telephone ? (
              <>
                <Phone size={11} style={{ opacity: 0.7 }} />
                {agent.metadata.telephone}
              </>
            ) : (
              "—"
            )}
          </span>
        </div>
      </div>

      <div className="agent-card-footer">
        <span className="agent-card-cta">
          Détails &amp; Badge
          <ArrowUpRight size={15} />
        </span>

        <div className="agent-card-actions" onClick={(e) => e.stopPropagation()}>
          {surEnrolement && (
            <button
              type="button"
              className="agent-icon-btn"
              title={agent.isEnrolled ? "Ré-enrôler le visage" : "Enrôler le visage"}
              onClick={() => surEnrolement(agent)}
              style={{
                color: agent.isEnrolled ? "#1e6b52" : "#b45309",
              }}
            >
              <Camera size={14} />
            </button>
          )}
          <Link
            to={`/agents/${agent.id}/edit`}
            className="agent-icon-btn"
            title="Modifier l'agent"
          >
            <Pencil size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}

// Alias de rétrocompatibilité
export { CarteAgent as AgentCard };
