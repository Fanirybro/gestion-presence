// The same imports serve navigation prefetching and React.lazy (browser module cache).
export const pageModules = {
  dashboard: () => import("../pages/Dashboard"),
  agents: () => import("../pages/Agents"),
  presences: () => import("../pages/Presences"),
  admin: () => import("../pages/Admin"),
  scan: () => import("../pages/Scan"),
  reports: () => import("../pages/Reports"),
  authorizedAbsences: () => import("../pages/AuthorizedAbsences"),
};

export function prefetchPage(path: string) {
  if (path === "/conges-permissions") {
    void pageModules.authorizedAbsences().catch(() => {});
    return;
  }
  const load =
    path === "/"
      ? pageModules.dashboard
      : path.startsWith("/agents")
        ? pageModules.agents
        : /^\/(users|settings|profile)/.test(path)
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
