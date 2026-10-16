import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useApp } from "./context";

type Mode = "simple" | "expert";
const ModeContext = createContext({
  simple: false,
  setMode: (_mode: Mode) => {},
});

export function SecretaryModeProvider({ children }: { children: ReactNode }) {
  const { user, notify } = useApp();
  const key = `presence-ui-mode.v1.${user?.id ?? "default"}`;
  const read = useCallback((): Mode => {
    try {
      return localStorage.getItem(key) === "expert" ? "expert" : "simple";
    } catch {
      return "simple";
    }
  }, [key]);
  const [mode, setValue] = useState<Mode>(read);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === key || event.key === null) setValue(read());
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [key, read]);
  const setMode = (next: Mode) => {
    setValue(next);
    try {
      localStorage.setItem(key, next);
    } catch {
      notify(
        "Le mode est appliqué, mais ne pourra pas être mémorisé dans ce navigateur.",
        true,
      );
    }
  };
  return (
    <ModeContext.Provider
      value={{
        simple: mode === "simple",
        setMode,
      }}
    >
      {children}
    </ModeContext.Provider>
  );
}

// oxlint-disable-next-line react/only-export-components
export const useSecretaryMode = () => useContext(ModeContext);

export function SecretaryModeSelector() {
  const { simple, setMode } = useSecretaryMode();
  return (
    <div
      className="mode-switch-pill"
      role="group"
      aria-label="Mode d’interface"
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: "#e4ece7",
        padding: "3px",
        borderRadius: "8px",
        border: "1px solid #c2d4cb",
        fontSize: "13px",
        fontWeight: 600,
        gap: "2px",
      }}
    >
      <button
        type="button"
        aria-pressed={simple}
        onClick={() => setMode("simple")}
        style={{
          border: "none",
          padding: "6px 12px",
          borderRadius: "6px",
          cursor: "pointer",
          transition: "all 0.15s ease",
          background: simple ? "#227057" : "transparent",
          color: simple ? "#ffffff" : "#45594f",
          boxShadow: simple ? "0 1px 3px rgba(0,0,0,0.15)" : "none",
        }}
      >
        Simple
      </button>
      <button
        type="button"
        aria-pressed={!simple}
        onClick={() => setMode("expert")}
        style={{
          border: "none",
          padding: "6px 12px",
          borderRadius: "6px",
          cursor: "pointer",
          transition: "all 0.15s ease",
          background: !simple ? "#227057" : "transparent",
          color: !simple ? "#ffffff" : "#45594f",
          boxShadow: !simple ? "0 1px 3px rgba(0,0,0,0.15)" : "none",
        }}
      >
        Expert
      </button>
    </div>
  );
}
