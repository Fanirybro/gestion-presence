import { useEffect, useRef, useState } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from "motion/react";
import RouteContent from "../components/RouteContent";
import { prefetchPage } from "../app/pageModules";
import {
  LayoutDashboard,
  ScanLine,
  Users,
  Layers,
  CalendarCheck,
  CalendarDays,
  Files,
  Settings,
  Camera,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  QrCode,
} from "lucide-react";
import { useApp } from "../app/context";
import { initials } from "../utils";
import { hasPermission } from "../types";

export default function DashboardLayout() {
  const { db, user, organisation, logout } = useApp();
  const location = useLocation();
  const qrEnabled = organisation?.pointage_qr ?? db.settings.pointage_qr ?? true;
  const facialEnabled = organisation?.pointage_facial ?? db.settings.pointage_facial ?? true;
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
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!open) return;
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
    };
  }, [open]);

  // Sidebar épurée : 7 entrées essentielles au quotidien
  const navItems = [
    { path: "/", name: "Tableau de bord", icon: LayoutDashboard, permission: "dashboard" },
    ...(qrEnabled ? [{ path: "/scan", name: "Pointage QR", icon: ScanLine, permission: "scan" }] : []),
    ...(facialEnabled ? [{ path: "/kiosk", name: "Pointage Facial", icon: Camera, permission: "kiosk" }] : []),
    { path: "/agents", name: "Personnel", icon: Users, permission: "agents" },
    { path: "/departments", name: "Divisions", icon: Layers, permission: "departments" },
    { path: "/presences", name: "Présences", icon: CalendarCheck, permission: "presences" },
    { path: "/reports", name: "Rapports", icon: Files, permission: "reports" },
    { path: "/conges-permissions", name: "Congés & Permissions", icon: CalendarDays, permission: "leaves" },
    { path: "/settings", name: "Paramètres", icon: Settings, permission: "settings" },
  ].filter((item) => !item.permission || hasPermission(user, item.permission));

  const orgNom = organisation?.nom || "présence";
  const nameLen = orgNom.length;
  const isLongName = nameLen > 25;
  const brandFontSize =
    nameLen > 40
      ? "13.5px"
      : nameLen > 28
        ? "15.5px"
        : nameLen > 18
          ? "18.5px"
          : nameLen > 12
            ? "22px"
            : "26px";
  const brandLineHeight = isLongName ? 1.25 : 1.15;

  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
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

      <aside
        id="main-navigation"
        ref={sidebar}
        aria-label="Navigation principale"
        className={`sidebar ${open ? "open" : ""}`}
      >
        <div
          className="brand"
          style={
            isLongName
              ? { alignItems: "flex-start", padding: "22px 18px 20px" }
              : undefined
          }
        >
          <button
            className="brand-mark sidebar-toggle"
            style={isLongName ? { marginTop: "2px", flexShrink: 0 } : undefined}
            aria-label={collapsed ? "Déployer la sidebar" : "Replier la sidebar"}
            title={collapsed ? "Déployer la sidebar" : "Replier la sidebar"}
            aria-expanded={!collapsed}
            aria-controls="main-navigation"
            onClick={toggleSidebar}
          >
            {organisation?.logo_url ? (
              <img
                src={organisation.logo_url}
                alt="Logo"
                style={{ width: 26, height: 26, objectFit: "contain", borderRadius: 4 }}
              />
            ) : (
              <QrCode className="brand-logo" size={25} aria-hidden="true" />
            )}
            <span className="brand-toggle-icon" aria-hidden="true">
              {collapsed ? <PanelLeftOpen size={23} /> : <PanelLeftClose size={23} />}
            </span>
          </button>
          <Link
            to="/"
            className="brand-mark mobile-brand"
            style={isLongName ? { marginTop: "2px", flexShrink: 0 } : undefined}
            aria-label="Accueil"
          >
            {organisation?.logo_url ? (
              <img
                src={organisation.logo_url}
                alt="Logo"
                style={{ width: 26, height: 26, objectFit: "contain", borderRadius: 4 }}
              />
            ) : (
              <QrCode size={25} />
            )}
          </Link>
          <Link
            to="/"
            className="brand-name"
            aria-label="Accueil"
            style={{
              fontSize: brandFontSize,
              lineHeight: brandLineHeight,
            }}
          >
            {orgNom}
            <span className="brand-dot">.</span>
            <small>GESTION DE PRÉSENCE</small>
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
            <section>
              {navItems.map(({ path, name, icon: Icon }) => {
                const isItemActive = (navActive: boolean) => {
                  if (path === "/presences") {
                    return (
                      navActive ||
                      location.pathname.startsWith("/presences") ||
                      location.pathname.startsWith("/retards") ||
                      location.pathname.startsWith("/absences")
                    );
                  }
                  return navActive;
                };

                return (
                  <NavLink
                    end={path === "/"}
                    key={path}
                    to={path}
                    className={({ isActive }) => (isItemActive(isActive) ? "active" : "")}
                    aria-label={name}
                    title={name}
                    onClick={() => setOpen(false)}
                    onPointerEnter={() => prefetchPage(path)}
                    onFocus={() => prefetchPage(path)}
                  >
                    {({ isActive: navActive }) => {
                      const active = isItemActive(navActive);
                      return (
                        <>
                          {active && (
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
                      );
                    }}
                  </NavLink>
                );
              })}
            </section>
          </nav>
        </LayoutGroup>

        <div className="sidebar-profile">
          <Link
            to="/profile"
            aria-label="Mon profil"
            title="Accéder à mon profil"
            className={location.pathname === "/profile" ? "active-profile" : ""}
          >
            <span className="avatar">{initials(user?.name || "")}</span>
            <span>
              <strong>{user?.name}</strong>
              <small>
                {user?.role === "COORDINATOR" ? "SuperAdmin" : "Responsable de division"}
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

      <div className="main-shell" inert={open}>
        <main>
          <RouteContent />
        </main>
        <footer className="app-footer">
          <span>{organisation?.nom || db.settings.organization}</span>
          <span>Fuseau : {organisation?.fuseau_horaire || "Madagascar"}</span>
        </footer>
      </div>
    </div>
  );
}
