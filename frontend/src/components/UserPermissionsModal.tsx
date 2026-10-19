import { useState } from "react";
import { Modal } from "./ui";
import {
  DEFAULT_SECRETARY_PERMISSIONS,
  type User,
  type UserPermissions,
} from "../types";
import {
  ShieldAlert,
  Save,
  CheckCircle2,
  XCircle,
  RotateCcw,
  ChevronDown,
  ChevronsUpDown,
  QrCode,
  CalendarCheck,
  Files,
  Users,
  Settings,
} from "lucide-react";

interface Props {
  targetUser: User;
  close: () => void;
  onSave: (userId: string, permissions: UserPermissions) => Promise<void>;
}

interface PermItemConfig {
  key: keyof UserPermissions;
  title: string;
  description: string;
  isSubItem?: boolean;
}

interface PermGroupConfig {
  id: string;
  title: string;
  icon: typeof QrCode;
  items: PermItemConfig[];
}

const PERMISSION_GROUPS: PermGroupConfig[] = [
  {
    id: "pointage",
    title: "Pointage & Bornes Kiosk",
    icon: QrCode,
    items: [
      {
        key: "scan",
        title: "Pointage QR Code",
        description: "Scanner les badges des agents pour enregistrer arrivées et départs",
      },
      {
        key: "kiosk",
        title: "Pointage Facial (Borne Kiosk)",
        description: "Accès à la borne de reconnaissance faciale en direct",
      },
    ],
  },
  {
    id: "presences",
    title: "Suivi des Présences",
    icon: CalendarCheck,
    items: [
      {
        key: "presences",
        title: "Module Présences",
        description: "Consulter la liste des présences, retards et absences",
      },
      {
        key: "presences_justify",
        title: "Justifier une absence",
        description: "Enregistrer un motif d'absence justifiée pour un agent",
        isSubItem: true,
      },
      {
        key: "presences_add",
        title: "Ajout manuel / Saisie de secours",
        description: "Ajouter ou corriger manuellement un pointage oublié",
        isSubItem: true,
      },
    ],
  },
  {
    id: "reports",
    title: "Rapports & Feuilles d'émargement",
    icon: Files,
    items: [
      {
        key: "reports",
        title: "Consultation des Rapports",
        description: "Visualiser les statistiques et synthèses périodiques",
      },
      {
        key: "reports_print",
        title: "Impression des Rapports & Fiches",
        description: "Imprimer la fiche de présence et les rapports en PDF",
        isSubItem: true,
      },
    ],
  },
  {
    id: "personnel",
    title: "Ressources Humaines & Personnel",
    icon: Users,
    items: [
      {
        key: "leaves",
        title: "Congés & Permissions",
        description: "Traiter et valider les demandes d'absences autorisées",
      },
      {
        key: "agents",
        title: "Répertoire du Personnel",
        description: "Consulter l'annuaire et les fiches des employés",
      },
      {
        key: "agents_manage",
        title: "Gestion des Employés",
        description: "Créer, modifier ou désactiver des profils d'agents",
        isSubItem: true,
      },
      {
        key: "agents_badges",
        title: "Badges & QR Codes",
        description: "Générer et réimprimer les badges et cartes de présence",
        isSubItem: true,
      },
    ],
  },
  {
    id: "admin",
    title: "Administration & Paramètres Système",
    icon: Settings,
    items: [
      {
        key: "departments",
        title: "Départements & Services",
        description: "Gérer l'organigramme et les départements",
      },
      {
        key: "schedules",
        title: "Horaires de travail",
        description: "Configurer les plages horaires et tolérances de retard",
      },
      {
        key: "face_enroll",
        title: "Enrôlement Facial",
        description: "Enregistrer les photos et visages des employés",
      },
      {
        key: "users",
        title: "Gestion des Utilisateurs",
        description: "Créer des comptes et administrer les accès utilisateurs",
      },
      {
        key: "settings",
        title: "Paramètres de l'Organisation",
        description: "Modifier les modes de pointage autorisés et options système",
      },
    ],
  },
];

