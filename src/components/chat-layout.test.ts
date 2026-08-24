import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("shared chat layout", () => {
  it("centers empty conversations and keeps the Send control compact while the composer grows", () => {
    const styles = readFileSync(resolve(process.cwd(), "src/app/styles.css"), "utf8");

    expect(styles).toContain(".managerEmpty { justify-self:center;");
    expect(styles).toContain(".managerComposer > div { display:grid;");
    expect(styles).toContain("grid-template-columns:minmax(0,1fr) auto;");
    expect(styles).toContain(".managerComposer button { align-self:end; min-width:118px; height:48px;");
    expect(styles).toContain(".managerComposer textarea { min-height:48px;");
    expect(styles).toContain("max-height:168px;");
  });

  it("keeps conversation history in its own bounded, contained scroll area", () => {
    const styles = readFileSync(resolve(process.cwd(), "src/app/styles.css"), "utf8");

    expect(styles).toContain(".managerChatLayout { display:grid; grid-template-columns:270px minmax(0,1fr); height:min(72vh,760px);");
    expect(styles).toContain(".managerMessages { display:grid; align-content:start; gap:14px; flex:1; min-height:0;");
    expect(styles).toContain("overflow-y:auto; overscroll-behavior:contain;");
    expect(styles).toContain(".managerChatLayout.emptyConversation { height:auto; min-height:360px;");
  });
});
