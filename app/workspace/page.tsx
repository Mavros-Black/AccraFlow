"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

type Role = "resident" | "moderator" | "operator" | "admin";
type Membership = {
  organization_id: string;
  role: Role;
  organizations: { id: string; name: string } | null;
};
type Session = {
  user: { id: string; email: string };
  memberships: Membership[];
};
type Incident = {
  id: string;
  reported_by: string;
  title: string;
  description: string;
  category: string;
  status: string;
  longitude: number;
  latitude: number;
  created_at: string;
};
type WorkOrder = {
  id: string;
  incident_id: string | null;
  title: string;
  priority: string;
  status: string;
  due_at: string | null;
  completion_notes: string | null;
  maintenance_assignments: { assigned_user_id: string }[];
};
type Operator = { user_id: string; display_name: string };
type OrganizationMember = {
  user_id: string;
  display_name: string;
  role: Role;
  is_active: boolean;
};
type AuditEntry = {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
};
type Photo = {
  id: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};
type History = {
  id: string;
  previous_status: string | null;
  new_status: string;
  reason: string | null;
  created_at: string;
};
async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    cache: "no-store",
    headers: {
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
      ...options?.headers,
    },
  });
  const body = await response
    .json()
    .catch(() => ({ error: "Unexpected server response." }));
  if (!response.ok) throw new Error(body.error || "Request failed.");
  return body as T;
}
const pretty = (value: string) =>
  value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
