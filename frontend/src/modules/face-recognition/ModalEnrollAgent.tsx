import { motion } from "motion/react";
import FaceEnrollComponent from "./FaceEnrollComponent";
import type { Agent } from "../../types";

export function ModalEnrollAgent({
  agent,
  onClose,
  onSuccess,
}: {
  agent: Agent;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  return (
    <div
      className="face-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Enrôlement facial de ${agent.firstName} ${agent.lastName}`}
    >
      <motion.div
        className="face-modal-dialog"
        style={{ maxWidth: "600px", width: "100%" }}
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ type: "spring", stiffness: 380, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <FaceEnrollComponent
          targetPersonnelId={agent.id}
          isModal={true}
          onSuccess={onSuccess}
          onClose={onClose}
        />
      </motion.div>
    </div>
  );
}

export default ModalEnrollAgent;
