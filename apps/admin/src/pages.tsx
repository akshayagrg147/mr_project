import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, json } from "./api";
import { useWorkspace, label } from "./context";
import {
  Button,
  Badge,
  Empty,
  Icon,
  Metric,
  Modal,
  Notice,
  PageTitle,
  Spinner,
  Table,
  downloadCsv,
  useResource,
} from "./ui";
import { RecordForm, RecordDetail } from "./forms";
import {
  moduleByKey,
  money,
  type RecordData,
  type User,
} from "../../../packages/shared/src/index.ts";
export function Overview() {
  const { workspace, version } = useWorkspace();
  const [date, setDate] = useState(
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
  );
  const [owner, setOwner] = useState("");
  const {
    data: d,
    error,
    loading,
  } = useResource(
    () => api("/dashboard?date=" + date + (owner ? "&ownerId=" + owner : "")),
    [date, owner, version],
  );
  const [detail, setDetail] = useState<RecordData>();
  if (loading) return <Spinner />;
  if (error) return <Notice tone="error">{error}</Notice>;
  return (
    <>
      <PageTitle
        title="A clear view of your field force"
        description={
          new Date(date + "T12:00:00").toLocaleDateString("en-IN", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          }) +
          " · " +
          workspace.company.code
        }
        actions={
          <>
            <Button
              secondary
              onClick={() =>
                downloadCsv("field-snapshot.csv", [
                  {
                    date: d.date,
                    active: d.active,
                    representatives: d.users,
                    doctorCalls: d.doctorCalls,
                    dcrSubmitted: d.dcrSubmitted,
                    pob: d.pob,
                  },
                ])
              }
            >
              Export snapshot
            </Button>
            <Link className="button" to="/tracking">
              View live activity
            </Link>
          </>
        }
      />
      <div className="filter-bar">
        <label>
          Reporting date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          Representative
          <select value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">All representatives</option>
            {workspace.users
              .filter((u) => u.role === "rep")
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </select>
        </label>
        <span className="filter-hint">
          <Icon name="list-filter" />
          Your permitted team
        </span>
      </div>
      <div className="metrics">
        <Metric
          label="Active representatives"
          value={`${d.active} / ${d.users}`}
          hint="Day plans recorded for this date"
        />
        <Metric
          label="Doctor calls"
          value={d.doctorCalls}
          hint={`${d.totalCalls} total customer visits`}
        />
        <Metric
          label="DCR submission"
          value={`${d.users ? Math.round((d.dcrSubmitted / d.users) * 100) : 0}%`}
          hint={`${d.dcrSubmitted} of ${d.users} submitted`}
        />
        <Metric
          label="POB captured"
          value={money(d.pob)}
          hint={`${d.from} to ${d.to}`}
        />
      </div>
      <div className="chart-grid">
        <section className="card">
          <div className="card-heading">
            <h3>Monthly doctor coverage</h3>
            <small>Current month</small>
          </div>
          <div className="coverage">
            <strong>
              {d.monthlyCoverage}
              <span> / {d.customerCount}</span>
            </strong>
            <p>Unique customers visited</p>
            <div className="progress">
              <span
                style={{
                  width:
                    Math.min(
                      100,
                      d.customerCount
                        ? (d.monthlyCoverage / d.customerCount) * 100
                        : 0,
                    ) + "%",
                }}
              />
            </div>
            <p className="muted">
              Coverage uses persisted visits and assigned customers.
            </p>
          </div>
        </section>
        <section className="card">
          <div className="card-heading">
            <h3>POB trend</h3>
            <small>Last 7 days</small>
          </div>
          <div className="bar-chart">
            {d.trend.map((v: any) => (
              <div key={v.date} title={money(v.pob)}>
                <small>{money(v.pob)}</small>
                <span
                  style={{
                    height:
                      Math.max(
                        3,
                        (v.pob /
                          Math.max(1, ...d.trend.map((x: any) => x.pob))) *
                          130,
                      ) + "px",
                  }}
                />
                <label>{v.date.slice(8)}</label>
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="card no-padding">
        <div className="card-heading">
          <h3>Needs your attention</h3>
          <Link className="button secondary" to="/approvals">
            All approvals
          </Link>
        </div>
        <Table
          caption="Needs your attention"
          rows={d.attention}
          onRow={setDetail}
          columns={[
            {
              key: "kind",
              label: "Item",
              render: (r) =>
                moduleByKey[r.kind]?.singular || "Daily call report",
            },
            { key: "ownerName", label: "Representative" },
            {
              key: "date",
              label: "Date",
              render: (r) => r.date || r.fromDate || r.createdAt.slice(0, 10),
            },
            {
              key: "status",
              label: "Status",
              render: (r) => <Badge status={r.status} />,
            },
          ]}
          empty={
            <Empty
              title="All caught up"
              body="There are no submissions waiting for your attention."
            />
          }
        />
      </section>
      {detail && (
        <RecordDetail
          record={detail}
          onClose={() => setDetail(undefined)}
          onChanged={() => {}}
        />
      )}
    </>
  );
}
export function RecordsPage({ kind }: { kind: string }) {
  const { workspace, refresh, notify } = useWorkspace();
  const mod = moduleByKey[kind];
  const [searchParams] = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") || "");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<RecordData | "new">();
  const [detail, setDetail] = useState<RecordData>();
  const [importing, setImporting] = useState(false);
  useEffect(() => {
    setQ(searchParams.get("q") || "");
    setType("");
    setStatus("");
    setDetail(undefined);
  }, [kind, searchParams]);
  if (!mod) return <Empty title="Module not found" />;
  const canWrite =
    (!mod.readOnlyForRep && !mod.adminOnly) || workspace.user.role === "admin";
  const rows = (workspace.records[kind] || []).filter(
    (r) =>
      (!q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase())) &&
      (!type || r.type === type) &&
      (!status || r.status === status),
  );
  return (
    <>
      <PageTitle
        title={mod.title}
        description={
          kind === "customer"
            ? "One accurate source for doctors, chemists, hospitals and stockists."
            : "Manage " +
              mod.title.toLowerCase() +
              " across your permitted team."
        }
        actions={
          <>
            <Button
              secondary
              onClick={() =>
                downloadCsv(
                  kind + ".csv",
                  rows.map((r) =>
                    Object.fromEntries(
                      mod.columns.map((k) => [k, label(workspace, k, r[k])]),
                    ),
                  ),
                )
              }
            >
              Export CSV
            </Button>
            {kind === "customer" && canWrite && (
              <Button secondary onClick={() => setImporting(true)}>
                Import customers
              </Button>
            )}
            {canWrite && (
              <Button onClick={() => setEditing("new")}>
                Add {mod.singular.toLowerCase()}
              </Button>
            )}
          </>
        }
      />
      {kind === "customer" && (
        <div className="tabs">
          {["", "Doctor", "Chemist", "Stockist", "Hospital"].map((t) => (
            <button
              key={t}
              className={type === t ? "active" : ""}
              onClick={() => setType(t)}
            >
              {t ? t + "s" : "All customers"}
            </button>
          ))}
        </div>
      )}
      <div className="filter-bar">
        <label className="grow">
          Search
          <input
            type="search"
            placeholder={"Search " + mod.title.toLowerCase()}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {[
              ...new Set((workspace.records[kind] || []).map((r) => r.status)),
            ].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <span className="filter-hint">{rows.length} records</span>
      </div>
      {kind === "customer" && (
        <div className="metrics three">
          <Metric
            label="Doctors"
            value={
              (workspace.records.customer || []).filter(
                (r) => r.type === "Doctor",
              ).length
            }
            hint="Assigned customer universe"
          />
          <Metric
            label="Chemists"
            value={
              (workspace.records.customer || []).filter(
                (r) => r.type === "Chemist",
              ).length
            }
            hint="Retail customer directory"
          />
          <Metric
            label="Routes"
            value={workspace.records.route?.length || 0}
            hint="Available coverage routes"
          />
        </div>
      )}
      <section className="card no-padding">
        <div className="card-heading">
          <h3>{type ? type + "s" : mod.title}</h3>
        </div>
        <Table
          rows={rows}
          onRow={setDetail}
          columns={mod.columns.map((k) => ({
            key: k,
            label: k.replace(/([A-Z])/g, " $1"),
            render: (r) =>
              k === "status" ? (
                <Badge status={r.status} />
              ) : (
                <span>{label(workspace, k, r[k])}</span>
              ),
          }))}
        />
      </section>
      {editing && (
        <RecordForm
          mod={mod}
          initial={editing === "new" ? undefined : editing}
          onClose={() => setEditing(undefined)}
          onSaved={async (r) => {
            setEditing(undefined);
            await refresh();
            notify(mod.singular + " saved");
            setDetail(r);
          }}
        />
      )}
      {detail && (
        <RecordDetail
          record={detail}
          onClose={() => setDetail(undefined)}
          onEdit={(r) => {
            setDetail(undefined);
            setEditing(r);
          }}
          onChanged={() => void refresh()}
        />
      )}{" "}
      {importing && <ImportCustomers onClose={() => setImporting(false)} />}
    </>
  );
}
export function Approvals() {
  const { version, refresh } = useWorkspace();
  const { data, error, loading } = useResource(
    () => api("/approvals"),
    [version],
  );
  const [kind, setKind] = useState("");
  const [detail, setDetail] = useState<RecordData>();
  return (
    <>
      <PageTitle
        title="Approvals inbox"
        description="Review the evidence, record a decision and keep your field team moving."
      />
      <div className="tabs">
        {["", "dcr", "expense", "leave", "tourplan", "sponsorship"].map((k) => (
          <button
            key={k}
            className={kind === k ? "active" : ""}
            onClick={() => setKind(k)}
          >
            {k ? moduleByKey[k]?.title || "Daily reports" : "All submissions"}
          </button>
        ))}
      </div>
      {loading ? (
        <Spinner />
      ) : error ? (
        <Notice tone="error">{error}</Notice>
      ) : (
        <section className="card no-padding">
          <Table
            rows={data.items.filter(
              (r: RecordData) => !kind || r.kind === kind,
            )}
            onRow={setDetail}
            columns={[
              {
                key: "kind",
                label: "Submission",
                render: (r) =>
                  moduleByKey[r.kind]?.singular || "Daily call report",
              },
              { key: "ownerName", label: "Representative" },
              {
                key: "date",
                label: "Date",
                render: (r) => r.date || r.fromDate,
              },
              {
                key: "amount",
                label: "Value",
                render: (r) => (r.amount ? money(r.amount) : "—"),
              },
              {
                key: "status",
                label: "Status",
                render: (r) => <Badge status={r.status} />,
              },
            ]}
            empty={
              <Empty
                title="All caught up"
                body="No submissions need a decision right now."
              />
            }
          />
        </section>
      )}
      {detail && (
        <RecordDetail
          record={detail}
          onClose={() => setDetail(undefined)}
          onChanged={() => void refresh()}
        />
      )}
    </>
  );
}
export function Team() {
  const { workspace, refresh, notify } = useWorkspace();
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<any>();
  return (
    <>
      <PageTitle
        title="Field team"
        description="People, reporting hierarchy and territory ownership."
        actions={
          workspace.user.role === "admin" && (
            <Button onClick={() => setEdit("new")}>Add employee</Button>
          )
        }
      />
      <div className="filter-bar">
        <label className="grow">
          Search team
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name or email"
          />
        </label>
        <Link className="button secondary" to="/module/territory">
          Territories & HQ
        </Link>
        <Link className="button secondary" to="/settings?tab=roles">
          Roles & permissions
        </Link>
      </div>
      <section className="card no-padding">
        <Table
          rows={workspace.users.filter((u) =>
            (u.name + " " + u.email).toLowerCase().includes(q.toLowerCase()),
          )}
          onRow={workspace.user.role === "admin" ? setEdit : undefined}
          columns={[
            { key: "name", label: "Employee" },
            { key: "email", label: "User ID" },
            { key: "role", label: "Role" },
            {
              key: "managerId",
              label: "Reports to",
              render: (r) => label(workspace, "ownerId", r.managerId),
            },
            {
              key: "territoryId",
              label: "HQ",
              render: (r) => label(workspace, "territoryId", r.territoryId),
            },
            {
              key: "active",
              label: "Access",
              render: (r) => (
                <Badge status={r.active ? "active" : "Disabled"} />
              ),
            },
          ]}
        />
      </section>
      {edit && (
        <UserForm
          initial={edit === "new" ? undefined : edit}
          onClose={() => setEdit(undefined)}
          onSaved={async () => {
            setEdit(undefined);
            await refresh();
            notify("Employee saved");
          }}
        />
      )}
    </>
  );
}
function UserForm({
  initial,
  onClose,
  onSaved,
}: {
  initial?: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { workspace } = useWorkspace();
  const [v, setV] = useState<any>(
    initial
      ? { ...initial, password: "" }
      : {
          name: "",
          email: "",
          role: "rep",
          managerId: null,
          territoryId: null,
          active: true,
          password: "",
        },
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={initial ? "Employee setup" : "Add employee"}
      onClose={onClose}
      wide
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api(
              "/users" + (initial ? "/" + initial.id : ""),
              json(initial ? "PUT" : "POST", {
                name: v.name,
                email: v.email,
                role: v.role,
                managerId: v.managerId,
                territoryId: v.territoryId,
                active: v.active,
                ...(v.password ? { password: v.password } : {}),
                ...(initial ? { version: initial.version } : {}),
              }),
            );
            onSaved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          {[
            ["name", "Full name"],
            ["email", "Email / user ID"],
          ].map(([key, title]) => (
            <div className="field" key={key}>
              <label htmlFor={"employee-" + key}>{title} *</label>
              <input
                id={"employee-" + key}
                required
                type={key === "email" ? "email" : "text"}
                value={v[key]}
                onChange={(e) => setV({ ...v, [key]: e.target.value })}
              />
            </div>
          ))}
          <div className="field">
            <label htmlFor="role">Role</label>
            <select
              id="role"
              value={v.role}
              onChange={(e) => setV({ ...v, role: e.target.value })}
            >
              {["rep", "manager", "admin"].map((role) => (
                <option key={role}>{role}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="manager">Reports to</label>
            <select
              id="manager"
              value={v.managerId || ""}
              onChange={(e) =>
                setV({ ...v, managerId: e.target.value || null })
              }
            >
              <option value="">No manager</option>
              {workspace.users
                .filter((u) => u.role !== "rep" && u.id !== initial?.id)
                .map((u) => (
                  <option value={u.id} key={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="territory">Head quarter</label>
            <select
              id="territory"
              value={v.territoryId || ""}
              onChange={(e) =>
                setV({ ...v, territoryId: e.target.value || null })
              }
            >
              <option value="">Unassigned</option>
              {workspace.records.territory?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="new-pass">
              {initial ? "Reset password (optional)" : "Initial password *"}
            </label>
            <input
              id="new-pass"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required={!initial}
              value={v.password}
              onChange={(e) => setV({ ...v, password: e.target.value })}
            />
            <small>
              At least 12 characters. Employee must change it at next sign-in.
            </small>
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={v.active}
              onChange={(e) => setV({ ...v, active: e.target.checked })}
            />
            Account active
          </label>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="form-actions">
          <Button secondary type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy}>{busy ? "Saving…" : "Save employee"}</Button>
        </div>
      </form>
    </Modal>
  );
}
export function Inventory() {
  const { workspace, version } = useWorkspace();
  const { data, error, loading } = useResource(
    () => api("/inventory"),
    [version],
  );
  return (
    <>
      <PageTitle
        title="Samples & promotional inputs"
        description="Stock moves only through acknowledged receipts and recorded visits."
        actions={
          <Link className="button" to="/module/challan">
            Manage challans
          </Link>
        }
      />
      <div className="tabs">
        <Link to="/module/product">Products</Link>
        <Link to="/module/input">Promotional inputs</Link>
        <Link to="/module/challan">Challan receipts</Link>
      </div>
      {loading ? (
        <Spinner />
      ) : error ? (
        <Notice tone="error">{error}</Notice>
      ) : (
        <section className="card no-padding">
          <Table
            rows={data.items}
            columns={[
              { key: "ownerName", label: "Employee" },
              { key: "name", label: "Item" },
              { key: "itemType", label: "Type" },
              { key: "quantity", label: "Available units" },
            ]}
          />
        </section>
      )}
    </>
  );
}
export function Reports() {
  const { workspace, version } = useWorkspace();
  const [type, setType] = useState("productivity");
  const [from, setFrom] = useState(
    new Date()
      .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
      .slice(0, 7) + "-01",
  );
  const [to, setTo] = useState(
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
  );
  const query = `?from=${from}&to=${to}`;
  const { data, error, loading } = useResource(
    () => api("/reports/" + type + query),
    [type, from, to, version],
  );
  const names = [
    "productivity",
    "deviations",
    "missed-coverage",
    "product-reach",
    "expenses",
    "pob",
    "sales",
    "inventory",
    ...(workspace.user.role === "admin" ? ["audit"] : []),
  ];
  return (
    <>
      <PageTitle
        title="Reporting center"
        description="Explore field productivity, coverage, sales and the operational audit trail."
        actions={
          <a
            className="button"
            href={"/api/reports/" + type + query + "&format=csv"}
          >
            Download CSV
          </a>
        }
      />
      <div className="filter-bar">
        <label>
          Report
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {names.map((n) => (
              <option key={n} value={n}>
                {n.replaceAll("-", " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          From
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      {loading ? (
        <Spinner />
      ) : error ? (
        <Notice tone="error">{error}</Notice>
      ) : (
        <section className="card no-padding">
          <Table
            rows={data.items}
            columns={Object.keys(data.items[0] || { result: "" }).map((k) => ({
              key: k,
              label: k.replace(/([A-Z])/g, " $1"),
            }))}
          />
        </section>
      )}
    </>
  );
}
export function Activity() {
  const { version } = useWorkspace();
  const [tab, setTab] = useState("visit");
  const { data, error, loading } = useResource(
    () => api("/records/" + tab),
    [tab, version],
  );
  const [detail, setDetail] = useState<RecordData>();
  return (
    <>
      <PageTitle
        title="Calls & daily reports"
        description="Review captured visits, location evidence and submitted daily reports."
        actions={
          <Link className="button" to="/tracking">
            Open activity map
          </Link>
        }
      />
      <div className="tabs">
        {["visit", "dcr"].map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t === "visit" ? "Customer calls" : "Daily reports"}
          </button>
        ))}
      </div>
      {loading ? (
        <Spinner />
      ) : error ? (
        <Notice tone="error">{error}</Notice>
      ) : (
        <section className="card no-padding">
          <Table
            rows={data.items}
            onRow={setDetail}
            columns={[
              { key: "date", label: "Date" },
              { key: "ownerName", label: "Representative" },
              ...(tab === "visit"
                ? [
                    { key: "customerName", label: "Customer" },
                    {
                      key: "verified",
                      label: "Location",
                      render: (r: any) => (
                        <Badge
                          status={r.verified ? "Verified" : "Needs review"}
                        />
                      ),
                    },
                    {
                      key: "orderTotal",
                      label: "POB",
                      render: (r: any) => money(r.orderTotal),
                    },
                  ]
                : [
                    {
                      key: "status",
                      label: "Status",
                      render: (r: any) => <Badge status={r.status} />,
                    },
                  ]),
            ]}
          />
        </section>
      )}
      {detail && (
        <RecordDetail
          record={detail}
          onClose={() => setDetail(undefined)}
          onChanged={() => {}}
        />
      )}
    </>
  );
}
function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("CSV has an unclosed quoted field");
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  const headers =
    rows.shift()?.map((s) => s.replace(/^\uFEFF/, "").trim()) || [];
  if (new Set(headers).size !== headers.length)
    throw new Error("CSV contains duplicate column names");
  return rows.map((r) =>
    Object.fromEntries(headers.map((h, i) => [h, r[i] || ""])),
  );
}
function ImportCustomers({ onClose }: { onClose: () => void }) {
  const { workspace, refresh, notify } = useWorkspace();
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Import customers" onClose={onClose} wide>
      <Notice>
        Use the template column names. Representative and route fields require
        the IDs shown in your export. All rows are validated before anything is
        imported.
      </Notice>
      <Button
        secondary
        onClick={() =>
          downloadCsv("customer-template.csv", [
            {
              name: "Example doctor",
              type: "Doctor",
              assignedTo:
                workspace.users.find((u) => u.role === "rep")?.id || "",
              routeId: workspace.records.route?.[0]?.id || "",
              area: "Delhi",
              clinicAddress: "Clinic address",
              specialty: "General physician",
              frequency: 2,
            },
          ])
        }
      >
        Download template
      </Button>
      <div className="field">
        <label htmlFor="csv-import">Customer CSV</label>
        <input
          id="csv-import"
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            setError("");
            try {
              const file = e.target.files?.[0];
              if (file) {
                if (file.size > 2 * 1024 * 1024)
                  throw new Error("Maximum CSV size is 2 MB");
                const parsed = parseCsv(await file.text());
                if (parsed.length > 1000)
                  throw new Error("Maximum 1,000 customers per import");
                setRows(
                  parsed.map((r) => ({
                    ...r,
                    ...(r.frequency ? { frequency: Number(r.frequency) } : {}),
                  })),
                );
              }
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        />
      </div>
      {rows.length > 0 && (
        <>
          <p>{rows.length} customers ready for validation. Preview:</p>
          <Table
            rows={rows.slice(0, 5)}
            columns={["name", "type", "area", "assignedTo"].map((k) => ({
              key: k,
              label: k,
            }))}
          />
        </>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="form-actions">
        <Button secondary onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={busy || rows.length === 0}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await api(
                "/import/customers",
                json("POST", { rows }, crypto.randomUUID()),
              );
              await refresh();
              notify(rows.length + " customers imported");
              onClose();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Validating…" : "Validate & import"}
        </Button>
      </div>
    </Modal>
  );
}
