import { Component, lazy, type ReactNode } from "react";
import { MotionConfig } from "motion/react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppProvider, useApp } from "./app/context";
import { BootstrapSkeleton } from "./components/Skeleton";
import DashboardLayout from "./layouts/DashboardLayout";
import OrganisationSetup from "./pages/OrganisationSetup";
import Login from "./pages/Login";
import ForgottenAttendance from "./pages/ForgottenAttendance";
import { pageModules } from "./app/pageModules";
import "./App.css";
import "./motion.css";
import "./secretary.css";
import "./glass.css";
import "./badges.css";
const Dashboard = lazy(pageModules.dashboard);
const Scan = lazy(pageModules.scan);
const Reports = lazy(pageModules.reports);
const AuthorizedAbsences = lazy(pageModules.authorizedAbsences);
const Agents = lazy(() =>
  pageModules.agents().then((m) => ({ default: m.Agents })),
);
const AgentBadges = lazy(() => import("./pages/AgentBadges"));
const AgentDetails = lazy(() =>
  pageModules.agents().then((m) => ({ default: m.AgentDetails })),
);
const AgentForm = lazy(() =>
  pageModules.agents().then((m) => ({ default: m.AgentForm })),
);
const AgentQr = lazy(() =>
  pageModules.agents().then((m) => ({ default: m.AgentQr })),
);
const Presences = lazy(() =>
  pageModules.presences().then((m) => ({ default: m.Presences })),
);
const PresenceDetails = lazy(() =>
  pageModules.presences().then((m) => ({ default: m.PresenceDetails })),
);
const Profile = lazy(pageModules.profile);
const SettingsPage = lazy(() =>
  pageModules.admin().then((m) => ({ default: m.SettingsPage })),
);
const DepartmentsPage = lazy(pageModules.departments);
const SchedulesPage = lazy(pageModules.schedules);
const UsersPage = lazy(() =>
  pageModules.admin().then((m) => ({ default: m.UsersPage })),
);
const UserCreate = lazy(() =>
  pageModules.admin().then((m) => ({ default: m.UserCreate })),
);
const FaceCheckInPage = lazy(
  () => import("./modules/face-recognition/FaceCheckInPage"),
);
const FaceEnrollComponent = lazy(
  () => import("./modules/face-recognition/FaceEnrollComponent"),
);
const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});
function Protected() {
  const { user, personnelLoading, personnelError, refreshPersonnel, logout } =
    useApp();
  return !user ? (
    <Navigate to="/login" replace />
  ) : !user.organisationId ? (
    <Navigate to="/organisation" replace />
  ) : personnelError ? (
    <div className="error-page" role="alert">
      <h1>Personnel indisponible</h1>
      <p>{personnelError}</p>
      <button
        className="button primary"
        onClick={() => void refreshPersonnel()}
      >
        Réessayer
      </button>
      <button className="button" onClick={logout}>
        Se déconnecter
      </button>
    </div>
  ) : personnelLoading ? (
    <BootstrapSkeleton authenticated />
  ) : (
    <Outlet />
  );
}
import { hasPermission } from "./types";

function PermissionGuard({ permission }: { permission: string }) {
  const { user } = useApp();
  return hasPermission(user, permission) ? (
    <Outlet />
  ) : (
    <Navigate to="/403" replace />
  );
}

