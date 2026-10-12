export interface DocumentMeta {
  title: string;
  description: string;
}

const MIRRORED: readonly { selector: string; field: keyof DocumentMeta }[] = [
  { selector: 'meta[name="description"]', field: 'description' },
  { selector: 'meta[property="og:title"]', field: 'title' },
  { selector: 'meta[property="og:description"]', field: 'description' },
  { selector: 'meta[name="twitter:title"]', field: 'title' },
  { selector: 'meta[name="twitter:description"]', field: 'description' },
];

/** Keeps the tab title and the description/social tags in the visitor's language. */
export function applyDocumentMeta(meta: DocumentMeta, doc: Document = document): void {
  doc.title = meta.title;
  for (const { selector, field } of MIRRORED) {
    doc.head.querySelector(selector)?.setAttribute('content', meta[field]);
  }
}
