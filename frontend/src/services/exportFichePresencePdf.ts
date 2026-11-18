import type { Agent, SchedulePeriod } from "../types";
import type { PresenceRecord } from "./presences";
import type { AuthorizedAbsence } from "./authorizedAbsences";
import { fullName } from "../utils";

export interface FichePresenceOptions {
  format: "portrait" | "paysage";
  date: string; // YYYY-MM-DD
  periode?: "MATIN" | "APRES_MIDI" | "JOURNEE" | "";
  divisionId?: string;
  divisionNom?: string;
  nomOrganisation?: string;
  adresseOrganisation?: string;
  logoUrl?: string | null;
  lieu?: string; // Ville (ex: Toliara)
  agents: Agent[];
  attendances: PresenceRecord[];
  absencesAutorisees?: AuthorizedAbsence[];
  divisions?: { id: string; name: string }[];
}

/**
 * Charge une image (data URI, webp, png, jpeg, svg) et la convertit en PNG sécurisé pour jsPDF
 */
async function loadLogoForPdf(
  logoUrl?: string | null,
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  if (!logoUrl || typeof logoUrl !== "string" || !logoUrl.trim()) return null;

  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const naturalW = img.naturalWidth || img.width || 100;
          const naturalH = img.naturalHeight || img.height || 100;
          const canvas = document.createElement("canvas");
          canvas.width = naturalW;
          canvas.height = naturalH;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL("image/png");
          resolve({ dataUrl, width: naturalW, height: naturalH });
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = logoUrl;
    } catch {
      resolve(null);
    }
  });
}

function getAgentIM(agent: Agent): string {
  const meta = agent.metadata || {};
  return String(
    meta.im ||
      meta.IM ||
      meta.matricule ||
      meta.Matricule ||
      meta.num_im ||
      meta.numero_im ||
      agent.id,
  );
}

function formatDateFr(isoDate: string): { jj_mm_aaaa: string; moisNom: string; annee: string } {
  try {
    const [y, m, d] = isoDate.split("-");
    const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
    const moisNom = new Intl.DateTimeFormat("fr-FR", { month: "long" }).format(dateObj);
    return {
      jj_mm_aaaa: `${d} / ${m} / ${y}`,
      moisNom: moisNom.charAt(0).toUpperCase() + moisNom.slice(1),
      annee: y,
    };
  } catch {
    return { jj_mm_aaaa: isoDate, moisNom: "", annee: "" };
  }
}

function getSlotLabel(slot: SchedulePeriod): string {
  switch (slot) {
    case "MATIN":
      return "CRÉNEAU DU MATIN";
    case "APRES_MIDI":
      return "CRÉNEAU DE L'APRÈS-MIDI";
    case "SOIR":
      return "CRÉNEAU DU SOIR";
    default:
      return `CRÉNEAU ${slot}`;
  }
}

/**
 * 1. FORMAT PORTRAIT : Fiche par Division
 */
