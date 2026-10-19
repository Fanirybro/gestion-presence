import { useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence } from "motion/react";
import {
  Building2,
  Plus,
  Search,
  Users,
  CheckCircle2,
  XCircle,
  Pencil,
  ArrowUpRight,
  Power,
  X,
} from "lucide-react";
import { useApp } from "../app/context";
import { Heading, Empty, Modal, Confirm } from "../components/ui";
import { personnelApi } from "../services/personnel";
import { RowActionsMenu } from "../components/RowActionsMenu";

type DepartmentItem = { id: string; name: string; isActive?: boolean };

export default function DepartmentsPage() {
  const { db, refreshPersonnel, notify } = useApp();

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [modalMode, setModalMode] = useState<"CREATE" | "RENAME" | null>(null);
  const [targetDept, setTargetDept] = useState<DepartmentItem | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [confirmToggle, setConfirmToggle] = useState<DepartmentItem | null>(null);

  // Statistics
  const totalCount = db.departments.length;
  const activeCount = db.departments.filter((d) => d.isActive !== false).length;
  const inactiveCount = totalCount - activeCount;
  const totalAgentsCount = db.agents.length;

  // Filtered departments list
  const filteredDepartments = db.departments
    .filter((d) => {
      const matchesSearch = d.name.toLowerCase().includes(search.toLowerCase());
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
    setError("");
    setModalMode("CREATE");
    setTargetDept(null);
  };

  const handleOpenRename = (dept: DepartmentItem) => {
    setNameInput(dept.name);
    setError("");
    setTargetDept(dept);
    setModalMode("RENAME");
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setError("Le nom du département ne peut pas être vide.");
      return;
    }

    // Check duplicate
    const duplicate = db.departments.some(
      (d) =>
        d.name.toLowerCase() === trimmed.toLowerCase() &&
        (!targetDept || d.id !== targetDept.id),
    );
    if (duplicate) {
      setError("Un département portant ce nom existe déjà.");
      return;
    }

    setPending(true);
    setError("");
    try {
      if (modalMode === "CREATE") {
        await personnelApi.createDepartment(trimmed);
        notify("Département créé avec succès.");
      } else if (modalMode === "RENAME" && targetDept) {
        await personnelApi.updateDepartment(targetDept.id, { nom: trimmed });
        notify("Département renommé avec succès.");
      }
      await refreshPersonnel();
      setModalMode(null);
      setNameInput("");
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
        `Impossible de désactiver : ce département contient ${active} agent(s) actif(s). Réaffectez-les d'abord.`,
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
          ? "Département désactivé."
          : "Département réactivé avec succès.",
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
        title="Départements"
        subtitle="Gestion des pôles, services et rattachement des agents de l'organisation"
      >
        <button className="button primary" onClick={handleOpenCreate}>
          <Plus size={16} />
          Nouveau département
        </button>
      </Heading>

      {/* KPI Metrics Strip (Model from Reports) */}
      <div className="rp-metrics-row">
        <div className="rp-metric-cell">
          <span className="rp-metric-label">
            <CheckCircle2 size={14} style={{ color: "#1e6b52" }} /> Départements actifs
          </span>
          <strong className="rp-metric-value green">{activeCount}</strong>
          <small className="rp-metric-sub">Sur un total de {totalCount}</small>
        </div>

        <div className="rp-metric-cell">
          <span className="rp-metric-label">
            <XCircle size={14} /> Départements inactifs
          </span>
          <strong className="rp-metric-value">{inactiveCount}</strong>
          <small className="rp-metric-sub">Archivés ou suspendus</small>
        </div>

        <div className="rp-metric-cell">
          <span className="rp-metric-label">
            <Users size={14} /> Effectif global
          </span>
          <strong className="rp-metric-value">{totalAgentsCount}</strong>
          <small className="rp-metric-sub">Agents enregistrés</small>
        </div>

        <div className="rp-metric-cell">
          <span className="rp-metric-label">
            <Building2 size={14} /> Moyenne par service
          </span>
          <strong className="rp-metric-value">
            {activeCount > 0 ? (totalAgentsCount / activeCount).toFixed(1) : "0"}
          </strong>
          <small className="rp-metric-sub">Agents par département actif</small>
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
            <span>Tous les services ({totalCount})</span>
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
                aria-label="Rechercher un département"
                placeholder="Rechercher par nom de service…"
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

      {/* Departments Table / Cards */}
      <section className="data-section">
        {!filteredDepartments.length ? (
          <Empty
            text={
              totalCount === 0
                ? "Aucun département enregistré pour le moment. Cliquez sur « Nouveau département » pour créer le premier."
                : "Aucun département ne correspond aux filtres de recherche."
            }
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>DÉPARTEMENT</th>
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
                            <Building2 size={16} />
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
                        <span className={`badge ${isActive ? "present" : "absent"}`}>
                          <i />
                          {isActive ? "Actif" : "Inactif"}
                        </span>
                      </td>

                      <td>
                        <Link
                          to={`/agents?department=${dept.id}`}
                          className="text-link"
                          title="Voir les agents de ce département"
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
                          ariaLabel={`Actions pour le département ${dept.name}`}
                          items={[
                            {
                              label: "Renommer",
                              icon: <Pencil size={14} />,
                              disabled: pending,
                              onClick: () => handleOpenRename(dept),
                            },
                            {
                              label: isActive ? "Désactiver le département" : "Réactiver le département",
                              icon: <Power size={14} />,
                              variant: isActive ? "danger" : "default",
                              disabled: pending || (isActive && stats.active > 0),
                              title:
                                isActive && stats.active > 0
                                  ? "Ce département contient des agents actifs et ne peut pas être désactivé"
                                  : undefined,
                              onClick: () => setConfirmToggle(dept),
                            },
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

      {/* Modal Add / Rename */}
      <AnimatePresence>
        {modalMode && (
          <Modal
            key="dept-modal"
            title={modalMode === "CREATE" ? "Nouveau département" : "Renommer le département"}
            close={() => {
              if (!pending) setModalMode(null);
            }}
          >
            <form onSubmit={handleSaveModal}>
              <div className="field">
                <label htmlFor="dept-name-input">
                  Nom du département <span style={{ color: "#a4384c" }}>*</span>
                </label>
                <input
                  id="dept-name-input"
                  type="text"
                  required
                  maxLength={100}
                  autoFocus
                  placeholder="Ex : Informatique, Ressources Humaines, Logistique…"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  disabled={pending}
                />
                <small>Nom court et explicite pour identifier le service ou pôle RH.</small>
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
                      ? "Créer le département"
                      : "Enregistrer"}
                </button>
              </footer>
            </form>
          </Modal>
        )}
      </AnimatePresence>

      {/* Confirmation Dialog for Status Change */}
      <AnimatePresence>
        {confirmToggle && (
          <Confirm
            key="confirm-dept-toggle"
            title={
              confirmToggle.isActive !== false
                ? `Désactiver le département « ${confirmToggle.name} » ?`
                : `Réactiver le département « ${confirmToggle.name} » ?`
            }
            text={
              confirmToggle.isActive !== false
                ? "Le département sera marqué comme inactif. Il ne pourra plus être sélectionné pour de nouveaux agents."
                : "Le département redeviendra actif et pourra à nouveau recevoir de nouveaux agents."
            }
            close={() => setConfirmToggle(null)}
            confirm={() => void handleToggleStatus(confirmToggle)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