export default function Workspace() {
  const [session, setSession] = useState<Session | null>(null);
  const [org, setOrg] = useState("");
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [selected, setSelected] = useState("");
  const [history, setHistory] = useState<History[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoVersion, setPhotoVersion] = useState(0);
  const [status, setStatus] = useState("Checking sign-in…");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const loadSession = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await api<Session>("/api/auth/session", { signal });
      if (signal?.aborted) return;
      setSession(data);
      setOrg((current) =>
        data.memberships.some((m) => m.organization_id === current)
          ? current
          : (data.memberships[0]?.organization_id ?? ""),
      );
      setStatus(
        data.memberships.length
          ? ""
          : "Your account has no organization membership. Ask an administrator to add you.",
      );
    } catch (e) {
      if (!signal?.aborted) {
        setSession(null);
        setStatus(e instanceof Error ? e.message : "Unable to check session.");
      }
    } finally {
      if (!signal?.aborted) setReady(true);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => loadSession(controller.signal));
    return () => controller.abort();
  }, [loadSession]);
  const role = session?.memberships.find(
    (m) => m.organization_id === org,
  )?.role;
  const canModerate = role === "moderator" || role === "admin";
  const canOperate = role === "operator" || role === "admin";
  const loadData = useCallback(
    async (signal?: AbortSignal) => {
      if (!org) return;
      try {
        const [reports, work, roster, memberData, auditData] =
          await Promise.all([
            api<{ incidents: Incident[] }>(
              `/api/incidents?organizationId=${encodeURIComponent(org)}`,
              { signal },
            ),
            api<{ workOrders: WorkOrder[] }>(
              `/api/work-orders?organizationId=${encodeURIComponent(org)}`,
              { signal },
            ),
            canOperate
              ? api<{ operators: Operator[] }>(
                  `/api/operators?organizationId=${encodeURIComponent(org)}`,
                  { signal },
                )
              : Promise.resolve({ operators: [] }),
            role === "admin"
              ? api<{ members: OrganizationMember[] }>(
                  `/api/memberships?organizationId=${encodeURIComponent(org)}`,
                  { signal },
                )
              : Promise.resolve({ members: [] }),
            role === "admin"
              ? api<{ entries: AuditEntry[] }>(
                  `/api/audit?organizationId=${encodeURIComponent(org)}`,
                  { signal },
                )
              : Promise.resolve({ entries: [] }),
          ]);
        if (signal?.aborted) return;
        setIncidents(reports.incidents);
        setOrders(work.workOrders);
        setOperators(roster.operators);
        setMembers(memberData.members);
        setAudit(auditData.entries);
        setSelected((current) =>
          reports.incidents.some((i) => i.id === current)
            ? current
            : (reports.incidents[0]?.id ?? ""),
        );
        setStatus("");
      } catch (e) {
        if (signal?.aborted) return;
        setIncidents([]);
        setOrders([]);
        setOperators([]);
        setMembers([]);
        setAudit([]);
        setSelected("");
        setStatus(e instanceof Error ? e.message : "Unable to load records.");
        throw e;
      }
    },
    [org, canOperate, role],
  );
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve()
      .then(() => loadData(controller.signal))
      .catch(() => {});
    return () => controller.abort();
  }, [loadData]);
  useEffect(() => {
    if (!selected) {
      return;
    }
    const controller = new AbortController();
    api<{ history: History[] }>(
      `/api/incidents/${encodeURIComponent(selected)}/history`,
      { signal: controller.signal },
    )
      .then((data) => setHistory(data.history))
      .catch(() => {
        if (!controller.signal.aborted) setHistory([]);
      });
    return () => controller.abort();
  }, [selected, historyVersion]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    api<{ photos: Photo[] }>(
      `/api/incidents/${encodeURIComponent(selected)}/photos`,
      { signal: controller.signal },
    )
      .then((data) => setPhotos(data.photos))
      .catch(() => {
        if (!controller.signal.aborted) setPhotos([]);
      });
    return () => controller.abort();
  }, [selected, photoVersion]);
  const current = incidents.find((i) => i.id === selected);
  async function perform(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await action();
      try {
        await loadData();
        setStatus(message);
      } catch {
        setStatus(
          `${message} Refresh failed; reload to see the latest records.`,
        );
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }
  async function login(form: FormData) {
    setBusy(true);
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      await loadSession();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }
  async function submit(form: FormData) {
    const data = {
      organizationId: org,
      title: form.get("title"),
      description: form.get("description"),
      category: form.get("category"),
      longitude: Number(form.get("longitude")),
      latitude: Number(form.get("latitude")),
    };
    await perform(
      () =>
        api("/api/incidents", { method: "POST", body: JSON.stringify(data) }),
      "Report submitted for review.",
    );
  }
  async function editReport(form: FormData) {
    if (!current) return;
    await perform(
      () =>
        api(`/api/incidents/${current.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            title: form.get("title"),
            description: form.get("description"),
            category: form.get("category"),
            longitude: Number(form.get("longitude")),
            latitude: Number(form.get("latitude")),
          }),
        }),
      "Report updated.",
    );
  }
  async function withdrawReport() {
    if (
      !current ||
      !window.confirm(
        "Withdraw this report? Its history and photos will be retained.",
      )
    )
      return;
    await perform(
      () =>
        api(`/api/incidents/${current.id}/withdraw`, {
          method: "POST",
          body: "{}",
        }),
      "Report withdrawn.",
    );
    setHistoryVersion((version) => version + 1);
  }
  async function transition(next: string) {
    if (!current) return;
    let reason: string | undefined;
    if (next === "rejected") {
      reason = window
        .prompt("Reason for rejection (at least five characters):")
        ?.trim();
      if (!reason || reason.length < 5) {
        setStatus(
          "A rejection reason of at least five characters is required.",
        );
        return;
      }
    }
    await perform(
      () =>
        api(`/api/incidents/${current.id}/status`, {
          method: "POST",
          body: JSON.stringify({ status: next, ...(reason ? { reason } : {}) }),
        }),
      "Incident status updated.",
    );
    setHistoryVersion((version) => version + 1);
  }
  async function createOrder(form: FormData) {
    if (!current) return;
    await perform(
      () =>
        api("/api/work-orders", {
          method: "POST",
          body: JSON.stringify({
            incidentId: current.id,
            title: form.get("orderTitle"),
            priority: form.get("priority"),
            dueAt: form.get("dueDate")
              ? `${form.get("dueDate")}T23:59:59.999Z`
              : null,
          }),
        }),
      "Work order created.",
    );
  }
  async function updateDueDate(order: WorkOrder, form: FormData) {
    const dueDate = String(form.get("dueDate") ?? "");
    await perform(
      () =>
        api(`/api/work-orders/${order.id}/due-date`, {
          method: "POST",
          body: JSON.stringify({ dueDate: dueDate || null }),
        }),
      "Work order due date updated.",
    );
  }
  async function uploadPhoto(form: FormData) {
    if (!current) return;
    const file = form.get("photo");
    if (
      !(file instanceof File) ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size === 0 ||
      file.size > 5 * 1024 * 1024
    ) {
      setStatus("Choose a JPEG, PNG, or WebP image up to 5 MiB.");
      return;
    }
    await perform(
      () =>
        api(`/api/incidents/${current.id}/photos`, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        }),
      "Photo added.",
    );
    setPhotoVersion((version) => version + 1);
  }
  async function assign(order: WorkOrder, form: FormData) {
    const userId = form.get("userId");
    if (typeof userId !== "string" || !userId) {
      setStatus("Choose an operator to assign.");
      return;
    }
    await perform(
      () =>
        api(`/api/work-orders/${order.id}/assignments`, {
          method: "POST",
          body: JSON.stringify({ userId }),
        }),
      "Operator assigned.",
    );
  }
  async function setMembership(form: FormData) {
    const userId = String(form.get("userId") ?? "").trim();
    if (userId === session?.user.id) {
      setStatus("Ask another administrator to change your own role.");
      return;
    }
    await perform(
      () =>
        api("/api/memberships", {
          method: "POST",
          body: JSON.stringify({
            organizationId: org,
            userId,
            role: form.get("role"),
          }),
        }),
      "Membership updated.",
    );
  }
  async function deactivateMembership(member: OrganizationMember) {
    if (member.user_id === session?.user.id) {
      setStatus("Ask another administrator to deactivate your membership.");
      return;
    }
    if (
      !window.confirm(
        `Deactivate ${member.display_name}'s organization access?`,
      )
    )
      return;
    await perform(
      () =>
        api(`/api/memberships/${member.user_id}/deactivate`, {
          method: "POST",
          body: JSON.stringify({ organizationId: org }),
        }),
      "Membership deactivated.",
    );
  }
  async function complete(order: WorkOrder) {
    const notes = window
      .prompt("Completion notes (at least five characters):")
      ?.trim();
    if (!notes || notes.length < 5) {
      setStatus("Completion notes of at least five characters are required.");
      return;
    }
    await perform(
      () =>
        api(`/api/work-orders/${order.id}/complete`, {
          method: "POST",
          body: JSON.stringify({ notes }),
        }),
      "Work order completed.",
    );
  }
  return (
    <main className="live-workspace">
      <header className="live-header">
        <div>
          <Link href="/" className="live-back">
            ← Demo dashboard
          </Link>
          <h1>Organization workspace</h1>
          <p>Signed-in records are kept separate from demo data.</p>
        </div>
        {session && (
          <button
            className="secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api("/api/auth/logout", { method: "POST" });
                setSession(null);
                setOrg("");
                setIncidents([]);
                setOrders([]);
                setOperators([]);
                setMembers([]);
                setAudit([]);
                setSelected("");
                setHistory([]);
                setPhotos([]);
                setStatus("Signed out.");
              } catch (error) {
                setStatus(
                  error instanceof Error
                    ? error.message
                    : "Unable to sign out.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Sign out
          </button>
        )}
      </header>
      {status && (
        <div role="status" className="notice">
          {status}
        </div>
      )}
      {!ready ? (
        <p className="muted">Loading…</p>
      ) : !session ? (
        <section className="panel live-login">
          <h2>Sign in</h2>
          <p className="muted">
            Use an existing account in the configured organization.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void login(new FormData(event.currentTarget));
            }}
          >
            <label>
              Email
              <input
                name="email"
                type="email"
                required
                autoComplete="username"
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </label>
            <button className="primary" disabled={busy}>
              Sign in
            </button>
          </form>
          <p className="footnote muted">
            Accounts and organization membership are managed by your
            administrator.
          </p>
        </section>
      ) : (
        <>
          <section className="panel live-org">
            <label>
              Organization
              <select
                value={org}
                disabled={busy}
                onChange={(e) => {
                  setOrg(e.target.value);
                  setIncidents([]);
                  setOrders([]);
                  setOperators([]);
                  setMembers([]);
                  setAudit([]);
                  setSelected("");
                  setHistory([]);
                  setPhotos([]);
                }}
              >
                {session.memberships.map((m) => (
                  <option key={m.organization_id} value={m.organization_id}>
                    {m.organizations?.name ?? "Organization"} · {pretty(m.role)}
                  </option>
                ))}
              </select>
            </label>
            <span>{session.user.email}</span>
          </section>
          {org && (
            <div className="live-grid">
              <section className="panel live-card">
                <h2>Reports & incidents</h2>
                <p className="muted">
                  Residents can see their own reports. Staff can review
                  organization reports.
                </p>
                <div className="live-list">
                  {incidents.length === 0 ? (
                    <p className="muted">No reports available.</p>
                  ) : (
                    incidents.map((i) => (
                      <button
                        key={i.id}
                        className={
                          selected === i.id ? "live-row active" : "live-row"
                        }
                        disabled={busy}
                        onClick={() => {
                          setHistory([]);
                          setPhotos([]);
                          setSelected(i.id);
                        }}
                      >
                        <span>
                          <strong>{i.title}</strong>
                          <small>
                            {pretty(i.category)} ·{" "}
                            {new Date(i.created_at).toLocaleDateString("en-GH")}
                          </small>
                        </span>
                        <span className="status">{pretty(i.status)}</span>
                      </button>
                    ))
                  )}
                </div>
                <details>
                  <summary>Submit a report</summary>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void submit(new FormData(event.currentTarget));
                    }}
                  >
                    <label>
                      Title
                      <input
                        name="title"
                        minLength={5}
                        maxLength={120}
                        required
                      />
                    </label>
                    <label>
                      Category
                      <select name="category">
                        <option value="blockage">Blockage</option>
                        <option value="flooding">Flooding</option>
                        <option value="debris">Debris</option>
                        <option value="damaged_culvert">Damaged culvert</option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                    <div className="form-grid">
                      <label>
                        Latitude
                        <input
                          name="latitude"
                          type="number"
                          min="5.4"
                          max="5.85"
                          step="any"
                          required
                        />
                      </label>
                      <label>
                        Longitude
                        <input
                          name="longitude"
                          type="number"
                          min="-0.45"
                          max="0.1"
                          step="any"
                          required
                        />
                      </label>
                    </div>
                    <label>
                      Description
                      <textarea
                        name="description"
                        rows={3}
                        minLength={15}
                        maxLength={2000}
                        required
                      />
                    </label>
                    <button className="primary" disabled={busy}>
                      Submit report
                    </button>
                  </form>
                </details>
              </section>
              <section className="panel live-card">
                <h2>Incident details</h2>
                {current ? (
                  <>
                    <h3>{current.title}</h3>
                    <p className="muted">
                      {pretty(current.category)} · {pretty(current.status)} ·{" "}
                      {current.latitude.toFixed(4)},{" "}
                      {current.longitude.toFixed(4)}
                    </p>
                    <p className="live-description">{current.description}</p>
                    {current.reported_by === session.user.id &&
                      current.status === "submitted" && (
                        <details key={current.id}>
                          <summary>Edit or withdraw report</summary>
                          <p className="muted">
                            You can make changes until review begins. Withdrawal
                            keeps the report and its history for audit.
                          </p>
                          <form
                            onSubmit={(event) => {
                              event.preventDefault();
                              void editReport(
                                new FormData(event.currentTarget),
                              );
                            }}
                          >
                            <label>
                              Title
                              <input
                                name="title"
                                defaultValue={current.title}
                                minLength={5}
                                maxLength={120}
                                required
                              />
                            </label>
                            <label>
                              Category
                              <select
                                name="category"
                                defaultValue={current.category}
                              >
                                <option value="blockage">Blockage</option>
                                <option value="flooding">Flooding</option>
                                <option value="debris">Debris</option>
                                <option value="damaged_culvert">
                                  Damaged culvert
                                </option>
                                <option value="other">Other</option>
                              </select>
                            </label>
                            <div className="form-grid">
                              <label>
                                Latitude
                                <input
                                  name="latitude"
                                  type="number"
                                  min="5.4"
                                  max="5.85"
                                  step="any"
                                  defaultValue={current.latitude}
                                  required
                                />
                              </label>
                              <label>
                                Longitude
                                <input
                                  name="longitude"
                                  type="number"
                                  min="-0.45"
                                  max="0.1"
                                  step="any"
                                  defaultValue={current.longitude}
                                  required
                                />
                              </label>
                            </div>
                            <label>
                              Description
                              <textarea
                                name="description"
                                rows={3}
                                minLength={15}
                                maxLength={2000}
                                defaultValue={current.description}
                                required
                              />
                            </label>
                            <div className="live-actions">
                              <button className="primary" disabled={busy}>
                                Save changes
                              </button>
                              <button
                                type="button"
                                className="secondary"
                                disabled={busy}
                                onClick={withdrawReport}
                              >
                                Withdraw report
                              </button>
                            </div>
                          </form>
                        </details>
                      )}
                    <h4>Incident photos</h4>
                    {photos.length ? (
                      <div className="live-photos">
                        {photos.map((photo) => (
                          <a
                            key={photo.id}
                            href={`/api/photos/${photo.id}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Image
                              src={`/api/photos/${photo.id}`}
                              alt={`Incident photo uploaded ${new Date(photo.created_at).toLocaleDateString("en-GH")}`}
                              width={112}
                              height={84}
                              unoptimized
                            />
                          </a>
                        ))}
                      </div>
                    ) : (
                      <p className="muted">No photos attached.</p>
                    )}
                    {(canModerate ||
                      canOperate ||
                      (role === "resident" &&
                        ["submitted", "under_review"].includes(
                          current.status,
                        ))) &&
                      photos.length < 10 && (
                        <form
                          onSubmit={(event) => {
                            event.preventDefault();
                            void uploadPhoto(new FormData(event.currentTarget));
                          }}
                          className="live-photo-upload"
                        >
                          <label>
                            Attach photo (JPEG, PNG or WebP; up to 5 MiB)
                            <input
                              type="file"
                              name="photo"
                              accept="image/jpeg,image/png,image/webp"
                              required
                              disabled={busy}
                            />
                          </label>
                          <button className="secondary" disabled={busy}>
                            Upload photo
                          </button>
                          <small>
                            Photos are re-encoded to remove embedded location
                            and camera metadata.
                          </small>
                        </form>
                      )}
                    <h4>Status history</h4>
                    {history.length ? (
                      <ol className="live-history">
                        {history.map((h) => (
                          <li key={h.id}>
                            {pretty(h.new_status)} ·{" "}
                            {new Date(h.created_at).toLocaleString("en-GH")}
                            {h.reason && <p>{h.reason}</p>}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="muted">No history available.</p>
                    )}
                    <div className="live-actions">
                      {canModerate && current.status === "submitted" && (
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() => transition("under_review")}
                        >
                          Start review
                        </button>
                      )}
                      {canModerate && current.status === "under_review" && (
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={() => transition("verified")}
                        >
                          Verify
                        </button>
                      )}
                      {canModerate &&
                        ["submitted", "under_review"].includes(
                          current.status,
                        ) && (
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() => transition("rejected")}
                          >
                            Reject
                          </button>
                        )}
                      {canOperate && current.status === "verified" && (
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={() => transition("assigned")}
                        >
                          Mark assigned
                        </button>
                      )}
                      {canOperate && current.status === "assigned" && (
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={() => transition("in_progress")}
                        >
                          Start work
                        </button>
                      )}
                      {canOperate && current.status === "in_progress" && (
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={() => transition("resolved")}
                        >
                          Resolve
                        </button>
                      )}
                    </div>
                    {canOperate &&
                      ["verified", "assigned", "in_progress"].includes(
                        current.status,
                      ) && (
                        <details>
                          <summary>Create work order</summary>
                          <form
                            onSubmit={(event) => {
                              event.preventDefault();
                              void createOrder(
                                new FormData(event.currentTarget),
                              );
                            }}
                          >
                            <label>
                              Task title
                              <input
                                name="orderTitle"
                                minLength={5}
                                maxLength={160}
                                required
                              />
                            </label>
                            <label>
                              Priority
                              <select name="priority">
                                <option value="medium">Medium</option>
                                <option value="low">Low</option>
                                <option value="high">High</option>
                                <option value="urgent">Urgent</option>
                              </select>
                            </label>
                            <label>
                              Due date (optional, Accra time)
                              <input
                                name="dueDate"
                                type="date"
                                disabled={busy}
                              />
                            </label>
                            <button className="primary" disabled={busy}>
                              Create work order
                            </button>
                          </form>
                        </details>
                      )}
                  </>
                ) : (
                  <p className="muted">Select a report to view its details.</p>
                )}
              </section>
              {role === "admin" && (
                <section className="panel live-card live-admin">
                  <h2>Organization members</h2>
                  <p className="muted">
                    Manage access for existing authentication accounts.
                    Deactivation preserves report and audit history.
                  </p>
                  <div className="live-members">
                    {members.map((member) => (
                      <div className="live-member" key={member.user_id}>
                        <div>
                          <strong>{member.display_name}</strong>
                          <small>
                            {member.user_id} · {pretty(member.role)} ·{" "}
                            {member.is_active ? "Active" : "Inactive"}
                          </small>
                        </div>
                        {member.is_active &&
                          member.user_id !== session.user.id && (
                            <button
                              className="secondary"
                              disabled={busy}
                              onClick={() => deactivateMembership(member)}
                            >
                              Deactivate
                            </button>
                          )}
                      </div>
                    ))}
                  </div>
                  <details>
                    <summary>Add, reactivate, or change a member role</summary>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void setMembership(new FormData(event.currentTarget));
                      }}
                    >
                      <label>
                        Existing user ID (UUID)
                        <input
                          name="userId"
                          type="text"
                          required
                          pattern="[0-9a-fA-F-]{36}"
                          maxLength={36}
                        />
                      </label>
                      <label>
                        Role
                        <select name="role">
                          <option value="resident">Resident</option>
                          <option value="moderator">Moderator</option>
                          <option value="operator">Operator</option>
                          <option value="admin">Admin</option>
                        </select>
                      </label>
                      <button className="primary" disabled={busy}>
                        Save membership
                      </button>
                    </form>
                  </details>
                </section>
              )}
              {role === "admin" && (
                <section className="panel live-card live-admin">
                  <h2>Audit log</h2>
                  <p className="muted">
                    Recent organization actions, newest first.
                  </p>
                  {audit.length ? (
                    <ol className="live-history">
                      {audit.map((entry) => (
                        <li key={entry.id}>
                          <strong>{entry.action}</strong> ·{" "}
                          {new Date(entry.created_at).toLocaleString("en-GH")}
                          <small>
                            {entry.entity_type} · {entry.entity_id}
                          </small>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="muted">No audit records available.</p>
                  )}
                </section>
              )}
              <section className="panel live-card live-orders">
                <h2>Maintenance work orders</h2>
                {!canOperate && role === "resident" ? (
                  <p className="muted">
                    Maintenance work orders are available to staff.
                  </p>
                ) : orders.length ? (
                  orders.map((order) => (
                    <div className="task" key={order.id}>
                      <div>
                        <strong>{order.title}</strong>
                        <small>
                          {pretty(order.priority)} · {pretty(order.status)}
                          {order.due_at
                            ? ` · Due: ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Africa/Accra" }).format(new Date(order.due_at))}`
                            : " · No due date"}
                          {order.completion_notes
                            ? ` · ${order.completion_notes}`
                            : ""}
                          {canOperate &&
                          (order.maintenance_assignments ?? []).length > 0
                            ? ` · Assigned: ${(order.maintenance_assignments ?? []).map((assignment) => operators.find((operator) => operator.user_id === assignment.assigned_user_id)?.display_name ?? "Operator").join(", ")}`
                            : ""}
                        </small>
                      </div>
                      {canOperate &&
                        ["open", "in_progress"].includes(order.status) && (
                          <form
                            className="live-assignment"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void updateDueDate(
                                order,
                                new FormData(event.currentTarget),
                              );
                            }}
                          >
                            <label>
                              Due date (Accra time)
                              <input
                                name="dueDate"
                                type="date"
                                defaultValue={order.due_at?.slice(0, 10) ?? ""}
                                disabled={busy}
                              />
                            </label>
                            <button className="secondary" disabled={busy}>
                              Save due date
                            </button>
                          </form>
                        )}
                      {canOperate &&
                        ["open", "in_progress"].includes(order.status) && (
                          <form
                            className="live-assignment"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void assign(
                                order,
                                new FormData(event.currentTarget),
                              );
                            }}
                          >
                            <label>
                              Assign operator
                              <select
                                name="userId"
                                defaultValue=""
                                disabled={busy}
                                required
                              >
                                <option value="" disabled>
                                  Choose operator
                                </option>
                                {operators
                                  .filter(
                                    (operator) =>
                                      !(
                                        order.maintenance_assignments ?? []
                                      ).some(
                                        (assignment) =>
                                          assignment.assigned_user_id ===
                                          operator.user_id,
                                      ),
                                  )
                                  .map((operator) => (
                                    <option
                                      key={operator.user_id}
                                      value={operator.user_id}
                                    >
                                      {operator.display_name}
                                    </option>
                                  ))}
                              </select>
                            </label>
                            <button
                              className="secondary"
                              disabled={busy || operators.length === 0}
                            >
                              Assign
                            </button>
                          </form>
                        )}
                      {canOperate &&
                        ["open", "in_progress"].includes(order.status) && (
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() => complete(order)}
                          >
                            Complete
                          </button>
                        )}
                    </div>
                  ))
                ) : (
                  <p className="muted">No work orders available.</p>
                )}
              </section>
            </div>
          )}
        </>
      )}
    </main>
  );
}