export async function exporterFicheDivisionPortrait(options: FichePresenceOptions) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const {
    date,
    periode = "JOURNEE",
    divisionNom = "Division",
    lieu = "Toliara",
    agents,
    attendances,
    absencesAutorisees = [],
    logoUrl,
  } = options;

  const dateEdition = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const loadedLogo = await loadLogoForPdf(logoUrl);

  let topShift = 0;
  if (loadedLogo) {
    const maxW = 24;
    const maxH = 15;
    let logoW = maxW;
    let logoH = (loadedLogo.height / loadedLogo.width) * logoW;
    if (logoH > maxH) {
      logoH = maxH;
      logoW = (loadedLogo.width / loadedLogo.height) * logoH;
    }
    const logoX = 105 - logoW / 2;
    const logoY = 6;
    try {
      doc.addImage(loadedLogo.dataUrl, "PNG", logoX, logoY, logoW, logoH);
      topShift = logoH + 4;
    } catch (e) {
      console.warn("Impossible d'ajouter le logo au PDF:", e);
    }
  }

  const { jj_mm_aaaa } = formatDateFr(date);

  // Déterminer les créneaux à générer
  let targetSlots: SchedulePeriod[] = [];
  if (periode === "MATIN") {
    targetSlots = ["MATIN"];
  } else if (periode === "APRES_MIDI") {
    targetSlots = ["APRES_MIDI"];
  } else {
    targetSlots = ["MATIN", "APRES_MIDI"];
    if (attendances.some((p) => p.date === date && (p.periode === "SOIR" || p.period === "SOIR"))) {
      targetSlots.push("SOIR");
    }
  }

  // --- EN-TÊTE INSTITUTIONNEL PAGE 1 ---
  doc.setFont("times", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(20, 20, 20);
  doc.text("REPOBLIKAN'I MADAGASIKARA", 105, 14 + topShift, { align: "center" });

  doc.setFont("times", "italic");
  doc.setFontSize(8.5);
  doc.setTextColor(50, 50, 50);
  doc.text("Fitiavana - Tanindrazana - Fandrosoana", 105, 18 + topShift, { align: "center" });

  doc.setLineWidth(0.3);
  doc.setDrawColor(80, 80, 80);
  doc.line(90, 19.5 + topShift, 120, 19.5 + topShift);

  doc.setFont("times", "bold");
  doc.setFontSize(8);
  doc.setTextColor(30, 30, 30);
  doc.text("MINISTÈRE DE L'ÉCONOMIE ET DES FINANCES", 14, 25 + topShift);

  doc.setFont("times", "normal");
  doc.setFontSize(7.5);
  doc.text("SECRÉTARIAT GÉNÉRAL", 14, 29 + topShift);
  doc.text("DIRECTION GÉNÉRALE DU BUDGET", 14, 33 + topShift);

  doc.setFont("times", "bold");
  doc.setFontSize(8.5);
  doc.text(`DIVISION : ${divisionNom.toUpperCase()}`, 14, 38.5 + topShift);

  doc.setLineWidth(0.2);
  doc.line(14, 40.5 + topShift, 75, 40.5 + topShift);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(10, 10, 10);
  doc.text("FICHE DE PRESENCE", 105, 50 + topShift, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Date : ${jj_mm_aaaa}`, 14, 57 + topShift);

  const matinCoche = targetSlots.includes("MATIN") ? "[X]" : "[  ]";
  const apresMidiCoche = targetSlots.includes("APRES_MIDI") ? "[X]" : "[  ]";
  doc.setFont("helvetica", "bold");
  doc.text(`${matinCoche}  MATIN        ${apresMidiCoche}  APRÈS-MIDI`, 120, 57 + topShift);

  let currentY = 62 + topShift;

  targetSlots.forEach((slot, slotIndex) => {
    // Si ce n'est pas le premier créneau, vérifier la place restante sur la page
    if (slotIndex > 0) {
      if (currentY + 55 > 280) {
        doc.addPage();
        currentY = 20;
      }
    }

    // Titre de créneau
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(20, 50, 40);
    doc.text(getSlotLabel(slot), 14, currentY);
    currentY += 3.5;

    let nbConge = 0;
    let nbPermission = 0;
    let nbAbsence = 0;
    let nbPresents = 0;

    const rows = agents.map((agent, index) => {
      const im = getAgentIM(agent);
      const nomPrenom = `${fullName(agent).toUpperCase()}${im ? ` (IM : ${im})` : ""}`;

      const targetRecord = attendances.find(
        (p) => p.agentId === agent.id && p.date === date && (p.periode === slot || p.period === slot),
      );

      const absAuth = absencesAutorisees.find(
        (ab) => !ab.cancelled && ab.agentId === agent.id && date >= ab.start && date <= ab.end,
      );

      let heureEntree = targetRecord?.arrivalAt || "—";
      let heureSortie = targetRecord?.departureAt || "—";

      if (absAuth) {
        if (absAuth.type === "LEAVE") {
          nbConge++;
          if (heureEntree === "—") heureEntree = "Congé";
        } else if (absAuth.type === "MISSION") {
          nbConge++;
          if (heureEntree === "—") heureEntree = "Mission";
        } else {
          nbPermission++;
          if (heureEntree === "—") heureEntree = "Perm.";
        }
      } else if (targetRecord && ["PRESENT", "LATE"].includes(targetRecord.status)) {
        nbPresents++;
      } else {
        nbAbsence++;
      }

      return [String(index + 1), nomPrenom, heureEntree, heureSortie];
    });

    const tableData = rows.length > 0 ? rows : [["—", "Aucun agent affecté à cette division", "—", "—"]];

    autoTable(doc, {
      startY: currentY,
      head: [["N°", "NOM ET PRENOM, IM", "HEURE D'ENTREE", "HEURE DE SORTIE"]],
      body: tableData,
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 8.5,
        textColor: [20, 20, 20],
        lineColor: [60, 60, 60],
        lineWidth: 0.25,
        cellPadding: 2.2,
        minCellHeight: 7.5,
        valign: "middle",
      },
      headStyles: {
        font: "helvetica",
        fontStyle: "bold",
        fillColor: [242, 245, 243],
        textColor: [10, 10, 10],
        halign: "center",
        lineWidth: 0.35,
        lineColor: [40, 40, 40],
      },
      columnStyles: {
        0: { cellWidth: 12, halign: "center" },
        1: { cellWidth: 104, halign: "left" },
        2: { cellWidth: 32, halign: "center" },
        3: { cellWidth: 32, halign: "center" },
      },
      margin: { left: 14, right: 14, bottom: 25 },
    });

    const finalTableY = (doc as any).lastAutoTable?.finalY || currentY + 30;
    let effectifY = finalTableY + 5;

    // Vérifier si le cadre récapitulatif (34mm) tient sur la page
    if (effectifY + 34 > 280) {
      doc.addPage();
      effectifY = 20;
    }

    // Cadre récapitulatif "EFFECTIF"
    doc.setDrawColor(50, 50, 50);
    doc.setLineWidth(0.35);
    doc.rect(14, effectifY, 182, 34);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 15, 15);
    doc.text(`EFFECTIF : ${agents.length}`, 18, effectifY + 5.5);
    doc.text("....................................................................................................", 55, effectifY + 5.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);

    doc.text(`Nombre de congé : ${nbConge}`, 22, effectifY + 11.5);
    doc.text("....................................................................................................", 62, effectifY + 11.5);

    doc.text(`Nombre de Permissionnaire : ${nbPermission}`, 22, effectifY + 17);
    doc.text("....................................................................................................", 68, effectifY + 17);

    doc.text(`Nombre d'absence : ${nbAbsence}`, 22, effectifY + 22.5);
    doc.text("....................................................................................................", 62, effectifY + 22.5);

    doc.setFont("helvetica", "bold");
    doc.text(`Nombre de Présents : ${nbPresents}`, 22, effectifY + 28);
    doc.setFont("helvetica", "normal");
    doc.text("....................................................................................................", 62, effectifY + 28);

    currentY = effectifY + 34 + 10;

    // Si c'est le tout dernier créneau, apposer la signature à la fin
    if (slotIndex === targetSlots.length - 1) {
      let sigY = effectifY + 34 + 8;
      if (sigY + 25 > 282) {
        doc.addPage();
        sigY = 22;
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(30, 30, 30);
      doc.text(`Fait à ${lieu}, le ${dateEdition}`, 130, sigY);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.text("Le Responsable", 130, sigY + 5.5);
      doc.setFont("helvetica", "normal");
      doc.text("........................................................", 130, sigY + 16);
    }
  });

  // Numérotation des pages
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `Fiche de présence officielle — ${divisionNom} · ${jj_mm_aaaa} — Page ${p}/${totalPages}`,
      105,
      292,
      { align: "center" },
    );
  }

  doc.save(`fiche-presence-${divisionNom.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${date}.pdf`);
}

