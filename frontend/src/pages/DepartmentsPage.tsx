import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import {
  Layers,
  Plus,
  Search,
  Users,
  UserPlus,
  CheckCircle2,
  XCircle,
  Pencil,
  ArrowUpRight,
  Power,
  X,
  UserCheck,
} from "lucide-react";
import { useApp } from "../app/context";
import { Heading, Empty, Modal, Confirm } from "../components/ui";
import { TableSkeleton } from "../components/Skeleton";
import { personnelApi, type DivisionResponsable } from "../services/personnel";
import { RowActionsMenu } from "../components/RowActionsMenu";
import { ModalAjouterPersonnelsDivision } from "./departments/ModalAjouterPersonnelsDivision";

type DepartmentItem = {
  id: string;
  name: string;
  isActive?: boolean;
  responsables?: DivisionResponsable[];
};

export default function DepartmentsPage() {
  const navigate = useNavigate();
  const { db, user, refreshPersonnel, notify, personnelLoading } = useApp();

  const isCoordinator = user?.role === "COORDINATOR";
  const managedDivisions = Array.isArray(user?.managed_division_ids)
    ? user.managed_division_ids.map(String)
    : [];

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [modalMode, setModalMode] = useState<"CREATE" | "RENAME" | null>(null);
  const [targetDept, setTargetDept] = useState<DepartmentItem | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [selectedResponsableIds, setSelectedResponsableIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [confirmToggle, setConfirmToggle] = useState<DepartmentItem | null>(null);
  const [addingPersonnelToDept, setAddingPersonnelToDept] = useState<DepartmentItem | null>(null);

  const { data: membersData } = useQuery({
    queryKey: ["personnel-members", user?.organisationId, user?.id],
    queryFn: personnelApi.members,
  });
  const membres = membersData?.membres || [];

  // Accessible departments based on user scope
  const allDepartments: DepartmentItem[] = isCoordinator
    ? db.departments
    : db.departments.filter((d) => managedDivisions.includes(String(d.id)));

  // Statistics
  const totalCount = allDepartments.length;
  const activeCount = allDepartments.filter((d) => d.isActive !== false).length;
  const inactiveCount = totalCount - activeCount;
  const totalAgentsCount = isCoordinator
    ? db.agents.length
    : db.agents.filter((a) => managedDivisions.includes(String(a.departmentId))).length;

  // Filtered departments list
  const filteredDepartments = allDepartments
    .filter((d) => {
      const matchesSearch =
        d.name.toLowerCase().includes(search.toLowerCase()) ||
        (d.responsables &&
          d.responsables.some((r) =>
            `${r.prenom} ${r.nom}`.toLowerCase().includes(search.toLowerCase()),
          ));
      const isActive = d.isActive !== false;
      const matchesStatus =
        filterStatus === "ALL"
          ? true
          : filterStatus === "ACTIVE"
            ? isActive
            : !isActive;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // Count agents for a given department
  const getDepartmentStats = (deptId: string) => {
    const agents = db.agents.filter((a) => a.departmentId === deptId);
    const active = agents.filter((a) => a.isActive).length;
    return { total: agents.length, active };
  };

  const handleOpenCreate = () => {
    setNameInput("");
    setSelectedResponsableIds([]);
    setError("");
    setModalMode("CREATE");
    setTargetDept(null);
  };

  const handleOpenRename = (dept: DepartmentItem) => {
    setNameInput(dept.name);
    setSelectedResponsableIds(dept.responsables?.map((r) => r.id) || []);
    setError("");
    setTargetDept(dept);
    setModalMode("RENAME");
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setError("Le nom du niveau ne peut pas être vide.");
      return;
    }

    // Check duplicate
    const duplicate = db.departments.some(
      (d) =>
        d.name.toLowerCase() === trimmed.toLowerCase() &&
        (!targetDept || d.id !== targetDept.id),
    );
    if (duplicate) {
      setError("Un niveau / division portant ce nom existe déjà.");
      return;
    }

    setPending(true);
    setError("");
    try {
      if (modalMode === "CREATE") {
        await personnelApi.createDepartment({
          nom: trimmed,
          responsable_ids: selectedResponsableIds,
        });
        notify("Niveau créé avec succès.");
      } else if (modalMode === "RENAME" && targetDept) {
        await personnelApi.updateDepartment(targetDept.id, {
          nom: trimmed,
          responsable_ids: selectedResponsableIds,
        });
        notify("Niveau mis à jour avec succès.");
      }
      await refreshPersonnel();
      setModalMode(null);
      setNameInput("");
      setSelectedResponsableIds([]);
      setTargetDept(null);
    } catch (err) {
      setError((err as Error).message);
      notify((err as Error).message, true);
    } finally {
      setPending(false);
    }
  };

  const handleToggleStatus = async (dept: DepartmentItem) => {
    const isCurrentlyActive = dept.isActive !== false;
    const { active } = getDepartmentStats(dept.id);

    // Business rule: cannot deactivate if active agents exist
    if (isCurrentlyActive && active > 0) {
      notify(
        `Impossible de désactiver : ce niveau contient ${active} agent(s) actif(s). Réaffectez-les d'abord.`,
        true,
      );
      setConfirmToggle(null);
      return;
    }

    setPending(true);
    try {
      await personnelApi.updateDepartment(dept.id, {
        actif: !isCurrentlyActive,
      });
      await refreshPersonnel();
      notify(
        isCurrentlyActive
          ? "Niveau désactivé."
          : "Niveau réactivé avec succès.",
      );
    } catch (err) {
      notify((err as Error).message, true);
    } finally {
      setPending(false);
      setConfirmToggle(null);
    }
  };

  return (
    <>
      <Heading
        eyebrow="STRUCTURE ORGANISATIONNELLE"
        title="Divisions & Niveaux"
        subtitle="Gestion des niveaux, affectation des responsables et partitionnement des données"
      >
        {isCoordinator && (
          <button className="button primary" onClick={handleOpenCreate}>
            <Plus size={16} />
            Nouveau niveau
          </button>
        )}
      </Heading>

      {/* KPI Metrics Strip */}
      <div className="rp-metrics-row">
        <div className="rp-metric-cell">
          <span className="rp-metric-label">
            <CheckCircle2 size={14} style={{ color: "#1e6b52" }} /> Niveaux actifs
          </span>
          <strong className="rp-metric-value green">{activeCount}</strong>
          <small className="rp-metric-sub">Sur un total de {totalCount}</small>
        </div>

        <div className="rp-metric-cell">
          <span className="rp-metric-label">
            <XCircle size={14} /> Niveaux inactifs
          </span>
          <strong className="rp-metric-value">{inactiveCount}</strong>
          <small className="rp-metric-sub">Archivés ou suspendus</small>
        </div>

        <div className="rp-metric-cell">
          <span className="rp-metric-label">
            <Users size={14} /> Effectif rattaché
          </span>
          <strong className="rp-metric-value">{totalAgentsCount}</strong>
          <small className="rp-metric-sub">Agents dans votre périmètre</small>
        </div>

        <div className="rp-metric-cell">
          <span className="rp-metric-label">
            <Layers size={14} /> Moyenne par niveau
          </span>
          <strong className="rp-metric-value">
            {activeCount > 0 ? (totalAgentsCount / activeCount).toFixed(1) : "0"}
          </strong>
          <small className="rp-metric-sub">Agents par niveau actif</small>
        </div>
      </div>

      {/* Clean Tabs & Filter Toolbar */}
      <div className="dept-toolbar-row">
        <div className="profile-clean-tabs" role="tablist" aria-label="Filtrer par statut">
          <button
            type="button"
            role="tab"
            aria-selected={filterStatus === "ALL"}
            className={`profile-tab-item ${filterStatus === "ALL" ? "active" : ""}`}
            onClick={() => setFilterStatus("ALL")}
          >
            <span>Tous les niveaux ({totalCount})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={filterStatus === "ACTIVE"}
            className={`profile-tab-item ${filterStatus === "ACTIVE" ? "active" : ""}`}
            onClick={() => setFilterStatus("ACTIVE")}
          >
            <CheckCircle2 size={14} />
            <span>Actifs ({activeCount})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={filterStatus === "INACTIVE"}
            className={`profile-tab-item ${filterStatus === "INACTIVE" ? "active" : ""}`}
            onClick={() => setFilterStatus("INACTIVE")}
          >
            <XCircle size={14} />
            <span>Inactifs ({inactiveCount})</span>
          </button>
        </div>

        <div
          className="unified-filter-bar"
          style={{
            marginBottom: 0,
            minHeight: 44,
            padding: "2px 10px 2px 14px",
            width: "100%",
            maxWidth: 360,
          }}
        >
          <div className="unified-filter-segment segment-search" style={{ flex: 1, height: 38 }}>
            <Search size={15} className="segment-icon" aria-hidden="true" />
            <div className="segment-input-group">
              <input
                aria-label="Rechercher un niveau ou responsable"
                placeholder="Rechercher niveau ou responsable…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="unified-search-input"
              />
            </div>
            {search && (
              <button
                type="button"
                className="segment-clear-btn"
                onClick={() => setSearch("")}
                title="Effacer la recherche"
                aria-label="Effacer la recherche"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Departments Table */}
      <section className="data-section">
        {personnelLoading ? (
          <div role="status" aria-label="Chargement des divisions" aria-busy="true">
            <TableSkeleton columns={6} rows={6} />
          </div>
        ) : !filteredDepartments.length ? (
          <Empty
            text={
              totalCount === 0
                ? "Aucun niveau enregistré pour le moment."
                : "Aucun niveau ne correspond aux filtres de recherche."
            }
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>NIVEAU / DIVISION</th>
                  <th>RESPONSABLE(S)</th>
                  <th>STATUT</th>
                  <th>EFFECTIF RATTACHÉ</th>
                  <th>AGENTS ACTIFS</th>
                  <th style={{ textAlign: "right" }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredDepartments.map((dept) => {
                  const isActive = dept.isActive !== false;
                  const stats = getDepartmentStats(dept.id);
                  const respList = dept.responsables || [];

                  return (
                    <tr key={dept.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 8,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: isActive ? "#e8f5ed" : "#f1f3f2",
                              color: isActive ? "#1e6b52" : "#7d8b84",
                              flexShrink: 0,
                            }}
                          >
                            <Layers size={16} />
                          </span>
                          <div>
                            <strong style={{ fontSize: 13, color: isActive ? "#1a2720" : "#7d8b84" }}>
                              {dept.name}
                            </strong>
                            <small
                              style={{
                                display: "block",
                                color: "#8a968f",
                                fontSize: 10,
                                marginTop: 1,
                              }}
                            >
                              Identifiant : #{dept.id.slice(0, 8)}
                            </small>
                          </div>
                        </div>
                      </td>

                      <td>
                        {respList.length === 0 ? (
                          <span style={{ color: "#8a968f", fontSize: 12 }}>Aucun responsable</span>
                        ) : (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {respList.map((r) => (
                              <span
                                key={r.id}
                                className="badge"
                                style={{
                                  background: "#edf4f0",
                                  color: "#1e6b52",
                                  fontSize: 11,
                                  padding: "3px 8px",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                }}
                              >
                                <UserCheck size={12} />
                                {r.prenom} {r.nom}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      <td>
                        <span className={`badge ${isActive ? "present" : "absent"}`}>
                          <i />
                          {isActive ? "Actif" : "Inactif"}
                        </span>
                      </td>

                      <td>
                        <Link
                          to={`/agents?department=${dept.id}`}
                          className="text-link"
                          title="Voir les agents de ce niveau"
                          style={{ gap: 4 }}
                        >
                          <strong>{stats.total}</strong> agent{stats.total > 1 ? "s" : ""}
                          <ArrowUpRight size={13} />
                        </Link>
                      </td>

                      <td>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: stats.active > 0 ? "#1e6b52" : "#8a968f",
                          }}
                        >
                          {stats.active} actif{stats.active > 1 ? "s" : ""}
                        </span>
                      </td>

                      <td style={{ textAlign: "right" }}>
                        <RowActionsMenu
                          ariaLabel={`Actions pour le niveau ${dept.name}`}
                          items={[
                            {
                              label: "Voir les agents",
                              icon: <Users size={14} />,
                              onClick: () => navigate(`/agents?department=${dept.id}`),
                            },
                            {
                              label: "Ajouter des personnels",
                              icon: <UserPlus size={14} />,
                              disabled: !isActive || pending,
                              onClick: () => setAddingPersonnelToDept(dept),
                            },
                            {
                              label: "Modifier / Responsables",
                              icon: <Pencil size={14} />,
                              disabled: pending,
                              onClick: () => handleOpenRename(dept),
                            },
                            ...(isCoordinator
                              ? [
                                  {
                                    label: isActive ? "Désactiver le niveau" : "Réactiver le niveau",
                                    icon: <Power size={14} />,
                                    variant: (isActive ? "danger" : "default") as "danger" | "default",
                                    disabled: pending || (isActive && stats.active > 0),
                                    title:
                                      isActive && stats.active > 0
                                        ? "Ce niveau contient des agents actifs et ne peut pas être désactivé"
                                        : undefined,
                                    onClick: () => setConfirmToggle(dept),
                                  },
                                ]
                              : []),
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modal Add / Edit */}
      <AnimatePresence>
        {modalMode && (
          <Modal
            key="dept-modal"
            title={modalMode === "CREATE" ? "Nouveau niveau / division" : "Modifier le niveau / division"}
            close={() => {
              if (!pending) setModalMode(null);
            }}
          >
            <form onSubmit={handleSaveModal}>
              <div className="field">
                <label htmlFor="dept-name-input">
                  Nom du niveau / division <span style={{ color: "#a4384c" }}>*</span>
                </label>
                <input
                  id="dept-name-input"
                  type="text"
                  required
                  maxLength={100}
                  autoFocus
                  placeholder="Ex : L1 Informatique, M1 Gestion, Direction Technique…"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  disabled={pending}
                />
                <small>Nom clair et explicite pour identifier ce niveau ou division.</small>
              </div>

              <div className="field">
                <label>Responsable(s) assigné(s)</label>
                <div
                  style={{
                    maxHeight: 180,
                    overflowY: "auto",
                    border: "1px solid #d0ded6",
                    borderRadius: 8,
                    padding: "6px 8px",
                    background: "#fcfdfc",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  {membres.length === 0 ? (
                    <small style={{ color: "#8a968f", padding: 6 }}>
                      Aucun membre disponible dans cette organisation.
                    </small>
                  ) : (
                    membres.map((m) => {
                      const checked = selectedResponsableIds.includes(String(m.id));
                      return (
                        <label
                          key={m.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "4px 6px",
                            cursor: "pointer",
                            fontSize: 13,
                            borderRadius: 4,
                            background: checked ? "#edf4f0" : "transparent",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={pending}
                            onChange={(e) => {
                              const sid = String(m.id);
                              if (e.target.checked) {
                                setSelectedResponsableIds([...selectedResponsableIds, sid]);
                              } else {
                                setSelectedResponsableIds(selectedResponsableIds.filter((id) => id !== sid));
                              }
                            }}
                          />
                          <span>
                            <strong>
                              {m.prenom} {m.nom}
                            </strong>{" "}
                            {!m.actif && <small style={{ color: "#a4384c" }}>(inactif)</small>}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
                <small>
                  Les responsables auront accès uniquement aux personnels, pointages et congés de ce niveau.
                </small>
              </div>

              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}

              <footer>
                <button
                  type="button"
                  className="button"
                  disabled={pending}
                  onClick={() => setModalMode(null)}
                >
                  Annuler
                </button>
                <button type="submit" className="button primary" disabled={pending}>
                  {pending
                    ? "Enregistrement…"
                    : modalMode === "CREATE"
                      ? "Créer le niveau"
                      : "Enregistrer"}
                </button>
              </footer>
            </form>
          </Modal>
        )}
      </AnimatePresence>

      {/* Modal d'ajout / affectation de personnels à la division */}
      <AnimatePresence>
        {addingPersonnelToDept && (
          <ModalAjouterPersonnelsDivision
            division={{ id: addingPersonnelToDept.id, name: addingPersonnelToDept.name }}
            onClose={() => setAddingPersonnelToDept(null)}
            onSuccess={() => setAddingPersonnelToDept(null)}
          />
        )}
      </AnimatePresence>

      {/* Confirmation Dialog for Status Change */}
      <AnimatePresence>
        {confirmToggle && (
          <Confirm
            key="confirm-dept-toggle"
            title={
              confirmToggle.isActive !== false
                ? `Désactiver le niveau « ${confirmToggle.name} » ?`
                : `Réactiver le niveau « ${confirmToggle.name} » ?`
            }
            text={
              confirmToggle.isActive !== false
                ? "Ce niveau sera marqué comme inactif. Il ne pourra plus être sélectionné pour de nouveaux agents."
                : "Ce niveau redeviendra actif et pourra à nouveau recevoir de nouveaux agents."
            }
            close={() => setConfirmToggle(null)}
            confirm={() => void handleToggleStatus(confirmToggle)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
