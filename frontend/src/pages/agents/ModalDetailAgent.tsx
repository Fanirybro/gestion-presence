import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import {
  Briefcase,
  Camera,
  Clock,
  Download,
  IdCard,
  MoreVertical,
  Pencil,
  Phone,
  Printer,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { useApp } from "../../app/context";
import { Confirm } from "../../components/ui";
import { dateLabel, fullName, initials } from "../../utils";
import { generateQrCodeUrl } from "../../utils/qrcode";
import { badgesApi } from "../../services/badges";
import { type BadgePrintFormat } from "../../components/BadgePrintFormat";
import type { Agent } from "../../types";

export function ModalDetailAgent({
  agent,
  onClose,
  ageValeur,
  onEnroll,
}: {
  agent: Agent;
  onClose: () => void;
  ageValeur: number | null;
  onEnroll?: (agent: Agent) => void;
}) {
  const { db, user, notify } = useApp();
  const client = useQueryClient();
  const badgeCardRef = useRef<HTMLElement>(null);
  const [exportEnCours, setExportEnCours] = useState(false);
  const [formatImpression, setFormatImpression] = useState<BadgePrintFormat>("cr80");
  const [badgeEnAttente, setBadgeEnAttente] = useState(false);
  const [erreurBadge, setErreurBadge] = useState("");
  const [actionConfirmationBadge, setActionConfirmationBadge] = useState<"regenerate" | "revoke" | null>(null);

  const nomDepartement =
    db.departments.find((d) => d.id === agent.departmentId)?.name ?? "Non assigné";

  const cleBadge = ["badge", user?.organisationId, user?.id, agent.id];
  const requeteBadge = useQuery({
    queryKey: cleBadge,
    queryFn: () => badgesApi.get(agent.id),
    enabled: Boolean(agent.id),
  });
  const jeton = requeteBadge.data?.badge?.token;

  const requeteImage = useQuery({
    queryKey: ["badge-image", jeton],
    enabled: Boolean(jeton),
    queryFn: () =>
      generateQrCodeUrl(jeton!, {
        width: 480,
        margin: 2,
        errorCorrectionLevel: "M",
      }),
  });

  async function gererActionBadge(action: "create" | "regenerate" | "revoke") {
    if (badgeEnAttente) return;
    setBadgeEnAttente(true);
    setErreurBadge("");
    try {
      await client.cancelQueries({ queryKey: cleBadge });
      const result =
        action === "revoke"
          ? await badgesApi.revoke(agent.id)
          : await badgesApi.create(agent.id, action === "regenerate");
      client.setQueryData(cleBadge, result);
      notify(
        action === "revoke"
          ? "Badge révoqué."
          : action === "regenerate"
            ? "Nouveau badge créé. L’ancien code est invalidé."
            : "Badge généré et enregistré.",
      );
    } catch (err) {
      setErreurBadge((err as Error).message);
      notify((err as Error).message, true);
    } finally {
      setBadgeEnAttente(false);
    }
  }

  async function telechargerBadgePdf(format: BadgePrintFormat) {
    setExportEnCours(true);
    try {
      // Bascule immédiatement sur le format demandé pour monter la carte adaptée
      flushSync(() => setFormatImpression(format));
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 60)));

      if (!badgeCardRef.current) return;

      await document.fonts.ready;
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      const canvas = await html2canvas(badgeCardRef.current, {
        scale: 4,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
      });

      if (format === "cr80") {
        const pdf = new jsPDF({
          orientation: "landscape",
          unit: "mm",
          format: [86, 54],
        });
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 86, 54);
        pdf.save(`badge-${agent.id}-cr80.pdf`);
      } else {
        const pdf = new jsPDF({
          orientation: "portrait",
          unit: "mm",
          format: [105, 148],
        });
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 105, 148);
        pdf.save(`badge-${agent.id}-a6.pdf`);
      }

      notify(`Badge PDF (${format.toUpperCase()}) téléchargé !`);
    } catch {
      notify("Impossible d'exporter le badge.", true);
    } finally {
      setExportEnCours(false);
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
        <header className="agent-modal-header">
          <div className="agent-modal-header-left">
            <span className={`agent-modal-avatar tone-${Number(agent.id.replace(/\D/g, "") || 0) % 4}`}>
              {initials(fullName(agent))}
            </span>
            <div>
              <div className="agent-modal-name-row">
                <h2>{fullName(agent)}</h2>
                <span className={`badge ${agent.isEnrolled ? "present" : "late"}`}>
                  <i />
                  {agent.isEnrolled ? "Enrôlé" : "Non enrôlé"}
                </span>
              </div>
              <p className="agent-modal-subtitle">
                {agent.position || "Poste non spécifié"} · {nomDepartement}
              </p>
            </div>
          </div>

          <div className="agent-modal-header-actions">
            {onEnroll && (
              <button
                type="button"
                className={`button small ${agent.isEnrolled ? "" : "primary"}`}
                onClick={() => onEnroll(agent)}
                title={agent.isEnrolled ? "Ré-enrôler le visage" : "Enrôler le visage"}
              >
                <Camera size={14} />
                <span>{agent.isEnrolled ? "Ré-enrôler" : "Enrôler"}</span>
              </button>
            )}
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
            <button
              className="icon-button agent-modal-close"
              onClick={onClose}
              aria-label="Fermer"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="agent-modal-body">
          <div className="agent-modal-col-info">
            {/* 1. Informations d'identification */}
            <div className="agent-info-card">
              <h3>
                <IdCard size={16} />
                Informations d'identification
              </h3>
              <div className="agent-info-grid">
                <div>
                  <small>IM (NUMÉRO MATRICULE)</small>
                  <strong>{agent.metadata?.im || agent.metadata?.matricule || "—"}</strong>
                </div>
                <div>
                  <small>NUMÉRO CIN</small>
                  <strong>{agent.metadata?.cin || "—"}</strong>
                </div>
                <div>
                  <small>SEXE</small>
                  <strong>
                    {agent.metadata?.sexe === "H"
                      ? "Homme (Masculin)"
                      : agent.metadata?.sexe === "F"
                        ? "Femme (Féminin)"
                        : agent.metadata?.sexe || "—"}
                  </strong>
                </div>
                <div>
                  <small>DATE DE NAISSANCE</small>
                  <strong>{agent.birthDate ? dateLabel(agent.birthDate) : "—"}</strong>
                </div>
                <div>
                  <small>ÂGE</small>
                  <strong>{ageValeur !== null ? `${ageValeur} ans` : "Non renseigné"}</strong>
                </div>
                <div>
                  <small>IDENTIFIANT RH</small>
                  <code>#{agent.id.slice(0, 8)}</code>
                </div>
              </div>
            </div>

            {/* 2. Coordonnées de contact */}
            <div className="agent-info-card">
              <h3>
                <Phone size={16} />
                Coordonnées de contact
              </h3>
              <div className="agent-info-grid">
                <div>
                  <small>TÉLÉPHONE (TEL)</small>
                  <strong>{agent.metadata?.telephone || "—"}</strong>
                </div>
                <div>
                  <small>ADRESSE E-MAIL</small>
                  <strong>{agent.metadata?.email || "—"}</strong>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <small>LOCALITÉ / RÉSIDENCE</small>
                  <strong>{agent.metadata?.localite || "—"}</strong>
                </div>
              </div>
            </div>

            {/* 3. Carrière & Situation administrative */}
            <div className="agent-info-card">
              <h3>
                <Briefcase size={16} />
                Carrière & Situation administrative
              </h3>
              <div className="agent-info-grid">
                <div>
                  <small>STRUCTURE / DIVISION</small>
                  <strong>{agent.metadata?.structure || nomDepartement}</strong>
                </div>
                <div>
                  <small>POSTE OCCUPÉ</small>
                  <strong>{agent.position || "—"}</strong>
                </div>
                <div>
                  <small>STATUT ADMINISTRATIF</small>
                  <strong>{agent.metadata?.statut_administratif || "—"}</strong>
                </div>
                <div>
                  <small>CATÉGORIE</small>
                  <strong>{agent.metadata?.categorie ? `Catégorie ${agent.metadata.categorie}` : "—"}</strong>
                </div>
                <div>
                  <small>DATE D'ENTRÉE ADMINISTRATION</small>
                  <strong>
                    {agent.metadata?.date_entree_administration
                      ? dateLabel(agent.metadata.date_entree_administration)
                      : "—"}
                  </strong>
                </div>
                <div>
                  <small>DATE DE PRISE DE SERVICE</small>
                  <strong>
                    {agent.metadata?.date_prise_service
                      ? dateLabel(agent.metadata.date_prise_service)
                      : agent.hireDate
                        ? dateLabel(agent.hireDate)
                        : "—"}
                  </strong>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <small>ADRESSE PROFESSIONNELLE</small>
                  <strong>{agent.metadata?.adresse_professionnelle || "—"}</strong>
                </div>
                <div>
                  <small>STATUT D'ENRÔLEMENT</small>
                  <strong>
                    <span className={`badge ${agent.isEnrolled ? "present" : "late"}`}>
                      <i />
                      {agent.isEnrolled ? "Enrôlé" : "Non enrôlé"}
                    </span>
                  </strong>
                </div>
                <div>
                  <small>ENREGISTRÉ LE</small>
                  <strong>{dateLabel(agent.createdAt)}</strong>
                </div>
              </div>
            </div>

            {/* 4. Champs Additionnels */}
            {agent.metadata &&
              Object.entries(agent.metadata).filter(
                ([k]) =>
                  ![
                    "im",
                    "matricule",
                    "cin",
                    "telephone",
                    "email",
                    "localite",
                    "adresse_professionnelle",
                    "structure",
                    "sexe",
                    "categorie",
                    "statut_administratif",
                    "date_entree_administration",
                    "date_prise_service",
                    "compte_autorite",
                    "role_evaluateur",
                  ].includes(k),
              ).length > 0 && (
                <div className="agent-info-card">
                  <h3>
                    <SlidersHorizontal size={16} />
                    Champs Additionnels
                  </h3>
                  <div className="agent-info-grid">
                    {Object.entries(agent.metadata)
                      .filter(
                        ([k]) =>
                          ![
                            "im",
                            "matricule",
                            "cin",
                            "telephone",
                            "email",
                            "localite",
                            "adresse_professionnelle",
                            "structure",
                            "sexe",
                            "categorie",
                            "statut_administratif",
                            "date_entree_administration",
                            "date_prise_service",
                            "compte_autorite",
                            "role_evaluateur",
                          ].includes(k),
                      )
                      .map(([key, val]) => (
                        <div key={key}>
                          <small>{key.replace(/_/g, " ").toUpperCase()}</small>
                          <strong>{String(val) || "—"}</strong>
                        </div>
                      ))}
                  </div>
                </div>
              )}
          </div>

          <div className="agent-modal-col-badge">
            <div className="agent-badge-preview-card">
              <div className="agent-badge-card-header">
                <div className="agent-badge-format-pills">
                  <button
                    type="button"
                    className={`format-pill-btn ${formatImpression === "cr80" ? "active" : ""}`}
                    onClick={() => setFormatImpression("cr80")}
                    title="Carte CR80 paysage (86 × 54 mm)"
                  >
                    CR80 (Paysage)
                  </button>
                  <button
                    type="button"
                    className={`format-pill-btn ${formatImpression === "a6" ? "active" : ""}`}
                    onClick={() => setFormatImpression("a6")}
                    title="Feuille A6 portrait intégrale (105 × 148 mm)"
                  >
                    A6 (Portrait)
                  </button>
                </div>

                {jeton && (
                  <details className="agent-badge-dots-menu" data-html2canvas-ignore="true">
                    <summary aria-label="Options du badge" title="Options">
                      <MoreVertical size={16} />
                    </summary>
                    <div className="agent-badge-dropdown" data-html2canvas-ignore="true">
                      <div className="agent-dropdown-group">
                        <span className="agent-dropdown-header">Exportation PDF</span>
                        <button
                          type="button"
                          disabled={!agent.isActive || exportEnCours || Boolean(jeton && requeteImage.isPending)}
                          onClick={(e) => {
                            e.currentTarget.closest("details")?.removeAttribute("open");
                            void telechargerBadgePdf("cr80");
                          }}
                        >
                          <Download size={14} />
                          <span>Télécharger CR80 (86 × 54 mm)</span>
                        </button>
                        <button
                          type="button"
                          disabled={!agent.isActive || exportEnCours || Boolean(jeton && requeteImage.isPending)}
                          onClick={(e) => {
                            e.currentTarget.closest("details")?.removeAttribute("open");
                            void telechargerBadgePdf("a6");
                          }}
                        >
                          <Download size={14} />
                          <span>Télécharger A6 (105 × 148 mm)</span>
                        </button>
                      </div>

                      <div className="agent-dropdown-divider" />

                      <div className="agent-dropdown-group">
                        <span className="agent-dropdown-header">Impression</span>
                        <button
                          type="button"
                          disabled={!agent.isActive || exportEnCours || Boolean(jeton && requeteImage.isPending)}
                          onClick={(e) => {
                            const details = e.currentTarget.closest("details");
                            details?.removeAttribute("open");
                            flushSync(() => setFormatImpression("cr80"));
                            setTimeout(() => window.print(), 80);
                          }}
                        >
                          <Printer size={14} />
                          <span>Imprimer en CR80 (Paysage)</span>
                        </button>
                        <button
                          type="button"
                          disabled={!agent.isActive || exportEnCours || Boolean(jeton && requeteImage.isPending)}
                          onClick={(e) => {
                            const details = e.currentTarget.closest("details");
                            details?.removeAttribute("open");
                            flushSync(() => setFormatImpression("a6"));
                            setTimeout(() => window.print(), 80);
                          }}
                        >
                          <Printer size={14} />
                          <span>Imprimer en A6 (Plein page)</span>
                        </button>
                      </div>

                      <div className="agent-dropdown-divider" />

                      <div className="agent-dropdown-group">
                        <span className="agent-dropdown-header">Gestion</span>
                        <button
                          type="button"
                          disabled={!agent.isActive || badgeEnAttente}
                          onClick={(e) => {
                            e.currentTarget.closest("details")?.removeAttribute("open");
                            setActionConfirmationBadge("regenerate");
                          }}
                        >
                          <RefreshCw size={14} />
                          <span>Régénérer le QR</span>
                        </button>
                        <button
                          type="button"
                          className="danger"
                          disabled={badgeEnAttente}
                          onClick={(e) => {
                            e.currentTarget.closest("details")?.removeAttribute("open");
                            setActionConfirmationBadge("revoke");
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

              <div className="agent-badge-wrapper" data-badge-format={formatImpression}>
                {formatImpression === "cr80" ? (
                  <section ref={badgeCardRef} className="qr-badge print-area">
                    <div className="qr-badge-header">
                      présence.<small>{db.settings.organization}</small>
                    </div>
                    <div className="badge-content">
                      <div
                        className="qr-image-slot badge-qr-wrapper"
                        aria-busy={requeteBadge.isPending || Boolean(jeton && requeteImage.isPending)}
                      >
                        {agent.isActive && !badgeEnAttente && requeteImage.data && (
                          <img
                            src={requeteImage.data}
                            width={240}
                            height={240}
                            alt={`QR de pointage de ${fullName(agent)}`}
                          />
                        )}
                        {(requeteBadge.isPending || (jeton && requeteImage.isPending)) && (
                          <p role="status">Chargement…</p>
                        )}
                        {!agent.isActive && <p>Agent inactif : pointage désactivé.</p>}
                        {agent.isActive && !requeteBadge.isPending && !jeton && (
                          <p>Aucun badge configuré.</p>
                        )}
                      </div>
                      <h2>{fullName(agent)}</h2>
                      <p>{agent.position || "Poste non spécifié"}</p>
                      <span>{nomDepartement}</span>
                      {!agent.isActive && (
                        <strong className="badge-inactive">
                          Agent inactif · Pointage désactivé
                        </strong>
                      )}
                    </div>
                  </section>
                ) : (
                  <section ref={badgeCardRef} className="qr-badge-a6 print-area">
                    <div className="qr-badge-header-a6">
                      <span className="brand-title">présence.</span>
                      <small>{db.settings.organization}</small>
                    </div>
                    <div className="badge-content-a6">
                      <div
                        className="badge-qr-wrapper-a6"
                        aria-busy={requeteBadge.isPending || Boolean(jeton && requeteImage.isPending)}
                      >
                        {agent.isActive && !badgeEnAttente && requeteImage.data && (
                          <img
                            src={requeteImage.data}
                            width={280}
                            height={280}
                            alt={`QR de pointage de ${fullName(agent)}`}
                          />
                        )}
                        {(requeteBadge.isPending || (jeton && requeteImage.isPending)) && (
                          <p role="status">Chargement…</p>
                        )}
                        {!agent.isActive && <p>Agent inactif : pointage désactivé.</p>}
                        {agent.isActive && !requeteBadge.isPending && !jeton && (
                          <p>Aucun badge configuré.</p>
                        )}
                      </div>
                      <div className="badge-info-a6">
                        <h2>{fullName(agent)}</h2>
                        <p>{agent.position || "Poste non spécifié"}</p>
                        <span className="dept-tag-a6">{nomDepartement}</span>
                        {!agent.isActive && (
                          <strong className="badge-inactive-a6">
                            Agent inactif · Pointage désactivé
                          </strong>
                        )}
                      </div>
                    </div>
                  </section>
                )}
              </div>

              {erreurBadge && (
                <p className="form-error" role="alert">
                  {erreurBadge}
                </p>
              )}

              {!jeton && (
                <button
                  className="button primary full-width"
                  disabled={!agent.isActive || badgeEnAttente}
                  onClick={() => void gererActionBadge("create")}
                >
                  <Sparkles size={16} />
                  {badgeEnAttente ? "Création…" : "Générer le Badge"}
                </button>
              )}
            </div>
          </div>
        </div>

        <AnimatePresence>
          {actionConfirmationBadge && (
            <Confirm
              title={
                actionConfirmationBadge === "regenerate"
                  ? "Régénérer le code QR ?"
                  : "Révoquer le badge ?"
              }
              text="L'ancien badge QR sera immédiatement invalidé pour les prochains pointages."
              close={() => setActionConfirmationBadge(null)}
              confirm={() => void gererActionBadge(actionConfirmationBadge)}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// Alias de rétrocompatibilité
export { ModalDetailAgent as AgentDetailModal };
