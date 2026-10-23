import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import type { User } from "../../../packages/shared/src/index.ts";
const derive = promisify(scrypt);
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await derive(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [salt, key] = encoded.split(":");
  if (!salt || !key) return false;
  const actual = (await derive(password, salt, 64)) as Buffer;
  const expected = Buffer.from(key, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export const publicUser = (row: any): User => ({
  id: row.id,
  tenantId: row.tenant_id,
  name: row.name,
  email: row.email,
  role: row.role,
  managerId: row.manager_id,
  territoryId: row.territory_id,
  active: !!row.active,
  mustChangePassword: !!row.must_change,
});
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code = "REQUEST_FAILED",
    public details?: unknown,
  ) {
    super(message);
  }
}
export function assert(
  condition: unknown,
  status: number,
  message: string,
  code?: string,
): asserts condition {
  if (!condition) throw new HttpError(status, message, code);
}
