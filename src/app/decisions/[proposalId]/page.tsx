import { redirect } from "next/navigation";

/** Decision reports are intentionally presented through the shared History modal. */
export default function RetiredDecisionReportPage() {
  redirect("/activity");
}
