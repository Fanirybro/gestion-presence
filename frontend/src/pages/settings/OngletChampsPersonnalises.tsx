import { useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { Field, Table } from "../../components/ui";
import { useApp } from "../../app/context";

export function OngletChampsPersonnalises({
  champsPersonnalises,
  setChampsPersonnalises,
  enSauvegarde,
  surEnregistrement,
}: {
  champsPersonnalises: any[];
  setChampsPersonnalises: (champs: any[]) => void;
  enSauvegarde: boolean;
  surEnregistrement: (e: React.FormEvent) => void;
}) {
  const { notify } = useApp();
  const [nomNouveauChamp, setNomNouveauChamp] = useState("");
  const [typeNouveauChamp, setTypeNouveauChamp] = useState<"text" | "number" | "date" | "select">("text");

  const liste = Array.isArray(champsPersonnalises)
    ? champsPersonnalises
    : typeof champsPersonnalises === "string"
      ? (() => {
          try {
            const p = JSON.parse(champsPersonnalises);
            return Array.isArray(p) ? p : [];
          } catch {
            return [];
          }
        })()
      : [];

  const ajouterChamp = () => {
    const libelle = nomNouveauChamp.trim();
    if (!libelle) return;
    const cle = libelle
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (liste.some((f) => f.name === cle)) {
      notify("Ce champ personnalisé existe déjà.", true);
      return;
    }
    const miseAJour = [
      ...liste,
      {
        id: `field_${Date.now()}`,
        name: cle,
        label: libelle,
        type: typeNouveauChamp,
        required: false,
      },
    ];
    setChampsPersonnalises(miseAJour);
    setNomNouveauChamp("");
  };

  const supprimerChamp = (id: string) => {
    const miseAJour = liste.filter((f) => f.id !== id);
    setChampsPersonnalises(miseAJour);
  };

  return (
    <section className="settings-section">
      <h2>Champs dynamiques du personnel (metadata jsonb)</h2>
      <p className="text-secondary" style={{ fontSize: "0.875rem", marginBottom: "1.25rem" }}>
        Configurez les attributs supplémentaires à afficher sur les fiches des agents (ex. Numéro CIN, contact d'urgence, groupe sanguin) sans modifier le schéma de la base de données.
      </p>

      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem", flexWrap: "wrap", alignItems: "flex-end" }}>
        <Field label="Libellé du champ">
          <input
            placeholder="Ex. Contact d'urgence"
            value={nomNouveauChamp}
            onChange={(e) => setNomNouveauChamp(e.target.value)}
            maxLength={50}
          />
        </Field>

        <Field label="Type de donnée">
          <select
            value={typeNouveauChamp}
            onChange={(e) => setTypeNouveauChamp(e.target.value as any)}
            style={{ padding: "0.55rem" }}
          >
            <option value="text">Texte libre</option>
            <option value="number">Numérique</option>
            <option value="date">Date</option>
          </select>
        </Field>

        <button
          type="button"
          className="button primary"
          style={{ height: "40px", gap: "0.4rem" }}
          onClick={ajouterChamp}
        >
          <Plus size={16} />
          <span>Ajouter le champ</span>
        </button>
      </div>

      <Table
        empty="Aucun champ personnalisé pour le moment. Ajoutez-en un ci-dessus."
        headers={["Nom interne (clé)", "Libellé affiché", "Type", "Action"]}
        rows={liste.map((f) => [
          <code key="key" style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: 4 }}>
            {f.name}
          </code>,
          <strong key="label">{f.label}</strong>,
          <span key="type" className="badge" style={{ textTransform: "uppercase", fontSize: "11px" }}>
            {f.type}
          </span>,
          <button
            key="action"
            type="button"
            className="button danger"
            style={{ padding: "3px 8px", fontSize: "12px" }}
            onClick={() => supprimerChamp(f.id)}
          >
            <Trash2 size={13} /> Retirer
          </button>,
        ])}
      />

      <div className="form-actions" style={{ marginTop: "1.5rem" }}>
        <button
          type="button"
          className="button primary"
          disabled={enSauvegarde}
          onClick={surEnregistrement}
        >
          <Save size={16} />
          {enSauvegarde ? "Enregistrement…" : "Sauvegarder les champs"}
        </button>
      </div>
    </section>
  );
}

// Alias de rétrocompatibilité
export { OngletChampsPersonnalises as CustomFieldsTab };
