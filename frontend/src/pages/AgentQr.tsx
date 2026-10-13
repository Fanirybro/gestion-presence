import {
  BadgeFormatMenu,
  type BadgePrintFormat,
} from "../components/BadgePrintFormat";
import { flushSync } from "react-dom";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { AnimatePresence } from "motion/react";
import { Download, Printer, QrCode, RefreshCw } from "lucide-react";
import { Back, Confirm, Empty, Heading } from "../components/ui";
import { useApp } from "../app/context";
import { badgesApi } from "../services/badges";
import { fullName } from "../utils";

export default function AgentQr() {
  const { id = "" } = useParams();
  const { db, user, notify } = useApp();
  const [printFormat, setPrintFormat] = useState<BadgePrintFormat>("cr80");
  const card = useRef<HTMLElement>(null);
  const [exporting, setExporting] = useState(false);
  const agent = db.agents.find((a) => a.id === id);
  const client = useQueryClient();
  const key = ["badge", user?.organisationId, user?.id, id];
  const badge = useQuery({
    queryKey: key,
    queryFn: () => badgesApi.get(id),
    enabled: Boolean(agent),
  });
  const token = badge.data?.badge?.token;
  const image = useQuery({
    queryKey: ["badge-image", token],
    enabled: Boolean(token),
    queryFn: async () => {
      const { default: QRCode } = await import("qrcode");
      return QRCode.toDataURL(token!, {
        width: 480,
        margin: 2,
        errorCorrectionLevel: "M",
      });
    },
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<"regenerate" | "revoke" | null>(null);
  async function change(action: "create" | "regenerate" | "revoke") {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await client.cancelQueries({ queryKey: key });
      const result =
        action === "revoke"
          ? await badgesApi.revoke(id)
          : await badgesApi.create(id, action === "regenerate");
      client.setQueryData(key, result);
      notify(
        action === "revoke"
          ? "Badge révoqué."
          : action === "regenerate"
            ? "Nouveau badge créé. L’ancien code est invalidé."
            : "Badge enregistré.",
      );
    } catch (err) {
      setError((err as Error).message);
      notify((err as Error).message, true);
    } finally {
      setPending(false);
    }
  }
  async function download(format: BadgePrintFormat) {
    if (!card.current || exporting) return;
    setExporting(true);
    try {
      await document.fonts.ready;
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(card.current, {
        scale: 4,
        backgroundColor: "#ffffff",
      });
      const pdf = new jsPDF({
        orientation: format === "cr80" ? "landscape" : "portrait",
        unit: "mm",
        format: format === "cr80" ? [86, 54] : "a6",
      });
      pdf.addImage(
        canvas.toDataURL("image/png"),
        "PNG",
        format === "cr80" ? 0 : 9.5,
        format === "cr80" ? 0 : 47,
        86,
        54,
      );
      pdf.save(`badge-${id}-${format}.pdf`);
      notify("Badge téléchargé.");
    } catch {
      notify("Impossible de télécharger le badge. Réessayez.", true);
    } finally {
      setExporting(false);
    }
  }
  if (!agent) return <Empty text="Agent introuvable" />;
  return (
    <>
      <Back to={`/agents/${id}`} />
      <Heading title="Badge de pointage" subtitle={fullName(agent)} />
      <div className="qr-layout" data-badge-format={printFormat}>
        <section ref={card} className="qr-badge print-area">
          <div className="qr-badge-header">
            présence.<small>{db.settings.organization}</small>
          </div>
          <div className="badge-content">
            <div
              className="qr-image-slot badge-qr-wrapper"
              aria-busy={badge.isPending || Boolean(token && image.isPending)}
            >
              {agent.isActive && !pending && image.data && (
                <img
                  src={image.data}
                  width={240}
                  height={240}
                  alt={`QR de pointage de ${fullName(agent)}`}
                />
              )}
              {(badge.isPending || (token && image.isPending)) && (
                <p role="status">Chargement du badge…</p>
              )}
              {!agent.isActive && <p>Agent inactif : pointage désactivé.</p>}
              {agent.isActive &&
                !badge.isPending &&
                !badge.isError &&
                !token && (
                  <p>
                    {badge.data?.badge
                      ? "Ce badge doit être régénéré."
                      : "Aucun badge actif. Vous pouvez émettre un badge de remplacement."}
                  </p>
                )}
            </div>
            <h2>{fullName(agent)}</h2>
            <p>{agent.position}</p>
            <span>
              {db.departments.find((d) => d.id === agent.departmentId)?.name}
            </span>
          </div>
        </section>
        <div className="qr-controls">
          <h2>QR personnel</h2>
          <p>
            Retrouvez ce badge après rechargement. Régénérez-le uniquement pour
            remplacer un code perdu ou compromis.
          </p>
          {(error || badge.isError || image.isError) && (
            <p role="alert" className="form-error">
              {error ||
                badge.error?.message ||
                "Impossible de générer l’image du QR."}
            </p>
          )}
          {(badge.isError || image.isError) && (
            <button
              className="button"
              onClick={() => {
                void badge.refetch();
                if (token) void image.refetch();
              }}
            >
              Réessayer
            </button>
          )}
          {!badge.data?.badge && (
            <button
              className="button primary"
              disabled={
                !agent.isActive || pending || badge.isPending || badge.isError
              }
              onClick={() => void change("create")}
            >
              <QrCode size={17} />
              {pending ? "Enregistrement…" : "Générer le badge"}
            </button>
          )}
          <BadgeFormatMenu
            label={exporting ? "Téléchargement…" : "Télécharger le QR"}
            icon={<Download size={17} />}
            primary
            disabled={
              !image.data || !token || !agent.isActive || pending || exporting
            }
            onSelect={(format) => void download(format)}
          />
          <BadgeFormatMenu
            label="Imprimer le badge"
            icon={<Printer size={17} />}
            disabled={
              !image.data || !token || !agent.isActive || pending || exporting
            }
            onSelect={(format) => {
              flushSync(() => setPrintFormat(format));
              window.print();
            }}
          />
          <small className="badge-download-note">
            Le téléchargement contient le badge et son QR, au format PDF.
          </small>
          {badge.data?.badge && (
            <>
              <button
                className="button"
                disabled={!agent.isActive || pending}
                onClick={() => setConfirm("regenerate")}
              >
                <RefreshCw size={17} />
                Régénérer le QR
              </button>
              <button
                className="button"
                disabled={pending}
                onClick={() => setConfirm("revoke")}
              >
                Révoquer le badge
              </button>
            </>
          )}
        </div>
      </div>
      <AnimatePresence>
        {confirm && (
          <Confirm
            title={
              confirm === "regenerate"
                ? "Régénérer le QR ?"
                : "Révoquer le badge ?"
            }
            text="L’ancien badge ne pourra plus être utilisé pour pointer."
            close={() => setConfirm(null)}
            confirm={() => void change(confirm)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
