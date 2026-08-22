import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("settings alert layout", () => {
  it("stacks every alert channel in one vertical accordion list", () => {
    const styles = readFileSync(resolve(process.cwd(), "src/app/styles.css"), "utf8");

    expect(styles).toContain(
      ".notificationForm { grid-template-columns:minmax(0,1fr); }",
    );
    expect(styles).toContain(".notificationChannel { width:100%; }");
    expect(styles).toContain(".notificationActions { grid-column:auto; }");
  });

  it("uses explicit channel toggles so notification controls remain reachable", () => {
    const component = readFileSync(
      resolve(process.cwd(), "src/components/settings.tsx"),
      "utf8",
    );

    expect(component).toContain("const [openNotificationChannel, setOpenNotificationChannel]");
    expect(component).toContain('aria-expanded={isOpen}');
    expect(component).toContain('<NotificationChannel id="webhook"');
    expect(component).not.toContain('<details className="notificationChannel"');
  });
});
