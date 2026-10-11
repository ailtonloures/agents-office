function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** A tiny self-contained page (data: URL) shown instead of the office when it cannot load. */
export function errorPageUrl(title: string, message: string): string {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{margin:0;height:100vh;display:grid;place-items:center;background:#1b1d2a;color:#e8e6f0;font:16px/1.5 system-ui,sans-serif}
main{max-width:34rem;padding:2rem}h1{font-size:1.25rem;margin:0 0 .75rem;color:#ffd166}p{margin:0}</style></head>
<body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></main></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}
