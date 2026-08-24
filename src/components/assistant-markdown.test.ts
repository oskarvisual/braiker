import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { AssistantMarkdown } from "./assistant-markdown";

describe("AssistantMarkdown", () => {
  it("renders basic Markdown without interpreting HTML", () => {
    const markup = renderToStaticMarkup(createElement(AssistantMarkdown, { content: "**Bold** and *italic*\n\n- first\n- <img src=x onerror=alert(1)>" }));

    expect(markup).toContain("<strong>Bold</strong>");
    expect(markup).toContain("<em>italic</em>");
    expect(markup).toContain("<ul>");
    expect(markup).toContain("&lt;img");
    expect(markup).not.toContain("<img");
  });
});
