import { Fragment } from "react";
import { normalizeSearchText } from "@/lib/search-query";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function splitSearchHighlight(text: string, query: string) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [{ text, match: false }];

  const pattern = new RegExp(`(${escapeRegExp(normalizedQuery)})`, "ig");
  const parts = text.split(pattern).filter(Boolean);

  return parts.map((part) => ({
    text: part,
    match: part.toLowerCase() === normalizedQuery
  }));
}

export function SearchHighlight({
  text,
  query,
  className
}: {
  text: string;
  query: string;
  className?: string;
}) {
  const parts = splitSearchHighlight(text, query);

  return (
    <>
      {parts.map((part, index) =>
        part.match ? (
          <mark key={`${part.text}-${index}`} className={className}>
            {part.text}
          </mark>
        ) : (
          <Fragment key={`${part.text}-${index}`}>{part.text}</Fragment>
        )
      )}
    </>
  );
}
