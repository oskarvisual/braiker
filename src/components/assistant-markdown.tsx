import type { ReactNode } from "react";

function inlineMarkdown(value: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const expression = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let index = 0;
  for (const match of value.matchAll(expression)) {
    const start = match.index ?? 0;
    if (start > index) nodes.push(value.slice(index, start));
    const token = match[0];
    if (token.startsWith("**")) nodes.push(<strong key={`${start}-strong`}>{token.slice(2, -2)}</strong>);
    else nodes.push(<em key={`${start}-em`}>{token.slice(1, -1)}</em>);
    index = start + token.length;
  }
  if (index < value.length) nodes.push(value.slice(index));
  return nodes;
}

/** Intentionally small Markdown subset. React escapes all input and no HTML is parsed. */
export function AssistantMarkdown({ content }: { content: string }) {
  const blocks = content.replace(/\r\n/g, "\n").trim().split(/\n\s*\n/).filter(Boolean);
  return <>{blocks.map((block, index) => {
    const lines = block.split("\n");
    const unordered = lines.every((line) => /^\s*[-*]\s+/.test(line));
    const ordered = lines.every((line) => /^\s*\d+\.\s+/.test(line));
    if (unordered) return <ul key={index}>{lines.map((line, item) => <li key={item}>{inlineMarkdown(line.replace(/^\s*[-*]\s+/, ""))}</li>)}</ul>;
    if (ordered) return <ol key={index}>{lines.map((line, item) => <li key={item}>{inlineMarkdown(line.replace(/^\s*\d+\.\s+/, ""))}</li>)}</ol>;
    return <p key={index}>{lines.map((line, lineIndex) => <span key={lineIndex}>{lineIndex ? <br /> : null}{inlineMarkdown(line)}</span>)}</p>;
  })}</>;
}
