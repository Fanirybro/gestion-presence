// The same imports serve navigation prefetching and React.lazy (browser module cache).
export const pageModules = {
  dashboard: () => import("../pages/Dashboard"),
  agents: () => import("../pages/Agents"),
  presences: () => import("../pages/Presences"),
  admin: () => import("../pages/Admin"),
  scan: () => import("../pages/Scan"),
  reports: () => import("../pages/Reports"),
  authorizedAbsences: () => import("../pages/AuthorizedAbsences"),
  departments: () => import("../pages/DepartmentsPage"),
  schedules: () => import("../pages/SchedulesPage"),
  profile: () => import("../pages/ProfilePage"),
};

export function prefetchPage(path: string) {
  if (path === "/conges-permissions") {
    void pageModules.authorizedAbsences().catch(() => {});
    return;
  }
  const load =
    path === "/"
      ? pageModules.dashboard
      : path === "/profile"
        ? pageModules.profile
        : path.startsWith("/agents")
          ? pageModules.agents
          : path.startsWith("/departments") || path.startsWith("/departements")
            ? pageModules.departments
            : path.startsWith("/schedules") || path.startsWith("/horaires")
              ? pageModules.schedules
              : /^\/(users|settings)/.test(path)
                ? pageModules.admin
              : path.startsWith("/scan")
                ? pageModules.scan
                : path.startsWith("/reports")
                  ? pageModules.reports
                  : /^\/(presences|absences|retards|history)/.test(path)
                    ? pageModules.presences
                    : null;
  if (load)
    void load().catch(() => {
      /* Navigation keeps its normal retry/error path. */
    });
}
