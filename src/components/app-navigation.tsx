"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { accountMenuItems, sidebarNavigationItems, type AppRole } from "./app-navigation-policy";

export function AppNavigation({ user }: { user: { email: string; role: AppRole } }) {
  const pathname = usePathname();
  const router = useRouter();
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setAccountOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); router.refresh(); }
  const item = ({ href, label }: { href: string; label: string }) => <Link key={href} className={pathname === href ? "active" : ""} href={href}>{label}</Link>;
  const roleName = user.role === "ADMIN" ? "Administrator" : user.role === "OPERATOR" ? "Operator" : "Viewer";

  return <>
    <aside className="appNav"><Link className="brand" href="/">Br<span>AI</span>ker<small>Paper only</small></Link><nav>{sidebarNavigationItems(user.role).map(item)}</nav></aside>
    <div className="accountMenu" ref={accountRef}>
      <button type="button" className="accountTrigger" aria-haspopup="menu" aria-expanded={accountOpen} onClick={() => setAccountOpen((open) => !open)}>
        <span className="accountAvatar" aria-hidden="true">{user.email[0]?.toUpperCase() ?? "A"}</span>
        <span className="accountIdentity"><strong>{user.email}</strong><small>{roleName}</small></span>
        <span className="accountChevron" aria-hidden="true">⌄</span>
      </button>
      {accountOpen && <div className="accountDropdown" role="menu" aria-label="Account menu">
        <div className="accountDropdownIdentity"><strong>{user.email}</strong><small>{roleName}</small></div>
        {accountMenuItems(user.role).map(({ href, label }) => <Link key={href} href={href} role="menuitem" onClick={() => setAccountOpen(false)}>{label}</Link>)}
        <Link href="/account/password" role="menuitem" onClick={() => setAccountOpen(false)}>Change password</Link>
        <div className="accountMenuDivider" />
        <button type="button" role="menuitem" className="signOutMenuItem" onClick={logout}>Sign out</button>
      </div>}
    </div>
  </>;
}
