const DRAFT_PREFIX = "mithron-editor-draft:";

export function editorDraftStorageKey(documentType: string, documentId: string) {
  return `${DRAFT_PREFIX}${documentType}:${documentId}`;
}

export function readEditorDraft(documentType: string, documentId: string) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(editorDraftStorageKey(documentType, documentId));
    return raw ? (JSON.parse(raw) as { json: unknown; savedAt: string }) : null;
  } catch {
    return null;
  }
}

export function writeEditorDraft(documentType: string, documentId: string, json: unknown) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    editorDraftStorageKey(documentType, documentId),
    JSON.stringify({ json, savedAt: new Date().toISOString() })
  );
}

export function clearEditorDraft(documentType: string, documentId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(editorDraftStorageKey(documentType, documentId));
}
