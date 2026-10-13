import { flushSync } from "react-dom";
import {
  BadgeFormatMenu,
  type BadgePrintFormat,
} from "../components/BadgePrintFormat";
import { badgesApi, type BadgeData } from "../services/badges";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { useApp } from "../app/context";
import { Back, Empty, Heading } from "../components/ui";
import { fullName } from "../utils";

export default function AgentBadges() {
  const { db, notify } = useApp();
  const [printFormat, setPrintFormat] = useState<BadgePrintFormat>("cr80");
  const [badges, setBadges] = useState<BadgeData[] | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState("");
  const prepare = async () => {
    if (preparing) return;
    setPreparing(true);
    setPrepareError("");
    try {
      setBadges((await badgesApi.prepare()).badges);
    } catch (error) {
      setPrepareError((error as Error).message);
    } finally {
      setPreparing(false);
    }
  };
  const [printing, setPrinting] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);
  const agents = db.agents
    .filter(
      (a) =>
        a.isActive &&
        !a.deletedAt &&
        (!badges || badges.some((b) => b.personnel_id === a.id && b.token)),
    )
    .sort((a, b) => fullName(a).localeCompare(fullName(b)));
  const {
    data: images,
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["badge-sheet", badges],
    enabled: Boolean(badges) && agents.length > 0,
    queryFn: async () => {
      const { default: QRCode } = await import("qrcode");
      return Promise.all(
        agents.map((agent) =>
          QRCode.toDataURL(
            badges!.find((b) => b.personnel_id === agent.id)!.token!,
            {
              width: 320,
              margin: 2,
              errorCorrectionLevel: "M",
            },
          ),
        ),
      );
    },
  });
  const ready =
    Boolean(badges) &&
    agents.length > 0 &&
    Boolean(images) &&
    !isError &&
    !preparing;
  const print = async () => {
    if (!ready || printing) return;
    setPrinting(true);
    try {
      await Promise.all(
        Array.from(sheet.current?.querySelectorAll("img") || []).map((img) =>
          img.decode(),
        ),
      );
      await document.fonts.ready;
      window.print();
    } catch {
      notify(
        "Les badges n’ont pas pu être préparés pour l’impression. Réessayez.",
        true,
      );
    } finally {
      setPrinting(false);
    }
  };
  return (
    <>
      <Back to="/agents" label="Personnel" />
      <Heading
        title="Imprimer tous les badges"
        subtitle="Une planche de badges à imprimer ou à enregistrer en PDF depuis la fenêtre d’impression."
      >
        <button
          className="button"
          disabled={preparing}
          onClick={() => void prepare()}
        >
          {preparing ? "Préparation…" : "Préparer les badges"}
        </button>
        <BadgeFormatMenu
          label={
            printing ? "Préparation…" : `Imprimer les ${agents.length} badges`
          }
          icon={<Printer size={18} />}
          primary
          disabled={!ready || printing}
          onSelect={(format) => {
            flushSync(() => setPrintFormat(format));
            void print();
          }}
        />
      </Heading>
      <p>
        Les badges existants sont conservés. La préparation crée uniquement les
        badges manquants des agents actifs.
      </p>
      {prepareError && (
        <p className="form-error" role="alert">
          {prepareError}
        </p>
      )}
      {!agents.length ? (
        <Empty text="Aucun badge à imprimer" />
      ) : !badges ? (
        <Empty text="Préparez la planche pour afficher les badges." />
      ) : isError ? (
        <div role="alert">
          <p>La génération des badges a échoué.</p>
          <button className="button" onClick={() => void refetch()}>
            Réessayer
          </button>
        </div>
      ) : isPending ? (
        <p role="status">Génération des badges…</p>
      ) : (
        <div
          ref={sheet}
          className="badge-print-grid"
          data-badge-format={printFormat}
          aria-label="Planche de badges"
        >
          {agents.map((agent, index) => (
            <section className="qr-badge" key={agent.id}>
              <div className="qr-badge-header">
                présence.<small>{db.settings.organization}</small>
              </div>
              <div className="badge-content">
                <div className="badge-qr-wrapper">
                  <img
                    src={images![index]}
                    width={240}
                    height={240}
                    alt={`QR de pointage de ${fullName(agent)}`}
                  />
                </div>
                <h2>{fullName(agent)}</h2>
                <p>{agent.position}</p>
                <span>
                  {
                    db.departments.find((d) => d.id === agent.departmentId)
                      ?.name
                  }
                </span>
                {!agent.isActive && (
                  <strong className="badge-inactive">
                    Agent inactif · Pointage désactivé
                  </strong>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
