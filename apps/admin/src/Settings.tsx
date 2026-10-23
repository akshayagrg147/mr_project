import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, json } from "./api";
import { useWorkspace } from "./context";
import { Button, Notice, PageTitle, Table, useResource } from "./ui";
const policyLabels: Record<string, string> = {
  gpsRadiusMeters: "Visit verification radius (m)",
  maxAccuracyMeters: "Maximum GPS uncertainty (m)",
  staleAfterMinutes: "Missing-update threshold (minutes)",
  reportDeadlineDays: "Reporting window (days)",
  receiptRequiredAbove: "Receipt required from (₹)",
  localDA: "Local DA (₹)",
  exStationDA: "Ex-station DA (₹)",
  outstationDA: "Outstation DA (₹)",
  taPerKm: "TA per km (₹)",
  trackingIntervalSeconds: "Tracking interval (seconds)",
  retentionDays: "Location retention period (days)",
};
export function Settings() {
  const { workspace, refresh, notify, version } = useWorkspace();
  const [search, setSearch] = useSearchParams();
  const tab = search.get("tab") || "policies";
  const [values, setValues] = useState(workspace.policies);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: integrations } = useResource(
    () =>
      workspace.user.role === "admin"
        ? api("/integrations")
        : Promise.resolve({ items: [] }),
    [version],
  );
  const { data: audit } = useResource(
    () =>
      workspace.user.role === "admin"
        ? api("/reports/audit")
        : Promise.resolve({ items: [] }),
    [version],
  );
  return (
    <>
      <PageTitle
        title="Workspace settings"
        description="Reporting policies, access permissions and connected services."
      />
      <div className="tabs">
        {["policies", "roles", "integrations", "audit", "account"].map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setSearch({ tab: t })}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {tab === "policies" && (
        <section className="card">
          <h3>Company reporting policies</h3>
          <p className="muted">
            These are proposed defaults. Changes apply to new submissions and
            new tracking sessions.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await api(
                  "/policies",
                  json("PUT", values, crypto.randomUUID()),
                );
                await refresh();
                notify("Reporting policies saved");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="form-grid">
              {Object.entries(values).map(([key, value]) => (
                <div className="field" key={key}>
                  <label htmlFor={"policy-" + key}>
                    {policyLabels[key] || key}
                  </label>
                  <input
                    id={"policy-" + key}
                    type="number"
                    required
                    min={key === "taPerKm" ? 0 : 1}
                    max={key === "trackingIntervalSeconds" ? 900 : 100000}
                    step="any"
                    disabled={workspace.user.role !== "admin"}
                    value={value}
                    onChange={(e) =>
                      setValues({ ...values, [key]: Number(e.target.value) })
                    }
                  />
                </div>
              ))}
            </div>
            {error && <Notice tone="error">{error}</Notice>}
            {workspace.user.role === "admin" && (
              <div className="form-actions">
                <Button disabled={busy}>
                  {busy ? "Saving…" : "Save policies"}
                </Button>
              </div>
            )}
          </form>
        </section>
      )}
      {tab === "roles" && (
        <section className="card no-padding">
          <div className="card-heading">
            <h3>Roles & permissions</h3>
          </div>
          <Table
            rows={[
              {
                role: "Administrator",
                scope: "Entire company",
                masters: "Manage all",
                approvals: "Team submissions except own",
                settings: "Manage",
              },
              {
                role: "Manager",
                scope: "Own reporting hierarchy",
                masters: "Manage assigned customers and routes",
                approvals: "Team submissions except own",
                settings: "Read policies",
              },
              {
                role: "Representative",
                scope: "Own data and assigned customers",
                masters: "Own customers and routes",
                approvals: "Submit, correct and resubmit own",
                settings: "Own account",
              },
            ]}
            columns={["role", "scope", "masters", "approvals", "settings"].map(
              (k) => ({ key: k, label: k }),
            )}
          />
          <p className="card-note">
            Assign roles from Field team → Employee setup. Permissions are
            enforced by the API.
          </p>
        </section>
      )}
      {tab === "integrations" && (
        <section className="card no-padding">
          <Table
            rows={integrations?.items || []}
            columns={[
              { key: "name", label: "Service" },
              { key: "status", label: "Status" },
              { key: "description", label: "Setup required" },
            ]}
          />
        </section>
      )}
      {tab === "audit" &&
        (workspace.user.role === "admin" ? (
          <section className="card no-padding">
            <Table
              rows={audit?.items || []}
              columns={[
                { key: "date", label: "Time" },
                { key: "actor", label: "Actor" },
                { key: "action", label: "Action" },
                { key: "entity", label: "Entity" },
              ]}
            />
          </section>
        ) : (
          <Notice>Administrator access is required for the audit log.</Notice>
        ))}
      {tab === "account" && <Account />}
    </>
  );
}
export function Account() {
  const [current, setCurrent] = useState(""),
    [next, setNext] = useState(""),
    [confirm, setConfirm] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="card narrow">
      <h2>Account security</h2>
      <p>Changing your password signs out all devices.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (next !== confirm) {
            setError("The new passwords do not match");
            return;
          }
          setBusy(true);
          setError("");
          try {
            await api(
              "/auth/password",
              json("POST", { currentPassword: current, newPassword: next }),
            );
            location.reload();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {[
          ["current", "Current password", current, setCurrent],
          ["new", "New password", next, setNext],
          ["confirm", "Confirm new password", confirm, setConfirm],
        ].map(([key, title, value, set]) => (
          <div className="field" key={key as string}>
            <label htmlFor={"pass-" + key}>{title as string}</label>
            <input
              id={"pass-" + key}
              type="password"
              required
              minLength={key === "current" ? 1 : 12}
              value={value as string}
              onChange={(e) => (set as (v: string) => void)(e.target.value)}
              autoComplete={
                key === "current" ? "current-password" : "new-password"
              }
            />
          </div>
        ))}
        {error && <Notice tone="error">{error}</Notice>}
        <Button disabled={busy}>
          {busy ? "Updating…" : "Change password"}
        </Button>
      </form>
    </section>
  );
}
