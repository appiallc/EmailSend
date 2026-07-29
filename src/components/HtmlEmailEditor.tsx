"use client";

import { useEffect, useRef, useState } from "react";

type Mode = "visual" | "html";

export function HtmlEmailEditor({
  value,
  onChange,
  rows = 8,
  className = "",
}: {
  value: string;
  onChange: (html: string) => void;
  rows?: number;
  className?: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("visual");
  const syncing = useRef(false);

  useEffect(() => {
    if (mode !== "visual" || !editorRef.current) return;
    if (syncing.current) return;
    if (editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || "<p></p>";
    }
  }, [value, mode]);

  const run = (command: string, commandValue?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    if (editorRef.current) {
      syncing.current = true;
      onChange(editorRef.current.innerHTML);
      syncing.current = false;
    }
  };

  const insertLink = () => {
    const url = window.prompt("Link URL", "https://");
    if (!url) return;
    run("createLink", url);
  };

  return (
    <div className={`border rounded-lg overflow-hidden bg-white ${className}`}>
      <div className="flex flex-wrap items-center gap-1 border-b bg-slate-50 px-2 py-1.5">
        <button
          type="button"
          className="px-2 py-1 text-xs rounded border bg-white hover:bg-slate-50 font-bold"
          onClick={() => run("bold")}
          title="Bold"
        >
          B
        </button>
        <button
          type="button"
          className="px-2 py-1 text-xs rounded border bg-white hover:bg-slate-50 italic"
          onClick={() => run("italic")}
          title="Italic"
        >
          I
        </button>
        <button
          type="button"
          className="px-2 py-1 text-xs rounded border bg-white hover:bg-slate-50 underline"
          onClick={() => run("underline")}
          title="Underline"
        >
          U
        </button>
        <button
          type="button"
          className="px-2 py-1 text-xs rounded border bg-white hover:bg-slate-50"
          onClick={insertLink}
          title="Insert link"
        >
          Link
        </button>
        <button
          type="button"
          className="px-2 py-1 text-xs rounded border bg-white hover:bg-slate-50"
          onClick={() => run("insertUnorderedList")}
          title="Bullet list"
        >
          List
        </button>
        <button
          type="button"
          className="px-2 py-1 text-xs rounded border bg-white hover:bg-slate-50"
          onClick={() => run("formatBlock", "p")}
          title="Paragraph"
        >
          ¶
        </button>
        <div className="ml-auto flex gap-1">
          <button
            type="button"
            onClick={() => setMode("visual")}
            className={`px-2 py-1 text-xs rounded ${
              mode === "visual"
                ? "bg-blue-600 text-white"
                : "border bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            Visual
          </button>
          <button
            type="button"
            onClick={() => setMode("html")}
            className={`px-2 py-1 text-xs rounded ${
              mode === "html"
                ? "bg-blue-600 text-white"
                : "border bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            HTML
          </button>
        </div>
      </div>

      {mode === "visual" ? (
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          className="min-h-[8rem] px-3 py-2 text-sm outline-none prose prose-sm max-w-none [&_a]:text-blue-600"
          style={{ minHeight: `${rows * 1.25}rem` }}
          onInput={() => {
            if (!editorRef.current) return;
            syncing.current = true;
            onChange(editorRef.current.innerHTML);
            syncing.current = false;
          }}
        />
      ) : (
        <textarea
          className="w-full px-3 py-2 text-sm font-mono outline-none resize-y"
          style={{ minHeight: `${rows * 1.25}rem` }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
