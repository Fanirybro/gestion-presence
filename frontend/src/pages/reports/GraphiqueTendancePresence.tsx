export const COULEURS_DEPARTEMENTS = [
  "#227057",
  "#2563eb",
  "#d97706",
  "#9333ea",
  "#e11d48",
  "#0891b2",
  "#4f46e5",
];

export interface SerieTendance {
  id: string;
  name: string;
  color: string;
  points: number[];
}

export function GraphiqueTendancePresence({
  jours,
  listeSeries,
  indexJourSelectionne,
  surSelectionJour,
}: {
  jours: string[];
  listeSeries: SerieTendance[];
  indexJourSelectionne: number | null;
  surSelectionJour: (index: number | null) => void;
}) {
  const largeur = 800;
  const hauteur = 240;
  const marge = { haut: 20, droite: 30, bas: 35, gauche: 45 };

  const largeurGraphe = largeur - marge.gauche - marge.droite;
  const hauteurGraphe = hauteur - marge.haut - marge.bas;

  const nbJours = jours.length;
  const obtenirX = (i: number) => marge.gauche + (nbJours > 1 ? (i / (nbJours - 1)) * largeurGraphe : largeurGraphe / 2);
  const obtenirY = (val: number) => marge.haut + hauteurGraphe - (val / 100) * hauteurGraphe;

  const graduationsY = [0, 25, 50, 75, 100];

  return (
    <div className="rp-chart-container">
      <svg
        viewBox={`0 0 ${largeur} ${hauteur}`}
        className="rp-chart-svg"
        preserveAspectRatio="none"
        onMouseLeave={() => surSelectionJour(null)}
      >
        <defs>
          {listeSeries.map((s) => (
            <linearGradient key={`grad-${s.id}`} id={`grad-${s.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0.0" />
            </linearGradient>
          ))}
        </defs>

        {graduationsY.map((tick) => {
          const y = obtenirY(tick);
          return (
            <g key={tick} className="rp-chart-grid">
              <line x1={marge.gauche} y1={y} x2={largeur - marge.droite} y2={y} stroke="#e4e9e5" strokeDasharray="3 3" />
              <text x={marge.gauche - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#8f9991">
                {tick}%
              </text>
            </g>
          );
        })}

        {jours.map((jourStr, i) => {
          const numJour = i + 1;
          const afficherLibelle = numJour === 1 || numJour % 5 === 0 || numJour === nbJours;
          if (!afficherLibelle) return null;
          const x = obtenirX(i);
          return (
            <text key={jourStr} x={x} y={hauteur - 12} textAnchor="middle" fontSize="10" fill="#8f9991">
              {numJour}
            </text>
          );
        })}

        {listeSeries.map((s) => {
          const chainePoints = s.points.map((pt, i) => `${obtenirX(i)},${obtenirY(pt)}`).join(" ");
          const chaineAire = `${chainePoints} ${obtenirX(nbJours - 1)},${obtenirY(0)} ${obtenirX(0)},${obtenirY(0)}`;

          return (
            <g key={s.id}>
              {listeSeries.length === 1 && (
                <polygon points={chaineAire} fill={`url(#grad-${s.id})`} />
              )}
              <polyline
                fill="none"
                stroke={s.color}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={chainePoints}
              />
              {s.points.map((pt, i) => (
                <circle
                  key={i}
                  cx={obtenirX(i)}
                  cy={obtenirY(pt)}
                  r={indexJourSelectionne === i ? 5 : 2.5}
                  fill={indexJourSelectionne === i ? "#fff" : s.color}
                  stroke={s.color}
                  strokeWidth="2"
                />
              ))}
            </g>
          );
        })}

        {indexJourSelectionne !== null && (
          <line
            x1={obtenirX(indexJourSelectionne)}
            y1={marge.haut}
            x2={obtenirX(indexJourSelectionne)}
            y2={hauteur - marge.bas}
            stroke="#227057"
            strokeWidth="1.5"
            strokeDasharray="2 2"
          />
        )}

        {jours.map((_, i) => {
          const x = obtenirX(i);
          const colW = largeurGraphe / nbJours;
          return (
            <rect
              key={i}
              x={x - colW / 2}
              y={marge.haut}
              width={colW}
              height={hauteurGraphe}
              fill="transparent"
              style={{ cursor: "crosshair" }}
              onMouseEnter={() => surSelectionJour(i)}
            />
          );
        })}
      </svg>
    </div>
  );
}

// Alias de rétrocompatibilité
export {
  GraphiqueTendancePresence as AttendanceTrendChart,
  COULEURS_DEPARTEMENTS as DEPT_COLORS,
  type SerieTendance as TrendSeries,
};
