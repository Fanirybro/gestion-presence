import { Copy } from "lucide-react";
import { useApp } from "../app/context";
export default function OrganisationCode() {
  const { organisation, notify } = useApp();
  if (!organisation) return null;
  return (
    <section className="data-section" style={{ padding: 24, marginBottom: 24 }}>
      <h2>Inviter votre équipe</h2>
      <p>
        Partagez ce code pour permettre à un utilisateur de rejoindre{" "}
        {organisation.nom}.
      </p>
      <div
        style={{
          display: "flex",
          gap: 16,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <code
          style={{ fontSize: 20, userSelect: "all", overflowWrap: "anywhere" }}
        >
          {organisation.organisation_code}
        </code>
        <button
          className="button"
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(
                String(organisation.organisation_code),
              );
              notify("Code copié.");
            } catch {
              notify("Sélectionnez le code pour le copier.", true);
            }
          }}
        >
          <Copy size={16} />
          Copier le code
        </button>
      </div>
    </section>
  );
}
