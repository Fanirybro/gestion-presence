import { useState, useRef, useEffect, useMemo, type KeyboardEvent } from "react";
import { Search, X, Check, User, Users } from "lucide-react";
import type { Agent } from "../types";
import { fullName, initials } from "../utils";
import "./agentAutocomplete.css";

interface AgentAutocompleteProps {
  agents: Agent[];
  departments?: { id: string; name: string }[];
  value: string; // agentId or ""
  onChange: (agentId: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  embedded?: boolean;
}

export function AgentAutocomplete({
  agents,
  departments = [],
  value,
  onChange,
  placeholder = "Rechercher par nom, prénom…",
  ariaLabel = "Rechercher un employé",
  embedded = false,
}: AgentAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === value),
    [agents, value],
  );

  // Synchronize input display with selected value
  useEffect(() => {
    if (selectedAgent) {
      setSearch(fullName(selectedAgent));
    } else {
      setSearch("");
    }
  }, [selectedAgent]);

  // Filter agents instantly based on user input
  const filteredAgents = useMemo(() => {
    const q = search.trim().toLowerCase();
    // If the input text is the exact full name of the currently selected agent, show full list so user can change selection
    if (selectedAgent && search === fullName(selectedAgent)) {
      return agents;
    }
    if (!q) return agents;

    return agents.filter((a) => {
      const name = fullName(a).toLowerCase();
      const dept =
        departments.find((d) => d.id === a.departmentId)?.name.toLowerCase() || "";
      const pos = (a.position || "").toLowerCase();
      return name.includes(q) || dept.includes(q) || pos.includes(q);
    });
  }, [agents, departments, search, selectedAgent]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        if (selectedAgent) {
          setSearch(fullName(selectedAgent));
        } else {
          setSearch("");
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selectedAgent]);

  const handleSelect = (agentId: string) => {
    onChange(agentId);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setSearch("");
    setIsOpen(false);
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    const totalItems = filteredAgents.length + 1; // +1 for "Tous les employés"

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % totalItems);
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev - 1 + totalItems) % totalItems);
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex === 0) {
          handleSelect("");
        } else if (
          highlightedIndex > 0 &&
          highlightedIndex <= filteredAgents.length
        ) {
          handleSelect(filteredAgents[highlightedIndex - 1].id);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        break;
    }
  };

  const toneClass = (id?: string) =>
    `tone-${Number((id || "0").replace(/\D/g, "")) % 4}`;

  return (
    <div
      className={`agent-autocomplete-wrapper ${embedded ? "embedded" : ""}`}
      ref={containerRef}
    >
      <div
        className={`agent-autocomplete-input-box ${isOpen ? "focused" : ""} ${
          selectedAgent ? "has-value" : ""
        } ${embedded ? "embedded" : ""}`}
        onClick={() => inputRef.current?.focus()}
      >
        <Search size={16} className="agent-autocomplete-icon" />

        {selectedAgent && !isOpen && (
          <span className={`agent-chip-avatar ${toneClass(selectedAgent.id)}`}>
            {initials(fullName(selectedAgent))}
          </span>
        )}

        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          placeholder={placeholder}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!isOpen) setIsOpen(true);
            setHighlightedIndex(-1);
          }}
          onFocus={() => {
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className="agent-autocomplete-input"
        />

        {value ? (
          <button
            type="button"
            className="agent-autocomplete-clear"
            onClick={handleClear}
            title="Désélectionner l'employé"
            aria-label="Effacer le filtre employé"
          >
            <X size={13} />
          </button>
        ) : null}
      </div>

      {isOpen && (
        <div className="agent-autocomplete-dropdown" role="listbox">
          <div className="agent-autocomplete-header">
            <span>
              {search.trim()
                ? `${filteredAgents.length} résultat(s)`
                : "Suggestions de personnel"}
            </span>
          </div>

          <div className="agent-autocomplete-list">
            {/* Option "Tous les employés" */}
            <div
              role="option"
              aria-selected={!value}
              className={`agent-autocomplete-item ${!value ? "active" : ""} ${
                highlightedIndex === 0 ? "highlighted" : ""
              }`}
              onClick={() => handleSelect("")}
              onMouseEnter={() => setHighlightedIndex(0)}
            >
              <span className="agent-autocomplete-avatar-all">
                <Users size={14} />
              </span>
              <div className="agent-autocomplete-details">
                <span className="agent-name">Tous les employés</span>
                <span className="agent-meta">Réinitialiser le filtre personnel</span>
              </div>
              {!value && <Check size={15} className="agent-check-icon" />}
            </div>

            {/* List of matching agents */}
            {filteredAgents.map((agent, index) => {
              const itemIdx = index + 1;
              const isSelected = agent.id === value;
              const isHighlighted = highlightedIndex === itemIdx;
              const deptName =
                departments.find((d) => d.id === agent.departmentId)?.name || "—";

              return (
                <div
                  key={agent.id}
                  role="option"
                  aria-selected={isSelected}
                  className={`agent-autocomplete-item ${
                    isSelected ? "active" : ""
                  } ${isHighlighted ? "highlighted" : ""}`}
                  onClick={() => handleSelect(agent.id)}
                  onMouseEnter={() => setHighlightedIndex(itemIdx)}
                >
                  <span className={`agent-chip-avatar ${toneClass(agent.id)}`}>
                    {initials(fullName(agent))}
                  </span>
                  <div className="agent-autocomplete-details">
                    <span className="agent-name">{fullName(agent)}</span>
                    <span className="agent-meta">
                      <span className="agent-dept-pill">{deptName}</span>
                      {agent.position && <span> · {agent.position}</span>}
                    </span>
                  </div>
                  {isSelected && <Check size={15} className="agent-check-icon" />}
                </div>
              );
            })}

            {filteredAgents.length === 0 && (
              <div className="agent-autocomplete-empty">
                <User size={16} />
                <span>Aucun employé ne correspond à « {search} »</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

