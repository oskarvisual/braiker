import type { Metadata } from "next";
import { ToastProvider } from "@/components/toast";
import "./styles.css";

export const metadata: Metadata = { title: "Braiker", description: "Paper-first automated trading platform" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><ToastProvider>{children}</ToastProvider></body></html>;
}
