import OrganisationCode from "../components/OrganisationCode";
import { useEffect, useState } from "react";
import { AnimatePresence } from "motion/react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Save, KeyRound, SlidersHorizontal, Users, ShieldCheck, Trash2, Power, Pencil } from "lucide-react";
import { z } from "zod";
import { useApp } from "../app/context";
import { Back, Confirm, Field, Heading, Modal, Table } from "../components/ui";
import type { Role, RoleDefinition, User, UserPermissions } from "../types";
import { usersService } from "../services/users";
import { rolesService } from "../services/roles";
import UserPermissionsModal from "../components/UserPermissionsModal";
import RolePermissionsModal from "../components/RolePermissionsModal";
import { RowActionsMenu } from "../components/RowActionsMenu";

export function UsersPage() {
  const { db, user, update, notify, audit } = useApp();
  const [activeTab, setActiveTab] = useState<"users" | "roles">("users");
  const [target, setTarget] = useState("");
  const [reset, setReset] = useState("");
  const [error, setError] = useState("");
  const [editingPermsUser, setEditingPermsUser] = useState<User | null>(null);

  // Roles state
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [editingRole, setEditingRole] = useState<RoleDefinition | null>(null);
  const [newRoleModalOpen, setNewRoleModalOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");
  const [roleDeleting, setRoleDeleting] = useState<RoleDefinition | null>(null);

  const loadRoles = async () => {
    try {
      const res = await rolesService.list();
      if (res.roles) setRoles(res.roles);
    } catch (err) {
      console.warn("Échec chargement des rôles :", err);
    }
  };

  useEffect(() => {
    let mounted = true;
    void loadRoles();
    void usersService
      .list()
      .then((res) => {
        if (!mounted || !res.users) return;
        update((d) => {
          for (const su of res.users) {
            const existing = d.users.find((x) => x.id === String(su.id));
            if (existing) {
              existing.role = su.role;
              existing.isActive = su.actif;
              existing.permissions = su.permissions || {};
            } else {
              d.users.push({
                id: String(su.id),
                name: `${su.prenom} ${su.nom}`,
                email: su.email,
                role: su.role,
                isActive: su.actif,
                permissions: su.permissions || {},
              });
            }
          }
        });
      })
      .catch(() => {
        // Fallback local if offline
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleSaveUserPermissions = async (userId: string, newPerms: UserPermissions) => {
    try {
      await usersService.updatePermissions(userId, newPerms);
    } catch (err) {
      console.warn("Échec sauvegarde permissions serveur :", err);
    }
    update((d) => {
      const u = d.users.find((x) => x.id === userId);
      if (u) {
        u.permissions = newPerms;
        audit(d, userId, "Modification des privilèges", "Permissions granulaires mises à jour");
      }
    });
    notify("Autorisations d'accès enregistrées avec succès.");
  };

  const handleSaveRolePermissions = async (
    roleId: string,
    data: { nom?: string; description?: string; permissions?: UserPermissions },
  ) => {
    try {
      await rolesService.update(roleId, data);
      await loadRoles();
      notify("Privilèges du rôle enregistrés avec succès.");
    } catch (err) {
      notify((err as Error).message || "Erreur lors de la mise à jour du rôle.", true);
      throw err;
    }
  };

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;
    try {
      const res = await rolesService.create({
        nom: newRoleName.trim(),
        description: newRoleDesc.trim(),
      });
      setNewRoleModalOpen(false);
      setNewRoleName("");
      setNewRoleDesc("");
      await loadRoles();
      notify(`Rôle "${res.role.nom}" créé. Vous pouvez maintenant configurer ses privilèges.`);
      setEditingRole(res.role);
    } catch (err) {
      notify((err as Error).message || "Erreur lors de la création du rôle.", true);
    }
  };

  const handleDeleteRole = async () => {
    if (!roleDeleting) return;
    try {
      await rolesService.delete(roleDeleting.id);
      notify(`Rôle "${roleDeleting.nom}" supprimé.`);
      setRoleDeleting(null);
      await loadRoles();
    } catch (err) {
      notify((err as Error).message || "Impossible de supprimer ce rôle.", true);
    }
  };

  return (
    <>
      <Heading
        eyebrow="ADMINISTRATION SYSTÈME"
        title="Utilisateurs & Rôles"
        subtitle="Gestion des comptes, création des rôles et configuration des privilèges"
      >
        {activeTab === "users" ? (
          <Link className="button primary" to="/users/new">
            <Plus size={16} />
            <span>Nouvel utilisateur</span>
          </Link>
        ) : (
          <button
            type="button"
            className="button primary"
            onClick={() => {
              setNewRoleName("");
              setNewRoleDesc("");
              setNewRoleModalOpen(true);
            }}
          >
            <Plus size={16} />
            <span>Nouveau rôle</span>
          </button>
        )}
      </Heading>

      {/* Tabs Switcher: Users vs Roles */}
      <div className="profile-clean-tabs" role="tablist" style={{ marginBottom: "1.5rem" }}>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "users"}
          className={`profile-tab-item ${activeTab === "users" ? "active" : ""}`}
          onClick={() => setActiveTab("users")}
        >
          <Users size={14} />
          <span>Comptes Utilisateurs</span>
          <span className="badge" style={{ marginLeft: 6, fontSize: "11px", padding: "1px 6px" }}>
            {db.users.length}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "roles"}
          className={`profile-tab-item ${activeTab === "roles" ? "active" : ""}`}
          onClick={() => setActiveTab("roles")}
        >
          <ShieldCheck size={14} />
          <span>Rôles & Privilèges</span>
          <span className="badge" style={{ marginLeft: 6, fontSize: "11px", padding: "1px 6px" }}>
            {roles.length || 2}
          </span>
        </button>
      </div>

      {activeTab === "users" ? (
        <section className="data-section">
          <Table
            headers={["UTILISATEUR", "EMAIL", "RÔLE ATTRIBUÉ", "STATUT", "ACTIONS"]}
            rows={db.users.map((u) => [
              <strong key="name">{u.name}</strong>,
              u.email,
              <select
                key="role"
                aria-label={`Rôle de ${u.name}`}
                value={u.role}
                disabled={u.id === user?.id}
                onChange={async (e) => {
                  const nextRole = e.target.value as Role;
                  try {
                    await usersService.updateRole(u.id, nextRole);
                  } catch (err) {
                    console.warn("Échec mise à jour rôle serveur :", err);
                  }
                  update((d) => {
                    d.users.find((x) => x.id === u.id)!.role = nextRole;
                    audit(d, u.id, "Modification du rôle", nextRole);
                  });
                  notify("Rôle mis à jour.");
                  void loadRoles();
                }}
              >
                {roles.length > 0 ? (
                  roles.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.nom}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="COORDINATOR">Coordinateur</option>
                    <option value="SECRETARY">Secrétaire</option>
                  </>
                )}
              </select>,
              <span
                key="status"
                className={`badge ${u.isActive ? "present" : "absent"}`}
              >
                {u.isActive ? "Actif" : "Inactif"}
              </span>,
              <RowActionsMenu
                key="actions"
                ariaLabel={`Actions pour ${u.name}`}
                items={[
                  {
                    label: "Privilèges d'accès",
                    icon: <SlidersHorizontal size={14} />,
                    onClick: () => setEditingPermsUser(u),
                  },
                  {
                    label: "Réinitialiser mot de passe",
                    icon: <KeyRound size={14} />,
                    onClick: () => {
                      setReset(u.id);
                      setError("");
                    },
                  },
                  {
                    label: u.isActive ? "Désactiver le compte" : "Activer le compte",
                    icon: <Power size={14} />,
                    variant: u.isActive ? "danger" : "default",
                    disabled: u.id === user?.id,
                    onClick: () => setTarget(u.id),
                  },
                ]}
              />,
            ])}
          />
        </section>
      ) : (
        <section className="data-section">
          <Table
            headers={["RÔLE", "DESCRIPTION", "UTILISATEURS ACTIFS", "STATUT", "ACTIONS"]}
            rows={roles.map((r) => {
              const isCoordinator = r.code === "COORDINATOR";
              return [
                <div key="role-info">
                  <strong>{r.nom}</strong>
                  <small style={{ display: "block", color: "#6d7e76", fontSize: "11px" }}>
                    Code : <code>{r.code}</code>
                  </small>
                </div>,
                <span key="desc" style={{ color: "#55665f", fontSize: "13px" }}>
                  {r.description || "—"}
                </span>,
                <span key="count" style={{ fontWeight: 600 }}>
                  {r.members_count ?? 0} utilisateur{Number(r.members_count ?? 0) > 1 ? "s" : ""}
                </span>,
                <span
                  key="type"
                  className={`badge ${isCoordinator ? "role-coord" : "role-sec"}`}
                >
                  {isCoordinator ? "Système (Racine)" : "Rôle Modifiable"}
                </span>,
                <RowActionsMenu
                  key="actions"
                  ariaLabel={`Actions pour le rôle ${r.nom}`}
                  items={
                    isCoordinator
                      ? [
                          {
                            label: "Consulter les privilèges",
                            icon: <SlidersHorizontal size={14} />,
                            onClick: () => setEditingRole(r),
                          },
                        ]
                      : [
                          {
                            label: "Modifier le rôle & privilèges",
                            icon: <Pencil size={14} />,
                            onClick: () => setEditingRole(r),
                          },
                          {
                            label: "Supprimer le rôle",
                            icon: <Trash2 size={14} />,
                            variant: "danger",
                            onClick: () => setRoleDeleting(r),
                          },
                        ]
                  }
                />,
              ];
            })}
          />
        </section>
      )}

      <AnimatePresence>
        {/* User permissions override modal */}
        {editingPermsUser && (
          <UserPermissionsModal
            key="permissions-modal"
            targetUser={editingPermsUser}
            close={() => setEditingPermsUser(null)}
            onSave={handleSaveUserPermissions}
          />
        )}

        {/* Role privileges and details modal */}
        {editingRole && (
          <RolePermissionsModal
            key="role-permissions-modal"
            role={editingRole}
            close={() => setEditingRole(null)}
            onSave={handleSaveRolePermissions}
          />
        )}

        {/* Create new role modal */}
        {newRoleModalOpen && (
          <Modal title="Créer un nouveau rôle" close={() => setNewRoleModalOpen(false)}>
            <form onSubmit={handleCreateRole} className="role-modal">
              <Field label="Nom du rôle" hint="ex: Responsable RH, Superviseur, Contrôleur">
                <input
                  required
                  maxLength={100}
                  placeholder="ex: Responsable RH"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  autoFocus
                />
              </Field>
              <Field label="Description">
                <input
                  maxLength={200}
                  placeholder="Brève description des responsabilités…"
                  value={newRoleDesc}
                  onChange={(e) => setNewRoleDesc(e.target.value)}
                />
              </Field>
              <footer style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button type="button" className="button" onClick={() => setNewRoleModalOpen(false)}>
                  Annuler
                </button>
                <button type="submit" className="button primary">
                  <Plus size={16} />
                  <span>Créer le rôle</span>
                </button>
              </footer>
            </form>
          </Modal>
        )}

        {/* Delete role confirmation */}
        {roleDeleting && (
          <Confirm
            key="delete-role"
            title={`Supprimer le rôle "${roleDeleting.nom}" ?`}
            text="Cette action est irréversible. Les utilisateurs doivent avoir un autre rôle avant de pouvoir le supprimer."
            close={() => setRoleDeleting(null)}
            confirm={handleDeleteRole}
          />
        )}

        {target && (
          <Confirm
            key="access"
            title="Modifier l’accès au compte ?"
            text="Le changement sera appliqué à cet utilisateur."
            close={() => setTarget("")}
            confirm={async () => {
              const targetObj = db.users.find((u) => u.id === target);
              const nextActive = !targetObj?.isActive;
              try {
                await usersService.updateStatus(target, nextActive);
              } catch (err) {
                console.warn("Échec mise à jour statut serveur :", err);
              }
              update((d) => {
                const u = d.users.find((u) => u.id === target)!;
                u.isActive = nextActive;
                audit(
                  d,
                  target,
                  "Modification de l’accès",
                  u.isActive ? "Activation" : "Désactivation",
                );
              });
              notify("Accès mis à jour.");
            }}
          />
        )}

        {reset && (
          <Modal
            key="password-reset"
            title="Réinitialiser le mot de passe"
            close={() => setReset("")}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const p = String(new FormData(e.currentTarget).get("password"));
                if (p.length < 10) {
                  setError(
                    "Le mot de passe doit contenir au moins 10 caractères.",
                  );
                  return;
                }
                update((d) => {
                  d.credentials[reset] = p;
                  audit(d, reset, "Réinitialisation du mot de passe", "");
                });
                setReset("");
                notify("Mot de passe réinitialisé.");
              }}
            >
              <Field label="Nouveau mot de passe">
                <input
                  name="password"
                  type="password"
                  minLength={10}
                  required
                  autoComplete="new-password"
                />
              </Field>
              {error && <p className="form-error">{error}</p>}
              <footer>
                <button className="button primary">Enregistrer</button>
              </footer>
            </form>
          </Modal>
        )}
      </AnimatePresence>
    </>
  );
}
export function UserCreate() {
  const { db, update, notify, audit } = useApp();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [roles, setRoles] = useState<RoleDefinition[]>([]);

  useEffect(() => {
    let mounted = true;
    rolesService
      .list()
      .then((res) => {
        if (mounted && res.roles && res.roles.length > 0) {
          setRoles(res.roles);
        }
      })
      .catch((err) => console.warn("Échec chargement rôles :", err));
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <>
      <Back to="/users" />
      <Heading title="Nouvel utilisateur" />
      <form
        className="form-surface"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = Object.fromEntries(new FormData(e.currentTarget));
          const parsed = z
            .object({
              name: z.string().trim().min(2),
              email: z.string().email(),
              password: z.string().min(12, "Le mot de passe doit contenir au moins 12 caractères."),
              role: z.string().min(1),
            })
            .safeParse(form);
          if (!parsed.success) {
            setError(
              parsed.error.issues[0]?.message ||
                "Vérifiez les champs : nom, email et mot de passe de 12 caractères minimum.",
            );
            return;
          }
          if (
            db.users.some(
              (u) => u.email.toLowerCase() === parsed.data.email.toLowerCase(),
            )
          ) {
            setError("Cet email est déjà utilisé.");
            return;
          }
          let id: string = crypto.randomUUID();
          const nameParts = parsed.data.name.trim().split(" ");
          const prenom = nameParts[0];
          const nom = nameParts.slice(1).join(" ") || prenom;
          try {
            const res = await usersService.create({
              nom,
              prenom,
              email: parsed.data.email,
              password: parsed.data.password,
              role: parsed.data.role,
            });
            if (res.user?.id) id = String(res.user.id);
          } catch (err) {
            console.warn("Échec création utilisateur backend :", err);
          }
          update((d) => {
            d.users.push({
              id,
              name: parsed.data.name,
              email: parsed.data.email,
              role: parsed.data.role,
              isActive: true,
            });
            d.credentials[id] = parsed.data.password;
            audit(d, id, "Création d’un utilisateur", parsed.data.role);
          });
          notify("Utilisateur créé.");
          navigate("/users");
        }}
      >
        <div className="form-grid">
          <Field label="Nom complet">
            <input name="name" required />
          </Field>
          <Field label="Email">
            <input name="email" type="email" required />
          </Field>
          <Field label="Rôle">
            <select name="role" defaultValue="SECRETARY">
              {roles.length > 0 ? (
                roles.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.nom} ({r.code})
                  </option>
                ))
              ) : (
                <>
                  <option value="SECRETARY">Secrétaire</option>
                  <option value="COORDINATOR">Coordinateur</option>
                </>
              )}
            </select>
          </Field>
          <Field label="Mot de passe" hint="12 caractères minimum">
            <input
              name="password"
              type="password"
              minLength={12}
              required
              autoComplete="new-password"
            />
          </Field>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <Link className="button" to="/users">
            Annuler
          </Link>
          <button className="button primary">Créer l’utilisateur</button>
        </div>
      </form>
    </>
  );
}
export function SettingsPage() {
  const { db, organisation, saveSettings, notify } = useApp();
  const [settings, setSettings] = useState(() => structuredClone(db.settings));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <>
      <Heading
        eyebrow="CONFIGURATION SYSTÈME"
        title="Paramètres"
        subtitle="Informations générales et identifiants de l'organisation"
      />
      <OrganisationCode />
      <form
        className="settings-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (saving) return;
          setError("");
          setSaving(true);
          try {
            await saveSettings(settings);
            notify("Paramètres enregistrés.");
          } catch (error) {
            setError((error as Error).message);
            notify((error as Error).message, true);
          } finally {
            setSaving(false);
          }
        }}
      >
        <fieldset
          disabled={saving}
          style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
        >
          <section className="settings-section">
            <h2>Organisation</h2>
            <div className="form-grid">
              <Field label="Nom de l’organisation">
                <input
                  required
                  maxLength={100}
                  value={settings.organization}
                  onChange={(e) =>
                    setSettings({ ...settings, organization: e.target.value })
                  }
                />
              </Field>
              <Field label="Adresse">
                <input
                  maxLength={500}
                  value={settings.address}
                  onChange={(e) =>
                    setSettings({ ...settings, address: e.target.value })
                  }
                />
              </Field>
              <Field label="Fuseau horaire">
                <input readOnly value={organisation?.fuseau_horaire ?? ""} />
              </Field>
            </div>
          </section>

          <section className="settings-section" style={{ marginTop: "1.5rem" }}>
            <h2>Modes de pointage autorisés</h2>
            <p className="text-secondary" style={{ fontSize: "0.875rem", marginBottom: "1rem" }}>
              Activez ou désactivez les méthodes de pointage selon les besoins opérationnels de votre entreprise. Au moins une méthode doit rester active.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer", fontWeight: 500 }}>
                <input
                  type="checkbox"
                  checked={settings.pointage_qr ?? true}
                  onChange={(e) => {
                    const next = e.target.checked;
                    if (!next && !(settings.pointage_facial ?? true)) {
                      notify("Au moins un mode de pointage (QR code ou reconnaissance faciale) doit être activé.", true);
                      return;
                    }
                    setSettings({ ...settings, pointage_qr: next });
                  }}
                />
                <span>Pointage par QR Code (Scanners mobiles & bornes badges)</span>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer", fontWeight: 500 }}>
                <input
                  type="checkbox"
                  checked={settings.pointage_facial ?? true}
                  onChange={(e) => {
                    const next = e.target.checked;
                    if (!next && !(settings.pointage_qr ?? true)) {
                      notify("Au moins un mode de pointage (QR code ou reconnaissance faciale) doit être activé.", true);
                      return;
                    }
                    setSettings({ ...settings, pointage_facial: next });
                  }}
                />
                <span>Pointage par Reconnaissance Faciale (Borne Kiosk biométrique)</span>
              </label>
            </div>
          </section>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <div className="form-actions">
            <button className="button primary" disabled={saving}>
              <Save size={16} />
              {saving ? "Enregistrement…" : "Enregistrer les modifications"}
            </button>
          </div>
        </fieldset>
      </form>
    </>
  );
}
export { default as Profile } from "./ProfilePage";
