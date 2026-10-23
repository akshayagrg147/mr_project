import { Store } from "../apps/api/src/db.ts";
import { hashPassword } from "../apps/api/src/auth.ts";
import { defaultPolicies } from "../packages/shared/src/index.ts";
import { randomUUID } from "node:crypto";
const { COMPANY_CODE, COMPANY_NAME, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } =
  process.env;
if (
  !COMPANY_CODE ||
  !COMPANY_NAME ||
  !ADMIN_NAME ||
  !ADMIN_EMAIL ||
  !ADMIN_PASSWORD ||
  ADMIN_PASSWORD.length < 16
)
  throw new Error(
    "Set COMPANY_CODE, COMPANY_NAME, ADMIN_NAME, ADMIN_EMAIL and a 16+ character ADMIN_PASSWORD via your secret manager or shell environment.",
  );
if (!/^[A-Z0-9_-]{2,40}$/.test(COMPANY_CODE) || !ADMIN_EMAIL.includes("@"))
  throw new Error("Invalid company code or email.");
const s = new Store(process.env.DATABASE_PATH || ".data/mr-connect.sqlite");
const hash = await hashPassword(ADMIN_PASSWORD);
s.transaction(() => {
  const tenant = randomUUID(),
    user = randomUUID();
  s.run(
    "INSERT INTO tenants VALUES(?,?,?,?)",
    tenant,
    COMPANY_CODE,
    COMPANY_NAME,
    JSON.stringify(defaultPolicies),
  );
  s.run(
    "INSERT INTO users(id,tenant_id,email,name,role,password_hash) VALUES(?,?,?,?,?,?)",
    user,
    tenant,
    ADMIN_EMAIL.toLowerCase(),
    ADMIN_NAME,
    "admin",
    hash,
  );
});
s.close();
console.log(
  "Company and administrator created. No demonstration records were added.",
);
