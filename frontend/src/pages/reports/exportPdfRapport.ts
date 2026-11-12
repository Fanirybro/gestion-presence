import { fullName } from "../../utils";
import type { SerieTendance } from "./GraphiqueTendancePresence";

export function genererImageGraphique(
  jours: string[],
  listeSeries: SerieTendance[],
  tauxGlobal: number,
): string {
  try {
    const canvas = document.createElement("canvas");
    const dpr = 2;
    const w = 900;
    const h = 270;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);

    const marge = { haut: 32, droite: 35, bas: 42, gauche: 52 };
    const largeurGraphe = w - marge.gauche - marge.droite;
    const hauteurGraphe = h - marge.haut - marge.bas;
    const nbJours = jours.length;

    const obtenirX = (i: number) =>
      marge.gauche + (nbJours > 1 ? (i / (nbJours - 1)) * largeurGraphe : largeurGraphe / 2);
    const obtenirY = (val: number) =>
      marge.haut + hauteurGraphe - (Math.max(0, Math.min(100, val)) / 100) * hauteurGraphe;

    const graduationsY = [0, 25, 50, 75, 100];
    ctx.strokeStyle = "#e8edea";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.fillStyle = "#7c8981";
    ctx.font = "11px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    for (const graduation of graduationsY) {
      const y = obtenirY(graduation);
      ctx.beginPath();
      ctx.moveTo(marge.gauche, y);
      ctx.lineTo(w - marge.droite, y);
      ctx.stroke();

      ctx.fillText(`${graduation}%`, marge.gauche - 10, y);
    }
    ctx.setLineDash([]);

    if (listeSeries.length === 1 && tauxGlobal > 0) {
      const avgY = obtenirY(tauxGlobal);
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(marge.gauche, avgY);
      ctx.lineTo(w - marge.droite, avgY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "#047857";
      ctx.font = "bold 10px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`Moyenne : ${tauxGlobal}%`, marge.gauche + 8, avgY - 8);
    }

    ctx.fillStyle = "#7c8981";
    ctx.font = "11px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    jours.forEach((_, i) => {
      const numJour = i + 1;
      const afficher = numJour === 1 || numJour % 5 === 0 || numJour === nbJours;
      if (afficher) {
        ctx.fillText(String(numJour), obtenirX(i), h - marge.bas + 10);
      }
    });

    for (const s of listeSeries) {
      if (!s.points.length) continue;

      if (listeSeries.length === 1) {
        const grad = ctx.createLinearGradient(0, marge.haut, 0, marge.haut + hauteurGraphe);
        grad.addColorStop(0, "rgba(34, 112, 87, 0.20)");
        grad.addColorStop(1, "rgba(34, 112, 87, 0.01)");

        ctx.beginPath();
        ctx.moveTo(obtenirX(0), obtenirY(s.points[0]));
        for (let i = 1; i < nbJours; i++) {
          ctx.lineTo(obtenirX(i), obtenirY(s.points[i]));
        }
        ctx.lineTo(obtenirX(nbJours - 1), obtenirY(0));
        ctx.lineTo(obtenirX(0), obtenirY(0));
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.moveTo(obtenirX(0), obtenirY(s.points[0]));
      for (let i = 1; i < nbJours; i++) {
        ctx.lineTo(obtenirX(i), obtenirY(s.points[i]));
      }
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();

      for (let i = 0; i < nbJours; i++) {
        const cx = obtenirX(i);
        const cy = obtenirY(s.points[i]);
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    if (listeSeries.length > 1) {
      let legendX = w - marge.droite;
      ctx.font = "11px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (let idx = listeSeries.length - 1; idx >= 0; idx--) {
        const s = listeSeries[idx];
        const textWidth = ctx.measureText(s.name).width;
        ctx.fillStyle = "#2d3832";
        ctx.fillText(s.name, legendX, 16);

        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(legendX - textWidth - 10, 16, 4, 0, Math.PI * 2);
        ctx.fill();

        legendX -= textWidth + 28;
      }
    } else if (listeSeries.length === 1) {
      const s = listeSeries[0];
      ctx.font = "11px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      const legendText = `${s.name} (${tauxGlobal}%)`;
      const textWidth = ctx.measureText(legendText).width;
      const lx = w - marge.droite;

      ctx.fillStyle = "#2d3832";
      ctx.fillText(legendText, lx, 16);

      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(lx - textWidth - 10, 16, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    return canvas.toDataURL("image/png");
  } catch (err) {
    console.warn("Échec génération graphique PDF :", err);
    return "";
  }
}

export async function exporterRapportPdf({
  nomOrganisation,
  adresseOrganisation,
  mois,
  libelleMois,
  libelleFiltreDepartement,
  effectifTotal,
  tauxPresenceGlobal,
  cumulRetardsMin,
  totalAbsences,
  joursDuMois,
  seriesTendance,
  lignesTableau,
  formaterDuree,
}: {
  nomOrganisation: string;
  adresseOrganisation: string;
  mois: string;
  libelleMois: string;
  libelleFiltreDepartement: string;
  effectifTotal: number;
  tauxPresenceGlobal: number;
  cumulRetardsMin: number;
  totalAbsences: number;
  joursDuMois: string[];
  seriesTendance: SerieTendance[];
  lignesTableau: any[];
  formaterDuree: (min: number) => string;
}) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.setTextColor(34, 112, 87);
  doc.text(nomOrganisation, 14, 18);

  doc.setFontSize(9);
  doc.setTextColor(120, 130, 125);
  if (adresseOrganisation) doc.text(adresseOrganisation, 14, 24);

  doc.setFontSize(14);
  doc.setTextColor(30, 40, 35);
  doc.text(`Rapport de Paie & Synthèse RH — ${libelleMois}`, 14, 36);

  doc.setFontSize(10);
  doc.setTextColor(90, 100, 95);
  doc.text(`Filtre : ${libelleFiltreDepartement} | Date d'émission : ${new Date().toLocaleDateString("fr-FR")}`, 14, 43);

  doc.setDrawColor(220, 230, 225);
  doc.setFillColor(245, 248, 246);
  doc.roundedRect(14, 48, 182, 22, 2, 2, "FD");

  doc.setFontSize(9);
  doc.setTextColor(90, 100, 95);
  doc.text("EFFECTIF TOTAL", 20, 56);
  doc.text("TAUX DE PRÉSENCE", 65, 56);
  doc.text("CUMUL RETARDS", 115, 56);
  doc.text("ABSENCES TOTALES", 160, 56);

  doc.setFontSize(12);
  doc.setTextColor(30, 40, 35);
  doc.text(String(effectifTotal), 20, 64);
  doc.text(`${tauxPresenceGlobal}%`, 65, 64);
  doc.text(formaterDuree(cumulRetardsMin), 115, 64);
  doc.text(String(totalAbsences), 160, 64);

  let debutTableauY = 78;
  const imageGraphe = genererImageGraphique(joursDuMois, seriesTendance, tauxPresenceGlobal);
  if (imageGraphe) {
    doc.setFontSize(11);
    doc.setTextColor(34, 112, 87);
    doc.text("Évaluation de l'assiduité — Taux de présence journalier", 14, 78);

    doc.setFontSize(8.5);
    doc.setTextColor(120, 130, 125);
    doc.text("Évolution quotidienne du taux de présence sur l'ensemble du mois", 14, 82.5);

    doc.setDrawColor(225, 232, 228);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(14, 85, 182, 54, 2, 2, "FD");

    doc.addImage(imageGraphe, "PNG", 14.5, 85.5, 181, 53);

    doc.setFontSize(11);
    doc.setTextColor(34, 112, 87);
    doc.text("Bilan Détaillé par Agent", 14, 147);

    debutTableauY = 151;
  } else {
    doc.setFontSize(11);
    doc.setTextColor(34, 112, 87);
    doc.text("Bilan Détaillé par Agent", 14, 78);
    debutTableauY = 82;
  }

  autoTable(doc, {
    startY: debutTableauY,
    head: [["Agent", "Service", "Jours trav.", "Cumul retards", "Abs. injust.", "Abs. just."]],
    body: lignesTableau.map((r) => [
      fullName(r.agent),
      r.dept,
      r.worked,
      formaterDuree(r.lateMin),
      r.absences,
      r.justified,
    ]),
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [34, 112, 87], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 249] },
    margin: { bottom: 25 },
    didDrawPage: () => {
      doc.setFontSize(8);
      doc.setTextColor(140, 145, 140);
      doc.text(
        `Document officiel RH — ${nomOrganisation} · Page ${doc.getNumberOfPages()}`,
        14,
        285,
      );
    },
  });

  doc.save(`rapport-presence-${mois}.pdf`);
}

// Alias de rétrocompatibilité
export {
  genererImageGraphique as generateTrendChartImage,
  exporterRapportPdf as exportReportsPdf,
};
