export function chatTitleEditorCommand(key: string) {
  if (key === "Enter") return "CONFIRM";
  if (key === "Escape") return "CANCEL";
  return null;
}
