import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Database, User, Settings } from "../types";
import { settingsApi, mapSettings } from "../services/settings";
import { readDb, writeDb, setStoreScope, getStoreKey } from "../services/store";
import { loadDatabase } from "../services/loadDatabase";
import { apiClient } from "../services/api";
import { loadPersonnel } from "../services/personnel";
import {
  toUser,
  type Account,
  type Organisation,
  type Signup,
} from "../services/auth";
import { BootstrapSkeleton } from "../components/Skeleton";
import { Toaster, type ToastNotification } from "../components/Toaster";
type Context = {
  db: Database;
  refreshPersonnel: () => Promise<void>;
  saveSettings: (settings: Settings) => Promise<void>;
  schedulesConfigured: boolean;
  personnelLoading: boolean;
  personnelError: string | null;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (body: Signup) => Promise<void>;
  organisation: Organisation | null;
  completeOrganisation: (body: {
    user: Account;
    organisation: Organisation;
  }) => void;
  logout: () => void;
  update: (fn: (db: Database) => void) => void;
  notify: (message: string, error?: boolean) => void;
  audit: (db: Database, id: string, action: string, reason: string) => void;
};
const AppContext = createContext<Context | null>(null);
export function AppProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const {
    data: db,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["database"],
    queryFn: loadDatabase,
    staleTime: Infinity,
  });
  const [user, setUser] = useState<User | null>(null);
  const [organisation, setOrganisation] = useState<Organisation | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const personnelKey = ["personnel", user?.organisationId, user?.id];
  const personnel = useQuery({
    queryKey: personnelKey,
    queryFn: loadPersonnel,
    enabled: Boolean(user?.organisationId),
  });
  const refreshPersonnel = async () => {
    await client.invalidateQueries({ queryKey: personnelKey });
  };
  const saveSettings = async (settings: Settings) => {
    const result = await settingsApi.save(settings);
    client.setQueryData<Awaited<ReturnType<typeof loadPersonnel>>>(
      personnelKey,
      (previous) =>
        previous
          ? {
              ...previous,
              settings: mapSettings(result),
              organisation: result.organisation,
              schedulesConfigured: true,
            }
          : previous,
    );
    setOrganisation(result.organisation);
  };
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, error = false) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newToast: ToastNotification = {
        id,
        message,
        error: Boolean(error),
        createdAt: Date.now(),
      };
      setToasts((prev) => [...prev.slice(-2), newToast]);
      const timer = setTimeout(() => {
        dismissToast(id);
      }, 4500);
      timersRef.current.set(id, timer);
    },
    [dismissToast],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === getStoreKey())
        client.setQueryData(["database"], readDb());
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [client]);
  const update = (fn: (db: Database) => void) => {
    const next = structuredClone(readDb());
    // Les écrans locaux de présence et les archives utilisent le référentiel serveur.
    next.agents = structuredClone(personnel.data?.agents ?? []);
    next.departments = structuredClone(personnel.data?.departments ?? []);
    if (personnel.data)
      next.settings = structuredClone(personnel.data.settings);
    fn(next);
    writeDb(next);
    client.setQueryData(["database"], next);
    if (user) {
      const current = next.users.find((u) => u.id === user.id);
      if (
        current &&
        (current.name !== user.name ||
          current.email !== user.email ||
          current.role !== user.role ||
          current.isActive !== user.isActive)
      ) {
        setUser(current);
      }
    }
  };
  const acceptAccount = useCallback(
    (account: Account, org: Organisation | null = null) => {
      const mapped = toUser(account);
      setStoreScope(mapped.organisationId ?? null);
      const local = readDb();
      local.users = [
        mapped,
        ...local.users.filter((item) => item.id !== mapped.id),
      ];
      if (org) {
        local.settings.organization = org.nom;
        local.settings.address = org.adresse ?? "";
      }
      writeDb(local);
      client.setQueryData(["database"], local);
      setOrganisation(org);
      setUser(mapped);
    },
    [client],
  );
  const loadAccount = useCallback(
    async (account: Account) => {
      const org = account.organisation_id
        ? (
            await apiClient.get<{ organisation: Organisation }>(
              "/organisations/me",
            )
          ).organisation
        : null;
      acceptAccount(account, org);
    },
    [acceptAccount],
  );
  useEffect(() => {
    let active = true;
    apiClient.setUnauthorizedHandler(() => {
      setUser(null);
      setOrganisation(null);
    });
    void apiClient
      .get<{ user: Account }>("/auth/me")
      .then(async (result) => {
        if (active) await loadAccount(result.user);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setAuthLoading(false);
      });
    return () => {
      active = false;
      apiClient.setUnauthorizedHandler(() => {});
    };
  }, [loadAccount]);
  const login = async (email: string, password: string) => {
    const result = await apiClient.post<{ user: Account }>("/auth/login", {
      email,
      password,
    });
    await loadAccount(result.user);
  };
  const signup = async (body: Signup) => {
    const result = await apiClient.post<{ user: Account }>(
      "/auth/signup",
      body,
    );
    acceptAccount(result.user);
  };
  const completeOrganisation = (body: {
    user: Account;
    organisation: Organisation;
  }) => acceptAccount(body.user, body.organisation);
  const logout = () => {
    void apiClient
      .post("/auth/logout", {})
      .then(() => {
        setUser(null);
        setOrganisation(null);
        setStoreScope(null);
        client.setQueryData(["database"], readDb());
      })
      .catch((error) => notify((error as Error).message, true));
  };
  const audit = (
    data: Database,
    id: string,
    action: string,
    reason: string,
  ) => {
    data.audit.unshift({
      id: crypto.randomUUID(),
      entityId: id,
      actor: user?.name || "",
      action,
      reason,
      at: new Date().toISOString(),
    });
  };
  if (isError && !db)
    return (
      <div className="error-page">
        <h1>Données indisponibles</h1>
        <p>Le chargement a échoué. Réessayez pour retrouver votre espace.</p>
        <button className="button primary" onClick={() => void refetch()}>
          Réessayer
        </button>
      </div>
    );
  if (!db || authLoading) return <BootstrapSkeleton authenticated={false} />;
  return (
    <AppContext.Provider
      value={{
        db: {
          ...db,
          agents: personnel.data?.agents ?? [],
          departments: personnel.data?.departments ?? [],
          settings: personnel.data?.settings ?? db.settings,
        },
        refreshPersonnel,
        saveSettings,
        schedulesConfigured: personnel.data?.schedulesConfigured ?? false,
        personnelLoading: Boolean(user?.organisationId) && personnel.isPending,
        personnelError: personnel.isError ? personnel.error.message : null,
        user,
        organisation: personnel.data?.organisation ?? organisation,
        login,
        signup,
        completeOrganisation,
        logout,
        update,
        notify,
        audit,
      }}
    >
      {children}
      {createPortal(
        <Toaster toasts={toasts} onDismiss={dismissToast} />,
        document.body,
      )}
    </AppContext.Provider>
  );
}
// The context hook intentionally shares the provider module.
// oxlint-disable-next-line react/only-export-components
export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("AppProvider manquant");
  return value;
}
