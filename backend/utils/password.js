import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

const deriveKey = promisify(scrypt);

// Format partagé entre création de compte et inscription d'organisation.
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = await deriveKey(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
  return `scrypt$131072$8$1$${salt}$${key.toString("hex")}`;
}
