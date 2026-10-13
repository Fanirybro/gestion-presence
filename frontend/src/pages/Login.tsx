import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { useApp } from "../app/context";
import AuthLayout from "../components/AuthLayout";
export default function Login({
  signupMode = false,
}: {
  signupMode?: boolean;
}) {
  const { user, login, signup } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (user)
    return (
      <Navigate to={user.organisationId ? "/" : "/organisation"} replace />
    );
  return (
    <AuthLayout>
      <nav className="auth-switch" aria-label="Accès au compte">
        <Link
          to="/login"
          aria-current={!signupMode ? "page" : undefined}
          onClick={() => setError("")}
        >
          Se connecter
        </Link>
        <Link
          to="/signup"
          aria-current={signupMode ? "page" : undefined}
          onClick={() => setError("")}
        >
          Créer un compte
        </Link>
      </nav>
      <div className="auth-heading">
        <span className="auth-kicker">
          {signupMode ? "BIENVENUE CHEZ PRÉSENCE" : "VOTRE ESPACE VOUS ATTEND"}
        </span>
        <h2>
          {signupMode ? "Faisons connaissance." : "Heureux de vous retrouver."}
        </h2>
        <p>
          {signupMode
            ? "Créez votre compte, puis retrouvez votre organisation."
            : "Connectez-vous pour retrouver votre équipe."}
        </p>
      </div>
      <form
        className="auth-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setError("");
          setBusy(true);
          try {
            if (signupMode) await signup({ nom, prenom, email, password });
            else await login(email, password);
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          {signupMode && (
            <div className="auth-name-row">
              <label>
                Prénom
                <input
                  autoComplete="given-name"
                  value={prenom}
                  onChange={(e) => setPrenom(e.target.value)}
                  required
                  maxLength={100}
                  placeholder="Votre prénom"
                />
              </label>
              <label>
                Nom
                <input
                  autoComplete="family-name"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  required
                  maxLength={100}
                  placeholder="Votre nom"
                />
              </label>
            </div>
          )}
          <label>
            Adresse email
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              maxLength={254}
              placeholder="vous@organisation.mg"
            />
          </label>
          <label>
            Mot de passe
            <span className="auth-password">
              <input
                type={show ? "text" : "password"}
                autoComplete={signupMode ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={signupMode ? 12 : undefined}
                maxLength={128}
                aria-describedby={signupMode ? "password-hint" : undefined}
                placeholder={
                  signupMode ? "12 caractères minimum" : "Votre mot de passe"
                }
              />
              <button
                type="button"
                aria-label={
                  show ? "Masquer le mot de passe" : "Afficher le mot de passe"
                }
                onClick={() => setShow(!show)}
              >
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>
          {signupMode && (
            <small id="password-hint">
              Utilisez au moins 12 caractères pour protéger votre compte.
            </small>
          )}
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          <button className="auth-primary" type="submit">
            {busy
              ? "Un instant…"
              : signupMode
                ? "Créer mon compte"
                : "Se connecter"}
            <ArrowRight size={18} />
          </button>
        </fieldset>
      </form>
      <p className="auth-reassurance">
        <LockKeyhole size={16} /> Un accès personnel à votre espace d’équipe.
      </p>
      <p className="auth-alternate">
        {signupMode
          ? "Vous avez déjà un compte ?"
          : "Vous découvrez Présence ?"}{" "}
        <Link
          to={signupMode ? "/login" : "/signup"}
          onClick={() => setError("")}
        >
          {signupMode ? "Se connecter" : "Créer un compte"}
        </Link>
      </p>
    </AuthLayout>
  );
}
