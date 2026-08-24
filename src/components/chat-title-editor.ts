export function chatTitleEditorCommand(key: string) {
  if (key === "Enter") return "CONFIRM";
  if (key === "Escape") return "CANCEL";
  return null;
}

export function isChatTitleEditing(renamingSessionId: string | null, selectedSessionId: string | null) {
  return renamingSessionId !== null && renamingSessionId === selectedSessionId;
}
