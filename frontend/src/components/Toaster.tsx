import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, CircleAlert, X } from "lucide-react";

export interface ToastNotification {
  id: string;
  message: string;
  error: boolean;
  createdAt: number;
}

interface ToasterProps {
  toasts: ToastNotification[];
  onDismiss: (id: string) => void;
}

export function Toaster({ toasts, onDismiss }: ToasterProps) {
  return (
    <aside className="toaster-container" aria-label="Notifications système">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, y: -24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.92, transition: { duration: 0.2 } }}
            transition={{ type: "spring", stiffness: 420, damping: 28 }}
            role={toast.error ? "alert" : "status"}
            className={`toast ${toast.error ? "error" : ""}`}
          >
            <div className="toast-icon">
              {toast.error ? (
                <CircleAlert size={19} aria-hidden="true" />
              ) : (
                <CheckCircle2 size={19} aria-hidden="true" />
              )}
            </div>
            <div className="toast-content">
              <strong className="toast-title">
                {toast.error ? "Erreur" : "Succès"}
              </strong>
              <span className="toast-message">{toast.message}</span>
            </div>
            <button
              className="toast-close"
              aria-label="Fermer la notification"
              type="button"
              onClick={() => onDismiss(toast.id)}
            >
              <X size={15} aria-hidden="true" />
            </button>
            <motion.div
              initial={{ width: "100%" }}
              animate={{ width: "0%" }}
              transition={{ duration: 4.5, ease: "linear" }}
              className="toast-progress"
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </aside>
  );
}

