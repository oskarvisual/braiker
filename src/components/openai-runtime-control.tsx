"use client";

import { useState } from "react";

export function OpenAiRuntimeControl() {
  const [state, setState] = useState<"idle" | "checking" | "error">("idle");
  const [message, setMessage] = useState("");

  async function reactivate() {
    setState("checking");
    setMessage("");
    try {
      const response = await fetch("/api/settings/openai-runtime", { method: "POST" });
      const body = await response.json() as { error?: string; status?: string };
      if (!response.ok || body.status !== "ACTIVE") {
        setState("error");
        setMessage(body.error === "OPENAI_QUOTA_EXHAUSTED" ? "OpenAI still reports no available quota. Advisory remains paused." : "OpenAI could not confirm availability. Advisory remains paused; try again later.");
        return;
      }
      window.location.reload();
    } catch {
      setState("error");
      setMessage("OpenAI could not confirm availability. Advisory remains paused; try again later.");
    }
  }

  return <div className="openAiRuntimeControl"><button className="secondaryButton" type="button" onClick={reactivate} disabled={state === "checking"}>{state === "checking" ? "Checking OpenAI…" : "Check budget & reactivate AI"}</button>{state === "error" && <p role="status">{message}</p>}</div>;
}
