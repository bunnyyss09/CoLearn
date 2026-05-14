import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { Editor } from "@tiptap/core";
import { useEditor, EditorContent, useEditorState } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import { TextAlign } from "@tiptap/extension-text-align";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { Placeholder } from "@tiptap/extension-placeholder";
import { toEditorHtml } from "./sessionNoteText";
import { FiLink } from "react-icons/fi";
import {
  MdCheckBox,
  MdFormatListBulleted,
  MdFormatListNumbered,
  MdFormatAlignLeft,
  MdFormatAlignCenter,
  MdFormatAlignRight,
  MdFormatAlignJustify,
  MdRedo,
  MdUndo,
} from "react-icons/md";
import { AiOutlineUnderline, AiOutlineStrikethrough } from "react-icons/ai";
import { LuHeading2, LuHeading3, LuType, LuPilcrow } from "react-icons/lu";
import { RiBold, RiItalic } from "react-icons/ri";

const FONT_SIZES = ["12px", "14px", "16px", "18px", "20px", "24px", "28px"] as const;
const TEXT_PRESETS: { label: string; color: string }[] = [
  { label: "A", color: "inherit" },
  { label: "A", color: "#b91c1c" },
  { label: "A", color: "#c2410c" },
  { label: "A", color: "#a16207" },
  { label: "A", color: "#15803d" },
  { label: "A", color: "#0d9488" },
  { label: "A", color: "#1d4ed8" },
  { label: "A", color: "#7c3aed" },
];

type NotesToolbarProps = { editor: Editor; isDark: boolean };