/**
 * 2. FORMAT PAYSAGE : Fiche consolidée de toutes les divisions
 */
export async function exporterFicheConsolideePaysage(options: FichePresenceOptions) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const {
    date,
    divisionNom,
    nomOrganisation = "Direction Générale du Budget",
    lieu = "Toliara",
    agents,
    attendances,
    absencesAutorisees = [],
    divisions = [],
    logoUrl,
  } = options;

  const loadedLogo = await loadLogoForPdf(logoUrl);
  if (loadedLogo) {
    const maxW = 30;
    const maxH = 18;
    let logoW = maxW;
    let logoH = (loadedLogo.height / loadedLogo.width) * logoW;
    if (logoH > maxH) {
      logoH = maxH;
      logoW = (loadedLogo.width / loadedLogo.height) * logoH;
    }
    const logoX = 148.5 - logoW / 2;
    const logoY = 8;
    try {
      doc.addImage(loadedLogo.dataUrl, "PNG", logoX, logoY, logoW, logoH);
    } catch (e) {
      console.warn("Impossible d'ajouter le logo au PDF:", e);
    }
  }

  const { jj_mm_aaaa, moisNom, annee } = formatDateFr(date);

  // --- EN-TÊTE INSTITUTIONNEL PAGE 1 ---
  doc.setFont("times", "bold");
  doc.setFontSize(9);
  doc.setTextColor(20, 20, 20);
  doc.text("REPOBLIKAN'I MADAGASIKARA", 14, 13);

  doc.setFont("times", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(60, 60, 60);
  doc.text("Fitiavana - Tanindrazana - Fandrosoana", 14, 16.5);

  doc.setLineWidth(0.25);
  doc.setDrawColor(80, 80, 80);
  doc.line(14, 18, 55, 18);

  doc.setFont("times", "bold");
  doc.setFontSize(8);
  doc.setTextColor(30, 30, 30);
  doc.text("MINISTÈRE DE L'ÉCONOMIE ET DES FINANCES", 14, 23);

  doc.setFont("times", "normal");
  doc.setFontSize(7.5);
  doc.text("SECRÉTARIAT GÉNÉRAL", 14, 26.5);
  doc.text("DIRECTION GÉNÉRALE DU BUDGET", 14, 30);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(10, 10, 10);
  doc.text("FICHE DE PRESENCE QUOTIDIENNE", 170, 15);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(40, 40, 40);

  doc.text(`Division : ${divisionNom || "Toutes les divisions"}`, 170, 21);
  doc.text(`Date : ${jj_mm_aaaa}`, 170, 25.5);
  doc.text(`Mois : ${moisNom}     Année : ${annee}`, 170, 30);

  doc.setLineWidth(0.3);
  doc.line(170, 32.5, 283, 32.5);

  // Déterminer les créneaux
  const targetSlots: SchedulePeriod[] = ["MATIN", "APRES_MIDI"];
  if (attendances.some((p) => p.date === date && (p.periode === "SOIR" || p.period === "SOIR"))) {
    targetSlots.push("SOIR");
  }

  const dateEdition = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  let currentY = 38;

  targetSlots.forEach((slot, slotIndex) => {
    // Si créneau suivant, vérifier s'il faut passer sur une nouvelle page
    if (slotIndex > 0) {
      if (currentY + 50 > 195) {
        doc.addPage();
        currentY = 20;
      }
    }

    // Titre de créneau
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(20, 50, 40);
    doc.text(getSlotLabel(slot), 14, currentY);
    currentY += 3.5;

    let nbConge = 0;
    let nbPermission = 0;
    let nbAbsence = 0;
    let nbPresents = 0;

    const rows = agents.map((agent, index) => {
      const im = getAgentIM(agent);
      const nomPrenoms = fullName(agent);
      const dept = divisions.find((d) => d.id === agent.departmentId)?.name || agent.divisionName || "—";

      // Relevé du jour pour ce créneau spécifique
      const record = attendances.find(
        (p) => p.agentId === agent.id && p.date === date && (p.periode === slot || p.period === slot),
      );

      // Absence autorisée
      const absAuth = absencesAutorisees.find(
        (ab) => !ab.cancelled && ab.agentId === agent.id && date >= ab.start && date <= ab.end,
      );

      const heureArrivee = record?.arrivalAt || "—";
      const heureSortie = record?.departureAt || "—";

      let observations = "";
      if (absAuth) {
        if (absAuth.type === "LEAVE") {
          nbConge++;
          observations = "Congé autorisé";
        } else if (absAuth.type === "MISSION") {
          nbConge++;
          observations = "En mission";
        } else {
          nbPermission++;
          observations = absAuth.from && absAuth.to
            ? `Permission (${absAuth.from} - ${absAuth.to})`
            : "Permission autorisée";
        }
      } else if (record && ["PRESENT", "LATE"].includes(record.status)) {
        nbPresents++;
        if (record.status === "LATE") {
          const ret = record.lateMinutes || 0;
          observations = ret > 0 ? `Retard (${ret} min)` : "En retard";
        } else {
          observations = "Présent";
        }
      } else if (record && record.status === "JUSTIFIED") {
        nbPermission++;
        observations = record.note ? `Absence justifiée (${record.note})` : "Absence justifiée";
      } else {
        nbAbsence++;
        if (record && record.status === "ABSENT") {
          observations = "Absence non justifiée";
        } else {
          observations = "Non pointé";
        }
      }

      return [
        String(index + 1),
        im,
        `${nomPrenoms} (${dept})`,
        heureArrivee,
        heureSortie,
        observations,
      ];
    });

    const tableData = rows.length > 0 ? rows : [["—", "—", "Aucun agent enregistré", "—", "—", "—"]];

    autoTable(doc, {
      startY: currentY,
      head: [["N°", "IM", "Nom et prénoms", "Heure d'arrivée", "Heure de sortie", "Observations"]],
      body: tableData,
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 8,
        textColor: [20, 20, 20],
        lineColor: [70, 70, 70],
        lineWidth: 0.25,
        cellPadding: 2,
        minCellHeight: 6.5,
        valign: "middle",
      },
      headStyles: {
        font: "helvetica",
        fontStyle: "bold",
        fillColor: [240, 243, 241],
        textColor: [10, 10, 10],
        halign: "center",
        lineWidth: 0.35,
        lineColor: [40, 40, 40],
      },
      columnStyles: {
        0: { cellWidth: 12, halign: "center" },
        1: { cellWidth: 26, halign: "center" },
        2: { cellWidth: 94, halign: "left" },
        3: { cellWidth: 32, halign: "center" },
        4: { cellWidth: 32, halign: "center" },
        5: { cellWidth: 73, halign: "left" },
      },
      margin: { left: 14, right: 14, bottom: 20 },
    });

    const finalTableY = (doc as any).lastAutoTable?.finalY || currentY + 30;
    let boxY = finalTableY + 5;

    // Vérifier si le cadre (34mm) tient sur la page
    if (boxY + 34 > 195) {
      doc.addPage();
      boxY = 20;
    }

    // Cadre récapitulatif "EFFECTIF" (à gauche)
    doc.setDrawColor(50, 50, 50);
    doc.setLineWidth(0.35);
    doc.rect(14, boxY, 135, 34);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 15, 15);
    doc.text(`EFFECTIF : ${agents.length}`, 18, boxY + 5.5);
    doc.text("................................................................................", 52, boxY + 5.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Nombre de congé : ${nbConge}`, 22, boxY + 12);
    doc.text("................................................................................", 60, boxY + 12);

    doc.text(`Nombre de Permissionnaire : ${nbPermission}`, 22, boxY + 17.5);
    doc.text("................................................................................", 70, boxY + 17.5);

    doc.text(`Nombre d'absence : ${nbAbsence}`, 22, boxY + 23);
    doc.text("................................................................................", 60, boxY + 23);

    doc.setFont("helvetica", "bold");
    doc.text(`Nombre de Présents : ${nbPresents}`, 22, boxY + 28.5);
    doc.setFont("helvetica", "normal");
    doc.text("................................................................................", 60, boxY + 28.5);

    // Si c'est le dernier créneau, apposer la signature à droite du cadre ("c'est a la fin qu'on fait fait a toliara le (date)")
    if (slotIndex === targetSlots.length - 1) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(30, 30, 30);
      doc.text(`Fait à ${lieu}, le ${dateEdition}`, 190, boxY + 10);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.text("Le Responsable", 190, boxY + 16);
      doc.setFont("helvetica", "normal");
      doc.text("................................................................", 190, boxY + 28);
    }

    currentY = boxY + 34 + 10;
  });

  // Numérotation des pages
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `Fiche de présence — ${nomOrganisation} · Page ${p}/${totalPages}`,
      148.5,
      202,
      { align: "center" },
    );
  }

  doc.save(`fiche-presence-${date}.pdf`);
}
