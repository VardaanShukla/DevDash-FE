import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import KtDocument from "./KtDocument";
import styles from "./ktDoc.css?raw";
import { attachKt } from "./ktInteract";
import type { KtModel } from "./ktModel";

// The detailed KT as one page to keep or send: its styles, script and pictures all inside the
// one .html file, so it opens offline with a double click and works as it does in DevDash
// (search, the map's filter, jumping to a file, copying a command). Light or dark as the
// computer is set.

const PAGE = `
*,*::before,*::after{box-sizing:border-box}
body{margin:0;padding:24px 16px 48px;background:#f3f4f9;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;font-size:15px}
.page{max-width:1180px;margin:0 auto}
@media (prefers-color-scheme:dark){
  body{background:#0b0d1a;--dd-ink:#e8e9f3;--dd-muted:#9aa0b8;--dd-line:rgba(255,255,255,.12);--dd-card:#151829;--dd-glass:rgba(255,255,255,.04);--dd-accent:#8b8bff}
}`;

// A picture as data, so the page needs nothing else; left as it was if it can't be read.
async function inline(src: string) {
  try {
    const blob = await (await fetch(src)).blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function downloadPage(model: KtModel) {
  const images = (await Promise.all(model.images.map(async (image) => ({ ...image, src: (await inline(image.src)) ?? "" })))).filter((i) => i.src);
  const body = renderToStaticMarkup(createElement(KtDocument, { model: { ...model, images } }));
  const title = `${model.name} · Detailed KT`.replace(/[<&]/g, (c) => (c === "<" ? "&lt;" : "&amp;"));
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${PAGE}
${styles}</style>
</head>
<body>
<main class="page">${body}</main>
<script>(${attachKt.toString()})(document.querySelector(".page"));</script>
</body>
</html>
`;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  link.download = `${model.name.replace(/[^\w.-]+/g, "-")}-KT-detailed.html`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
