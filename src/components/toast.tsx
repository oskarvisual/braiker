"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { appendToast } from "./toast-state";

type ToastTone = "error" | "success";
type Toast = { id: number; title: string; message?: string; tone: ToastTone };
type ToastInput = Omit<Toast, "id">;
type ToastContextValue = { pushToast: (toast: ToastInput) => void };
const ToastContext = createContext<ToastContextValue | null>(null);

function ToastCard({ toast, dismiss }: { toast: Toast; dismiss: (id: number) => void }) {
  useEffect(() => { const timer = window.setTimeout(() => dismiss(toast.id), toast.tone === "error" ? 7000 : 4000); return () => window.clearTimeout(timer); }, [dismiss, toast.id, toast.tone]);
  return <article className={`toast toast${toast.tone === "error" ? "Error" : "Success"}`} role={toast.tone === "error" ? "alert" : "status"}><span aria-hidden="true">{toast.tone === "error" ? "!" : "✓"}</span><div><strong>{toast.title}</strong>{toast.message && <p>{toast.message}</p>}</div><button type="button" onClick={() => dismiss(toast.id)} aria-label="Dismiss notification">×</button></article>;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);
  const pushToast = useCallback((toast: ToastInput) => setToasts((current) => appendToast(current, { ...toast, id: Date.now() + Math.random() })), []);
  const value = useMemo(() => ({ pushToast }), [pushToast]);
  return <ToastContext.Provider value={value}>{children}<aside className="toastViewport" aria-live="polite">{toasts.map((toast) => <ToastCard key={toast.id} toast={toast} dismiss={dismiss} />)}</aside></ToastContext.Provider>;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
