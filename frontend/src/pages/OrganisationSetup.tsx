import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  KeyRound,
  Copy,
  Check,
  LogOut,
} from "lucide-react";
import AuthLayout from "../components/AuthLayout";
import { useApp } from "../app/context";
import { apiClient } from "../services/api";
import type { Account, Organisation } from "../services/auth";
export default function OrganisationSetup() {
  const { user, organisation, completeOrganisation, logout } = useApp();
  const [mode, setMode] = useState<"create" | "join">("join");
  const [nom, setNom] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!user) return <Navigate to="/login" replace />;
  if (user.organisationId && !created) return <Navigate to="/" replace />;
  return (
    <AuthLayout onboarding>
      <div className="auth-account">
        <span>{user.email}</span>
        <button type="button" onClick={logout} aria-label="Se déconnecter">
          <LogOut size={17} />
        </button>
      </div>
      {created && organisation ? (
        <>
          <span className="auth-success-icon">
            <Check size={28} />
          </span>
          <div className="auth-heading">
            <span className="auth-kicker">VOTRE ÉQUIPE A SON ESPACE</span>
            <h2>{organisation.nom} est prête.</h2>
            <p>
              Vous êtes le coordinateur de cette organisation. Partagez ce code
              avec les personnes qui doivent la rejoindre.
            </p>
          </div>
          <div className="auth-code">
            <span>CODE D’ORGANISATION</span>
            <strong>{organisation.organisation_code}</strong>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    String(organisation.organisation_code),
                  );
                  setCopied(true);
                } catch {
                  setError("Sélectionnez le code pour le copier manuellement.");
                }
              }}
            >
              <Copy size={16} />
              {copied ? "Code copié" : "Copier le code"}
            </button>
          </div>
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          <Link className="auth-primary" to="/">
            Accéder à mon espace
            <ArrowRight size={18} />
          </Link>
        </>
      ) : (
        <>
          <div className="auth-heading">
            <span className="auth-kicker">DERNIÈRE ÉTAPE</span>
            <h2>Retrouvez votre équipe.</h2>
            <p>
              Votre compte est prêt. Choisissez l’organisation dans laquelle
              vous allez travailler.
            </p>
          </div>
          <div className="auth-choices">
            <button
              type="button"
              disabled={busy}
              aria-pressed={mode === "join"}
              onClick={() => {
                setMode("join");
                setError("");
              }}
            >
              <KeyRound size={22} />
              <strong>Rejoindre</strong>
              <span>J’ai un code d’équipe</span>
            </button>
            <button
              type="button"
              disabled={busy}
              aria-pressed={mode === "create"}
              onClick={() => {
                setMode("create");
                setError("");
              }}
            >
              <Building2 size={22} />
              <strong>Créer</strong>
              <span>Je crée notre espace</span>
            </button>
          </div>
          <form
            className="auth-form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy) return;
              setError("");
              setBusy(true);
              try {
                const result = await apiClient.post<{
                  user: Account;
                  organisation: Organisation;
                }>(
                  mode === "create" ? "/organisations" : "/organisations/join",
                  mode === "create"
                    ? { nom }
                    : { organisation_code: code.trim().toUpperCase() },
                );
                setCreated(mode === "create");
                completeOrganisation(result);
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset disabled={busy}>
              {mode === "join" ? (
                <label>
                  Code d’organisation
                  <input
                    className="auth-code-input"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    inputMode="numeric"
                    pattern="[0-9]{1,10}"
                    autoComplete="off"
                    spellCheck={false}
                    required
                    minLength={1}
                    maxLength={10}
                    placeholder="Ex. 582394107"
                  />
                  <small>
                    Demandez ce code au coordinateur de votre organisation. Vous
                    rejoindrez son équipe comme secrétaire.
                  </small>
                </label>
              ) : (
                <label>
                  Nom de l’organisation
                  <input
                    value={nom}
                    onChange={(e) => setNom(e.target.value)}
                    required
                    maxLength={200}
                    placeholder="Ex. Direction administrative"
                  />
                  <small>
                    Vous deviendrez coordinateur. Un code sera créé pour inviter
                    votre équipe.
                  </small>
                </label>
              )}
              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}
              <button className="auth-primary" type="submit">
                {busy
                  ? "Un instant…"
                  : mode === "join"
                    ? "Rejoindre l’organisation"
                    : "Créer mon organisation"}
                <ArrowRight size={18} />
              </button>
            </fieldset>
          </form>
        </>
      )}
    </AuthLayout>
  );
}
