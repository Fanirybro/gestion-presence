import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Plus,
  Search,
  Pencil,
  ArrowUpRight,
  Download,
  Printer,
  RefreshCw,
  X,
  Building,
  Calendar,
  Briefcase,
  UserCheck,
  UserX,
  Clock,
  Sparkles,
  CheckCircle2,
  MoreVertical,
  Building2,
  RotateCcw,
  ArrowUpDown,
} from "lucide-react";
import { useApp } from "../app/context";
import {
  Back,
  Confirm,
  Empty,
  Field,
  Heading,
} from "../components/ui";
import { dateLabel, fullName, initials } from "../utils";
import { personnelApi, type PersonnelInput } from "../services/personnel";
import { badgesApi } from "../services/badges";
import { type BadgePrintFormat } from "../components/BadgePrintFormat";
import { flushSync } from "react-dom";
import type { Agent } from "../types";

/* ═══════════════════════════════════════════════════════════════
   Agent Status Toggle Button
   ═══════════════════════════════════════════════════════════════ */
function AgentStatus({
  agent,
  onStatusChanged,
}: {
  agent: Agent;
  onStatusChanged?: () => void;
}) {
  const { refreshPersonnel, notify } = useApp();
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);

  const change = async () => {
    setPending(true);
    try {
      await personnelApi.update(agent.id, { actif: !agent.isActive });
      await refreshPersonnel();
      notify(
        agent.isActive
          ? "Agent désactivé. Badges révoqués."
          : "Agent réactivé.",
      );
      onStatusChanged?.();
    } catch (error) {
      notify((error as Error).message, true);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <button
        className={`agent-action-btn ${agent.isActive ? "deactivate" : "activate"}`}
        disabled={pending}
        onClick={(e) => {
          e.stopPropagation();
          setConfirm(true);
        }}
      >
        {pending ? (
          "…"
        ) : agent.isActive ? (
          <>
            <UserX size={14} />
            Désactiver
          </>
        ) : (
          <>
            <UserCheck size={14} />
            Réactiver
          </>
        )}
      </button>

      <AnimatePresence>
        {confirm && (
          <Confirm
            title={
              agent.isActive
                ? "Désactiver cet agent ?"
                : "Réactiver cet agent ?"
            }
            text={
              agent.isActive
                ? `${fullName(agent)} restera dans le personnel inactif. Ses badges seront révoqués et son historique sera conservé.`
                : "L’agent sera de nouveau actif. Les anciens badges restent révoqués."
            }
            close={() => setConfirm(false)}
            confirm={() => void change()}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Comprehensive Agent Detail & Badge Modal
   ═══════════════════════════════════════════════════════════════ */
function AgentDetailModal({
  agent,
  onClose,
  ageValue,
}: {
  agent: Agent;
  onClose: () => void;
  ageValue: number | null;
}) {
  const { db, user, notify } = useApp();
  const client = useQueryClient();
  const badgeCardRef = useRef<HTMLElement>(null);
  const [exporting, setExporting] = useState(false);
  const [printFormat, setPrintFormat] = useState<BadgePrintFormat>("cr80");
  const [pendingBadge, setPendingBadge] = useState(false);
  const [badgeError, setBadgeError] = useState("");
  const [confirmBadgeAction, setConfirmBadgeAction] = useState<"regenerate" | "revoke" | null>(null);

  // Department name
  const departmentName =
    db.departments.find((d) => d.id === agent.departmentId)?.name ?? "Non assigné";

  // Linked user query
  const members = useQuery({
    queryKey: ["personnel-members", user?.organisationId, user?.id],
    queryFn: personnelApi.members,
  });
  const member = members.data?.membres.find((m) => String(m.id) === agent.userId);

  // Badge query
  const badgeKey = ["badge", user?.organisationId, user?.id, agent.id];
  const badgeQuery = useQuery({
    queryKey: badgeKey,
    queryFn: () => badgesApi.get(agent.id),
    enabled: Boolean(agent.id),
  });
  const token = badgeQuery.data?.badge?.token;

  // QR image query
  const imageQuery = useQuery({
    queryKey: ["badge-image", token],
    enabled: Boolean(token),
    queryFn: async () => {
      const { default: QRCode } = await import("qrcode");
      return QRCode.toDataURL(token!, {
        width: 480,
        margin: 2,
        errorCorrectionLevel: "M",
      });
    },
  });

  // Badge actions
  async function handleBadgeAction(action: "create" | "regenerate" | "revoke") {
    if (pendingBadge) return;
    setPendingBadge(true);
    setBadgeError("");
    try {
      await client.cancelQueries({ queryKey: badgeKey });
      const result =
        action === "revoke"
          ? await badgesApi.revoke(agent.id)
          : await badgesApi.create(agent.id, action === "regenerate");
      client.setQueryData(badgeKey, result);
      notify(
        action === "revoke"
          ? "Badge révoqué."
          : action === "regenerate"
            ? "Nouveau badge créé. L’ancien code est invalidé."
            : "Badge généré et enregistré.",
      );
    } catch (err) {
      setBadgeError((err as Error).message);
      notify((err as Error).message, true);
    } finally {
      setPendingBadge(false);
    }
  }

  // Download Badge PDF
  async function downloadBadgePdf(format: BadgePrintFormat) {
    if (!badgeCardRef.current || exporting) return;
    setExporting(true);
    try {
      await document.fonts.ready;
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(badgeCardRef.current, {
        scale: 4,
        backgroundColor: "#ffffff",
      });
      const pdf = new jsPDF({
        orientation: format === "cr80" ? "landscape" : "portrait",
        unit: "mm",
        format: format === "cr80" ? [86, 54] : "a6",
      });
      pdf.addImage(
        canvas.toDataURL("image/png"),
        "PNG",
        format === "cr80" ? 0 : 9.5,
        format === "cr80" ? 0 : 47,
        86,
        54,
      );
      pdf.save(`badge-${agent.id}-${format}.pdf`);
      notify("Badge PDF téléchargé !");
    } catch {
      notify("Impossible d'exporter le badge.", true);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="agent-modal-backdrop" onClick={onClose}>
      <motion.div
        className="agent-modal-dialog"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ type: "spring", stiffness: 380, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <header className="agent-modal-header">
          <div className="agent-modal-header-left">
            <span className={`agent-modal-avatar tone-${Number(agent.id.replace(/\D/g, "") || 0) % 4}`}>
              {initials(fullName(agent))}
            </span>
            <div>
              <div className="agent-modal-name-row">
                <h2>{fullName(agent)}</h2>
                <span className={`badge ${agent.isActive ? "present" : "absent"}`}>
                  <i />
                  {agent.isActive ? "Actif" : "Inactif"}
                </span>
              </div>
              <p className="agent-modal-subtitle">
                {agent.position || "Poste non spécifié"} · {departmentName}
              </p>
            </div>
          </div>

          <div className="agent-modal-header-actions">
            <Link
              to={`/presences?search=${encodeURIComponent(fullName(agent))}&agentId=${agent.id}`}
              className="button small"
              title="Consulter les pointages de cet agent"
            >
              <Clock size={14} />
              Voir les pointages
            </Link>
            <Link
              to={`/agents/${agent.id}/edit`}
              className="button small"
              title="Modifier les informations"
            >
              <Pencil size={14} />
              Modifier
            </Link>
            <AgentStatus agent={agent} />
            <button
              className="icon-button agent-modal-close"
              onClick={onClose}
              aria-label="Fermer"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* Modal Body: 2 Columns Grid */}
        <div className="agent-modal-body">
          {/* Left Column: Dossier RH & Infos */}
          <div className="agent-modal-col-info">
            <div className="agent-info-card">
              <h3>
                <Briefcase size={16} />
                Informations Professionnelles
              </h3>
              <div className="agent-info-grid">
                <div>
                  <small>DÉPARTEMENT</small>
                  <strong>{departmentName}</strong>
                </div>
                <div>
                  <small>POSTE OCCUPÉ</small>
                  <strong>{agent.position || "—"}</strong>
                </div>
                <div>
                  <small>DATE D'EMBAUCHE</small>
                  <strong>{agent.hireDate ? dateLabel(agent.hireDate) : "—"}</strong>
                </div>
                <div>
                  <small>COMPTE UTILISATEUR LIÉ</small>
                  <strong>
                    {member ? (
                      <span className="account-tag">
                        <CheckCircle2 size={13} />
                        {member.prenom} {member.nom}
                      </span>
                    ) : agent.userId ? (
                      "Compte associé"
                    ) : (
                      "Aucun compte lié"
                    )}
                  </strong>
                </div>
              </div>
            </div>

            <div className="agent-info-card">
              <h3>
                <Calendar size={16} />
                Informations Personnelles
              </h3>
              <div className="agent-info-grid">
                <div>
                  <small>DATE DE NAISSANCE</small>
                  <strong>{agent.birthDate ? dateLabel(agent.birthDate) : "—"}</strong>
                </div>
                <div>
                  <small>ÂGE</small>
                  <strong>{ageValue !== null ? `${ageValue} ans` : "Non renseigné"}</strong>
                </div>
                <div>
                  <small>ENREGISTRÉ LE</small>
                  <strong>{dateLabel(agent.createdAt)}</strong>
                </div>
                <div>
                  <small>IDENTIFIANT RH</small>
                  <code>#{agent.id.slice(0, 8)}</code>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Physical Badge & QR */}
          <div className="agent-modal-col-badge">
            <div className="agent-badge-preview-card">
              {/* Printable Physical Badge Format Container */}
              <div className="agent-badge-wrapper" data-badge-format={printFormat}>
                <section ref={badgeCardRef} className="agent-physical-badge print-area">
                  <div className="agent-badge-top-banner">
                    <div className="agent-badge-banner-content">
                      <span className="brand-title">présence.</span>
                      <small>{db.settings.organization}</small>
                    </div>

                    {/* Windows Context Menu Style 3-Dots Dropdown */}
                    {token && (
                      <details className="agent-badge-dots-menu">
                        <summary aria-label="Options du badge" title="Options">
                          <MoreVertical size={16} />
                        </summary>
                        <div className="agent-badge-dropdown">
                          <div className="agent-dropdown-group">
                            <span className="agent-dropdown-header">Exportation</span>
                            <button
                              type="button"
                              disabled={!imageQuery.data || !agent.isActive || exporting}
                              onClick={(e) => {
                                e.currentTarget.closest("details")?.removeAttribute("open");
                                void downloadBadgePdf("cr80");
                              }}
                            >
                              <Download size={14} />
                              <span>Télécharger PDF (CR80)</span>
                            </button>
                            <button
                              type="button"
                              disabled={!imageQuery.data || !agent.isActive || exporting}
                              onClick={(e) => {
                                e.currentTarget.closest("details")?.removeAttribute("open");
                                void downloadBadgePdf("a6");
                              }}
                            >
                              <Download size={14} />
                              <span>Télécharger PDF (A6)</span>
                            </button>
                            <button
                              type="button"
                              disabled={!imageQuery.data || !agent.isActive || exporting}
                              onClick={(e) => {
                                e.currentTarget.closest("details")?.removeAttribute("open");
                                flushSync(() => setPrintFormat("cr80"));
                                window.print();
                              }}
                            >
                              <Printer size={14} />
                              <span>Imprimer le badge</span>
                            </button>
                          </div>

                          <div className="agent-dropdown-divider" />

                          <div className="agent-dropdown-group">
                            <span className="agent-dropdown-header">Gestion</span>
                            <button
                              type="button"
                              disabled={!agent.isActive || pendingBadge}
                              onClick={(e) => {
                                e.currentTarget.closest("details")?.removeAttribute("open");
                                setConfirmBadgeAction("regenerate");
                              }}
                            >
                              <RefreshCw size={14} />
                              <span>Régénérer le QR</span>
                            </button>
                            <button
                              type="button"
                              className="danger"
                              disabled={pendingBadge}
                              onClick={(e) => {
                                e.currentTarget.closest("details")?.removeAttribute("open");
                                setConfirmBadgeAction("revoke");
                              }}
                            >
                              <X size={14} />
                              <span>Révoquer le badge</span>
                            </button>
                          </div>
                        </div>
                      </details>
                    )}
                  </div>

                  <div className="agent-badge-qr-area">
                    {agent.isActive && !pendingBadge && imageQuery.data && (
                      <img
                        src={imageQuery.data}
                        width={200}
                        height={200}
                        alt={`QR Code de ${fullName(agent)}`}
                      />
                    )}
                    {(badgeQuery.isPending || (token && imageQuery.isPending)) && (
                      <div className="badge-loading-placeholder">
                        <p>Génération du QR…</p>
                      </div>
                    )}
                    {!agent.isActive && (
                      <div className="badge-empty-state">
                        <p>Agent inactif. Pointage suspendu.</p>
                      </div>
                    )}
                    {agent.isActive && !badgeQuery.isPending && !token && (
                      <div className="badge-empty-state">
                        <p>Aucun badge configuré.</p>
                      </div>
                    )}
                  </div>
                  <div className="agent-badge-info">
                    <h4>{fullName(agent)}</h4>
                    <p>{agent.position || "Employé"}</p>
                    <span className="dept-tag">{departmentName}</span>
                  </div>
                </section>
              </div>

              {/* Badge Error or Create Button if no token */}
              {badgeError && (
                <p className="form-error" role="alert">
                  {badgeError}
                </p>
              )}

              {!token && (
                <button
                  className="button primary full-width"
                  disabled={!agent.isActive || pendingBadge}
                  onClick={() => void handleBadgeAction("create")}
                >
                  <Sparkles size={16} />
                  {pendingBadge ? "Création…" : "Générer le Badge"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Confirmation dialog for badge regenerate/revoke */}
        <AnimatePresence>
          {confirmBadgeAction && (
            <Confirm
              title={
                confirmBadgeAction === "regenerate"
                  ? "Régénérer le code QR ?"
                  : "Révoquer le badge ?"
              }
              text="L'ancien badge QR sera immédiatement invalidé pour les prochains pointages."
              close={() => setConfirmBadgeAction(null)}
              confirm={() => void handleBadgeAction(confirmBadgeAction)}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Main Personnel Page (Interactive Cards Grid + Modal)
   ═══════════════════════════════════════════════════════════════ */
export function Agents() {
  const { db, organisation } = useApp();
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  const currentDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: organisation?.fuseau_horaire || "Indian/Antananarivo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const age = (birthDate?: string) => {
    if (!birthDate || birthDate > currentDate) return null;
    const years = Number(currentDate.slice(0, 4)) - Number(birthDate.slice(0, 4));
    return years - (currentDate.slice(5) < birthDate.slice(5) ? 1 : 0);
  };

  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("name");

  const agents = db.agents
    .filter(
      (a) =>
        fullName(a)
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (!department || a.departmentId === department) &&
        (!status || String(a.isActive) === status),
    )
    .sort((a, b) =>
      sort === "age"
        ? (age(a.birthDate) ?? Infinity) - (age(b.birthDate) ?? Infinity)
        : fullName(a).localeCompare(fullName(b)),
    );

  return (
    <>
      <Heading
        eyebrow="RÉFÉRENTIEL RH"
        title="Personnel"
        subtitle={`${db.agents.length} agents · Fiches d'identité, affectations et badges`}
      >
        <Link className="button" to="/agents/badges">
          Imprimer les badges
        </Link>
        <Link className="button" to="/departments">
          <Building size={16} />
          Gérer les départements
        </Link>
        <Link className="button primary" to="/agents/new">
          <Plus size={18} />
          Nouvel agent
        </Link>
      </Heading>

      {/* Search & Filter Toolbar */}
      <section aria-label="Filtres du personnel" className="unified-filter-bar">
        {/* 1. Recherche */}
        <div className="unified-filter-segment segment-search" style={{ flex: 1.5, minWidth: 200 }}>
          <Search size={16} className="segment-icon" aria-hidden="true" />
          <div className="segment-input-group">
            <span className="segment-label">Agent</span>
            <input
              aria-label="Rechercher un agent"
              placeholder="Rechercher un nom ou prénom…"
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

        <div className="unified-filter-divider" aria-hidden="true" />

        {/* 2. Département */}
        <div className="unified-filter-segment segment-dept" style={{ flex: 1.2, minWidth: 170 }}>
          <Building2 size={16} className="segment-icon" aria-hidden="true" />
          <div className="segment-input-group">
            <span className="segment-label">Département</span>
            <select
              aria-label="Département"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="unified-select"
            >
              <option value="">Tous les départements</option>
              {db.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          {department && (
            <button
              type="button"
              className="segment-clear-btn"
              onClick={() => setDepartment("")}
              title="Effacer le filtre département"
              aria-label="Effacer le filtre département"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="unified-filter-divider" aria-hidden="true" />

        {/* 3. Statut */}
        <div className="unified-filter-segment segment-status" style={{ flex: 1, minWidth: 145 }}>
          <UserCheck size={16} className="segment-icon" aria-hidden="true" />
          <div className="segment-input-group">
            <span className="segment-label">Statut</span>
            <select
              aria-label="Statut de l’agent"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="unified-select"
            >
              <option value="">Tous les statuts</option>
              <option value="true">Actifs</option>
              <option value="false">Inactifs</option>
            </select>
          </div>
          {status && (
            <button
              type="button"
              className="segment-clear-btn"
              onClick={() => setStatus("")}
              title="Effacer le filtre statut"
              aria-label="Effacer le filtre statut"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="unified-filter-divider" aria-hidden="true" />

        {/* 4. Tri */}
        <div className="unified-filter-segment segment-sort" style={{ flex: 1, minWidth: 155 }}>
          <ArrowUpDown size={15} className="segment-icon" aria-hidden="true" />
          <div className="segment-input-group">
            <span className="segment-label">Tri</span>
            <select
              aria-label="Trier les agents"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="unified-select"
            >
              <option value="name">Par nom (A-Z)</option>
              <option value="age">Par âge</option>
            </select>
          </div>
        </div>

        {(search || department || status || sort !== "name") && (
          <>
            <div className="unified-filter-divider" aria-hidden="true" />
            <button
              type="button"
              className="unified-reset-btn"
              title="Réinitialiser les filtres"
              onClick={() => {
                setSearch("");
                setDepartment("");
                setStatus("");
                setSort("name");
              }}
            >
              <RotateCcw size={13} />
              <span>Réinitialiser</span>
            </button>
          </>
        )}
      </section>

      {/* Cards Grid Section */}
      <section className="agent-cards-container">
        {!agents.length ? (
          <Empty
            text={
              db.agents.length
                ? "Aucun agent ne correspond aux filtres de recherche"
                : "Aucun agent enregistré dans l'organisation"
            }
          />
        ) : (
          <div className="agent-cards-grid">
            {agents.map((a) => {
              const deptName =
                db.departments.find((d) => d.id === a.departmentId)?.name ?? "—";
              const agentAge = age(a.birthDate);

              return (
                <div
                  key={a.id}
                  className={`agent-card ${!a.isActive ? "inactive" : ""}`}
                  tabIndex={0}
                  role="button"
                  aria-label={`Ouvrir la fiche de ${fullName(a)}`}
                  onClick={() => setSelectedAgent(a)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedAgent(a);
                    }
                  }}
                >
                  {/* Top Bar of Card */}
                  <div className="agent-card-header">
                    <span className={`agent-card-avatar tone-${Number(a.id.replace(/\D/g, "") || 0) % 4}`}>
                      {initials(fullName(a))}
                    </span>
                    <span className={`badge ${a.isActive ? "present" : "absent"}`}>
                      <i />
                      {a.isActive ? "Actif" : "Inactif"}
                    </span>
                  </div>

                  {/* Identity */}
                  <div className="agent-card-identity">
                    <h3>{fullName(a)}</h3>
                    <p className="agent-card-position">{a.position || "Poste non renseigné"}</p>
                    <span className="agent-card-dept">
                      <Building size={13} />
                      {deptName}
                    </span>
                  </div>

                  {/* Highlights Grid */}
                  <div className="agent-card-details">
                    <div>
                      <small>ÂGE</small>
                      <span>{agentAge !== null ? `${agentAge} ans` : "—"}</span>
                    </div>
                    <div>
                      <small>EMBAUCHE</small>
                      <span>{a.hireDate ? dateLabel(a.hireDate) : "—"}</span>
                    </div>
                  </div>

                  {/* Card Footer / Quick Actions */}
                  <div className="agent-card-footer">
                    <span className="agent-card-cta">
                      Détails &amp; Badge
                      <ArrowUpRight size={15} />
                    </span>

                    <div className="agent-card-actions" onClick={(e) => e.stopPropagation()}>
                      <Link
                        to={`/agents/${a.id}/edit`}
                        className="agent-icon-btn"
                        title="Modifier l'agent"
                      >
                        <Pencil size={14} />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Large Detail & Badge Modal */}
      <AnimatePresence>
        {selectedAgent && (
          <AgentDetailModal
            agent={
              db.agents.find((a) => a.id === selectedAgent.id) ?? selectedAgent
            }
            ageValue={age(selectedAgent.birthDate)}
            onClose={() => setSelectedAgent(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Existing Subpages for Form and Details
   ═══════════════════════════════════════════════════════════════ */
export function AgentForm() {
  const { id } = useParams();
  const { db } = useApp();
  const agent = db.agents.find((a) => a.id === id);
  if (id && !agent)
    return (
      <Empty text="Agent introuvable">
        <Link to="/agents">Retour au personnel</Link>
      </Empty>
    );
  return <PersonnelForm key={id ?? "new"} agent={agent} />;
}

function PersonnelForm({ agent }: { agent?: Agent }) {
  const { db, user, refreshPersonnel, notify, organisation } = useApp();
  const navigate = useNavigate();
  const currentDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: organisation?.fuseau_horaire || "Indian/Antananarivo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const [form, setForm] = useState<PersonnelInput>({
    nom: agent?.lastName ?? "",
    prenom: agent?.firstName ?? "",
    departement_id: agent?.departmentId ?? "",
    utilisateur_id: agent?.userId ?? null,
    date_naissance: agent?.birthDate ?? "",
    date_embauche: agent?.hireDate || null,
    poste: agent?.position ?? "",
    actif: agent?.isActive ?? true,
  });
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const departments = db.departments;
  const members = useQuery({
    queryKey: ["personnel-members", user?.organisationId, user?.id],
    queryFn: personnelApi.members,
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nom.trim() || !form.prenom.trim()) {
      setError("Le nom et le prénom sont obligatoires.");
      return;
    }
    if (!form.departement_id) {
      setError("Veuillez sélectionner un département.");
      return;
    }
    setPending(true);
    setError("");
    try {
      if (agent) {
        await personnelApi.update(agent.id, form);
        notify("Agent mis à jour.");
      } else {
        await personnelApi.create(form);
        notify("Agent créé avec succès.");
      }
      await refreshPersonnel();
      navigate("/agents");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Back to="/agents" label="Personnel" />
      <Heading
        title={agent ? `Modifier ${fullName(agent)}` : "Nouvel agent"}
        subtitle="Renseignez les données administratives et l'affectation."
      />
      <form onSubmit={submit} className="form-surface">
        <fieldset disabled={pending}>
          <div className="form-grid">
            <Field label="Prénom">
              <input
                required
                value={form.prenom}
                onChange={(e) => setForm({ ...form, prenom: e.target.value })}
              />
            </Field>
            <Field label="Nom">
              <input
                required
                value={form.nom}
                onChange={(e) => setForm({ ...form, nom: e.target.value })}
              />
            </Field>
            <Field label="Date de naissance">
              <input
                type="date"
                max={currentDate}
                value={form.date_naissance}
                onChange={(e) =>
                  setForm({ ...form, date_naissance: e.target.value })
                }
              />
            </Field>
            <Field label="Date d'embauche">
              <input
                type="date"
                max={currentDate}
                value={form.date_embauche || ""}
                onChange={(e) =>
                  setForm({ ...form, date_embauche: e.target.value || null })
                }
              />
            </Field>
            <Field label="Poste / Rôle">
              <input
                value={form.poste || ""}
                placeholder="ex: Comptable, Développeur…"
                onChange={(e) => setForm({ ...form, poste: e.target.value })}
              />
            </Field>
            <Field label="Département">
              <select
                required
                value={form.departement_id}
                onChange={(e) =>
                  setForm({ ...form, departement_id: e.target.value })
                }
              >
                <option value="">Sélectionner un département</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {d.isActive === false ? " (inactif)" : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Compte utilisateur lié (facultatif)"
              hint="Un compte ne peut être associé qu’à un seul agent dans cette organisation."
            >
              <select
                disabled={members.isPending || members.isError}
                value={form.utilisateur_id ?? ""}
                onChange={(e) =>
                  setForm({ ...form, utilisateur_id: e.target.value || null })
                }
              >
                <option value="">Aucun compte lié</option>
                {form.utilisateur_id &&
                  !members.data?.membres.some(
                    (m) => String(m.id) === form.utilisateur_id,
                  ) && (
                    <option value={form.utilisateur_id}>
                      Compte lié actuel
                    </option>
                  )}
                {members.data?.membres
                  .filter(
                    (m) =>
                      String(m.id) === agent?.userId ||
                      (m.actif &&
                        !db.agents.some(
                          (a) =>
                            a.id !== agent?.id && a.userId === String(m.id),
                        )),
                  )
                  .map((m) => (
                    <option key={m.id} value={String(m.id)}>
                      {m.prenom} {m.nom}
                      {!m.actif ? " (inactif)" : ""}
                    </option>
                  ))}
              </select>
            </Field>
            <label className="check-field">
              <input
                type="checkbox"
                checked={form.actif}
                onChange={(e) => setForm({ ...form, actif: e.target.checked })}
              />
              Agent actif
            </label>
          </div>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <div className="form-actions">
            <Link className="button" to="/agents">
              Annuler
            </Link>
            <button className="button primary" type="submit" disabled={pending}>
              {pending ? "Enregistrement…" : "Enregistrer l’agent"}
            </button>
          </div>
        </fieldset>
      </form>
    </>
  );
}

export function AgentDetails() {
  const { id } = useParams();
  const { db, user } = useApp();
  const members = useQuery({
    queryKey: ["personnel-members", user?.organisationId, user?.id],
    queryFn: personnelApi.members,
  });
  const a = db.agents.find((a) => a.id === id);
  if (!a) return <Empty text="Agent introuvable" />;
  const member = members.data?.membres.find((m) => String(m.id) === a.userId);

  return (
    <>
      <Back to="/agents" label="Personnel" />
      <Heading title={fullName(a)} subtitle={a.position || undefined}>
        <Link className="button" to={`/agents/${id}/edit`}>
          <Pencil size={16} />
          Modifier
        </Link>
        <Link className="button small" to={`/agents/${a.id}/qr`}>
          Badge QR
        </Link>
        <AgentStatus agent={a} />
      </Heading>
      <div className="detail-strip">
        {[
          [
            "DÉPARTEMENT",
            db.departments.find((d) => d.id === a.departmentId)?.name ?? "—",
          ],
          ["NAISSANCE", a.birthDate ? dateLabel(a.birthDate) : "—"],
          ["EMBAUCHE", a.hireDate ? dateLabel(a.hireDate) : "—"],
          ["STATUT", a.isActive ? "Actif" : "Inactif"],
          [
            "COMPTE LIÉ",
            member
              ? `${member.prenom} ${member.nom}`
              : a.userId
                ? members.isError
                  ? "Indisponible"
                  : "Chargement…"
                : "Aucun",
          ],
          ["CRÉATION", dateLabel(a.createdAt)],
        ].map(([label, value]) => (
          <div key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </>
  );
}

export { default as AgentQr } from "./AgentQr";
