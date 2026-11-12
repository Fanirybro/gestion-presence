import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Copy } from "lucide-react";
import { motion } from "motion/react";
import type { Organisation } from "../../services/auth";

export function ModalConfirmation({
  organisationCreee,
  surErreur,
}: {
  organisationCreee: Organisation;
  surErreur: (msg: string) => void;
}) {
  const [copie, setCopie] = useState(false);

  const copierCode = async () => {
    try {
      await navigator.clipboard.writeText(String(organisationCreee.organisation_code));
      setCopie(true);
      setTimeout(() => setCopie(false), 3000);
    } catch {
      surErreur("Sélectionnez le code pour le copier.");
    }
  };

  return (
    <motion.div
      className="clean-completion-view"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <div className="clean-check-circle">
        <Check size={28} />
      </div>

      <h1 className="step-hero-title">
        {organisationCreee.nom} est prête !
      </h1>

      <div className="clean-code-box">
        <span className="clean-code-title">Code d'invitation</span>
        <strong className="clean-code-number">{organisationCreee.organisation_code}</strong>
        <button
          type="button"
          className="clean-copy-btn"
          onClick={copierCode}
        >
          {copie ? <Check size={14} /> : <Copy size={14} />}
          <span>{copie ? "Copié !" : "Copier"}</span>
        </button>
      </div>

      <div className="clean-completion-action">
        <Link className="clean-btn-primary full-width" to="/">
          <span>Accéder à l'espace</span>
          <ArrowRight size={17} />
        </Link>
      </div>
    </motion.div>
  );
}

export { ModalConfirmation as CompletedModal };
