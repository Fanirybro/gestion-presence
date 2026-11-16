import { useState, useEffect, useCallback, useRef } from "react";
import { authApi } from "../../services/auth";

const lockKeyboard = async () => {
  try {
    const nav = navigator as any;
    if ("keyboard" in nav && typeof nav.keyboard?.lock === "function") {
      // Bloque Escape, F11 et autres touches spéciales au niveau navigateur (Chromium)
      await nav.keyboard.lock(["Escape", "F11"]);
    }
  } catch {
    // Si l'API Keyboard Lock n'est pas supportée ou refusée, le gestionnaire keydown prend le relais
  }
};

const unlockKeyboard = () => {
  try {
    const nav = navigator as any;
    if ("keyboard" in nav && typeof nav.keyboard?.unlock === "function") {
      nav.keyboard.unlock();
    }
  } catch {
    // ignore
  }
};

export function useKioskMode() {
  const [isKiosk, setIsKiosk] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [exitError, setExitError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  const isKioskRef = useRef(isKiosk);
  isKioskRef.current = isKiosk;

  const showExitModalRef = useRef(showExitModal);
  showExitModalRef.current = showExitModal;

  // Demande d'extinction du switch -> ouverture de la modale de sécurité
  const requestExitKiosk = useCallback(() => {
    setExitError("");
    setShowExitModal(true);
  }, []);

  // Activation du mode borne
  const enterKiosk = useCallback(async () => {
    setIsKiosk(true);
    document.body.classList.add("kiosk-mode-active");
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // En cas de refus ou restriction du navigateur, le mode borne CSS reste actif
    }
    await lockKeyboard();
  }, []);

  // Fermer la modale sans quitter le mode borne (annuler)
  const cancelExit = useCallback(() => {
    setShowExitModal(false);
    setExitError("");
    // Si le plein écran a été perdu, le restaurer
    if (isKioskRef.current && !document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen()
        .then(() => lockKeyboard())
        .catch(() => {});
    }
  }, []);

  // Switch toggle handler
  const toggleKiosk = useCallback(() => {
    if (isKiosk) {
      requestExitKiosk();
    } else {
      enterKiosk();
    }
  }, [isKiosk, enterKiosk, requestExitKiosk]);

  // Validation du mot de passe pour sortie définitive
  const confirmExitWithPassword = useCallback(async (password: string) => {
    if (!password || !password.trim()) {
      setExitError("Veuillez saisir votre mot de passe.");
      return false;
    }

    setIsVerifying(true);
    setExitError("");

    try {
      await authApi.verifyPassword(password);
      // Succès : désactivation du mode borne
      setIsKiosk(false);
      setShowExitModal(false);
      document.body.classList.remove("kiosk-mode-active");
      unlockKeyboard();

      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      return true;
    } catch (err: any) {
      setExitError(err?.message || "Mot de passe incorrect.");
      return false;
    } finally {
      setIsVerifying(false);
    }
  }, []);

  useEffect(() => {
    // 1. Interception globale de toutes les touches pouvant quitter le mode plein écran
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isKioskRef.current) return;

      // Touche F11 (bascule plein écran Windows/navigateur)
      if (e.key === "F11" || e.code === "F11") {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Touche Échap (Escape)
      if (e.key === "Escape" || e.code === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        // Si la modale est déjà ouverte, Échap referme la modale en restant dans le mode borne
        // Si la modale n'est pas ouverte, Échap déclenche la vérification du mot de passe
        if (showExitModalRef.current) {
          cancelExit();
        } else {
          requestExitKiosk();
        }
        return;
      }

      // Raccourcis de navigation et rechargement accidentels
      // F5, Ctrl+R, Ctrl+Shift+R, Alt+Flèche gauche/droite
      if (
        e.key === "F5" ||
        e.code === "F5" ||
        ((e.ctrlKey || e.metaKey) && (e.key === "r" || e.key === "R")) ||
        (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home"))
      ) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    };

    // 2. Gestionnaire d'événement de changement de plein écran
    const handleFullscreenChange = () => {
      if (isKioskRef.current) {
        if (!document.fullscreenElement) {
          // Si le plein écran a été quitté de force par le système,
          // on verrouille l'interface avec la modale de mot de passe et on retente le plein écran
          setShowExitModal(true);
          if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen()
              .then(() => lockKeyboard())
              .catch(() => {});
          }
        } else {
          // Plein écran actif -> reverrouillage clavier
          lockKeyboard();
        }
      }
    };

    // 3. Empêcher le menu contextuel (clic droit) en mode borne
    const handleContextMenu = (e: MouseEvent) => {
      if (isKioskRef.current) {
        e.preventDefault();
      }
    };

    // 4. Avertissement si tentative de fermeture d'onglet/fenêtre
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isKioskRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    window.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      window.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.body.classList.remove("kiosk-mode-active");
      unlockKeyboard();
    };
  }, [cancelExit, requestExitKiosk]);

  return {
    isKiosk,
    showExitModal,
    exitError,
    isVerifying,
    toggleKiosk,
    enterKiosk,
    requestExitKiosk,
    cancelExit,
    confirmExitWithPassword,
  };
}
