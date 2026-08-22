"use client";

import { useLayoutEffect, useRef } from "react";

const COMPOSER_MIN_HEIGHT = 48;
const COMPOSER_MAX_HEIGHT = 168;

export function composerTextareaHeight(scrollHeight: number, minHeight = COMPOSER_MIN_HEIGHT, maxHeight = COMPOSER_MAX_HEIGHT) {
  return Math.min(Math.max(scrollHeight, minHeight), maxHeight);
}

export function useAutoResizingComposer(value: string) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    const contentHeight = textarea.scrollHeight;
    textarea.style.height = `${composerTextareaHeight(contentHeight)}px`;
    textarea.style.overflowY = contentHeight > COMPOSER_MAX_HEIGHT ? "auto" : "hidden";
  }, [value]);

  return textareaRef;
}