const NotesToolbar: React.FC<NotesToolbarProps> = ({ editor, isDark }) => {
  const t = isDark
    ? "text-zinc-200 border-zinc-600/50 bg-zinc-800/80 hover:bg-zinc-800"
    : "text-stone-800 border-stone-200 bg-white/90 hover:bg-stone-100";

  const activeT = isDark
    ? "bg-violet-800/50 text-violet-200 border-violet-500/40"
    : "bg-violet-100 text-violet-900 border-violet-300/80";

  const [blockMenuOpen, setBlockMenuOpen] = useState(false);
  const [sizeMenuOpen, setSizeMenuOpen] = useState(false);

  const state = useEditorState({
    editor,
    selector: (snap) => {
      const e = snap.editor;
      const para = e.getAttributes("paragraph");
      const head = e.getAttributes("heading");
      const textStyle = e.getAttributes("textStyle");
      return {
        bold: e.isActive("bold"),
        italic: e.isActive("italic"),
        underline: e.isActive("underline"),
        strike: e.isActive("strike"),
        h1: e.isActive("heading", { level: 1 }),
        h2: e.isActive("heading", { level: 2 }),
        h3: e.isActive("heading", { level: 3 }),
        p: e.isActive("paragraph"),
        bullet: e.isActive("bulletList"),
        ordered: e.isActive("orderedList"),
        task: e.isActive("taskList"),
        link: e.isActive("link"),
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
        textAlign: (head.textAlign ?? para.textAlign ?? "left") as string,
        fontSize: (textStyle?.fontSize as string | null) || null,
        color: (textStyle?.color as string | null) || null,
        transactionNumber: snap.transactionNumber,
      };
    },
  });

  const blockLabel = state.h1
    ? "Title"
    : state.h2
      ? "Heading 2"
      : state.h3
        ? "Heading 3"
        : "Normal text";

  const onLink = useCallback(() => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const next = window.prompt("Link URL", previous ?? "https://");
    if (next === null) return;
    if (next === "")
      return editor.chain().focus().extendMarkRange("link").unsetLink().run();
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: next })
      .run();
  }, [editor]);

  return (
    <div
      className={`flex flex-col gap-1 border-b px-2 py-1.5 shrink-0 ${
        isDark ? "border-zinc-700/50 bg-zinc-900/30" : "border-stone-200/80 bg-stone-50/80"
      }`}
    >
      <div className="flex flex-nowrap min-w-0 max-w-full overflow-x-auto items-center gap-0.5 pb-0.5 [scrollbar-width:thin]">
        <button
          type="button"
          title="Undo"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!state.canUndo}
          className={`rounded-md border px-1.5 py-1 text-sm disabled:opacity-35 ${t}`}
        >
          <MdUndo size={18} />
        </button>
        <button
          type="button"
          title="Redo"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!state.canRedo}
          className={`rounded-md border px-1.5 py-1 text-sm disabled:opacity-35 ${t}`}
        >
          <MdRedo size={18} />
        </button>
        <span
          className={isDark ? "mx-0.5 w-px self-stretch bg-zinc-600" : "mx-0.5 w-px self-stretch bg-stone-200"}
        />

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setBlockMenuOpen((o) => !o);
              setSizeMenuOpen(false);
            }}
            className={`flex h-8 min-w-[6.5rem] items-center justify-between gap-1 rounded-md border px-2 text-left text-xs font-medium ${t}`}
          >
            {state.h1 && <LuType size={16} className="shrink-0" />}
            {state.h2 && <LuHeading2 size={16} className="shrink-0" />}
            {state.h3 && <LuHeading3 size={16} className="shrink-0" />}
            {state.p && <LuPilcrow size={16} className="shrink-0" />}
            <span className="truncate">{blockLabel}</span>
            <span className="text-[10px] text-zinc-500">▾</span>
          </button>
          {blockMenuOpen && (
            <>
              <button
                type="button"
                aria-hidden
                className="fixed inset-0 z-20 cursor-default"
                onClick={() => setBlockMenuOpen(false)}
              />
              <div
                className={`absolute top-full left-0 z-30 mt-0.5 w-40 rounded-lg border py-0.5 shadow-lg ${
                  isDark ? "border-zinc-600 bg-zinc-800" : "border-stone-200 bg-white"
                }`}
              >
                {[
                  {
                    k: "p" as const,
                    label: "Normal text",
                    icon: <LuPilcrow size={16} />,
                    run: () => editor.chain().focus().setParagraph().run(),
                    active: state.p,
                  },
                  {
                    k: "h1",
                    label: "Title",
                    icon: <LuType size={16} />,
                    run: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
                    active: state.h1,
                  },
                  {
                    k: "h2",
                    label: "Heading 2",
                    icon: <LuHeading2 size={16} />,
                    run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
                    active: state.h2,
                  },
                  {
                    k: "h3",
                    label: "Heading 3",
                    icon: <LuHeading3 size={16} />,
                    run: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
                    active: state.h3,
                  },
                ].map((row) => (
                  <button
                    key={row.k}
                    type="button"
                    onClick={() => {
                      row.run();
                      setBlockMenuOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs ${
                      row.active
                        ? isDark
                          ? "bg-violet-800/50 text-violet-100"
                          : "bg-violet-100 text-violet-900"
                        : isDark
                          ? "text-zinc-200 hover:bg-zinc-700/80"
                          : "text-stone-800 hover:bg-stone-100"
                    }`}
                  >
                    {row.icon}
                    {row.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setSizeMenuOpen((o) => !o);
              setBlockMenuOpen(false);
            }}
            className={`flex h-8 min-w-[3.5rem] items-center justify-center rounded-md border px-2 text-xs font-medium ${t}`}
            title="Font size"
          >
            {state.fontSize?.replace("px", "") || "A⁺"}
          </button>
          {sizeMenuOpen && (
            <>
              <button
                type="button"
                aria-hidden
                className="fixed inset-0 z-20 cursor-default"
                onClick={() => setSizeMenuOpen(false)}
              />
              <div
                className={`absolute top-full left-0 z-30 mt-0.5 w-20 rounded-lg border py-0.5 shadow-lg ${
                  isDark ? "border-zinc-600 bg-zinc-800" : "border-stone-200 bg-white"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    editor.chain().focus().unsetFontSize().run();
                    setSizeMenuOpen(false);
                  }}
                  className={`w-full px-2 py-1.5 text-left text-xs ${
                    isDark
                      ? "text-zinc-200 hover:bg-zinc-700/80"
                      : "text-stone-800 hover:bg-stone-100"
                  }`}
                >
                  Default
                </button>
                {FONT_SIZES.map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => {
                      editor.chain().focus().setFontSize(sz).run();
                      setSizeMenuOpen(false);
                    }}
                    className={`w-full px-2 py-1.5 text-left text-xs ${
                      isDark
                        ? "text-zinc-200 hover:bg-zinc-700/80"
                        : "text-stone-800 hover:bg-stone-100"
                    }`}
                  >
                    {sz.replace("px", "")} pt
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <span
          className={isDark ? "mx-0.5 w-px self-stretch bg-zinc-600" : "mx-0.5 w-px self-stretch bg-stone-200"}
        />

        <div className="flex items-center gap-0.5 rounded-md border p-0.5 px-1">
          {TEXT_PRESETS.map((c, i) => (
            <button
              key={i}
              type="button"
              title="Text color"
              onClick={() => {
                if (c.color === "inherit" || c.color === "") {
                  editor.chain().focus().unsetColor().run();
                } else {
                  editor.chain().focus().setColor(c.color).run();
                }
              }}
              className={`font-semibold w-5 h-6 flex items-center justify-center rounded text-sm leading-none ${
                c.color === "inherit"
                  ? isDark
                    ? "text-zinc-200 border border-zinc-500"
                    : "text-stone-800 border border-stone-300"
                  : ""
              } ${
                (c.color === "inherit" && (state.color == null || state.color === "")) ||
                (c.color !== "inherit" && state.color === c.color)
                  ? isDark
                    ? "ring-1 ring-violet-400"
                    : "ring-1 ring-violet-500"
                  : ""
              }`}
              style={c.color !== "inherit" ? { color: c.color } : undefined}
            >
              {c.label}
            </button>
          ))}
        </div>

        <span
          className={isDark ? "mx-0.5 w-px self-stretch bg-zinc-600" : "mx-0.5 w-px self-stretch bg-stone-200"}
        />

        <button
          type="button"
          title="Bold (⌘B)"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`rounded-md border px-1.5 py-1.5 text-sm font-semibold ${
            state.bold ? activeT : t
          }`}
        >
          <RiBold size={16} />
        </button>
        <button
          type="button"
          title="Italic (⌘I)"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`rounded-md border px-1.5 py-1.5 text-sm ${state.italic ? activeT : t}`}
        >
          <RiItalic size={16} className="italic" />
        </button>
        <button
          type="button"
          title="Underline"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`rounded-md border px-1.5 py-1.5 text-sm ${
            state.underline ? activeT : t
          }`}
        >
          <AiOutlineUnderline size={17} />
        </button>
        <button
          type="button"
          title="Strikethrough"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={`rounded-md border px-1.5 py-1.5 text-sm ${state.strike ? activeT : t}`}
        >
          <AiOutlineStrikethrough size={18} />
        </button>
        <button
          type="button"
          title="Link"
          onClick={onLink}
          className={`rounded-md border px-1.5 py-1.5 text-sm ${state.link ? activeT : t}`}
        >
          <FiLink size={16} />
        </button>

        <span
          className={isDark ? "mx-0.5 w-px self-stretch bg-zinc-600" : "mx-0.5 w-px self-stretch bg-stone-200"}
        />

        <button
          type="button"
          title="Bullet list"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`rounded-md border px-1.5 py-1.5 text-sm ${state.bullet ? activeT : t}`}
        >
          <MdFormatListBulleted size={18} />
        </button>
        <button
          type="button"
          title="Numbered list"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`rounded-md border px-1.5 py-1.5 text-sm ${state.ordered ? activeT : t}`}
        >
          <MdFormatListNumbered size={18} />
        </button>
        <button
          type="button"
          title="To-do list"
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          className={`rounded-md border px-1.5 py-1.5 text-sm ${state.task ? activeT : t}`}
        >
          <MdCheckBox size={18} />
        </button>

        <span
          className={isDark ? "mx-0.5 w-px self-stretch bg-zinc-600" : "mx-0.5 w-px self-stretch bg-stone-200"}
        />

        {(["left", "center", "right", "justify"] as const).map((a) => (
          <button
            key={a}
            type="button"
            title={a}
            onClick={() => editor.chain().focus().setTextAlign(a).run()}
            className={`rounded-md border px-1.5 py-1.5 text-sm ${
              state.textAlign === a || (a === "left" && (state.textAlign === "" || !state.textAlign))
                ? activeT
                : t
            }`}
          >
            {a === "left" && <MdFormatAlignLeft size={18} />}
            {a === "center" && <MdFormatAlignCenter size={18} />}
            {a === "right" && <MdFormatAlignRight size={18} />}
            {a === "justify" && <MdFormatAlignJustify size={18} />}
          </button>
        ))}
      </div>
    </div>
  );
};

