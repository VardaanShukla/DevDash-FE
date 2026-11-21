// What you can do on the detailed KT: find files, show one part's files (from the map or the
// filter buttons), jump to a file from any file name and see it highlighted, move through the
// contents, and copy a command. Plain DOM code with nothing from outside the function, so the
// page to download can carry it as text (attachKt.toString()) and run it with no React.
// Returns a function that takes it all off again.

export function attachKt(root: HTMLElement): () => void {
  const search = root.querySelector<HTMLInputElement>("[data-kt-search]");
  const count = root.querySelector<HTMLElement>("[data-kt-count]");
  let part = "";

  function apply() {
    const words = (search?.value || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    root.querySelectorAll<HTMLElement>("[data-partblock]").forEach((block) => {
      let visible = 0;
      block.querySelectorAll<HTMLElement>("tr[data-file]").forEach((row) => {
        const text = row.dataset.search || "";
        const hit = (!part || row.dataset.part === part) && words.every((w) => text.includes(w));
        row.hidden = !hit;
        if (hit) visible += 1;
      });
      block.hidden = visible === 0;
      if (visible && words.length) (block as HTMLDetailsElement).open = true;
      shown += visible;
    });
    root.querySelectorAll<HTMLElement>(".ktdoc__filters [data-part-filter]").forEach((button) => {
      button.setAttribute("aria-pressed", String((button.dataset.partFilter || "") === part));
    });
    if (count) count.textContent = words.length || part ? `${shown} file${shown === 1 ? "" : "s"} shown` : "";
  }

  function goTo(id: string) {
    const target = root.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function showPart(id: string) {
    part = id;
    apply();
    goTo("kt-files");
  }

  function jump(path: string) {
    const row = Array.from(root.querySelectorAll<HTMLElement>("tr[data-file]")).find((r) => r.dataset.file === path);
    if (!row) return;
    if (row.hidden) {
      part = "";
      if (search) search.value = "";
      apply();
    }
    const block = row.closest("details");
    if (block) (block as HTMLDetailsElement).open = true;
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.classList.remove("is-hit");
    void row.offsetWidth;
    row.classList.add("is-hit");
    window.setTimeout(() => row.classList.remove("is-hit"), 2400);
  }

  function onClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const jumpTo = target.closest<HTMLElement>("[data-jump]");
    if (jumpTo) {
      event.preventDefault();
      jump(jumpTo.dataset.jump || "");
      return;
    }
    const filter = target.closest<HTMLElement>("[data-part-filter]");
    if (filter) {
      showPart(filter.dataset.partFilter || "");
      return;
    }
    const node = target.closest<HTMLElement>("[data-map-part]");
    if (node) {
      showPart(node.dataset.mapPart || "");
      return;
    }
    const copy = target.closest<HTMLElement>("[data-copy]");
    if (copy) {
      const text = copy.dataset.copy || "";
      const done = () => {
        copy.textContent = "Copied";
        window.setTimeout(() => (copy.textContent = "Copy"), 1500);
      };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => {});
      return;
    }
    const link = target.closest<HTMLAnchorElement>('a[href^="#kt-"]');
    if (link) {
      event.preventDefault();
      goTo(link.getAttribute("href")!.slice(1));
    }
  }

  function onKey(event: KeyboardEvent) {
    const node = (event.target as HTMLElement).closest<HTMLElement>("[data-map-part]");
    if (node && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      showPart(node.dataset.mapPart || "");
    }
  }

  root.addEventListener("click", onClick);
  root.addEventListener("keydown", onKey);
  search?.addEventListener("input", apply);
  apply();
  return () => {
    root.removeEventListener("click", onClick);
    root.removeEventListener("keydown", onKey);
    search?.removeEventListener("input", apply);
  };
}
