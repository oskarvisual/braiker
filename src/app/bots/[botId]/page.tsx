import { redirect } from "next/navigation";

/** Bot detail is intentionally a shared modal in Bots and History, not a second maintained screen. */
export default function RetiredBotDetailPage() {
  redirect("/setup");
}
