"use client";

import { FormEvent, useState } from "react";
import { useToast } from "@/components/toast";

type Role = "ADMIN" | "OPERATOR" | "VIEWER";
type User = { id: string; email: string; role: Role; mustChangePassword: boolean; createdAt: string };
type Modal = { mode: "create" } | { mode: "edit"; user: User } | null;

export function UserManagement({ actorId, initialUsers }: { actorId: string; initialUsers: User[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [modal, setModal] = useState<Modal>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("VIEWER");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { pushToast } = useToast();

  function openCreate() { setEmail(""); setRole("VIEWER"); setTemporaryPassword(""); setConfirmDelete(false); setModal({ mode: "create" }); }
  function openEdit(user: User) { setEmail(user.email); setRole(user.role); setTemporaryPassword(""); setConfirmDelete(false); setModal({ mode: "edit", user }); }
  function close() { setModal(null); setConfirmDelete(false); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const isCreate = modal?.mode === "create";
    const response = await fetch(isCreate ? "/api/admin/users" : `/api/admin/users/${modal?.mode === "edit" ? modal.user.id : ""}`, { method: isCreate ? "POST" : "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(isCreate ? { email, role, temporaryPassword } : { role }) });
    const body = await response.json();
    if (!response.ok) { pushToast({ tone: "error", title: "We could not save this user", message: body.error ?? "Please review the fields and try again." }); return; }
    if (isCreate) setUsers((current) => [...current, { ...body, createdAt: new Date().toISOString() }]);
    else setUsers((current) => current.map((user) => user.id === body.id ? { ...user, role: body.role } : user));
    close();
  }
  async function remove() {
    if (modal?.mode !== "edit") return;
    const response = await fetch(`/api/admin/users/${modal.user.id}`, { method: "DELETE" });
    if (!response.ok) { const body = await response.json(); pushToast({ tone: "error", title: "We could not delete this user", message: body.error ?? "Please try again." }); return; }
    setUsers((current) => current.filter((user) => user.id !== modal.user.id)); close();
  }
  return <><header><div><p className="eyebrow">ADMINISTRATION</p><h1>Users</h1></div><button className="headerAction" onClick={openCreate}>Add user</button></header><section className="panel simpleTablePanel"><div className="userTable"><div className="userRow userHead"><span>Email</span><span>Role</span><span>Status</span><span /></div>{users.map((user) => <div className="userRow" key={user.id}><strong>{user.email}</strong><span>{user.role}</span><span>{user.mustChangePassword ? "Password change required" : "Active"}</span><button className="iconButton" title={user.id === actorId ? "You cannot modify your own permissions" : `Edit ${user.email}`} disabled={user.id === actorId} onClick={() => openEdit(user)}>✎</button></div>)}</div></section>{modal && <div className="modalOverlay" role="presentation"><section className="modalCard" role="dialog" aria-modal="true" aria-labelledby="user-modal-title"><div className="modalHeading"><div><p className="eyebrow">{modal.mode === "create" ? "NEW USER" : "EDIT USER"}</p><h2 id="user-modal-title">{modal.mode === "create" ? "Add user" : modal.user.email}</h2></div><button type="button" className="iconButton" onClick={close} aria-label="Close">×</button></div><form onSubmit={submit}>{modal.mode === "create" && <><label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Temporary password<input type="password" autoComplete="new-password" value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} required /></label><small className="muted">At least 12 characters, including upper-case, lower-case and a number.</small></>}<label>Global role<select value={role} onChange={(event) => setRole(event.target.value as Role)} disabled={modal.mode === "edit" && modal.user.id === actorId}><option value="VIEWER">Viewer — read-only</option><option value="OPERATOR">Operator — bot controls in assigned wallets</option><option value="ADMIN">Admin — configuration and users</option></select></label><button type="submit">{modal.mode === "create" ? "Add user" : "Save changes"}</button></form>{modal.mode === "edit" && modal.user.id !== actorId && <div className="dangerZone">{confirmDelete ? <><p>Delete {modal.user.email}? This cannot be undone.</p><div><button type="button" className="secondaryButton" onClick={() => setConfirmDelete(false)}>Cancel</button><button type="button" className="dangerButton" onClick={remove}>Confirm delete</button></div></> : <button type="button" className="dangerButton" onClick={() => setConfirmDelete(true)}>Delete user</button>}</div>}</section></div>}</>;
}
