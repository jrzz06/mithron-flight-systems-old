type JsonLdProps = {
  data: Record<string, unknown> | Array<Record<string, unknown>>;
};

function serializeJsonLd(data: JsonLdProps["data"]) {
  return JSON.stringify(data).replace(/<\/script/gi, "<\\/script");
}

export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
