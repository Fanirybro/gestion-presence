import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AnimatePresence } from "motion/react";
import {
  ArrowUpDown,
  Camera,
  Eye,
  Layers,
  Pencil,
  Plus,
  QrCode,
  RotateCcw,
  Search,
  UserCheck,
  X,
} from "lucide-react";
import { useApp } from "../app/context";
import { Back, Empty, Heading, Person, Table } from "../components/ui";
import { RowActionsMenu } from "../components/RowActionsMenu";
import { dateLabel, fullName } from "../utils";
import { ModalDetailAgent } from "./agents/ModalDetailAgent";
import { FormulairePersonnel } from "./agents/FormulairePersonnel";
import { ModalEnrollAgent } from "../modules/face-recognition/ModalEnrollAgent";
import type { Agent } from "../types";

export function Agents() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { db, organisation, notify, refreshPersonnel, personnelLoading } = useApp();
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [enrollAgent, setEnrollAgent] = useState<Agent | null>(null);

  const currentDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: organisation?.fuseau_horaire || "Indian/Antananarivo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const age = (birthDate?: string) => {
    if (!birthDate || birthDate > currentDate) return null;
    const years = Number(currentDate.slice(0, 4)) - Number(birthDate.slice(0, 4));
    return years - (currentDate.slice(5) < birthDate.slice(5) ? 1 : 0);
  };

  const getInitialDept = () =>
    searchParams.get("department") ||
    searchParams.get("division") ||
    searchParams.get("division_id") ||
    "";

  const getInitialSearch = () => searchParams.get("search") || "";

  const [search, setSearch] = useState(getInitialSearch);
  const [department, setDepartment] = useState(getInitialDept);
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("name");

  // Synchronise le filtre avec les query params de l'URL
  useEffect(() => {
    const urlDept =
      searchParams.get("department") ||
      searchParams.get("division") ||
      searchParams.get("division_id") ||
      "";
    const urlSearch = searchParams.get("search") || "";

    if (urlDept !== department) {
      setDepartment(urlDept);
    }
    if (urlSearch && urlSearch !== search) {
      setSearch(urlSearch);
    }
  }, [searchParams]);

  const handleDepartmentChange = (val: string) => {
    setDepartment(val);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (val) {
          next.set("department", val);
          next.delete("division");
          next.delete("division_id");
        } else {
          next.delete("department");
          next.delete("division");
          next.delete("division_id");
        }
        return next;
      },
      { replace: true },
    );
  };

  const handleResetFilters = () => {
    setSearch("");
    setDepartment("");
    setStatus("");
    setSort("name");
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("department");
        next.delete("division");
        next.delete("division_id");
        next.delete("search");
        return next;
      },
      { replace: true },
    );
  };

  const agents = db.agents
    .filter(
      (a) =>
        fullName(a)
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (!department || String(a.departmentId) === String(department)) &&
        (!status || (status === "enrolled" ? Boolean(a.isEnrolled) : !a.isEnrolled)),
    )
    .sort((a, b) =>
      sort === "age"
        ? (age(a.birthDate) ?? Infinity) - (age(b.birthDate) ?? Infinity)
        : fullName(a).localeCompare(fullName(b)),
    );

  return (
    <>
      <Heading
        eyebrow="RÉFÉRENTIEL RH"
        title="Personnel"
        subtitle={`${db.agents.length} agent${db.agents.length > 1 ? "s" : ""} · Fiches d'identité, affectations et badges`}
      >
        <Link className="button" to="/agents/badges">
          Imprimer les badges
        </Link>
        <Link className="button primary" to="/agents/new">
          <Plus size={16} />
          Nouvel agent
        </Link>
      </Heading>

      <section aria-label="Filtres du personnel" className="unified-filter-bar">
        {/* 1. Recherche par nom ou prénom */}
        <div className="unified-filter-segment segment-search" style={{ flex: 1.5, minWidth: 200 }}>
          <Search size={16} className="segment-icon" aria-hidden="true" />
          <div className="segment-input-group">
            <span className="segment-label">Agent</span>
            <input
              type="search"
              aria-label="Rechercher un agent"
              placeholder="Rechercher un nom ou prénom…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="unified-search-input"
            />
          </div>
          {search && (
            <button
              type="button"
              className="segment-clear-btn"
              onClick={() => setSearch("")}
              title="Effacer la recherche"
              aria-label="Effacer la recherche"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="unified-filter-divider" aria-hidden="true" />

        {/* 2. Niveau / Division */}
        <div className="unified-filter-segment segment-dept" style={{ flex: 1.2, minWidth: 170 }}>
          <Layers size={16} className="segment-icon" aria-hidden="true" />
          <div className="segment-input-group">
            <span className="segment-label">Niveau</span>
            <select
              aria-label="Filtrer par niveau"
              value={department}
              onChange={(e) => handleDepartmentChange(e.target.value)}
              className="unified-select"
            >
              <option value="">Tous les niveaux</option>
              {db.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.isActive === false ? " (inactif)" : ""}
                </option>
              ))}
            </select>
          </div>
          {department && (
            <button
              type="button"
              className="segment-clear-btn"
              onClick={() => handleDepartmentChange("")}
              title="Effacer le filtre niveau"
              aria-label="Effacer le filtre niveau"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="unified-filter-divider" aria-hidden="true" />

        {/* 3. Statut d'enrôlement */}
        <div className="unified-filter-segment segment-status" style={{ flex: 1.1, minWidth: 155 }}>
          <UserCheck size={16} className="segment-icon" aria-hidden="true" />
          <div className="segment-input-group">
            <span className="segment-label">Enrôlement</span>
            <select
              aria-label="Filtrer par statut d'enrôlement"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="unified-select"
            >
              <option value="">Tous les statuts</option>
              <option value="enrolled">Enrôlés</option>
              <option value="unenrolled">Non enrôlés</option>
            </select>
          </div>
          {status && (
            <button
              type="button"
              className="segment-clear-btn"
              onClick={() => setStatus("")}
              title="Effacer le filtre statut"
              aria-label="Effacer le filtre statut"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="unified-filter-divider" aria-hidden="true" />

        {/* 4. Tri */}
        <div className="unified-filter-segment segment-sort" style={{ flex: 1, minWidth: 155 }}>
          <ArrowUpDown size={15} className="segment-icon" aria-hidden="true" />
          <div className="segment-input-group">
            <span className="segment-label">Tri</span>
            <select
              aria-label="Trier les agents"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="unified-select"
            >
              <option value="name">Par nom (A-Z)</option>
              <option value="age">Par âge</option>
            </select>
          </div>
        </div>

        {/* 5. Réinitialiser */}
        {(search || department || status || sort !== "name") && (
          <>
            <div className="unified-filter-divider" aria-hidden="true" />
            <button
              type="button"
              className="unified-reset-btn"
              title="Réinitialiser les filtres"
              aria-label="Réinitialiser les filtres"
              onClick={handleResetFilters}
            >
              <RotateCcw size={12} />
              <span>Effacer</span>
            </button>
          </>
        )}
      </section>

      <section className="data-section">
        <Table
          loading={personnelLoading}
          headers={["AGENT", "NIVEAU", "POSTE", "STATUT", "TÉLÉPHONE", "ENRÔLEMENT", "ACTIONS"]}
          empty={
            db.agents.length
              ? "Aucun agent ne correspond aux filtres de recherche."
              : "Aucun agent enregistré dans l'organisation."
          }
          pageSize={10}
          rowKeys={agents.map((a) => a.id)}
          rows={agents.map((a) => {
            const deptName =
              db.departments.find((d) => d.id === a.departmentId)?.name ?? "—";
            const im = a.metadata?.im || a.metadata?.matricule;
            const ageStr = age(a.birthDate) !== null ? `${age(a.birthDate)} ans` : null;
            const sexeStr = a.metadata?.sexe ? (a.metadata.sexe === "H" ? "H" : "F") : null;
            const detailParts = [im ? `IM ${im}` : null, sexeStr, ageStr].filter(Boolean);
            const statutAdmin = a.metadata?.statut_administratif;
            const categorie = a.metadata?.categorie;

            return [
              <div
                key="person"
                style={{ cursor: "pointer" }}
                onClick={() => setSelectedAgent(a)}
              >
                <Person
                  agent={a}
                  detail={detailParts.length > 0 ? detailParts.join(" · ") : undefined}
                />
              </div>,
              <span key="dept" style={{ fontWeight: 500, color: "#2d3748" }}>
                {deptName}
              </span>,
              <span key="pos">{a.position || "—"}</span>,
              <div key="statut" style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "2px 8px",
                    borderRadius: "6px",
                    fontSize: "11px",
                    fontWeight: 600,
                    background:
                      statutAdmin === "FONCTIONNAIRE"
                        ? "rgba(16, 185, 129, 0.12)"
                        : statutAdmin === "EFA"
                          ? "rgba(59, 130, 246, 0.12)"
                          : statutAdmin === "ELD"
                            ? "rgba(245, 158, 11, 0.12)"
                            : "rgba(100, 116, 139, 0.12)",
                    color:
                      statutAdmin === "FONCTIONNAIRE"
                        ? "#065f46"
                        : statutAdmin === "EFA"
                          ? "#1e40af"
                          : statutAdmin === "ELD"
                            ? "#92400e"
                            : "#334155",
                    width: "fit-content",
                  }}
                >
                  {statutAdmin || "—"}
                </span>
                {categorie && (
                  <small style={{ fontSize: "11px", color: "#64748b" }}>Cat. {categorie}</small>
                )}
              </div>,
              <div key="tel">
                {a.metadata?.telephone ? (
                  <a
                    href={`tel:${a.metadata.telephone}`}
                    style={{
                      fontFamily: "monospace",
                      fontSize: "12px",
                      color: "#1e6b52",
                      textDecoration: "none",
                      fontWeight: 500,
                    }}
                    title="Appeler cet agent"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {a.metadata.telephone}
                  </a>
                ) : (
                  <span style={{ color: "#94a3b8" }}>—</span>
                )}
              </div>,
              <span
                key="status"
                className={`badge ${a.isEnrolled ? "present" : "late"}`}
                title={
                  a.isEnrolled
                    ? "Agent enrôlé pour la reconnaissance faciale"
                    : "Non enrôlé"
                }
              >
                <i />
                {a.isEnrolled ? "Enrôlé" : "Non enrôlé"}
              </span>,
              <div key="actions" style={{ display: "flex", justifyContent: "flex-end" }}>
                <RowActionsMenu
                  ariaLabel={`Actions pour ${fullName(a)}`}
                  items={[
                    {
                      label: "Fiche détaillée",
                      icon: <Eye size={14} />,
                      onClick: () => setSelectedAgent(a),
                    },
                    {
                      label: "Modifier l'agent",
                      icon: <Pencil size={14} />,
                      onClick: () => navigate(`/agents/${a.id}/edit`),
                    },
                    {
                      label: a.isEnrolled ? "Ré-enrôler le visage" : "Enrôler le visage",
                      icon: <Camera size={14} />,
                      onClick: () => setEnrollAgent(a),
                    },
                    {
                      label: "Badge & QR Code",
                      icon: <QrCode size={14} />,
                      onClick: () => navigate(`/agents/${a.id}/qr`),
                    },
                  ]}
                />
              </div>,
            ];
          })}
        />
      </section>

      <AnimatePresence>
        {selectedAgent && (
          <ModalDetailAgent
            agent={
              db.agents.find((a) => a.id === selectedAgent.id) ?? selectedAgent
            }
            ageValeur={age(selectedAgent.birthDate)}
            onClose={() => setSelectedAgent(null)}
            onEnroll={(agent) => {
              setSelectedAgent(null);
              setEnrollAgent(agent);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {enrollAgent && (
          <ModalEnrollAgent
            agent={enrollAgent}
            onClose={() => setEnrollAgent(null)}
            onSuccess={async () => {
              notify(`Enrôlement réussi pour ${fullName(enrollAgent)} !`);
              setEnrollAgent(null);
              await refreshPersonnel();
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

export function AgentForm() {
  const { id } = useParams();
  const { db } = useApp();
  const agent = db.agents.find((a) => a.id === id);
  if (id && !agent)
    return (
      <Empty text="Agent introuvable">
        <Link to="/agents">Retour au personnel</Link>
      </Empty>
    );
  return <FormulairePersonnel key={id ?? "new"} agent={agent} />;
}

export function AgentDetails() {
  const { id } = useParams();
  const { db, notify, refreshPersonnel } = useApp();
  const [enrollAgent, setEnrollAgent] = useState<Agent | null>(null);
  const a = db.agents.find((a) => a.id === id);
  if (!a) return <Empty text="Agent introuvable" />;

  return (
    <>
      <Back to="/agents" label="Personnel" />
      <Heading title={fullName(a)} subtitle={a.position || undefined}>
        <button
          type="button"
          className={`button ${a.isEnrolled ? "" : "primary"}`}
          onClick={() => setEnrollAgent(a)}
        >
          <Camera size={16} />
          {a.isEnrolled ? "Ré-enrôler" : "Enrôler"}
        </button>
        <Link className="button" to={`/agents/${id}/edit`}>
          <Pencil size={16} />
          Modifier
        </Link>
        <Link className="button small" to={`/agents/${a.id}/qr`}>
          Badge QR
        </Link>
      </Heading>
      <div className="detail-strip">
        {[
          ["IM (MATRICULE)", a.metadata?.im || a.metadata?.matricule || "—"],
          ["CIN", a.metadata?.cin || "—"],
          [
            "NIVEAU / DIVISION",
            db.departments.find((d) => d.id === a.departmentId)?.name ?? a.metadata?.structure ?? "—",
          ],
          ["POSTE", a.position || "—"],
          ["STATUT", a.metadata?.statut_administratif || "—"],
          ["CATÉGORIE", a.metadata?.categorie ? `Cat. ${a.metadata.categorie}` : "—"],
          [
            "SEXE",
            a.metadata?.sexe === "H"
              ? "Homme (Masculin)"
              : a.metadata?.sexe === "F"
                ? "Femme (Féminin)"
                : a.metadata?.sexe || "—",
          ],
          ["TÉLÉPHONE (TEL)", a.metadata?.telephone || "—"],
          ["E-MAIL", a.metadata?.email || "—"],
          ["LOCALITÉ", a.metadata?.localite || "—"],
          ["DATE DE NAISSANCE", a.birthDate ? dateLabel(a.birthDate) : "—"],
          [
            "ENTRÉE ADMINISTRATION",
            a.metadata?.date_entree_administration
              ? dateLabel(a.metadata.date_entree_administration)
              : "—",
          ],
          [
            "PRISE DE SERVICE",
            a.metadata?.date_prise_service
              ? dateLabel(a.metadata.date_prise_service)
              : a.hireDate
                ? dateLabel(a.hireDate)
                : "—",
          ],
          ["ENRÔLEMENT", a.isEnrolled ? "Enrôlé" : "Non enrôlé"],
          ["CRÉATION", dateLabel(a.createdAt)],
        ].map(([label, value]) => (
          <div key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <AnimatePresence>
        {enrollAgent && (
          <ModalEnrollAgent
            agent={enrollAgent}
            onClose={() => setEnrollAgent(null)}
            onSuccess={async () => {
              notify(`Enrôlement facial réussi pour ${fullName(enrollAgent)} !`);
              setEnrollAgent(null);
              await refreshPersonnel();
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

export { default as AgentQr } from "./AgentQr";
