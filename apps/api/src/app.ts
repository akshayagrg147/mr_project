import Fastify, { type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import staticFiles from "@fastify/static";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { z, ZodError } from "zod";
import { Store } from "./db.ts";
import { Service, now, today } from "./service.ts";
import { Tracking } from "./tracking.ts";
import { csv, report, reportNames } from "./reports.ts";
import {
  assert,
  hashPassword,
  HttpError,
  newToken,
  publicUser,
  tokenHash,
  verifyPassword,
} from "./auth.ts";
import {
  defaultPolicies,
  moduleByKey,
  modules,
  type User,
} from "../../../packages/shared/src/index.ts";
declare module "fastify" {
  interface FastifyRequest {
    user: User;
    sessionHash: string;
  }
}
export async function buildApp(
  options: {
    databasePath?: string;
    uploads?: string;
    logger?: boolean;
    serveWeb?: boolean;
  } = {},
) {
  const store = new Store(
    options.databasePath ||
      process.env.DATABASE_PATH ||
      ".data/mr-connect.sqlite",
  );
  const service = new Service(store),
    tracking = new Tracking(service);
  const uploadDir = resolve(
    options.uploads || process.env.UPLOAD_DIR || ".data/uploads",
  );
  mkdirSync(uploadDir, { recursive: true });
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 1024 * 1024,
    trustProxy: process.env.TRUST_PROXY === "1",
  });
  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https://*.tile.openstreetmap.org"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  });
  await app.register(rateLimit, {
    global: true,
    max: 600,
    timeWindow: "1 minute",
    allowList: (request) => !request.url.startsWith("/api"),
  });
  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 2 },
  });
  const origins = (
    process.env.APP_ORIGINS ||
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4000,http://127.0.0.1:4000"
  ).split(",");
  const unsafe = (r: FastifyRequest) =>
    !["GET", "HEAD", "OPTIONS"].includes(r.method);
  app.addHook("onRequest", async (r, reply) => {
    if (!r.url.startsWith("/api")) return;
    reply.header("Cache-Control", "no-store");
    if (unsafe(r) && r.headers.origin)
      assert(
        origins.includes(r.headers.origin),
        403,
        "Request origin is not allowed",
      );
    if (
      ["/api/health", "/api/auth/login", "/api/auth/access-help"].includes(
        r.url.split("?")[0],
      )
    )
      return;
    const bearer = r.headers.authorization?.startsWith("Bearer ")
      ? r.headers.authorization.slice(7)
      : undefined;
    const token = bearer || r.cookies.mr_session;
    assert(token, 401, "Sign in to continue", "SESSION_EXPIRED");
    if (!bearer && unsafe(r))
      assert(
        !!r.headers.origin && origins.includes(r.headers.origin),
        403,
        "A trusted request origin is required",
      );
    const hash = tokenHash(token);
    const session = store.get(
      "SELECT u.*,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=?",
      hash,
    );
    assert(
      session && session.active && session.expires_at > now(),
      401,
      "Your session expired. Sign in again",
      "SESSION_EXPIRED",
    );
    r.user = publicUser(session);
    r.sessionHash = hash;
    if (
      r.user.mustChangePassword &&
      !["/api/auth/me", "/api/auth/password", "/api/auth/logout"].includes(
        r.url.split("?")[0],
      )
    )
      throw new HttpError(
        403,
        "Change your temporary password first",
        "PASSWORD_CHANGE_REQUIRED",
      );
  });
  app.setErrorHandler((error, r, reply) => {
    if (error instanceof ZodError)
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
      });
    if (error instanceof HttpError)
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      });
    if ((error as Error).message?.includes("UNIQUE constraint failed"))
      return reply.code(409).send({
        error: {
          code: "DUPLICATE_RECORD",
          message: "A record already exists for this date or identifier",
        },
      });
    const status = (error as any).statusCode;
    if (status && status < 500)
      return reply.code(status).send({
        error: { code: "INVALID_REQUEST", message: (error as Error).message },
      });
    r.log.error(error);
    return reply.code(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message:
          "The request could not be completed. Try again or contact support.",
      },
    });
  });
  const mutate = (r: FastifyRequest, fn: () => any) =>
    service.idempotent(
      r.user,
      r.headers["idempotency-key"] as string | undefined,
      { method: r.method, path: r.url, body: r.body },
      fn,
    );
  const id = (r: FastifyRequest) => (r.params as any).id as string;
  app.get("/api/health", async () => ({
    status: "ok",
    version: "0.1.0",
    database: !!store.get("SELECT 1 AS ok").ok,
  }));
  app.post(
    "/api/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (r, reply) => {
      const b = z
        .object({
          companyCode: z.string().trim().min(1).max(40),
          email: z.string().trim().min(1).max(254),
          password: z.string().min(1).max(256),
          client: z.enum(["web", "android"]).optional(),
        })
        .parse(r.body);
      const user = store.get(
        "SELECT u.* FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE upper(t.code)=? AND lower(u.email)=?",
        b.companyCode.toUpperCase(),
        b.email.toLowerCase(),
      );
      const valid = await verifyPassword(
        b.password,
        user?.password_hash ||
          "00000000000000000000000000000000:" + "00".repeat(64),
      );
      assert(
        user && user.active && valid,
        401,
        "Company code, user ID or password is incorrect",
      );
      const token = newToken(),
        hash = tokenHash(token),
        expires = new Date(Date.now() + 12 * 3600000).toISOString();
      store.transaction(() => {
        store.run("DELETE FROM sessions WHERE expires_at<?", now());
        store.run(
          "INSERT INTO sessions VALUES(?,?,?,?)",
          hash,
          user.id,
          expires,
          now(),
        );
        service.audit(publicUser(user), "session.created", user.id);
      });
      reply.setCookie("mr_session", token, {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 12 * 3600,
      });
      return {
        user: publicUser(user),
        expiresAt: expires,
        ...(b.client === "android" ? { token } : {}),
      };
    },
  );
  app.post(
    "/api/auth/access-help",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (r) => {
      z.object({
        companyCode: z.string().max(40),
        email: z.string().max(254),
      }).parse(r.body);
      return {
        message:
          "Contact your company administrator to verify your identity and reset access. Automated email is not configured.",
      };
    },
  );
  app.get("/api/auth/me", async (r) => ({ user: r.user }));
  app.post("/api/auth/logout", async (r, reply) => {
    store.run("DELETE FROM sessions WHERE hash=?", r.sessionHash);
    reply.clearCookie("mr_session", { path: "/" });
    return { ok: true };
  });
  app.post("/api/auth/password", async (r, reply) => {
    const b = z
      .object({
        currentPassword: z.string().max(256),
        newPassword: z.string().min(12).max(256),
      })
      .parse(r.body);
    const u = store.get("SELECT * FROM users WHERE id=?", r.user.id);
    assert(
      await verifyPassword(b.currentPassword, u.password_hash),
      400,
      "Current password is incorrect",
    );
    const hash = await hashPassword(b.newPassword);
    store.transaction(() => {
      store.run(
        "UPDATE users SET password_hash=?,must_change=0,version=version+1 WHERE id=?",
        hash,
        r.user.id,
      );
      store.run("DELETE FROM sessions WHERE user_id=?", r.user.id);
      service.audit(r.user, "password.changed", r.user.id);
    });
    reply.clearCookie("mr_session", { path: "/" });
    return { ok: true, message: "Password changed. Sign in again." };
  });
  app.get("/api/catalog", async (r) => ({
    modules: modules.filter((m) => !m.adminOnly || r.user.role === "admin"),
    policies: service.policies(r.user),
    reportNames: reportNames.filter(
      (n) => n !== "audit" || r.user.role === "admin",
    ),
  }));
  app.get("/api/bootstrap", async (r) => ({
    user: r.user,
    company: store.get(
      "SELECT code,name FROM tenants WHERE id=?",
      r.user.tenantId,
    ),
    policies: service.policies(r.user),
    modules: modules.filter((m) => !m.adminOnly || r.user.role === "admin"),
    users: service.users(r.user),
    records: Object.fromEntries(
      modules
        .filter((m) => !m.adminOnly || r.user.role === "admin")
        .map((m) => [m.key, service.list(r.user, m.key)]),
    ),
    inventory: service.inventory(r.user),
    activeShift:
      store.get(
        "SELECT * FROM shifts WHERE user_id=? AND ended_at IS NULL",
        r.user.id,
      ) || null,
  }));
  app.get("/api/users", async (r) => ({ items: service.users(r.user) }));
  const userBody = z
    .object({
      name: z.string().trim().min(2).max(100),
      email: z.email().max(254),
      role: z.enum(["admin", "manager", "rep"]),
      managerId: z.string().nullable(),
      territoryId: z.string().nullable(),
      active: z.boolean(),
      password: z.string().min(12).max(256).optional(),
      version: z.number().int().optional(),
    })
    .strict();
  async function saveUser(r: FastifyRequest, creating: boolean) {
    assert(r.user.role === "admin", 403, "Administrator access required");
    const b = userBody.parse(r.body);
    const uid = creating ? randomUUID() : id(r);
    let current: any;
    if (!creating) {
      current = store.get(
        "SELECT * FROM users WHERE id=? AND tenant_id=?",
        uid,
        r.user.tenantId,
      );
      assert(current, 404, "Employee not found");
      assert(
        current.version === b.version,
        409,
        "Employee changed. Reload first",
        "VERSION_CONFLICT",
      );
      if (uid === r.user.id)
        assert(
          b.active && b.role === "admin",
          409,
          "You cannot disable or demote your own account",
        );
    }
    if (b.managerId) {
      const m = store.get(
        "SELECT * FROM users WHERE id=? AND tenant_id=? AND active=1",
        b.managerId,
        r.user.tenantId,
      );
      assert(m && m.role !== "rep", 400, "Choose an active manager");
      let ancestor = m;
      const seen = new Set<string>([uid]);
      while (ancestor) {
        assert(
          !seen.has(ancestor.id),
          400,
          "Employee hierarchy cannot contain a cycle",
        );
        seen.add(ancestor.id);
        ancestor = ancestor.manager_id
          ? store.get("SELECT * FROM users WHERE id=?", ancestor.manager_id)
          : null;
      }
    }
    if (b.territoryId)
      assert(
        service.record(r.user, b.territoryId).kind === "territory",
        400,
        "Invalid territory",
      );
    if (creating) assert(b.password, 400, "An initial password is required");
    const hash = b.password
      ? await hashPassword(b.password)
      : current.password_hash;
    return store.transaction(() => {
      if (creating)
        store.run(
          "INSERT INTO users(id,tenant_id,email,name,role,manager_id,territory_id,password_hash,active,must_change) VALUES(?,?,?,?,?,?,?,?,?,1)",
          uid,
          r.user.tenantId,
          b.email.toLowerCase(),
          b.name,
          b.role,
          b.managerId,
          b.territoryId,
          hash,
          Number(b.active),
        );
      else {
        store.run(
          "UPDATE users SET email=?,name=?,role=?,manager_id=?,territory_id=?,password_hash=?,active=?,must_change=?,version=version+1 WHERE id=?",
          b.email.toLowerCase(),
          b.name,
          b.role,
          b.managerId,
          b.territoryId,
          hash,
          Number(b.active),
          b.password ? 1 : current.must_change,
          uid,
        );
        if (b.password || !b.active || b.role !== current.role)
          store.run("DELETE FROM sessions WHERE user_id=?", uid);
      }
      service.audit(
        r.user,
        creating ? "employee.created" : "employee.updated",
        uid,
        { role: b.role, active: b.active },
      );
      return {
        ...publicUser(store.get("SELECT * FROM users WHERE id=?", uid)),
        version: creating ? 1 : current.version + 1,
      };
    });
  }
  app.post("/api/users", async (r) => saveUser(r, true));
  app.put("/api/users/:id", async (r) => saveUser(r, false));
  app.post("/api/import/customers", async (r) =>
    mutate(r, () => {
      const b = z
        .object({
          rows: z.array(z.record(z.string(), z.unknown())).min(1).max(1000),
        })
        .parse(r.body);
      return {
        items: b.rows.map((row, i) => {
          try {
            return service.create(r.user, "customer", row);
          } catch (e) {
            throw new HttpError(
              (e as any).statusCode || 400,
              "Row " + (i + 2) + ": " + (e as Error).message,
            );
          }
        }),
      };
    }),
  );
  app.get("/api/records/:kind", async (r) => ({
    items: service.list(r.user, (r.params as any).kind, r.query as any),
  }));
  app.get("/api/record/:id", async (r) => ({
    item: service.record(r.user, id(r)),
  }));
  app.post("/api/records/:kind", async (r) =>
    mutate(r, () => {
      const b = r.body as any;
      return service.create(
        r.user,
        (r.params as any).kind,
        b.data ?? b,
        b.ownerId ?? r.user.id,
      );
    }),
  );
  app.put("/api/record/:id", async (r) =>
    mutate(r, () => {
      const b = z
        .object({
          data: z.record(z.string(), z.unknown()),
          version: z.number().int(),
        })
        .parse(r.body);
      return service.update(r.user, id(r), b.data, b.version);
    }),
  );
  app.delete("/api/record/:id", async (r) =>
    mutate(r, () =>
      service.remove(
        r.user,
        id(r),
        z.object({ version: z.number().int() }).parse(r.body).version,
      ),
    ),
  );
  app.post("/api/record/:id/submit", async (r) =>
    mutate(r, () =>
      service.submit(
        r.user,
        id(r),
        z.object({ version: z.number().int() }).parse(r.body).version,
      ),
    ),
  );
  app.post("/api/record/:id/decision", async (r) =>
    mutate(r, () => {
      const b = z
        .object({
          version: z.number().int(),
          action: z.enum(["approve", "return", "reject"]),
          reason: z.string().max(2000).default(""),
        })
        .parse(r.body);
      return service.decide(r.user, id(r), b.action, b.reason, b.version);
    }),
  );
  app.post("/api/record/:id/acknowledge", async (r) =>
    mutate(r, () => {
      const b = z
        .object({
          version: z.number().int(),
          receivedQty: z.number().int(),
          notes: z.string().max(2000).default(""),
        })
        .parse(r.body);
      return service.acknowledge(
        r.user,
        id(r),
        b.version,
        b.receivedQty,
        b.notes,
      );
    }),
  );
  app.post("/api/visits", async (r) =>
    mutate(r, () => service.visit(r.user, r.body)),
  );
  app.post("/api/dcr", async (r) =>
    mutate(r, () => {
      const b = z
        .object({ date: z.string(), remarks: z.string().max(5000).default("") })
        .parse(r.body);
      return service.dcr(r.user, b.date, b.remarks);
    }),
  );
  app.get("/api/approvals", async (r) => ({
    items: service.approvals(r.user),
  }));
  app.get("/api/inventory", async (r) => ({
    items: service.inventory(r.user),
  }));
  app.get("/api/dashboard", async (r) =>
    service.dashboard(r.user, r.query as any),
  );
  app.get("/api/tracking", async (r) => ({
    items: tracking.overview(r.user, (r.query as any).date || today()),
  }));
  app.get("/api/tracking/:id", async (r) =>
    tracking.view(r.user, id(r), (r.query as any).date || today()),
  );
  app.get("/api/shifts/active", async (r) => ({
    shift:
      store.get(
        "SELECT * FROM shifts WHERE tenant_id=? AND user_id=? AND ended_at IS NULL",
        r.user.tenantId,
        r.user.id,
      ) ?? null,
  }));
  app.post("/api/shifts/start", async (r) =>
    mutate(r, () =>
      (() => {
        const b = z
          .object({
            deviceId: z.string(),
            startedAt: z.iso.datetime().optional(),
          })
          .parse(r.body);
        return tracking.start(r.user, b.deviceId, b.startedAt);
      })(),
    ),
  );
  app.post("/api/shifts/:id/end", async (r) =>
    mutate(r, () =>
      tracking.end(
        r.user,
        id(r),
        z.object({ endedAt: z.iso.datetime().optional() }).parse(r.body ?? {})
          .endedAt,
      ),
    ),
  );
  app.post("/api/shifts/:id/points", async (r) =>
    mutate(r, () => tracking.points(r.user, id(r), (r.body as any)?.points)),
  );
  app.post("/api/shifts/:id/events", async (r) =>
    mutate(r, () => {
      const b = z
        .object({ event: z.string(), observedAt: z.iso.datetime() })
        .parse(r.body);
      return tracking.event(r.user, id(r), b.event, b.observedAt);
    }),
  );
  app.get("/api/reports/:type", async (r, reply) => {
    const type = (r.params as any).type;
    assert(reportNames.includes(type), 404, "Report not found");
    if (type === "audit")
      assert(r.user.role === "admin", 403, "Administrator access required");
    const rows = report(service, r.user, type, r.query as any)!;
    if ((r.query as any).format === "csv")
      return reply
        .header(
          "Content-Disposition",
          `attachment; filename="mr-connect-${type}.csv"`,
        )
        .type("text/csv; charset=utf-8")
        .send(csv(rows));
    return { items: rows };
  });
  app.get("/api/policies", async (r) => ({
    policies: service.policies(r.user),
  }));
  app.put("/api/policies", async (r) => {
    assert(r.user.role === "admin", 403, "Administrator access required");
    const shape: any = {};
    for (const key of Object.keys(defaultPolicies)) {
      shape[key] = z
        .number()
        .min(key === "taPerKm" ? 0 : 1)
        .max(key === "retentionDays" ? 3650 : 100000);
    }
    const p = z.object(shape).strict().parse(r.body) as Record<string, number>;
    assert(
      p.trackingIntervalSeconds >= 15 && p.trackingIntervalSeconds <= 900,
      400,
      "Tracking interval must be 15–900 seconds",
    );
    return mutate(r, () => {
      store.run(
        "UPDATE tenants SET policies=? WHERE id=?",
        JSON.stringify(p),
        r.user.tenantId,
      );
      service.audit(r.user, "policies.updated", r.user.tenantId, p);
      return { policies: p };
    });
  });
  app.get("/api/integrations", async (r) => {
    assert(r.user.role === "admin", 403, "Administrator access required");
    return {
      items: [
        {
          name: "ERP",
          status: "Not configured",
          description:
            "Provide the ERP API contract and sandbox credentials to enable exchange.",
        },
        {
          name: "Email / SMS",
          status: "Not configured",
          description:
            "Access resets are performed by the company administrator.",
        },
        {
          name: "Push notifications",
          status: "Not configured",
          description:
            "In-app updates and pull sync are active. FCM credentials are required for remote push.",
        },
      ],
    };
  });
  app.post("/api/attachments", async (r) => {
    const part = await r.file();
    assert(part, 400, "Choose a file");
    const buffer = await part.toBuffer();
    let mime = "";
    if (buffer.subarray(0, 5).toString() === "%PDF-") mime = "application/pdf";
    if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255)
      mime = "image/jpeg";
    if (
      buffer
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      mime = "image/png";
    assert(mime, 400, "Only PDF, JPEG and PNG files are supported");
    const aid = randomUUID(),
      path = join(uploadDir, aid);
    writeFileSync(path, buffer, { mode: 0o600 });
    try {
      store.run(
        "INSERT INTO attachments VALUES(?,?,?,?,?,?,?,?)",
        aid,
        r.user.tenantId,
        r.user.id,
        part.filename.replace(/[^\w. -]/g, "_").slice(0, 100),
        mime,
        path,
        buffer.length,
        now(),
      );
      service.audit(r.user, "attachment.uploaded", aid);
    } catch (e) {
      unlinkSync(path);
      throw e;
    }
    return { id: aid, name: part.filename, mime, size: buffer.length };
  });
  app.get("/api/attachments/:id", async (r, reply) => {
    const a = store.get(
      "SELECT * FROM attachments WHERE id=? AND tenant_id=?",
      id(r),
      r.user.tenantId,
    );
    const referenced =
      a &&
      store
        .all(
          "SELECT * FROM records WHERE tenant_id=? AND deleted=0",
          r.user.tenantId,
        )
        .some(
          (row) =>
            row.kind === "product" &&
            service.visible(r.user, row) &&
            JSON.parse(row.data).contentId === a.id,
        );
    assert(
      a && (service.scope(r.user).includes(a.owner_id) || referenced),
      404,
      "Attachment not found",
    );
    return reply
      .type(a.mime)
      .header("Content-Disposition", `attachment; filename="${a.name}"`)
      .send(createReadStream(a.path));
  });
  const web = resolve("apps/admin/dist");
  if (options.serveWeb !== false && existsSync(web)) {
    await app.register(staticFiles, { root: web });
    app.setNotFoundHandler((r, reply) =>
      r.url.startsWith("/api")
        ? reply.code(404).send({
            error: { code: "NOT_FOUND", message: "Endpoint not found" },
          })
        : reply.type("text/html").send(readFileSync(join(web, "index.html"))),
    );
  }
  app.addHook("onClose", async () => store.close());
  return { app, store, service, tracking };
}
