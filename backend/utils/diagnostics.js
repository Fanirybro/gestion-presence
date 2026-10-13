import { randomUUID } from "node:crypto";

// Do not log request bodies, SQL parameters, credentials or database error details.
export function errorSummary(error) {
  const codes = [error?.code, error?.cause?.code, ...(error?.errors ?? []).map(item => item.code)].filter(Boolean);
  const timeout = /timeout|timed out/i.test(error?.message ?? "");
  return [...new Set(codes)].join(", ") || (timeout ? "CONNECTION_TIMEOUT" : "ERROR");
}

export function createTrace(scope) {
  const id = randomUUID().slice(0, 8);
  let count = 0;
  return {
    async step(label, action) {
      const prefix = `[${scope} ${id}] Step ${++count}: ${label}`;
      const start = Date.now();
      console.log(`${prefix} — START`);
      try {
        const result = await action();
        console.log(`${prefix} — OK (${Date.now() - start} ms)`);
        return result;
      } catch (error) {
        console.error(`${prefix} — FAIL (${Date.now() - start} ms): ${errorSummary(error)}`);
        throw error;
      }
    },
    result(message) { console.log(`[${scope} ${id}] ${message}`); },
  };
}