function ErrorPage({ forbidden = false }: { forbidden?: boolean }) {
  return (
    <div className="error-page">
      <span className="eyebrow">{forbidden ? "403" : "404"}</span>
      <h1>{forbidden ? "Accès restreint" : "Page introuvable"}</h1>
      <p>
        {forbidden
          ? "Vous ne disposez pas des autorisations nécessaires pour accéder à ce module."
          : "Cette adresse ne correspond à aucune page."}
      </p>
      <Link to="/" className="button primary">
        Retour au tableau de bord
      </Link>
    </div>
  );
}
class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean; error?: Error }
> {
  override state: { failed: boolean; error?: Error } = { failed: false };
  static getDerivedStateFromError(error: Error) {
    return { failed: true, error };
  }
  componentDidCatch(error: Error, errorInfo: unknown) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }
  render() {
    return this.state.failed ? (
      <div className="error-page">
        <h1>Une erreur est survenue</h1>
        <p>{this.state.error?.message || "Rechargez la page pour réessayer."}</p>
        <button
          className="button primary"
          onClick={() => window.location.reload()}
        >
          Recharger
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
export default function App() {
  return (
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">
        <QueryClientProvider client={client}>
          <AppProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Login signupMode />} />
                <Route path="/organisation" element={<OrganisationSetup />} />
                <Route element={<Protected />}>
                  <Route element={<DashboardLayout />}>
                    <Route index element={<Dashboard />} />
                    <Route element={<PermissionGuard permission="scan" />}>
                      <Route path="/scan" element={<Scan />} />
                    </Route>
                    <Route element={<PermissionGuard permission="kiosk" />}>
                      <Route path="/kiosk" element={<FaceCheckInPage />} />
                    </Route>
                    <Route element={<PermissionGuard permission="leaves" />}>
                      <Route
                        path="/conges-permissions"
                        element={<AuthorizedAbsences />}
                      />
                    </Route>
                    <Route element={<PermissionGuard permission="presences" />}>
                      <Route path="/presences" element={<Presences mode="presences" />} />
                      <Route path="/retards" element={<Presences mode="retards" />} />
                      <Route path="/absences" element={<Presences mode="absences" />} />
                      <Route
                        path="/presences/:id"
                        element={<PresenceDetails />}
                      />
                      <Route
                        path="/retards/:id"
                        element={<PresenceDetails />}
                      />
                      <Route
                        path="/absences/:id"
                        element={<PresenceDetails />}
                      />
                    </Route>
                    <Route element={<PermissionGuard permission="presences_add" />}>
                      <Route
                        path="/presences/ajouter"
                        element={<ForgottenAttendance />}
                      />
                    </Route>
                    <Route element={<PermissionGuard permission="reports" />}>
                      <Route path="/reports" element={<Reports />} />
                      <Route path="/reports/daily" element={<Reports />} />
                    </Route>
                    <Route path="/profile" element={<Profile />} />
                    <Route path="/403" element={<ErrorPage forbidden />} />
                    <Route element={<PermissionGuard permission="agents" />}>
                      <Route path="/agents" element={<Agents />} />
                      <Route path="/agents/badges" element={<AgentBadges />} />
                      <Route
                        path="/agents/new"
                        element={<AgentForm key="new" />}
                      />
                      <Route path="/agents/:id" element={<AgentDetails />} />
                      <Route path="/agents/:id/edit" element={<AgentForm />} />
                      <Route path="/agents/:id/qr" element={<AgentQr />} />
                    </Route>
                    <Route element={<PermissionGuard permission="departments" />}>
                      <Route path="/departments" element={<DepartmentsPage />} />
                      <Route
                        path="/departements"
                        element={<Navigate to="/departments" replace />}
                      />
                    </Route>
                    <Route element={<PermissionGuard permission="schedules" />}>
                      <Route path="/schedules" element={<SchedulesPage />} />
                      <Route
                        path="/horaires"
                        element={<Navigate to="/schedules" replace />}
                      />
                    </Route>
                    <Route element={<PermissionGuard permission="users" />}>
                      <Route path="/users" element={<UsersPage />} />
                      <Route path="/users/new" element={<UserCreate />} />
                    </Route>
                    <Route element={<PermissionGuard permission="settings" />}>
                      <Route path="/settings" element={<SettingsPage />} />
                    </Route>
                    <Route element={<PermissionGuard permission="face_enroll" />}>
                      <Route path="/admin/face-setup" element={<FaceEnrollComponent />} />
                      <Route path="/face-enroll" element={<Navigate to="/admin/face-setup" replace />} />
                    </Route>
                    <Route path="*" element={<ErrorPage />} />
                  </Route>
                </Route>
              </Routes>
            </BrowserRouter>
          </AppProvider>
        </QueryClientProvider>
      </MotionConfig>
    </ErrorBoundary>
  );
}
