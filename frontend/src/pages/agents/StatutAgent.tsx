import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { UserCheck, UserX } from "lucide-react";
import { useApp } from "../../app/context";
import { Confirm } from "../../components/ui";
import { fullName } from "../../utils";
import { personnelApi } from "../../services/personnel";
import type { Agent } from "../../types";

export function StatutAgent({
  agent,
  surChangementStatut,
}: {
  agent: Agent;
  surChangementStatut?: () => void;
}) {
  const { refreshPersonnel, notify } = useApp();
  const [confirm, setConfirm] = useState(false);
  const [enAttente, setEnAttente] = useState(false);

  const changerStatut = async () => {
    setEnAttente(true);
    try {
      await personnelApi.update(agent.id, { actif: !agent.isActive });
      await refreshPersonnel();
      notify(
        agent.isActive
          ? "Agent désactivé. Badges révoqués."
          : "Agent réactivé.",
      );
      surChangementStatut?.();
    } catch (error) {
      notify((error as Error).message, true);
    } finally {
      setEnAttente(false);
    }
  };

  return (
    <>
      <button
        className={`agent-action-btn ${agent.isActive ? "deactivate" : "activate"}`}
        disabled={enAttente}
        onClick={(e) => {
          e.stopPropagation();
          setConfirm(true);
        }}
      >
        {enAttente ? (
          "…"
        ) : agent.isActive ? (
          <>
            <UserX size={14} />
            Désactiver
          </>
        ) : (
          <>
            <UserCheck size={14} />
            Réactiver
          </>
        )}
      </button>

      <AnimatePresence>
        {confirm && (
          <Confirm
            title={
              agent.isActive
                ? "Désactiver cet agent ?"
                : "Réactiver cet agent ?"
            }
            text={
              agent.isActive
                ? `${fullName(agent)} restera dans le personnel inactif. Ses badges seront révoqués et son historique sera conservé.`
                : "L’agent sera de nouveau actif. Les anciens badges restent révoqués."
            }
            close={() => setConfirm(false)}
            confirm={() => void changerStatut()}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// Alias de rétrocompatibilité
export { StatutAgent as AgentStatus };
