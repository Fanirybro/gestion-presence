const base = import.meta.env.VITE_API_URL || "/api";
let unauthorized: () => void = () => {};
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      ...init,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    throw new Error(
      "Le serveur est injoignable. Vérifiez votre connexion et réessayez.",
    );
  }
  if (
    response.status === 401 &&
    !["/auth/login", "/auth/signup"].includes(path)
  )
    unauthorized();
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      body.message || `Erreur HTTP ${response.status}`,
      response.status,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  setUnauthorizedHandler: (handler: () => void) => {
    unauthorized = handler;
  },
};
