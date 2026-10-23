import { Service } from "./service.ts";
import type { User } from "../../../packages/shared/src/index.ts";
export const reportNames = [
  "productivity",
  "deviations",
  "missed-coverage",
  "product-reach",
  "expenses",
  "pob",
  "sales",
  "inventory",
  "audit",
] as const;
export function report(
  s: Service,
  u: User,
  type: string,
  q: Record<string, any>,
) {
  const visits = s.list(u, "visit", q),
    plans = s.list(u, "dayplan", q),
    customers = s.list(u, "customer");
  switch (type) {
    case "productivity":
      return s
        .users(u)
        .filter((x) => x.role === "rep")
        .map((x) => {
          const v = visits.filter((v) => v.ownerId === x.id);
          return {
            representative: x.name,
            calls: v.length,
            doctorCalls: v.filter((x) => x.customerType === "Doctor").length,
            verified: v.filter((x) => x.verified).length,
            days: plans.filter((p) => p.ownerId === x.id).length,
            pob: v.reduce((a, v) => a + v.orderTotal, 0),
          };
        });
    case "deviations":
      return plans.flatMap((p) => {
        const tour = s
          .list(u, "tourplan", { date: p.date, ownerId: p.ownerId })
          .find((t) => t.status === "approved");
        return tour && tour.routeId !== p.routeId
          ? [
              {
                date: p.date,
                representative: p.ownerName,
                plannedRoute: s.record(u, tour.routeId).name,
                actualRoute: s.record(u, p.routeId).name,
                notes: p.notes || "",
              },
            ]
          : [];
      });
    case "missed-coverage":
      return customers
        .filter((c) => c.type === "Doctor")
        .map((c) => ({
          doctor: c.name,
          area: c.area,
          required: c.frequency || 1,
          actual: visits.filter((v) => v.customerId === c.id).length,
          missed: Math.max(
            0,
            (c.frequency || 1) -
              visits.filter((v) => v.customerId === c.id).length,
          ),
        }))
        .filter((c) => c.missed > 0);
    case "product-reach":
      return s.list(u, "product").map((p) => ({
        product: p.name,
        calls: visits.filter((v) => v.detailedProductIds?.includes(p.id))
          .length,
        uniqueCustomers: new Set(
          visits
            .filter((v) => v.detailedProductIds?.includes(p.id))
            .map((v) => v.customerId),
        ).size,
        sampleUnits: visits
          .flatMap((v) => v.samples || [])
          .filter((x) => x.itemId === p.id)
          .reduce((a, x) => a + x.quantity, 0),
      }));
    case "expenses":
      return s.list(u, "expense", q).map((r) => ({
        date: r.date,
        representative: r.ownerName,
        category: r.category,
        amount: r.amount,
        status: r.status,
        remarks: r.remarks,
      }));
    case "pob":
      return visits.flatMap((v) =>
        v.orderLines.map((l: any) => ({
          date: v.date,
          representative: v.ownerName,
          customer: v.customerName,
          product: s.record(u, l.itemId).name,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          total: l.total,
        })),
      );
    case "sales":
      return s.list(u, "sale", q).map((r) => ({
        date: r.date,
        representative: r.ownerName,
        type: r.saleType,
        customer: s.record(u, r.customerId).name,
        product: s.record(u, r.productId).name,
        quantity: r.quantity,
        amount: r.amount,
      }));
    case "inventory":
      return s.inventory(u);
    case "audit":
      return s.store
        .all(
          "SELECT a.action,a.entity_id AS entity,a.details,a.created_at AS date,u.name AS actor FROM audit a LEFT JOIN users u ON a.actor_id=u.id WHERE a.tenant_id=? ORDER BY a.created_at DESC LIMIT 2000",
          u.tenantId,
        )
        .filter((r) => !q.from || r.date.slice(0, 10) >= q.from)
        .filter((r) => !q.to || r.date.slice(0, 10) <= q.to);
    default:
      return null;
  }
}
export function csv(rows: Record<string, any>[]) {
  const keys = rows.length ? Object.keys(rows[0]) : ["No records"];
  const cell = (v: any) => {
    let str =
      v === null || v === undefined
        ? ""
        : typeof v === "object"
          ? JSON.stringify(v)
          : String(v);
    if (/^(?:\s*[=+\-@]|[\t\r])/.test(str)) str = "'" + str;
    return '"' + str.replaceAll('"', '""') + '"';
  };
  return (
    "\uFEFF" +
    [
      keys.map(cell).join(","),
      ...rows.map((r) => keys.map((k) => cell(r[k])).join(",")),
    ].join("\r\n")
  );
}
