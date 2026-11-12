import { useState, useMemo } from "react";
import { Search, UserPlus, Users, X, CheckSquare, Square, Building2 } from "lucide-react";
import { useApp } from "../../app/context";
import { Modal } from "../../components/ui";
import { fullName, initials } from "../../utils";
import { personnelApi } from "../../services/personnel";
import type { Agent } from "../../types";

interface ModalAjouterPersonnelsDivisionProps {
  division: { id: string; name: string };
  onClose: () => void;
  onSuccess: () => void;
}

export function ModalAjouterPersonnelsDivision({
  division,
  onClose,
  onSuccess,
}: ModalAjouterPersonnelsDivisionProps) {
  const { db, refreshPersonnel, notify } = useApp();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [hideAlreadyInDivision, setHideAlreadyInDivision] = useState(true);

  // Map of departments for quick lookup
  const deptMap = useMemo(() => {
    const map = new Map<string, string>();
    db.departments.forEach((d) => map.set(String(d.id), d.name));
    return map;
  }, [db.departments]);

  // Filtered agents
  const filteredAgents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.agents
      .filter((agent) => {
        const isCurrent = String(agent.departmentId) === String(division.id);
        if (hideAlreadyInDivision && isCurrent) return false;

        if (!q) return true;

        const name = fullName(agent).toLowerCase();
        const im = (agent.metadata?.im || agent.metadata?.matricule || "").toLowerCase();
        const pos = (agent.position || "").toLowerCase();
        const currentDeptName = (deptMap.get(String(agent.departmentId)) || "").toLowerCase();
        const cin = (agent.metadata?.cin || "").toLowerCase();

        return (
          name.includes(q) ||
          im.includes(q) ||
          pos.includes(q) ||
          currentDeptName.includes(q) ||
          cin.includes(q)
        );
      })
      .sort((a, b) => {
        // Unassigned first, then by name
        const aIsCurrent = String(a.departmentId) === String(division.id);
        const bIsCurrent = String(b.departmentId) === String(division.id);
        if (aIsCurrent !== bIsCurrent) return aIsCurrent ? 1 : -1;
        return fullName(a).localeCompare(fullName(b));
      });
  }, [db.agents, search, division.id, hideAlreadyInDivision, deptMap]);

  // Eligible agents to add (those not already in this division)
  const eligibleDisplayedAgents = useMemo(() => {
    return filteredAgents.filter((a) => String(a.departmentId) !== String(division.id));
  }, [filteredAgents, division.id]);

  const allEligibleSelected =
    eligibleDisplayedAgents.length > 0 &&
    eligibleDisplayedAgents.every((a) => selectedIds.has(a.id));

  const toggleSelectAll = () => {
    if (allEligibleSelected) {
      // Unselect displayed eligible
      const next = new Set(selectedIds);
      eligibleDisplayedAgents.forEach((a) => next.delete(a.id));
      setSelectedIds(next);
    } else {
      // Select all displayed eligible
      const next = new Set(selectedIds);
      eligibleDisplayedAgents.forEach((a) => next.add(a.id));
      setSelectedIds(next);
    }
  };

  const toggleAgent = (agent: Agent) => {
    if (String(agent.departmentId) === String(division.id)) return;
    const next = new Set(selectedIds);
    if (next.has(agent.id)) {
      next.delete(agent.id);
    } else {
      next.add(agent.id);
    }
    setSelectedIds(next);
  };

  const handleAssign = async () => {
    if (selectedIds.size === 0 || submitting) return;
    setSubmitting(true);
    setError("");

    try {
      const ids = Array.from(selectedIds);
      await personnelApi.assignPersonnelToDivision(division.id, ids);
      notify(
        `${ids.length} agent${ids.length > 1 ? "s" : ""} rattaché${
          ids.length > 1 ? "s" : ""
        } au niveau « ${division.name} » avec succès !`,
      );
      await refreshPersonnel();
      onSuccess();
    } catch (err) {
      setError(
        (err as Error).message ||
          "Une erreur est survenue lors de l'affectation des personnels.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={`Ajouter des personnels · ${division.name}`} close={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 460, maxWidth: "100%" }}>
        <p style={{ margin: 0, color: "#475569", fontSize: 13, lineHeight: 1.4 }}>
          Sélectionnez les agents à affecter ou muter vers le niveau{" "}
          <strong style={{ color: "#1e6b52" }}>{division.name}</strong>.
        </p>

        {/* Barre de recherche AJAX / Instantanée */}
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <Search
            size={16}
            style={{ position: "absolute", left: 12, color: "#94a3b8", pointerEvents: "none" }}
          />
          <input
            type="search"
            autoFocus
            aria-label="Rechercher des agents"
            placeholder="Rechercher par nom, prénom, matricule IM, poste…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "9px 36px 9px 36px",
              borderRadius: "8px",
              border: "1px solid #d0ded6",
              fontSize: "13.5px",
              background: "#ffffff",
              boxSizing: "border-box",
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              style={{
                position: "absolute",
                right: 10,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "#94a3b8",
                padding: 4,
                display: "flex",
                alignItems: "center",
              }}
              title="Effacer la recherche"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Barre d'action rapide / options */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 12,
            color: "#64748b",
            padding: "0 2px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {eligibleDisplayedAgents.length > 0 && (
              <button
                type="button"
                onClick={toggleSelectAll}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "#1e6b52",
                  fontWeight: 600,
                  padding: 0,
                  fontSize: 12,
                }}
              >
                {allEligibleSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                <span>
                  {allEligibleSelected
                    ? "Tout désélectionner"
                    : `Tout cocher (${eligibleDisplayedAgents.length})`}
                </span>
              </button>
            )}
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
              fontSize: 12,
              userSelect: "none",
            }}
          >
            <input
              type="checkbox"
              checked={hideAlreadyInDivision}
              onChange={(e) => setHideAlreadyInDivision(e.target.checked)}
            />
            <span>Masquer les déjà rattachés</span>
          </label>
        </div>

        {/* Liste à cocher des agents */}
        <div
          style={{
            maxHeight: 300,
            overflowY: "auto",
            border: "1px solid #d0ded6",
            borderRadius: 8,
            background: "#fcfdfc",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {filteredAgents.length === 0 ? (
            <div
              style={{
                padding: "32px 16px",
                textAlign: "center",
                color: "#94a3b8",
                fontSize: 13,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Users size={24} style={{ opacity: 0.5 }} />
              <span>Aucun personnel trouvé pour cette recherche.</span>
            </div>
          ) : (
            filteredAgents.map((agent) => {
              const isCurrent = String(agent.departmentId) === String(division.id);
              const isChecked = selectedIds.has(agent.id);
              const im = agent.metadata?.im || agent.metadata?.matricule;
              const currentDeptName = deptMap.get(String(agent.departmentId));

              return (
                <div
                  key={agent.id}
                  onClick={() => toggleAgent(agent)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    borderBottom: "1px solid #edf2ef",
                    cursor: isCurrent ? "default" : "pointer",
                    background: isChecked
                      ? "rgba(30, 107, 82, 0.08)"
                      : isCurrent
                        ? "#f8faf9"
                        : "transparent",
                    transition: "background 0.15s ease",
                    opacity: isCurrent ? 0.7 : 1,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={isCurrent || submitting}
                      onChange={() => toggleAgent(agent)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ cursor: isCurrent ? "default" : "pointer" }}
                    />

                    <span
                      className={`avatar tone-${Number(agent.id.replace(/\D/g, "") || 0) % 4}`}
                      style={{ width: 30, height: 30, fontSize: 11, flexShrink: 0 }}
                    >
                      {initials(fullName(agent))}
                    </span>

                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 13,
                          color: "#1e293b",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {fullName(agent)}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "#64748b",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        {im && <span style={{ fontWeight: 600, color: "#1e6b52" }}>IM {im}</span>}
                        {im && agent.position && <span>·</span>}
                        {agent.position && <span>{agent.position}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Statut / Division actuelle */}
                  <div style={{ flexShrink: 0, marginLeft: 8 }}>
                    {isCurrent ? (
                      <span
                        className="badge present"
                        style={{ fontSize: 10.5, padding: "2px 6px" }}
                      >
                        <i />
                        Déjà rattaché
                      </span>
                    ) : (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 11,
                          color: currentDeptName ? "#475569" : "#94a3b8",
                          background: currentDeptName ? "#edf4f0" : "#f1f5f9",
                          padding: "2px 7px",
                          borderRadius: 4,
                          fontWeight: 500,
                          maxWidth: 160,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={
                          currentDeptName
                            ? `Actuellement rattaché à : ${currentDeptName}`
                            : "Aucune division assignée"
                        }
                      >
                        <Building2 size={11} style={{ opacity: 0.6 }} />
                        {currentDeptName || "Sans division"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Message d'erreur */}
        {error && (
          <p className="form-error" role="alert" style={{ margin: 0 }}>
            {error}
          </p>
        )}

        {/* Footer actions */}
        <footer
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 6,
            paddingTop: 10,
            borderTop: "1px solid #edf2ef",
          }}
        >
          <div style={{ fontSize: 12.5, fontWeight: 500, color: "#334155" }}>
            {selectedIds.size > 0 ? (
              <span style={{ color: "#1e6b52", fontWeight: 600 }}>
                {selectedIds.size} agent{selectedIds.size > 1 ? "s" : ""} sélectionné
                {selectedIds.size > 1 ? "s" : ""}
              </span>
            ) : (
              <span style={{ color: "#94a3b8" }}>Aucun agent sélectionné</span>
            )}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="button"
              onClick={onClose}
              disabled={submitting}
            >
              Annuler
            </button>
            <button
              type="button"
              className="button primary"
              disabled={selectedIds.size === 0 || submitting}
              onClick={handleAssign}
            >
              <UserPlus size={15} />
              <span>
                {submitting
                  ? "Affectation…"
                  : `Ajouter ${
                      selectedIds.size > 0 ? `(${selectedIds.size})` : ""
                    }`}
              </span>
            </button>
          </div>
        </footer>
      </div>
    </Modal>
  );
}

