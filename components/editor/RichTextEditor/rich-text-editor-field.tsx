"use client";

import type { JSONContent } from "@tiptap/core";
import { RichTextEditor } from "@/components/editor/RichTextEditor/lazy";

export function RichTextEditorField({
  label,
  name,
  jsonName,
  value,
  onChange,
  defaultValue,
  defaultJson,
  documentType,
  documentId,
  placeholder,
  minHeight = 180
}: {
  label?: string;
  name: string;
  jsonName?: string;
  value?: JSONContent | null;
  onChange?: (value: JSONContent) => void;
  defaultValue?: string;
  defaultJson?: string | JSONContent;
  documentType: string;
  documentId: string;
  placeholder?: string;
  minHeight?: number;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      {label ? <span className="platform-type-label">{label}</span> : null}
      <RichTextEditor
        name={name}
        jsonName={jsonName}
        value={value}
        onChange={onChange}
        defaultValue={defaultValue}
        defaultJson={defaultJson}
        documentType={documentType}
        documentId={documentId}
        placeholder={placeholder}
        minHeight={minHeight}
      />
    </label>
  );
}
