import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  Search,
  X,
  CheckCircle2,
  Clock3,
  UserX,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { Agent, Status } from "../types";
import { fullName, initials, statusLabels } from "../utils";
import { motion } from "motion/react";
import { useMotionPreference as useReducedMotion } from "./useMotionPreference";
import { Skeleton, TableSkeleton } from "./Skeleton";
export function Badge({ status }: { status: Status }) {
  const Icon = {
    PRESENT: CheckCircle2,
    LATE: Clock3,
    ABSENT: UserX,
    JUSTIFIED: ShieldCheck,
  }[status];
  return (
    <span className={`badge ${status.toLowerCase()}`}>
      <Icon size={16} aria-hidden="true" />
      {statusLabels[status]}
    </span>
  );
}
export function Person({ agent, detail }: { agent?: Agent; detail?: string }) {
  return (
    <div className="person">
      <span
        className={`avatar tone-${Number(agent?.id.replace(/\D/g, "") || 0) % 4}`}
      >
        {initials(fullName(agent))}
      </span>
      <span>
        <strong>{fullName(agent)}</strong>
        {detail && <small>{detail}</small>}
      </span>
    </div>
  );
}
export function Heading({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  const reduced = useReducedMotion();
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1 aria-label={title} className="animated-heading">
          {title.split(" ").map((word, i) => (
            <span className="word-mask" aria-hidden="true" key={`${i}-${word}`}>
              <motion.span
                initial={{
                  y: reduced ? 0 : "110%",
                  rotate: reduced ? 0 : 3,
                  opacity: 0,
                }}
                animate={{ y: 0, rotate: 0, opacity: 1 }}
                transition={{
                  duration: reduced ? 0.12 : 0.5,
                  delay: reduced ? 0 : Math.min(i, 8) * 0.035,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                {word}
              </motion.span>{" "}
            </span>
          ))}
        </h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="actions">{children}</div>
    </div>
  );
}
export function Empty({
  text = "Aucun résultat",
  children,
}: {
  text?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <Search size={28} />
      <h3>{text}</h3>
      {children}
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  const connect = (nodes: ReactNode): ReactNode =>
    Children.map(nodes, (node) => {
      if (!isValidElement(node)) return node;
      const element = node as ReactElement<{
        id?: string;
        children?: ReactNode;
        "aria-describedby"?: string;
      }>;
      if (
        typeof node.type === "string" &&
        ["input", "select", "textarea"].includes(node.type)
      )
        return cloneElement(element, {
          id,
          "aria-describedby": hint ? `${id}-hint` : undefined,
        });
      return element.props.children
        ? cloneElement(element, {}, connect(element.props.children))
        : element;
    });
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {connect(children)}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const reduced = useReducedMotion();
  useEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus({ preventScroll: true });
    };
  }, []);
  return (
    <motion.dialog
      ref={ref}
      aria-labelledby={titleId}
      initial={{ opacity: 0, y: reduced ? 0 : 30, scale: reduced ? 1 : 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{
        opacity: 0,
        y: reduced ? 0 : 6,
        scale: reduced ? 1 : 0.99,
        transition: { duration: 0.12 },
      }}
      transition={
        reduced
          ? { duration: 0.12 }
          : { type: "spring", stiffness: 420, damping: 30, mass: 0.8 }
      }
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" aria-label="Fermer" onClick={close}>
          <X size={20} />
        </button>
      </header>
      {children}
    </motion.dialog>
  );
}
export function Confirm({
  title,
  text,
  confirm,
  close,
}: {
  title: string;
  text: string;
  confirm: () => void;
  close: () => void;
}) {
  return (
    <Modal title={title} close={close}>
      <p>{text}</p>
      <footer>
        <button className="button" onClick={close}>
          Annuler
        </button>
        <button
          className="button primary"
          onClick={() => {
            confirm();
            close();
          }}
        >
          Confirmer
        </button>
      </footer>
    </Modal>
  );
}
export function Table({
  headers,
  rows,
  empty,
  pageSize = 8,
  loading = false,
  rowKeys,
}: {
  headers: string[];
  rows: ReactNode[][];
  empty?: string;
  pageSize?: number;
  loading?: boolean;
  rowKeys?: string[];
}) {
  const [page, setPage] = useState(1);
  const reduced = useReducedMotion();
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const active = Math.min(page, pages);
  if (loading)
    return (
      <div role="status" aria-label="Chargement du tableau" aria-busy="true">
        <TableSkeleton columns={headers.length} rows={Math.min(pageSize, 8)} />
        <div className="pagination">
          <Skeleton width={100} height={12} />
          <Skeleton width={120} height={24} />
        </div>
      </div>
    );
  return (
    <>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody key={active} className="table-page">
            {rows
              .slice((active - 1) * pageSize, active * pageSize)
              .map((row, i) => (
                <motion.tr
                  key={rowKeys?.[(active - 1) * pageSize + i] || i}
                  layout={reduced ? false : "position"}
                  initial={{ opacity: 0, x: reduced ? 0 : 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    opacity: {
                      duration: 0.22,
                      delay: reduced ? 0 : Math.min(i, 7) * 0.028,
                    },
                    x: {
                      type: "spring",
                      stiffness: 380,
                      damping: 32,
                      delay: reduced ? 0 : Math.min(i, 7) * 0.028,
                    },
                    layout: { type: "spring", stiffness: 400, damping: 35 },
                  }}
                >
                  {row.map((cell, j) => (
                    <td key={j}>{cell}</td>
                  ))}
                </motion.tr>
              ))}
          </tbody>
        </table>
        {!rows.length && <Empty text={empty} />}
      </div>
      <div className="pagination">
        <span>
          {rows.length
            ? `${(active - 1) * pageSize + 1}–${Math.min(active * pageSize, rows.length)} sur ${rows.length}`
            : "0 résultat"}
        </span>
        <div>
          <button
            className="icon-button"
            aria-label="Page précédente"
            disabled={active === 1}
            onClick={() => setPage(active - 1)}
          >
            <ArrowLeft size={16} />
          </button>
          <span>
            {active} / {pages}
          </span>
          <button
            className="icon-button"
            aria-label="Page suivante"
            disabled={active === pages}
            onClick={() => setPage(active + 1)}
          >
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </>
  );
}
export function Back({ to, label = "Retour" }: { to: string; label?: string }) {
  return (
    <Link className="back" to={to}>
      <ArrowLeft size={16} />
      {label}
    </Link>
  );
}
export function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="button" onClick={onClick}>
      <Download size={16} />
      Exporter CSV
    </button>
  );
}