export default function UserPermissionsModal({ targetUser, close, onSave }: Props) {
  const isSuperadmin = targetUser.role === "COORDINATOR";

  const [perms, setPerms] = useState<UserPermissions>(() => {
    if (isSuperadmin) {
      const all: UserPermissions = {};
      PERMISSION_GROUPS.forEach((g) => {
        g.items.forEach((item) => {
          all[item.key] = true;
        });
      });
      return all;
    }
    return { ...DEFAULT_SECRETARY_PERMISSIONS, ...(targetUser.permissions || {}) };
  });

  // Accordion state: by default, first group is open, others collapsed for clean view
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => ({
    pointage: true,
  }));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const areAllExpanded = PERMISSION_GROUPS.every((g) => openGroups[g.id]);

  const toggleExpandAll = () => {
    const nextState = !areAllExpanded;
    const update: Record<string, boolean> = {};
    PERMISSION_GROUPS.forEach((g) => {
      update[g.id] = nextState;
    });
    setOpenGroups(update);
  };

  const togglePerm = (key: keyof UserPermissions) => {
    if (isSuperadmin) return;
    setPerms((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      // Cascade turn off sub-items if parent module is turned off
      if (key === "presences" && !next.presences) {
        next.presences_justify = false;
        next.presences_add = false;
      }
      if (key === "reports" && !next.reports) {
        next.reports_print = false;
      }
      if (key === "agents" && !next.agents) {
        next.agents_manage = false;
        next.agents_badges = false;
      }
      return next;
    });
  };

  const handleActivateAll = () => {
    const all: UserPermissions = {};
    PERMISSION_GROUPS.forEach((g) => {
      g.items.forEach((item) => {
        all[item.key] = true;
      });
    });
    setPerms(all);
  };

  const handleDeactivateAll = () => {
    const none: UserPermissions = {
      dashboard: true,
    };
    PERMISSION_GROUPS.forEach((g) => {
      g.items.forEach((item) => {
        none[item.key] = false;
      });
    });
    setPerms(none);
  };

  const handleResetDefaults = () => {
    setPerms({ ...DEFAULT_SECRETARY_PERMISSIONS });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSuperadmin) {
      close();
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(targetUser.id, perms);
      close();
    } catch (err) {
      setError((err as Error).message || "Erreur lors de l'enregistrement des permissions.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Gestion des Accès et Privilèges" close={close}>
      <form onSubmit={handleSave} className="perm-modal" style={{ maxWidth: "680px" }}>
        <div className="perm-user-card">
          <div className="perm-user-info">
            <strong>{targetUser.name}</strong>
            <span>{targetUser.email}</span>
          </div>
          <span className={`badge ${targetUser.role === "COORDINATOR" ? "role-coord" : "role-sec"}`}>
            {targetUser.role === "COORDINATOR" ? "Coordinateur (Superadmin)" : "Secrétaire / Utilisateur"}
          </span>
        </div>

        {isSuperadmin ? (
          <div className="perm-superadmin-banner">
            <ShieldAlert size={22} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>Superadmin permanent :</strong> En tant que Coordinateur, cet utilisateur bénéficie
              automatiquement d'un accès intégral et sans restriction à tous les modules. Pour restreindre ses privilèges,
              modifiez son rôle en Secrétaire dans la liste des utilisateurs.
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "8px",
              marginBottom: "16px",
            }}
          >
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                className="button compact"
                onClick={handleActivateAll}
                title="Activer tous les modules et sous-fonctionnalités"
              >
                <CheckCircle2 size={14} />
                <span>Tout activer</span>
              </button>
              <button
                type="button"
                className="button compact"
                onClick={handleDeactivateAll}
                title="Désactiver toutes les options"
              >
                <XCircle size={14} />
                <span>Tout désactiver</span>
              </button>
              <button
                type="button"
                className="button compact"
                onClick={handleResetDefaults}
                title="Rétablir les autorisations standard"
              >
                <RotateCcw size={14} />
                <span>Défaut</span>
              </button>
            </div>

            <button
              type="button"
              className="button compact"
              onClick={toggleExpandAll}
              title={areAllExpanded ? "Replier tous les accordéons" : "Déplier tous les accordéons"}
              style={{ color: "#375044" }}
            >
              <ChevronsUpDown size={14} />
              <span>{areAllExpanded ? "Tout replier" : "Tout déplier"}</span>
            </button>
          </div>
        )}

        {/* Accordion Menu Container */}
        <div className="perm-accordion-list">
          {PERMISSION_GROUPS.map((group) => {
            const isOpen = Boolean(openGroups[group.id]);
            const Icon = group.icon;
            const activeCount = group.items.filter((item) => perms[item.key]).length;
            const totalCount = group.items.length;

            return (
              <div
                key={group.id}
                className={`perm-accordion-group ${isOpen ? "is-open" : ""}`}
              >
                <button
                  type="button"
                  className="perm-accordion-trigger"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={isOpen}
                >
                  <div className="perm-accordion-title-wrap">
                    <span className="perm-accordion-icon">
                      <Icon size={18} />
                    </span>
                    <span className="perm-accordion-title">{group.title}</span>
                  </div>

                  <div className="perm-accordion-meta">
                    <span className={`perm-badge-counter ${activeCount > 0 ? "active" : ""}`}>
                      {activeCount} / {totalCount} actif{activeCount > 1 ? "s" : ""}
                    </span>
                    <ChevronDown size={17} className="perm-accordion-chevron" />
                  </div>
                </button>

                {isOpen && (
                  <div className="perm-accordion-content">
                    {group.items.map((item) => {
                      const active = Boolean(perms[item.key]);
                      return (
                        <div
                          key={item.key}
                          className={`perm-item ${item.isSubItem ? "sub-item" : ""}`}
                        >
                          <div className="perm-item-details">
                            <span className="perm-item-title">{item.title}</span>
                            <span className="perm-item-desc">{item.description}</span>
                          </div>
                          <label
                            className="switch-control"
                            title={active ? "Désactiver" : "Activer"}
                          >
                            <input
                              type="checkbox"
                              checked={active}
                              disabled={isSuperadmin || saving}
                              onChange={() => togglePerm(item.key)}
                            />
                            <span className="switch-track">
                              <span className="switch-thumb" />
                            </span>
                            <span className={`switch-state-text ${active ? "active" : ""}`}>
                              {active ? "Actif" : "Inactif"}
                            </span>
                          </label>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {error && (
          <p className="form-error" role="alert" style={{ marginTop: "12px" }}>
            {error}
          </p>
        )}

        <footer style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <button type="button" className="button" onClick={close} disabled={saving}>
            {isSuperadmin ? "Fermer" : "Annuler"}
          </button>
          {!isSuperadmin && (
            <button type="submit" className="button primary" disabled={saving}>
              <Save size={16} />
              <span>{saving ? "Enregistrement…" : "Enregistrer les autorisations"}</span>
            </button>
          )}
        </footer>
      </form>
    </Modal>
  );
}
