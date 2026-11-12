import type { Agent } from "../types";
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
  serviceNom?: string;
  lieu?: string; // Ville (ex: Toliara)
  agents: Agent[];
  attendances: PresenceRecord[];
  absencesAutorisees?: AuthorizedAbsence[];
  divisions?: { id: string; name: string }[];
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

/**
 * 1. FORMAT PORTRAIT : Fiche par Division (Individuelle / Service)
 * Modèle institutionnel officiel (Ministère de l'Économie et des Finances)
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
    periode = "MATIN",
    divisionNom = "Division",
    serviceNom = "Direction du Budget",
    agents,
    attendances,
    absencesAutorisees = [],
  } = options;

  const { jj_mm_aaaa } = formatDateFr(date);

  // --- EN-TÊTE INSTITUTIONNEL ---
  // République de Madagascar & Devise officielle (Centré)
  doc.setFont("times", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(20, 20, 20);
  doc.text("REPOBLIKAN'I MADAGASIKARA", 105, 14, { align: "center" });

  doc.setFont("times", "italic");
  doc.setFontSize(8.5);
  doc.setTextColor(50, 50, 50);
  doc.text("Fitiavana - Tanindrazana - Fandrosoana", 105, 18, { align: "center" });

  doc.setLineWidth(0.3);
  doc.setDrawColor(80, 80, 80);
  doc.line(90, 19.5, 120, 19.5);

  // Hiérarchie ministérielle (Haut Gauche)
  doc.setFont("times", "bold");
  doc.setFontSize(8);
  doc.setTextColor(30, 30, 30);
  doc.text("MINISTÈRE DE L'ÉCONOMIE ET DES FINANCES", 14, 25);

  doc.setFont("times", "normal");
  doc.setFontSize(7.5);
  doc.text("SECRÉTARIAT GÉNÉRAL", 14, 29);
  doc.text("DIRECTION GÉNÉRALE DU BUDGET", 14, 33);
  doc.text(serviceNom.toUpperCase(), 14, 37);

  doc.setFont("times", "bold");
  doc.setFontSize(8.5);
  doc.text(`DIVISION : ${divisionNom.toUpperCase()}`, 14, 42);

  doc.setLineWidth(0.2);
  doc.line(14, 44, 75, 44);

  // --- TITRE DU DOCUMENT ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(10, 10, 10);
  doc.text("FICHE DE PRESENCE", 105, 50, { align: "center" });

  // Date et cases à cocher des créneaux
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Date : ${jj_mm_aaaa}`, 14, 57);

  const matinCoche = periode === "MATIN" || periode === "JOURNEE" || !periode ? "[X]" : "[  ]";
  const apresMidiCoche = periode === "APRES_MIDI" || periode === "JOURNEE" ? "[X]" : "[  ]";
  doc.setFont("helvetica", "bold");
  doc.text(`${matinCoche}  MATIN        ${apresMidiCoche}  APRÈS-MIDI`, 120, 57);

  // --- PRÉPARATION DES DONNÉES DU PERSONNEL ---
  let nbConge = 0;
  let nbPermission = 0;
  let nbAbsence = 0;
  let nbPresents = 0;

  const rows = agents.map((agent, index) => {
    const im = getAgentIM(agent);
    const nomPrenom = `${fullName(agent).toUpperCase()}${im ? ` (IM : ${im})` : ""}`;

    // Recherche pointage du jour (selon créneau si précisé)
    const records = attendances.filter((p) => p.agentId === agent.id && p.date === date);
    const targetRecord =
      periode && periode !== "JOURNEE"
        ? records.find((p) => (p.periode || p.period) === periode) || records[0]
        : records[0];

    // Recherche congé ou permission active
    const absAuth = absencesAutorisees.find(
      (ab) => !ab.cancelled && ab.agentId === agent.id && date >= ab.start && date <= ab.end,
    );

    let heureEntree = targetRecord?.arrivalAt || "—";
    let heureSortie = targetRecord?.departureAt || "—";

    if (absAuth) {
      if (absAuth.type === "LEAVE") {
        nbConge++;
        if (heureEntree === "—") heureEntree = "Congé";
      } else {
        nbPermission++;
        if (heureEntree === "—") heureEntree = "Perm.";
      }
    } else if (targetRecord && ["PRESENT", "LATE"].includes(targetRecord.status)) {
      nbPresents++;
    } else {
      nbAbsence++;
    }

    return [
      String(index + 1),
      nomPrenom,
      heureEntree,
      heureSortie,
    ];
  });

  // Si aucun agent n'est rattaché à la division
  const tableData = rows.length > 0 ? rows : [["—", "Aucun agent affecté à cette division", "—", "—"]];

  // --- TABLEAU DU PERSONNEL (PAS DE COLONNE SIGNATURE) ---
  autoTable(doc, {
    startY: 62,
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
    margin: { left: 14, right: 14, bottom: 42 },
  });

  // --- BLOC RÉCAPITULATIF "EFFECTIF" (BAS DE PAGE) ---
  const finalY = (doc as any).lastAutoTable?.finalY || 180;
  let effectifY = Math.max(finalY + 8, 235);

  // Si le tableau déborde sur une nouvelle page
  if (effectifY > 250) {
    doc.addPage();
    effectifY = 25;
  }

  // Cadre récapitulatif "EFFECTIF"
  doc.setDrawColor(50, 50, 50);
  doc.setLineWidth(0.35);
  doc.rect(14, effectifY, 182, 38);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(15, 15, 15);
  doc.text(`EFFECTIF : ${agents.length}`, 18, effectifY + 6);
  doc.text("....................................................................................................", 55, effectifY + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);

  doc.text(`Nombre de congé : ${nbConge}`, 22, effectifY + 13);
  doc.text("....................................................................................................", 62, effectifY + 13);

  doc.text(`Nombre de Permissionnaire : ${nbPermission}`, 22, effectifY + 19);
  doc.text("....................................................................................................", 68, effectifY + 19);

  doc.text(`Nombre d'absence : ${nbAbsence}`, 22, effectifY + 25);
  doc.text("....................................................................................................", 62, effectifY + 25);

  doc.setFont("helvetica", "bold");
  doc.text(`Nombre de Présents : ${nbPresents}`, 22, effectifY + 31);
  doc.setFont("helvetica", "normal");
  doc.text("....................................................................................................", 62, effectifY + 31);

  // Pied de page discret
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

  const safeNom = divisionNom.replace(/[^a-zA-Z0-9_-]/g, "_");
  doc.save(`fiche-presence-${safeNom}-${date}.pdf`);
}

/**
 * 2. FORMAT PAYSAGE : Fiche Consolidée (Toutes Divisions / SuperAdmin)
 * Vue d'ensemble de l'organisation
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
    serviceNom = "Direction du Budget",
    nomOrganisation = "Direction Générale du Budget",
    lieu = "Toliara",
    agents,
    attendances,
    absencesAutorisees = [],
    divisions = [],
  } = options;

  const { jj_mm_aaaa, moisNom, annee } = formatDateFr(date);

  // --- EN-TÊTE INSTITUTIONNEL ---
  // Hiérarchie ministérielle à gauche
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
  doc.text(serviceNom.toUpperCase(), 14, 33.5);

  // Titre principal et métadonnées à droite
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(10, 10, 10);
  doc.text("FICHE DE PRESENCE QUOTIDIENNE", 170, 15);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(40, 40, 40);

  doc.text(`Direction / Service : ${nomOrganisation}`, 170, 21);
  doc.text(`Division : ${divisionNom || "Toutes les divisions (Vue consolidée)"}`, 170, 25.5);
  doc.text(`Date : ${jj_mm_aaaa}`, 170, 30);
  doc.text(`Mois : ${moisNom}     Année : ${annee}`, 170, 34.5);

  doc.setLineWidth(0.3);
  doc.line(170, 36.5, 283, 36.5);

  // --- DONNÉES DU TABLEAU CONSOLIDÉ ÉTENDU ---
  let nbConge = 0;
  let nbPermission = 0;
  let nbAbsence = 0;
  let nbPresents = 0;

  const rows = agents.map((agent, index) => {
    const im = getAgentIM(agent);
    const nomPrenoms = fullName(agent);
    const dept = divisions.find((d) => d.id === agent.departmentId)?.name || agent.divisionName || "—";

    // Relevé du jour
    const record = attendances.find((p) => p.agentId === agent.id && p.date === date);

    // Absence autorisée
    const absAuth = absencesAutorisees.find(
      (ab) => !ab.cancelled && ab.agentId === agent.id && date >= ab.start && date <= ab.end,
    );

    const heureArrivee = record?.arrivalAt || "—";
    const heureSortie = record?.departureAt || "—";

    // Formulation des observations officielles et décompte d'effectif
    let observations = "";
    if (absAuth) {
      if (absAuth.type === "LEAVE") {
        nbConge++;
        observations = "Congé autorisé";
      } else {
        nbPermission++;
        observations = absAuth.from && absAuth.to
          ? `Permission (${absAuth.from} - ${absAuth.to})`
          : "Permission autorisée";
      }
    } else if (record && ["PRESENT", "LATE"].includes(record.status)) {
      nbPresents++;
      if (record.status === "LATE") {
        observations = `Retard (${record.lateMinutes} min)`;
      } else {
        observations = "Présent";
      }
    } else {
      nbAbsence++;
      if (record?.status === "JUSTIFIED") {
        observations = "Absence justifiée";
      } else if (record?.status === "ABSENT") {
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

  // --- TABLEAU CONSOLIDÉ ÉTENDU (PAS DE COLONNE DE SIGNATURE) ---
  autoTable(doc, {
    startY: 42,
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
    margin: { left: 14, right: 14, bottom: 26 },
  });

  // --- PIED DE PAGE : MENTION DU LIEU ET DE LA DATE D'ÉDITION ---
  const dateEdition = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);

    if (p === totalPages) {
      const finalY = (doc as any).lastAutoTable?.finalY || 140;
      let bottomY = finalY + 6;

      // Si le tableau prend presque toute la page (> 162mm en paysage A4 de 210mm), passer sur une nouvelle page
      if (bottomY > 162) {
        doc.addPage();
        bottomY = 20;
      }

      // Cadre récapitulatif "EFFECTIF" (à gauche)
      doc.setDrawColor(50, 50, 50);
      doc.setLineWidth(0.35);
      doc.rect(14, bottomY, 135, 34);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(15, 15, 15);
      doc.text(`EFFECTIF : ${agents.length}`, 18, bottomY + 5.5);
      doc.text("................................................................................", 52, bottomY + 5.5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(`Nombre de congé : ${nbConge}`, 22, bottomY + 12);
      doc.text("................................................................................", 60, bottomY + 12);

      doc.text(`Nombre de Permissionnaire : ${nbPermission}`, 22, bottomY + 17.5);
      doc.text("................................................................................", 70, bottomY + 17.5);

      doc.text(`Nombre d'absence : ${nbAbsence}`, 22, bottomY + 23);
      doc.text("................................................................................", 60, bottomY + 23);

      doc.setFont("helvetica", "bold");
      doc.text(`Nombre de Présents : ${nbPresents}`, 22, bottomY + 28.5);
      doc.setFont("helvetica", "normal");
      doc.text("................................................................................", 60, bottomY + 28.5);

      // Signature & Date (à droite)
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(30, 30, 30);
      doc.text(`Fait à ${lieu}, le ${dateEdition}`, 190, bottomY + 10);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.text("Le Coordonnateur / Le Responsable", 190, bottomY + 16);
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `Fiche de présence quotidienne consolidée — ${nomOrganisation} · Page ${p}/${totalPages}`,
      148.5,
      202,
      { align: "center" },
    );
  }

  doc.save(`fiche-presence-consolidee-${date}.pdf`);
}

