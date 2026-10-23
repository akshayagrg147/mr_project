import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Service, distanceMeters, now, today } from "./service.ts";
import { assert } from "./auth.ts";
import type { User } from "../../../packages/shared/src/index.ts";
const pointSchema = z
  .object({
    id: z.string().uuid(),
    observedAt: z.iso.datetime(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().min(0).max(10000),
    battery: z.number().int().min(0).max(100).nullable().optional(),
    mocked: z.boolean().default(false),
  })
  .strict();
export class Tracking {
  constructor(private s: Service) {}
  start(u: User, deviceId: string, startedAt = now()) {
    assert(
      !Number.isNaN(Date.parse(startedAt)),
      400,
      "Invalid shift start time",
    );
    startedAt = new Date(startedAt).toISOString();
    assert(
      typeof deviceId === "string" &&
        deviceId.length >= 8 &&
        deviceId.length <= 128,
      400,
      "Invalid device ID",
    );
    const prior = this.s.store.get(
      "SELECT * FROM shifts WHERE tenant_id=? AND user_id=? AND ended_at IS NULL",
      u.tenantId,
      u.id,
    );
    if (prior) {
      assert(
        prior.device_id === deviceId,
        409,
        "A shift is active on another device. End it first",
      );
      return prior;
    }
    assert(
      !Number.isNaN(Date.parse(startedAt)) &&
        Date.parse(startedAt) <= Date.now() + 120000 &&
        Date.now() - Date.parse(startedAt) <= 86400000,
      400,
      "Shift start must be within the last 24 hours",
    );
    const planDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(startedAt));
    assert(
      this.s.list(u, "dayplan", { date: planDate, ownerId: u.id }).length > 0,
      409,
      "Submit today’s day plan before starting tracking",
    );
    const id = randomUUID();
    this.s.store.run(
      "INSERT INTO shifts VALUES(?,?,?,?,NULL,?)",
      id,
      u.tenantId,
      u.id,
      startedAt,
      deviceId,
    );
    this.s.audit(u, "shift.started", id);
    return this.s.store.get("SELECT * FROM shifts WHERE id=?", id);
  }
  shift(u: User, id: string) {
    const row = this.s.store.get(
      "SELECT * FROM shifts WHERE id=? AND tenant_id=? AND user_id=?",
      id,
      u.tenantId,
      u.id,
    );
    assert(row, 404, "Shift not found");
    return row;
  }
  end(u: User, id: string, endedAt = now()) {
    const r = this.shift(u, id);
    assert(!Number.isNaN(Date.parse(endedAt)), 400, "Invalid shift end time");
    endedAt = new Date(endedAt).toISOString();
    assert(
      !Number.isNaN(Date.parse(endedAt)) &&
        Date.parse(endedAt) >= Date.parse(r.started_at) &&
        Date.parse(endedAt) <= Date.now() + 120000,
      400,
      "Invalid shift end time",
    );
    const last = this.s.store.get(
      "SELECT MAX(observed_at) AS time FROM points WHERE shift_id=?",
      id,
    );
    assert(
      !last?.time || Date.parse(endedAt) >= Date.parse(last.time),
      409,
      "Shift end cannot precede uploaded locations",
    );
    if (!r.ended_at) {
      this.s.store.run("UPDATE shifts SET ended_at=? WHERE id=?", endedAt, id);
      this.s.audit(u, "shift.ended", id);
    }
    return this.shift(u, id);
  }
  points(u: User, id: string, input: any) {
    const shift = this.shift(u, id);
    const batch = z.array(pointSchema).min(1).max(500).parse(input);
    let inserted = 0;
    for (const p of batch) {
      p.observedAt = new Date(p.observedAt).toISOString();
      const t = Date.parse(p.observedAt);
      assert(
        t >= Date.parse(shift.started_at) - 5000 &&
          t <= Date.now() + 120000 &&
          (!shift.ended_at || t <= Date.parse(shift.ended_at)),
        400,
        "Location time falls outside the shift",
      );
      assert(
        Date.now() - t <= this.s.policies(u).retentionDays * 86400000,
        400,
        "Location is outside the retention period",
      );
      const old = this.s.store.get(
        "SELECT * FROM points WHERE tenant_id=? AND user_id=? AND id=?",
        u.tenantId,
        u.id,
        p.id,
      );
      if (old) {
        assert(
          old.shift_id === id &&
            old.observed_at === p.observedAt &&
            old.latitude === p.latitude &&
            old.longitude === p.longitude &&
            old.accuracy === p.accuracy &&
            old.mocked === Number(p.mocked),
          409,
          "Location ID was reused with different content",
        );
        continue;
      }
      this.s.store.run(
        "INSERT INTO points VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        p.id,
        u.tenantId,
        u.id,
        id,
        p.observedAt,
        now(),
        p.latitude,
        p.longitude,
        p.accuracy,
        p.battery ?? null,
        Number(p.mocked),
      );
      inserted++;
    }
    return { accepted: batch.length, inserted };
  }
  event(u: User, id: string, event: string, observedAt: string) {
    this.shift(u, id);
    assert(
      [
        "location_disabled",
        "permission_denied",
        "service_started",
        "service_stopped",
        "app_opened",
        "reboot_detected",
      ].includes(event),
      400,
      "Unknown device event",
    );
    assert(
      !Number.isNaN(Date.parse(observedAt)) &&
        Date.parse(observedAt) <= Date.now() + 120000,
      400,
      "Invalid event time",
    );
    this.s.store.run(
      "INSERT INTO device_events VALUES(?,?,?,?,?,?)",
      randomUUID(),
      u.tenantId,
      u.id,
      id,
      event,
      observedAt,
    );
    return { ok: true };
  }
  view(u: User, userId: string, date: string) {
    this.s.user(u, userId);
    assert(/^\d{4}-\d{2}-\d{2}$/.test(date), 400, "Invalid date");
    const from = new Date(date + "T00:00:00+05:30").toISOString(),
      to = new Date(new Date(from).getTime() + 86400000).toISOString();
    const points = this.s.store.all(
      "SELECT * FROM points WHERE tenant_id=? AND user_id=? AND observed_at>=? AND observed_at<? ORDER BY observed_at,id",
      u.tenantId,
      userId,
      from,
      to,
    );
    const maxGap = this.s.policies(u).staleAfterMinutes * 60000;
    const gaps = [];
    let km = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i];
      const duration = Date.parse(b.observed_at) - Date.parse(a.observed_at);
      if (duration > maxGap)
        gaps.push({
          from: a.observed_at,
          to: b.observed_at,
          minutes: Math.round(duration / 60000),
        });
      if (
        !a.mocked &&
        !b.mocked &&
        a.accuracy <= this.s.policies(u).maxAccuracyMeters &&
        b.accuracy <= this.s.policies(u).maxAccuracyMeters &&
        duration <= maxGap
      )
        km +=
          distanceMeters(a.latitude, a.longitude, b.latitude, b.longitude) /
          1000;
    }
    const last = points.at(-1);
    const shift = this.s.store.get(
      "SELECT * FROM shifts WHERE tenant_id=? AND user_id=? AND started_at<? AND (ended_at IS NULL OR ended_at>=?) ORDER BY started_at DESC LIMIT 1",
      u.tenantId,
      userId,
      to,
      from,
    );
    const state = !shift
      ? "not_started"
      : shift.ended_at
        ? "ended"
        : !last
          ? "awaiting_fix"
          : Date.now() - Date.parse(last.observed_at) > maxGap
            ? "stale"
            : "live";
    return {
      userId,
      date,
      points,
      gaps,
      km: Math.round(km * 100) / 100,
      lastFix: last ?? null,
      state,
      shift: shift ?? null,
      events: this.s.store.all(
        "SELECT * FROM device_events WHERE tenant_id=? AND user_id=? AND observed_at>=? AND observed_at<? ORDER BY observed_at",
        u.tenantId,
        userId,
        from,
        to,
      ),
    };
  }
  overview(u: User, date: string) {
    return this.s
      .users(u)
      .filter((x) => x.role === "rep")
      .map((user) => {
        const r = this.view(u, user.id, date);
        return { ...r, points: undefined, events: undefined, name: user.name };
      });
  }
}
