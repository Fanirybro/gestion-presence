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
  const key = `presence-ui-mode.v1.${user!.id}`;
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
        simple: user?.role === "SECRETARY" && mode === "simple",
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
      className="secretary-mode"
      role="group"
      aria-label="Mode d’utilisation"
    >
      <div>
        <button
          type="button"
          aria-pressed={simple}
          onClick={() => setMode("simple")}
        >
          Simple
        </button>
        <button
          type="button"
          aria-pressed={!simple}
          onClick={() => setMode("expert")}
        >
          Expert
        </button>
      </div>
    </div>
  );
}