export interface SessionNotesEditorProps {
  initialHtml: string;
  isDark: boolean;
  /** When false, use read-only; still load content. */
  editable: boolean;
  onChange: (html: string) => void;
}

const SessionNotesEditor: React.FC<SessionNotesEditorProps> = ({
  initialHtml,
  isDark,
  editable,
  onChange,
}) => {
  const onUpdate = useCallback(
    ({ editor }: { editor: Editor }) => onChange(editor.getHTML()),
    [onChange]
  );

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        blockquote: {},
      }),
      TaskList,
      TaskItem.configure({ nested: true, HTMLAttributes: { class: "co-learn-task" } }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
        alignments: ["left", "center", "right", "justify"],
      }),
      TextStyleKit.configure({
        backgroundColor: false,
        lineHeight: false,
        fontFamily: false,
      }),
      Placeholder.configure({
        placeholder: "Jot a title, bullets, or checkboxes for the team…",
      }),
    ],
    []
  );

  const editor = useEditor(
    {
      immediatelyRender: true,
      shouldRerenderOnTransaction: true,
      extensions,
      content: toEditorHtml(initialHtml),
      editable,
      onUpdate,
      editorProps: {
        attributes: {
          class: `notes-rtf-content focus:outline-none ${
            isDark ? "text-zinc-100" : "text-stone-900"
          }`,
        },
      },
    },
    []
  );

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  if (!editor) {
    return (
      <div
        className={`min-h-[10rem] animate-pulse rounded-b-lg ${
          isDark ? "bg-zinc-800/30" : "bg-stone-100/50"
        }`}
      />
    );
  }

  return (
    <div className={`flex min-h-0 flex-1 flex-col notes-rtf ${isDark ? "notes-rtf--dark" : "notes-rtf--light"}`}>
      <NotesToolbar editor={editor} isDark={isDark} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <EditorContent editor={editor} className="h-full" />
      </div>
    </div>
  );
};

export default SessionNotesEditor;
