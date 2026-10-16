import { useQuery } from "@tanstack/react-query";
import { badgesApi } from "../services/badges";
import { ApiError } from "../services/api";
import { useEffect, useRef, useState } from "react";
import type { Html5Qrcode } from "html5-qrcode";
import { motion, useReducedMotion } from "motion/react";
import { Skeleton } from "../components/Skeleton";
import {
  Camera,
  CameraOff,
  CheckCircle2,
  XCircle,
  LoaderCircle,
  ScanLine,
  CircleHelp,
  QrCode,
  Video,
} from "lucide-react";
import { useSecretaryMode } from "../app/secretaryMode";
import { useApp } from "../app/context";
import { Heading, Person, Empty } from "../components/ui";
import { dateLabel, nowTime, today } from "../utils";
export default function ScanPage() {
  const { db, user, update } = useApp();
  const events = useQuery({
    queryKey: ["badge-events", user?.organisationId, user?.id],
    queryFn: badgesApi.events,
  });
  const updateRef = useRef(update);
  useEffect(() => {
    updateRef.current = update;
  }, [update]);
  useEffect(() => {
    if (events.data)
      updateRef.current((data) => {
        const remote = events.data.attendance;
        data.attendance = [
          ...remote,
          ...data.attendance.filter(
            (local) =>
              !remote.some(
                (row) =>
                  row.id === local.id ||
                  (row.agentId === local.agentId && row.date === local.date),
              ),
          ),
        ];
        data.scans = events.data.scans;
      });
  }, [events.data]);
  const scans = events.data?.scans ?? [];
  const retry = useRef<{ token: string; key: string } | null>(null);
  const { simple } = useSecretaryMode();
  const [help, setHelp] = useState(false);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<{
    state: "processing" | "success" | "error";
    message: string;
  } | null>(null);
  const scanner = useRef<Html5Qrcode | null>(null);
  const lock = useRef(false);
  const cooldown = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const alive = useRef(true);
  const submitRef = useRef<(value: string) => void>(() => {});
  const submit = async (value: string) => {
    if (lock.current || !value.trim()) return;
    lock.current = true;
    setError("");
    setFeedback({
      state: "processing",
      message: "Vérification du badge et enregistrement du pointage…",
    });
    const code = value.trim();
    if (retry.current?.token !== code)
      retry.current = { token: code, key: crypto.randomUUID() };
    try {
      const response = await badgesApi.scan(code, retry.current.key);
      retry.current = null;
      if (alive.current) {
        setFeedback({ state: "success", message: response.message });
      }
      void events.refetch().then((refreshed) => {
        if (refreshed.isError && alive.current)
          setError(
            "Pointage enregistré, mais l’historique n’a pas pu être actualisé. Rechargez la page.",
          );
      });
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) retry.current = null;
      if (alive.current)
        setFeedback({ state: "error", message: (e as Error).message });
    } finally {
      if (alive.current)
        cooldown.current = setTimeout(() => {
          lock.current = false;
          setFeedback(null);
        }, 5000);
    }
  };
  useEffect(() => {
    submitRef.current = submit;
  });
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimeout(cooldown.current);
      const instance = scanner.current;
      if (instance?.isScanning)
        void instance
          .stop()
          .then(() => instance.clear())
          .catch(() => {});
    };
  }, []);
  const start = async () => {
    setError("");
    setStarting(true);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (!alive.current) return;
      const instance = new Html5Qrcode("qr-reader");
      scanner.current = instance;
      await instance.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 230, height: 230 } },
        (value) => submitRef.current(value),
        () => {},
      );
      if (!alive.current) {
        await instance.stop();
        instance.clear();
        return;
      }
      setRunning(true);
    } catch {
      if (alive.current)
        setError(
          "Caméra indisponible. Autorisez son accès dans le navigateur pour scanner.",
        );
    } finally {
      if (alive.current) setStarting(false);
    }
  };
  const stop = async () => {
    try {
      if (scanner.current?.isScanning) await scanner.current.stop();
      scanner.current?.clear();
      setRunning(false);
    } catch {
      setError("Impossible d’arrêter la caméra. Rechargez cette page.");
    }
  };
  return (
    <div className={simple ? "simple-scan" : undefined}>
      {simple ? (
        <SimpleScanHeading />
      ) : (
        <Heading
          title="Pointage QR"
          subtitle="Arrivées et départs · Heure de Madagascar"
        >
          <span className="date-chip">
            <span className="online-dot" />
            {today()}
          </span>
        </Heading>
      )}
      <div className="scan-layout">
        <section className="scanner-section">
          {!simple && (
            <div className="section-heading">
              <h2>
                <ScanLine size={20} />
                Scanner un badge
              </h2>
              <span className={`badge ${running ? "present" : ""}`}>
                {running ? "Caméra active" : "Caméra arrêtée"}
              </span>
            </div>
          )}
          <div className="camera-frame">
            <div id="qr-reader" />
            {!running && !starting && (
              <div className="camera-placeholder">
                <div className="scan-target">
                  {simple ? (
                    <div
                      className="simple-badge-illustration"
                      aria-hidden="true"
                    >
                      <i />
                      <QrCode strokeWidth={1.5} />
                      <i />
                    </div>
                  ) : (
                    <QrVisual />
                  )}
                </div>
                {!simple && <h3>Prêt pour le prochain pointage</h3>}
                <button className="button primary" onClick={start}>
                  <Camera size={18} />
                  Activer la caméra
                </button>
              </div>
            )}
            {starting && (
              <div
                className="camera-placeholder"
                role="status"
                aria-label="Ouverture de la caméra"
                aria-busy="true"
              >
                <Skeleton width={230} height={180} />
                <Skeleton width={170} height={14} />
              </div>
            )}
            {feedback && (
              <ScanFeedback state={feedback.state} message={feedback.message} />
            )}
          </div>
          {simple && (
            <p className="simple-camera-state" role="status">
              {running ? (
                <Video aria-hidden="true" />
              ) : (
                <CameraOff aria-hidden="true" />
              )}
              {starting
                ? "Ouverture de la caméra…"
                : running
                  ? "Caméra active · Prêt à scanner"
                  : "Caméra arrêtée · Activez-la pour scanner"}
            </p>
          )}
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <details
            className="scan-help"
            open={!simple || help}
            onToggle={(event) => {
              if (simple) setHelp(event.currentTarget.open);
            }}
          >
            <summary hidden={!simple}>
              <CircleHelp aria-hidden="true" />
              Besoin d’aide ?
            </summary>
            {simple && (
              <div className="scan-help-instructions">
                <h2>Comment scanner votre badge</h2>
                <p>
                  Activez la caméra et autorisez son accès dans le navigateur.
                  Placez le QR code face à l’objectif, puis attendez la
                  confirmation du pointage.
                </p>
                <p>
                  Si le badge n’est pas reconnu, rapprochez-le et vérifiez
                  l’éclairage.
                </p>
              </div>
            )}
            {running && (
              <button className="button scan-stop" onClick={stop}>
                <CameraOff size={17} />
                Arrêter la caméra
              </button>
            )}
          </details>
        </section>
        {!simple && (
          <section className="recent-scans">
            <div className="section-heading">
              <h2>Derniers scans</h2>
              <span className="count">
                {scans.filter((s) => s.at.slice(0, 10) === today()).length}
              </span>
            </div>
            {events.isError ? (
              <p role="alert">
                Historique indisponible.{" "}
                <button
                  className="text-link"
                  onClick={() => void events.refetch()}
                >
                  Réessayer
                </button>
              </p>
            ) : scans.length ? (
              scans.slice(0, 8).map((s) => (
                <div className="scan-row" key={s.id}>
                  <Person agent={db.agents.find((a) => a.id === s.agentId)} />
                  <div>
                    <span className={s.type === "ARRIVAL" ? "green-text" : ""}>
                      {s.type === "ARRIVAL" ? "Arrivée" : "Départ"}
                    </span>
                    <small>
                      {new Date(s.at).toLocaleTimeString("fr-FR", {
                        timeZone: "Indian/Antananarivo",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </small>
                  </div>
                </div>
              ))
            ) : (
              <Empty text="Aucun pointage" />
            )}
          </section>
        )}
      </div>
    </div>
  );
}
function SimpleScanHeading() {
  const [clock, setClock] = useState(() => ({ day: today(), time: nowTime() }));
  useEffect(() => {
    const timer = setInterval(
      () => setClock({ day: today(), time: nowTime() }),
      10000,
    );
    return () => clearInterval(timer);
  }, []);
  return (
    <header className="simple-scan-heading">
      <time>{clock.time}</time>
      <p className="simple-scan-date">{dateLabel(clock.day, true)}</p>
      <h1>Présentez votre badge</h1>
      <p>Placez le QR code devant la caméra</p>
    </header>
  );
}
function QrVisual() {
  return <ScanLine size={64} strokeWidth={1.2} />;
}
function ScanFeedback({
  state,
  message,
}: {
  state: "processing" | "success" | "error";
  message: string;
}) {
  const reduced = useReducedMotion();
  const Icon =
    state === "processing"
      ? LoaderCircle
      : state === "success"
        ? CheckCircle2
        : XCircle;
  return (
    <div
      className={"scan-feedback-overlay " + state}
      role={state === "error" ? "alert" : "status"}
      aria-atomic="true"
    >
      <motion.div
        key={state}
        className="scan-feedback-content"
        initial={{ opacity: 0, scale: reduced ? 1 : 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <div className="scan-feedback-icon">
          <Icon size={88} strokeWidth={1.8} aria-hidden="true" />
        </div>
        <h2>
          {state === "processing"
            ? "Traitement en cours…"
            : state === "success"
              ? "Pointage confirmé"
              : "Pointage refusé"}
        </h2>
        <p>{message}</p>
        {state !== "processing" && (
          <small>Le scanner sera prêt dans quelques secondes.</small>
        )}
      </motion.div>
    </div>
  );
}
