import { useEffect, useRef, useState } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from "motion/react";
import {
  SecretaryModeProvider,
  SecretaryModeSelector,
  useSecretaryMode,
} from "../app/secretaryMode";
import RouteContent from "../components/RouteContent";
import { prefetchPage } from "../app/pageModules";
import {
  Home,
  LayoutDashboard,
  ScanLine,
  Users,
  CalendarCheck,
  CalendarDays,
  UserX,
  Clock3,
  History,
  Files,
  Settings,
  ShieldCheck,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  ChevronDown,
  QrCode,
} from "lucide-react";
import { useApp } from "../app/context";
import { initials, dateLabel, today } from "../utils";
const groups = [
  {
    label: "ESPACE DE TRAVAIL",
    items: [
      { path: "/", name: "Tableau de bord", icon: LayoutDashboard },
      { path: "/scan", name: "Pointage QR", icon: ScanLine },
      { path: "/agents", name: "Personnel", icon: Users, admin: true },
    ],
  },
  {
    label: "SUIVI DES PRÉSENCES",
    items: [
      { path: "/presences", name: "Présences", icon: CalendarCheck },
      { path: "/absences", name: "Absences", icon: UserX },
      { path: "/retards", name: "Retards", icon: Clock3 },
      { path: "/history", name: "Historique", icon: History },
      { path: "/reports", name: "Rapports", icon: Files },
      {
        path: "/conges-permissions",
        name: "Congés et permissions",
        icon: CalendarDays,
      },
    ],
  },
  {
    label: "ADMINISTRATION",
    items: [
      { path: "/users", name: "Utilisateurs", icon: ShieldCheck, admin: true },
      { path: "/settings", name: "Paramètres", icon: Settings, admin: true },
    ],
  },
];
export default function DashboardLayout() {
  const { user } = useApp();
  return (
    <SecretaryModeProvider key={user!.id}>
      <WorkspaceLayout />
    </SecretaryModeProvider>
  );
}
function WorkspaceLayout() {
  const { db, user, logout } = useApp();
  const { simple } = useSecretaryMode();
  const location = useLocation();
  const secretary = user?.role === "SECRETARY";
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("presence.sidebar.collapsed") === "true";
    } catch {
      return false;
    }
  });
  const toggleSidebar = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem("presence.sidebar.collapsed", String(next));
    } catch {
      // The toggle still works when browser storage is unavailable.
    }
  };
  const sidebar = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!open) return;
    const sidebarNode = sidebar.current;
    const trigger = menuButton.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebar.current?.querySelector<HTMLButtonElement>(".mobile-close")?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
      if (event.key !== "Tab") return;
      const targets = Array.from(
        sidebar.current?.querySelectorAll<HTMLElement>(
          "a[href],button:not([disabled])",
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
      if (!targets?.length) return;
      const first = targets[0];
      const last = targets[targets.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const desktop = window.matchMedia("(min-width: 761px)");
    const resize = () => {
      if (desktop.matches) setOpen(false);
    };
    document.addEventListener("keydown", keyboard);
    desktop.addEventListener("change", resize);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keyboard);
      desktop.removeEventListener("change", resize);
      if (sidebarNode?.contains(document.activeElement)) trigger?.focus();
    };
  }, [open]);
  useEffect(() => {
    // A mode change from another tab must also release the mobile focus trap.
    // oxlint-disable-next-line react/set-state-in-effect
    if (simple) setOpen(false);
  }, [simple]);
  return (
    <div
      className={`app-shell ${secretary ? "secretary-space" : ""} ${simple ? "secretary-simple" : ""} ${collapsed && !simple ? "sidebar-collapsed" : ""}`}
    >
      <AnimatePresence>
        {open && (
          <motion.button
            key="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="sidebar-scrim"
            aria-label="Fermer le menu"
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
      {!simple && (
        <aside
          id="main-navigation"
          ref={sidebar}
          aria-label="Navigation principale"
          className={`sidebar ${open ? "open" : ""}`}
        >
          <div className="brand">
            <button
              className="brand-mark sidebar-toggle"
              aria-label={
                collapsed ? "Déployer la sidebar" : "Replier la sidebar"
              }
              title={collapsed ? "Déployer la sidebar" : "Replier la sidebar"}
              aria-expanded={!collapsed}
              aria-controls="main-navigation"
              onClick={toggleSidebar}
            >
              <QrCode className="brand-logo" size={25} aria-hidden="true" />
              <span className="brand-toggle-icon" aria-hidden="true">
                {collapsed ? (
                  <PanelLeftOpen size={23} />
                ) : (
                  <PanelLeftClose size={23} />
                )}
              </span>
            </button>
            <Link
              to="/"
              className="brand-mark mobile-brand"
              aria-label="Accueil"
            >
              <QrCode size={25} />
            </Link>
            <Link to="/" className="brand-name" aria-label="Accueil">
              présence<span className="brand-dot">.</span>
              <small>GESTION DU PERSONNEL</small>
            </Link>
          </div>
          <button
            className="mobile-close icon-button"
            aria-label="Fermer le menu"
            onClick={() => setOpen(false)}
          >
            <X />
          </button>
          <LayoutGroup id="sidebar">
            <nav>
              {groups.map((g) => {
                const items = g.items.filter(
                  (i) =>
                    !i.admin || user?.role === "COORDINATOR",
                );
                return items.length ? (
                  <section key={g.label}>
                    <h2>{g.label}</h2>
                    {items.map(({ path, name, icon: Icon }) => (
                      <NavLink
                        end={path === "/"}
                        key={path}
                        to={path}
                        aria-label={name}
                        title={name}
                        onClick={() => setOpen(false)}
                        onPointerEnter={() => prefetchPage(path)}
                        onFocus={() => prefetchPage(path)}
                      >
                        {({ isActive }) => (
                          <>
                            {isActive && (
                              <motion.span
                                className="nav-active-indicator"
                                layoutId={reduced ? undefined : "active-page"}
                                transition={{
                                  type: "spring",
                                  stiffness: 500,
                                  damping: 40,
                                }}
                              />
                            )}
                            <Icon size={18} />
                            <span className="nav-label">{name}</span>
                            {path === "/scan" && <span className="nav-live" />}
                          </>
                        )}
                      </NavLink>
                    ))}
                  </section>
                ) : null;
              })}
            </nav>
          </LayoutGroup>
          <div className="sidebar-profile">
            <Link to="/profile" aria-label="Mon profil" title={user?.name}>
              <span className="avatar">{initials(user?.name || "")}</span>
              <span>
                <strong>{user?.name}</strong>
                <small>
                  {user?.role === "COORDINATOR"
                    ? "Coordinatrice / Coordinateur"
                    : "Secrétaire"}
                </small>
              </span>
            </Link>
            <button
              className="icon-button"
              title="Se déconnecter"
              aria-label="Se déconnecter"
              onClick={logout}
            >
              <LogOut size={18} />
            </button>
          </div>
        </aside>
      )}
      <div className="main-shell" inert={open}>
        <header className="topbar">
          <div>
            {simple ? (
              <Link to="/" className="secretary-brand">
                <QrCode aria-hidden="true" />
                <span>présence.</span>
              </Link>
            ) : (
              <>
                <button
                  className="icon-button mobile-menu"
                  aria-label="Ouvrir le menu"
                  ref={menuButton}
                  aria-expanded={open}
                  aria-controls="main-navigation"
                  onClick={() => setOpen(true)}
                >
                  <Menu />
                </button>
              </>
            )}
          </div>
          <div className="topbar-right">
            {secretary && <SecretaryModeSelector />}
            {simple && (
              <Link to="/profile" className="secretary-identity">
                {user?.name} · Secrétaire
              </Link>
            )}
            {!simple && <span className="top-date">{dateLabel(today())}</span>}
            <span className="demo-label">DÉMO</span>
            {simple ? (
              <button
                className="icon-button"
                aria-label="Se déconnecter"
                title="Se déconnecter"
                onClick={logout}
              >
                <LogOut />
              </button>
            ) : (
              <Link to="/profile" aria-label="Mon profil">
                <span className="avatar small">
                  {initials(user?.name || "")}
                </span>
                <ChevronDown size={14} />
              </Link>
            )}
          </div>
        </header>
        <main>
          {simple && location.pathname !== "/" && (
            <Link to="/" className="button secretary-back">
              <Home size={20} aria-hidden="true" />
              Retour à l’accueil
            </Link>
          )}
          <RouteContent />
        </main>
        <footer className="app-footer">
          <span>Présence · {db.settings.organization}</span>
          <span>Heure de Madagascar</span>
        </footer>
      </div>
    </div>
  );
}
