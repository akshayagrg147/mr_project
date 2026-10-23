import { useEffect, useRef, useState, type ReactNode } from "react";
import icons from "./icons.json";
import { statusLabels } from "../../../packages/shared/src/index.ts";
export function Icon({ name, size = 24 }: { name: string; size?: number }) {
  const src = (icons as Record<string, string>)[name];
  return src ? (
    <span className="icon" style={{ width: size, height: size }}>
      <img src={src} width="24" height="24" alt="" />
    </span>
  ) : (
    <span className="icon fallback" aria-hidden="true">
      ◇
    </span>
  );
}
export function Button({
  children,
  secondary = false,
  danger = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  secondary?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      {...props}
      className={`button ${secondary ? "secondary" : ""} ${danger ? "danger" : ""} ${props.className || ""}`}
    >
      {children}
    </button>
  );
}
export function Badge({ status }: { status: string }) {
  return (
    <span className={`badge ${status}`}>{statusLabels[status] || status}</span>
  );
}
export function Notice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <div
      className={`notice ${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
export function Empty({
  title = "No records yet",
  body = "New records will appear here.",
  action,
}: {
  title?: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <Icon name="briefcase-medical" size={36} />
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}
export function Spinner() {
  return (
    <div className="loading" role="status">
      <span className="spin" />
      Loading workspace…
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const focusable = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button,input,select,textarea,a[href],[tabindex="0"]',
        ) || [],
      ).filter((e) => !e.hasAttribute("disabled"));
    focusable()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const nodes = focusable(),
          first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = prevOverflow;
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">MR CONNECT</span>
            <h2>{title}</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint: string;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}
export function PageTitle({
  eyebrow = "FIELD OPERATIONS",
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <>
      <span className="eyebrow">{eyebrow}</span>
      <div className="page-title">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="actions">{actions}</div>
      </div>
    </>
  );
}
export function Table({
  columns,
  rows,
  onRow,
  empty,
  caption,
}: {
  columns: { key: string; label: string; render?: (row: any) => ReactNode }[];
  rows: any[];
  onRow?: (r: any) => void;
  empty?: ReactNode;
  caption?: string;
}) {
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [rows]);
  const count = Math.max(1, Math.ceil(rows.length / 10));
  return (
    <div className="table-wrap">
      <table>
        <caption className="sr-only">{caption || "Records"}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col">
                {c.label}
              </th>
            ))}
            {onRow && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {rows.slice(page * 10, page * 10 + 10).map((r, i) => (
            <tr key={r.id || i}>
              {columns.map((c, j) => (
                <td key={c.key}>
                  {c.render ? (
                    c.render(r)
                  ) : j === 0 ? (
                    <strong>{String(r[c.key] ?? "—")}</strong>
                  ) : (
                    String(r[c.key] ?? "—")
                  )}
                </td>
              ))}
              {onRow && (
                <td>
                  <button
                    className="text-button"
                    onClick={() => onRow(r)}
                    aria-label={
                      "View " +
                      (r.name || r.title || r.ownerName || r.id || "record")
                    }
                  >
                    View details →
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (empty || <Empty />)}
      <div className="pagination">
        <span>
          {rows.length
            ? `Showing ${page * 10 + 1}–${Math.min((page + 1) * 10, rows.length)} of ${rows.length} records`
            : "0 records"}
        </span>
        <div>
          <button
            aria-label="Previous page"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            ‹
          </button>
          <span>
            {page + 1} / {count}
          </span>
          <button
            aria-label="Next page"
            disabled={page + 1 >= count}
            onClick={() => setPage(page + 1)}
          >
            ›
          </button>
        </div>
      </div>
    </div>
  );
}
export function useResource<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    load()
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, deps);
  return { data, error, loading };
}
export const downloadCsv = (name: string, rows: any[]) => {
  const keys = rows.length ? Object.keys(rows[0]) : ["No records"];
  const cell = (v: any) => {
    let s = typeof v === "object" ? JSON.stringify(v) : String(v ?? "");
    if (/^(?:\s*[=+\-@]|[\t\r])/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const blob = new Blob(
    [
      "\uFEFF" +
        [
          keys.join(","),
          ...rows.map((r) => keys.map((k) => cell(r[k])).join(",")),
        ].join("\r\n"),
    ],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
