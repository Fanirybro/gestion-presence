import type { CSSProperties } from "react";

export function Skeleton({
  width = "100%",
  height = 14,
  className = "",
}: {
  width?: number | string;
  height?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`skeleton ${className}`}
      style={{ width, height } as CSSProperties}
    />
  );
}

export function TableSkeleton({
  columns = 6,
  rows = 8,
}: {
  columns?: number;
  rows?: number;
}) {
  return (
    <div className="table-scroll skeleton-table" aria-hidden="true">
      <table>
        <tbody>
          {Array.from({ length: rows }, (_, row) => (
            <tr key={row}>
              {Array.from({ length: columns }, (_, col) => (
                <td key={col}>
                  {col === 0 ? (
                    <div className="person">
                      <Skeleton
                        width={32}
                        height={32}
                        className="skeleton-avatar"
                      />
                      <div className="skeleton-person">
                        <Skeleton width="85%" height={12} />
                        <Skeleton width="50%" height={9} />
                      </div>
                    </div>
                  ) : (
                    <Skeleton
                      width={col === columns - 1 ? 28 : "75%"}
                      height={12}
                    />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PageSkeleton({ path = "/" }: { path?: string }) {
  const dashboard = path === "/";
  const scan = path.startsWith("/scan");
  const report = path.startsWith("/reports");
  const form = /new|edit|settings|profile/.test(path);
  return (
    <div
      className="page-skeleton"
      role="status"
      aria-label="Chargement des données"
      aria-busy="true"
    >
      <div className="page-heading" aria-hidden="true">
        <div className="skeleton-heading">
          <Skeleton width={95} height={10} />
          <Skeleton width="80%" height={32} />
          <Skeleton width="100%" height={13} />
        </div>
        <Skeleton width={145} height={40} />
      </div>
      {dashboard ? (
        <>
          <div className="day-strip">
            <Skeleton width="60%" height={12} />
          </div>
          <div className="stats-grid">
            {Array.from({ length: 4 }, (_, i) => (
              <div className="stat-card" key={i}>
                <Skeleton width="70%" height={12} />
                <Skeleton width={55} height={43} className="skeleton-value" />
                <Skeleton width="60%" height={10} />
              </div>
            ))}
          </div>
          <div className="dashboard-middle skeleton-panels">
            <Skeleton height={230} />
            <Skeleton height={230} />
          </div>
          <div className="data-section">
            <div className="section-heading">
              <Skeleton width={175} height={20} />
            </div>
            <TableSkeleton rows={5} />
          </div>
        </>
      ) : scan ? (
        <div className="scan-layout">
          <div className="scanner-section skeleton-surface">
            <Skeleton width="55%" height={20} />
            <Skeleton height={300} />
            <Skeleton height={42} />
          </div>
          <div className="recent-scans skeleton-surface">
            <Skeleton width="60%" height={20} />
            <TableSkeleton columns={2} rows={6} />
          </div>
        </div>
      ) : form ? (
        <div className="form-surface skeleton-form">
          <Skeleton width={170} height={20} />
          <div className="form-grid">
            {Array.from(
              { length: path.includes("settings") ? 8 : 6 },
              (_, i) => (
                <div className="field" key={i}>
                  <Skeleton width="35%" height={12} />
                  <Skeleton height={41} />
                </div>
              ),
            )}
          </div>
          <div className="form-actions">
            <Skeleton width={155} height={40} />
          </div>
        </div>
      ) : report ? (
        <>
          <div className="filters">
            <Skeleton width={160} height={40} />
            <Skeleton width={200} height={40} />
          </div>
          <div className="report-paper">
            <div className="skeleton-heading">
              <Skeleton width="80%" height={25} />
              <Skeleton width="60%" height={12} />
            </div>
            <div className="report-stats">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} width={100} height={36} />
              ))}
            </div>
            <TableSkeleton />
          </div>
        </>
      ) : (
        <>
          <div className="filters">
            <Skeleton width="45%" height={40} />
            <Skeleton width="24%" height={40} />
            <Skeleton width="20%" height={40} />
          </div>
          <div className="data-section">
            <div className="section-heading">
              <Skeleton width={135} height={20} />
            </div>
            <TableSkeleton />
            <div className="pagination">
              <Skeleton width={90} height={12} />
              <Skeleton width={110} height={24} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function BootstrapSkeleton({
  authenticated,
}: {
  authenticated: boolean;
}) {
  if (!authenticated)
    return (
      <div
        className="login-page"
        role="status"
        aria-label="Chargement de la connexion"
        aria-busy="true"
      >
        <div className="login-brand">
          <Skeleton width={150} height={32} />
        </div>
        <div className="login-content skeleton-surface">
          <Skeleton width="85%" height={35} />
          <Skeleton width="90%" />
          <Skeleton height={44} />
          <Skeleton height={44} />
          <Skeleton height={44} />
        </div>
      </div>
    );
  return (
    <div className="app-shell bootstrap-skeleton">
      <aside className="sidebar" aria-hidden="true">
        <div className="brand">
          <Skeleton width={165} height={38} />
        </div>
        <div className="skeleton-navigation">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} height={36} />
          ))}
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <Skeleton width={150} />
          <Skeleton width={32} height={32} className="skeleton-avatar" />
        </header>
        <main>
          <PageSkeleton path={window.location.pathname} />
        </main>
      </div>
    </div>
  );
}
