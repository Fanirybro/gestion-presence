import type { ReactNode } from "react";
import { QrCode, ScanLine, Check } from "lucide-react";
import "../pages/auth.css";
export default function AuthLayout({
  children,
  onboarding = false,
}: {
  children: ReactNode;
  onboarding?: boolean;
}) {
  return (
    <main className="auth-shell">
      <aside className="auth-story">
        <a href="/login" className="auth-logo" aria-label="Présence, accueil">
          <QrCode size={28} />
          <span>présence.</span>
        </a>
        <div className="auth-story-main">
          <p className="auth-kicker">LE POINT DE RENCONTRE DE VOTRE ÉQUIPE</p>
          <h1>
            Chaque journée
            <br />
            commence
            <br />
            <em>ensemble.</em>
          </h1>
          <p className="auth-story-copy">
            Un espace commun pour les présences,
            <br />
            les équipes et le quotidien.
          </p>
          <div className="auth-pass" aria-hidden="true">
            <div className="auth-pass-top">
              <span>PRÉSENCE · ESPACE ÉQUIPE</span>
              <ScanLine size={23} />
            </div>
            <div className="auth-pass-middle">
              <span className="auth-pass-avatar">
                <QrCode size={45} />
              </span>
              <div>
                <strong>
                  Une équipe.
                  <br />
                  Un même espace.
                </strong>
                <span>Connectés au quotidien</span>
              </div>
            </div>
            <div className="auth-pass-bottom">
              <span>
                <Check size={14} />{" "}
                {onboarding
                  ? "Votre compte est prêt"
                  : "Votre journée, bien organisée"}
              </span>
              <span>●</span>
            </div>
          </div>
        </div>
        <p className="auth-story-footer">Gestion de présence du personnel</p>
      </aside>
      <section className="auth-panel">
        <div className="auth-panel-inner">{children}</div>
        <footer className="auth-footer">
          Présence · Votre espace de travail partagé
        </footer>
      </section>
    </main>
  );
}
