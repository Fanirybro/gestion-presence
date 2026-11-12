import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence } from "motion/react";
import {
  KeyRound,
  Pencil,
  Plus,
  Power,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Users,
} from "lucide-react";
import { z } from "zod";
import { useApp } from "../../app/context";
import { Back, Confirm, Field, Heading, Modal, Table } from "../../components/ui";
import { RowActionsMenu } from "../../components/RowActionsMenu";
import UserPermissionsModal from "../../components/UserPermissionsModal";
import RolePermissionsModal from "../../components/RolePermissionsModal";
import { usersService } from "../../services/users";
import { rolesService } from "../../services/roles";
import type { Role, RoleDefinition, User, UserPermissions } from "../../types";

export function GestionUtilisateurs() {
  const { db, user, update, notify, audit } = useApp();
  const [activeTab, setActiveTab] = useState<"users" | "roles">("users");
  const [cible, setCible] = useState("");
  const [reinitialisationId, setReinitialisationId] = useState("");
  const [erreur, setErreur] = useState("");
  const [utilisateurModificationPerms, setUtilisateurModificationPerms] = useState<User | null>(null);

  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [chargementRoles, setChargementRoles] = useState(true);
  const [chargementUsers, setChargementUsers] = useState(true);
  const [roleEnModification, setRoleEnModification] = useState<RoleDefinition | null>(null);
  const [modalNouveauRoleOuverte, setModalNouveauRoleOuverte] = useState(false);
  const [nomNouveauRole, setNomNouveauRole] = useState("");
  const [descriptionNouveauRole, setDescriptionNouveauRole] = useState("");
  const [roleEnSuppression, setRoleEnSuppression] = useState<RoleDefinition | null>(null);

  const chargerRoles = async () => {
    try {
      const res = await rolesService.list();
      if (res.roles) setRoles(res.roles);
    } catch (err) {
      console.warn("Échec chargement des rôles :", err);
    } finally {
      setChargementRoles(false);
    }
  };

  useEffect(() => {
    let monte = true;
    void chargerRoles();
    void usersService
      .list()
      .then((res) => {
        if (!monte || !res.users) return;
        update((d) => {
          for (const su of res.users) {
            const existant = d.users.find((x) => x.id === String(su.id));
            if (existant) {
              existant.role = su.role;
              existant.isActive = su.actif;
              existant.permissions = su.permissions || {};
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
      .catch(() => {})
      .finally(() => {
        if (monte) setChargementUsers(false);
      });
    return () => {
      monte = false;
    };
  }, []);

  const enregistrerPermissionsUtilisateur = async (userId: string, newPerms: UserPermissions) => {
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

  const enregistrerPermissionsRole = async (
    roleId: string,
    data: { nom?: string; description?: string; permissions?: UserPermissions },
  ) => {
    try {
      await rolesService.update(roleId, data);
      await chargerRoles();
      notify("Privilèges du rôle enregistrés avec succès.");
    } catch (err) {
      notify((err as Error).message || "Erreur lors de la mise à jour du rôle.", true);
      throw err;
    }
  };

  const creerRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nomNouveauRole.trim()) return;
    try {
      const res = await rolesService.create({
        nom: nomNouveauRole.trim(),
        description: descriptionNouveauRole.trim(),
      });
      setModalNouveauRoleOuverte(false);
      setNomNouveauRole("");
      setDescriptionNouveauRole("");
      await chargerRoles();
      notify(`Rôle "${res.role.nom}" créé. Vous pouvez maintenant configurer ses privilèges.`);
      setRoleEnModification(res.role);
    } catch (err) {
      notify((err as Error).message || "Erreur lors de la création du rôle.", true);
    }
  };

  const supprimerRole = async () => {
    if (!roleEnSuppression) return;
    try {
      await rolesService.delete(roleEnSuppression.id);
      notify(`Rôle "${roleEnSuppression.nom}" supprimé.`);
      setRoleEnSuppression(null);
      await chargerRoles();
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
              setNomNouveauRole("");
              setDescriptionNouveauRole("");
              setModalNouveauRoleOuverte(true);
            }}
          >
            <Plus size={16} />
            <span>Nouveau rôle</span>
          </button>
        )}
      </Heading>

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
            {roles.length}
          </span>
        </button>
      </div>

      {activeTab === "users" ? (
        <section className="data-section">
          <Table
            loading={chargementUsers && !db.users.length}
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
                  void chargerRoles();
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
                    onClick: () => setUtilisateurModificationPerms(u),
                  },
                  {
                    label: "Réinitialiser mot de passe",
                    icon: <KeyRound size={14} />,
                    onClick: () => {
                      setReinitialisationId(u.id);
                      setErreur("");
                    },
                  },
                  {
                    label: u.isActive ? "Désactiver le compte" : "Activer le compte",
                    icon: <Power size={14} />,
                    variant: u.isActive ? "danger" : "default",
                    disabled: u.id === user?.id,
                    onClick: () => setCible(u.id),
                  },
                ]}
              />,
            ])}
          />
        </section>
      ) : (
        <section className="data-section">
          <Table
            loading={chargementRoles && !roles.length}
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
                            onClick: () => setRoleEnModification(r),
                          },
                        ]
                      : [
                          {
                            label: "Modifier le rôle & privilèges",
                            icon: <Pencil size={14} />,
                            onClick: () => setRoleEnModification(r),
                          },
                          {
                            label: "Supprimer le rôle",
                            icon: <Trash2 size={14} />,
                            variant: "danger",
                            onClick: () => setRoleEnSuppression(r),
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
        {utilisateurModificationPerms && (
          <UserPermissionsModal
            key="permissions-modal"
            targetUser={utilisateurModificationPerms}
            close={() => setUtilisateurModificationPerms(null)}
            onSave={enregistrerPermissionsUtilisateur}
          />
        )}

        {roleEnModification && (
          <RolePermissionsModal
            key="role-permissions-modal"
            role={roleEnModification}
            close={() => setRoleEnModification(null)}
            onSave={enregistrerPermissionsRole}
          />
        )}

        {modalNouveauRoleOuverte && (
          <Modal title="Créer un nouveau rôle" close={() => setModalNouveauRoleOuverte(false)}>
            <form onSubmit={creerRole} className="role-modal">
              <Field label="Nom du rôle" hint="ex: Responsable RH, Superviseur, Contrôleur">
                <input
                  required
                  maxLength={100}
                  placeholder="ex: Responsable RH"
                  value={nomNouveauRole}
                  onChange={(e) => setNomNouveauRole(e.target.value)}
                  autoFocus
                />
              </Field>
              <Field label="Description">
                <input
                  maxLength={200}
                  placeholder="Brève description des responsabilités…"
                  value={descriptionNouveauRole}
                  onChange={(e) => setDescriptionNouveauRole(e.target.value)}
                />
              </Field>
              <footer style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button type="button" className="button" onClick={() => setModalNouveauRoleOuverte(false)}>
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

        {roleEnSuppression && (
          <Confirm
            key="delete-role"
            title={`Supprimer le rôle "${roleEnSuppression.nom}" ?`}
            text="Cette action est irréversible. Les utilisateurs doivent avoir un autre rôle avant de pouvoir le supprimer."
            close={() => setRoleEnSuppression(null)}
            confirm={supprimerRole}
          />
        )}

        {cible && (
          <Confirm
            key="access"
            title="Modifier l’accès au compte ?"
            text="Le changement sera appliqué à cet utilisateur."
            close={() => setCible("")}
            confirm={async () => {
              const objetCible = db.users.find((u) => u.id === cible);
              const nouvelEtatActif = !objetCible?.isActive;
              try {
                await usersService.updateStatus(cible, nouvelEtatActif);
              } catch (err) {
                console.warn("Échec mise à jour statut serveur :", err);
              }
              update((d) => {
                const u = d.users.find((u) => u.id === cible)!;
                u.isActive = nouvelEtatActif;
                audit(
                  d,
                  cible,
                  "Modification de l’accès",
                  u.isActive ? "Activation" : "Désactivation",
                );
              });
              notify("Accès mis à jour.");
            }}
          />
        )}

        {reinitialisationId && (
          <Modal
            key="password-reset"
            title="Réinitialiser le mot de passe"
            close={() => setReinitialisationId("")}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const p = String(new FormData(e.currentTarget).get("password"));
                if (p.length < 10) {
                  setErreur(
                    "Le mot de passe doit contenir au moins 10 caractères.",
                  );
                  return;
                }
                update((d) => {
                  d.credentials[reinitialisationId] = p;
                  audit(d, reinitialisationId, "Réinitialisation du mot de passe", "");
                });
                setReinitialisationId("");
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
              {erreur && <p className="form-error">{erreur}</p>}
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

export function CreerUtilisateur() {
  const { db, update, notify, audit } = useApp();
  const navigate = useNavigate();
  const [erreur, setErreur] = useState("");
  const [roles, setRoles] = useState<RoleDefinition[]>([]);

  useEffect(() => {
    let monte = true;
    rolesService
      .list()
      .then((res) => {
        if (monte && res.roles && res.roles.length > 0) {
          setRoles(res.roles);
        }
      })
      .catch((err) => console.warn("Échec chargement rôles :", err));
    return () => {
      monte = false;
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
            setErreur(
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
            setErreur("Cet email est déjà utilisé.");
            return;
          }
          let id: string = crypto.randomUUID();
          const partiesNom = parsed.data.name.trim().split(" ");
          const prenom = partiesNom[0];
          const nom = partiesNom.slice(1).join(" ") || prenom;
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
        {erreur && (
          <p className="form-error" role="alert">
            {erreur}
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

// Alias de rétrocompatibilité
export { GestionUtilisateurs as UsersPage, CreerUtilisateur as UserCreate };
