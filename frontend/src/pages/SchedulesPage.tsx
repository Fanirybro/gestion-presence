import { useState } from "react";
import {
  Clock,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  CalendarDays,
  CalendarCheck2,
  Sparkles,
} from "lucide-react";
import { useApp } from "../app/context";
import { Heading } from "../components/ui";
import {
  periodLabels,
  schedulesError,
} from "../services/schedules";

export default function SchedulesPage() {
  const { db, saveSettings, schedulesConfigured, notify } = useApp();

  const [settings, setSettings] = useState(() => structuredClone(db.settings));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Statistics
  const workingDays = Array.from(
    new Set(
      settings.schedules.filter((s) => s.working).map((s) => s.day),
    ),
  );
  const activeSlotsCount = settings.schedules.filter((s) => s.working).length;
  const overnightSlotsCount = settings.schedules.filter(
    (s) => s.working && s.overnight,
  ).length;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (saving) return;

    const validationError = schedulesError(settings.schedules);
    if (validationError) {
      setError(validationError);
      notify(validationError, true);
      return;
    }

    setError("");
    setSaving(true);
    try {
      await saveSettings(settings);
      notify("Horaires de travail enregistrés avec succès.");
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      notify(msg, true);
    } finally {
      setSaving(false);
    }
  };

  // Preset: Monday to Friday standard (08h00-12h00, 14h00-18h00)
  const applyStandardWeek = () => {
    const updated = settings.schedules.map((s) => {
      const isWeekday = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"].includes(s.day);
      if (!isWeekday) {
        return { ...s, working: false, overnight: false };
      }
      if (s.period === "MATIN") {
        return {
          ...s,
          working: true,
          overnight: false,
          start: "08:00",
          end: "12:00",
          cutoff: "10:00",
          tolerance: 15,
        };
      }
      if (s.period === "APRES_MIDI") {
        return {
          ...s,
          working: true,
          overnight: false,
          start: "14:00",
          end: "18:00",
          cutoff: "16:00",
          tolerance: 15,
        };
      }
      // Evening off
      return { ...s, working: false, overnight: false };
    });

    setSettings({ ...settings, schedules: updated });
    setError("");
    notify("Modèle standard (Lun-Ven 08h-12h & 14h-18h) appliqué.");
  };

  // Duplicate Monday's schedule to Tuesday-Friday
  const copyMondayToWeek = () => {
    const mondaySlots = settings.schedules.filter((s) => s.day === "Lundi");
    const updated = settings.schedules.map((s) => {
      if (["Mardi", "Mercredi", "Jeudi", "Vendredi"].includes(s.day)) {
        const source = mondaySlots.find((m) => m.period === s.period);
        if (source) {
          return {
            ...s,
            working: source.working,
            overnight: source.overnight,
            start: source.start,
            end: source.end,
            cutoff: source.cutoff,
            tolerance: source.tolerance,
          };
        }
      }
      return s;
    });

    setSettings({ ...settings, schedules: updated });
    setError("");
    notify("Créneaux du Lundi dupliqués du Mardi au Vendredi.");
  };

  // Reset to initial database state
  const resetToSaved = () => {
    setSettings(structuredClone(db.settings));
    setError("");
    notify("Modifications annulées.");
  };

  return (
    <>
      <Heading
        eyebrow="TEMPS DE TRAVAIL & DISCIPLINE"
        title="Horaires de travail"
        subtitle="Configuration hebdomadaire des créneaux, tolérances de retard et seuils d'absence"
      >
        <div className="sched-header-actions">
          <button
            type="button"
            className="button"
            onClick={resetToSaved}
            disabled={saving}
            title="Annuler les modifications non enregistrées"
          >
            <RotateCcw size={15} />
            <span>Réinitialiser</span>
          </button>
          <button
            type="button"
            className="button primary"
            onClick={() => void handleSubmit()}
            disabled={saving}
          >
            <Save size={15} />
            <span>{saving ? "Enregistrement…" : "Enregistrer les horaires"}</span>
          </button>
        </div>
      </Heading>

      {/* KPI Metrics Strip (Model from Reports) */}
      <div className="rp-metrics-row">
        <div className="rp-metric-cell">
          <span className="rp-metric-label">
            {schedulesConfigured ? (
              <CheckCircle2 size={14} style={{ color: "#1e6b52" }} />
            ) : (
              <AlertCircle size={14} style={{ color: "#b45309" }} />
            )}
            État du planning
          </span>
          <strong className={`rp-metric-value ${schedulesConfigured ? "green" : "warn"}`}>
            {schedulesConfigured ? "Configuré" : "À configurer"}
          </strong>
          <small className="rp-metric-sub">
            {schedulesConfigured ? "Semaine opérationnelle" : "Action requise"}
          </small>
        </div>

        <div className="rp-metric-cell">
          <span className="rp-metric-label">
            <CalendarDays size={14} /> Jours travaillés
          </span>
          <strong className="rp-metric-value">{workingDays.length}</strong>
          <small className="rp-metric-sub">
            {workingDays.join(", ") || "Aucun jour ouvré"}
          </small>
        </div>

        <div className="rp-metric-cell">
          <span className="rp-metric-label">
            <Clock size={14} /> Créneaux actifs
          </span>
          <strong className="rp-metric-value">{activeSlotsCount} / 21</strong>
          <small className="rp-metric-sub">Matin, après-midi ou soir</small>
        </div>

        <div className="rp-metric-cell">
          <span className="rp-metric-label">
            <CalendarCheck2 size={14} /> Nuits traversées
          </span>
          <strong className="rp-metric-value">{overnightSlotsCount}</strong>
          <small className="rp-metric-sub">Créneaux finissant le lendemain</small>
        </div>
      </div>

      {/* Presets Toolbar (Seamless, no card wrapper) */}
      <div className="sched-toolbar">
        <div className="sched-toolbar-info">
          <Sparkles size={15} className="sched-accent-icon" />
          <span>
            <strong>Modèles rapides :</strong> pré-remplissez vos horaires et dupliquez les créneaux en un clic.
          </span>
        </div>

        <div className="sched-toolbar-actions">
          <button
            type="button"
            className="button small"
            onClick={applyStandardWeek}
            disabled={saving}
            title="Appliquer 08:00–12:00 et 14:00–18:00 du Lundi au Vendredi"
          >
            Modèle standard (Lun–Ven)
          </button>
          <button
            type="button"
            className="button small"
            onClick={copyMondayToWeek}
            disabled={saving}
            title="Dupliquer les créneaux du Lundi sur Mardi, Mercredi, Jeudi et Vendredi"
          >
            Dupliquer Lundi → Semaine
          </button>
        </div>
      </div>

      {/* Weekly Schedule Form */}
      <form onSubmit={handleSubmit} className="settings-form">
        <fieldset
          disabled={saving}
          style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
        >
          <section className="settings-section">
            <div className="table-scroll">
              <table className="schedule-table">
                <thead>
                  <tr>
                    <th>JOUR</th>
                    <th>CRÉNEAU</th>
                    <th>TRAVAILLÉ</th>
                    <th>DÉBUT</th>
                    <th>FIN</th>
                    <th>TOLÉRANCE (MIN)</th>
                    <th>SEUIL D’ABSENCE</th>
                  </tr>
                </thead>

                {Array.from(new Set(settings.schedules.map((s) => s.day))).map(
                  (day) => {
                    const daySlots = settings.schedules
                      .map((s, i) => ({ s, i }))
                      .filter(({ s }) => s.day === day);
                    const isDayWorking = daySlots.some(({ s }) => s.working);

                    return (
                      <tbody
                        key={day}
                        className="schedule-day"
                        style={{
                          opacity: isDayWorking ? 1 : 0.65,
                          transition: "opacity 0.2s",
                        }}
                      >
                        {daySlots.map(({ s, i }, periodIndex) => (
                          <tr
                            key={`${s.day}-${s.period}`}
                            style={{
                              background: s.working ? undefined : "#fbfdfc",
                            }}
                          >
                            {periodIndex === 0 && (
                              <th
                                className="schedule-day-name"
                                scope="rowgroup"
                                rowSpan={daySlots.length}
                              >
                                {s.day}
                              </th>
                            )}

                            <td>
                              <span style={{ fontWeight: s.working ? 600 : 400 }}>
                                {periodLabels[s.period]}
                              </span>
                            </td>

                            <td>
                              <input
                                type="checkbox"
                                aria-label={`${s.day} ${periodLabels[s.period]} travaillé`}
                                checked={s.working}
                                onChange={(e) =>
                                  setSettings({
                                    ...settings,
                                    schedules: settings.schedules.map((x, j) =>
                                      j === i
                                        ? {
                                            ...x,
                                            working: e.target.checked,
                                            overnight:
                                              e.target.checked && x.overnight,
                                          }
                                        : x,
                                    ),
                                  })
                                }
                              />
                            </td>

                            {(
                              ["start", "end", "tolerance", "cutoff"] as const
                            ).map((key) => (
                              <td key={key}>
                                <input
                                  aria-label={`${s.day} ${periodLabels[s.period]} ${key}`}
                                  type={key === "tolerance" ? "number" : "time"}
                                  min={key === "tolerance" ? 0 : undefined}
                                  max={key === "tolerance" ? 1439 : undefined}
                                  required={s.working}
                                  disabled={!s.working}
                                  value={s[key]}
                                  onChange={(e) =>
                                    setSettings({
                                      ...settings,
                                      schedules: settings.schedules.map(
                                        (x, j) =>
                                          j === i
                                            ? {
                                                ...x,
                                                [key]:
                                                  key === "tolerance"
                                                    ? Number(e.target.value)
                                                    : e.target.value,
                                              }
                                            : x,
                                      ),
                                    })
                                  }
                                />

                                {key === "end" && s.period === "SOIR" && (
                                  <label
                                    className="check-field"
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 6,
                                      marginLeft: 10,
                                      fontSize: 11,
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      aria-label={`${s.day} Soir fin le lendemain`}
                                      disabled={!s.working}
                                      checked={s.overnight}
                                      onChange={(e) =>
                                        setSettings({
                                          ...settings,
                                          schedules: settings.schedules.map(
                                            (x, j) =>
                                              j === i
                                                ? {
                                                    ...x,
                                                    overnight: e.target.checked,
                                                  }
                                                : x,
                                          ),
                                        })
                                      }
                                    />
                                    Fin le lendemain
                                  </label>
                                )}

                                {key === "cutoff" &&
                                  s.overnight &&
                                  s.cutoff < s.start && (
                                    <small
                                      style={{
                                        display: "block",
                                        color: "#227057",
                                        fontWeight: 600,
                                        marginTop: 2,
                                      }}
                                    >
                                      Lendemain
                                    </small>
                                  )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    );
                  },
                )}
              </table>
            </div>
          </section>

          {error && (
            <p className="form-error" role="alert" style={{ marginTop: 16 }}>
              {error}
            </p>
          )}

          <div className="form-actions" style={{ marginTop: 20 }}>
            <button
              type="submit"
              className="button primary"
              disabled={saving}
            >
              <Save size={16} />
              {saving ? "Enregistrement…" : "Enregistrer les horaires"}
            </button>
          </div>
        </fieldset>
      </form>
    </>
  );
}
