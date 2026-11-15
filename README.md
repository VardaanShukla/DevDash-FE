# devdash-ui

The DevDash dashboard: shows what changed in your repos, in a way people who don't read
code can follow. It is a React and TypeScript page built with Vite. Everything it shows
comes from the DevDash backend, [DevDash-BE](https://github.com/VardaanShukla/DevDash-BE),
which also serves a built copy of this page.

## Use it

You don't need this repo or Node to use DevDash: the backend comes with a built copy of
this page. On Linux, macOS or Windows:

```sh
pipx install git+https://github.com/VardaanShukla/DevDash-BE.git
devdash serve
```

Then open http://127.0.0.1:8765. See the backend's README for more.

## Work on it

Needs Node 18 or newer.

1. Keep the backend running: `devdash serve`.
2. In this repo, start the dev server, which reloads as you edit:

   ```sh
   npm install
   npm run dev
   ```

3. Open http://localhost:5173.

The dev server forwards every `/api` call to `http://127.0.0.1:8765` (see
`vite.config.ts`). The API only accepts changes from the page on port 5173 or 4173 (or from
the one it serves itself), so keep those ports.

To ship a change, build it into the backend and commit the result there:

```sh
cd ../DevDash-BE
python scripts/build_ui.py ../DevDash-FE
```

`npm run build` alone type-checks and writes the page to `dist/`; `npm run preview` serves
that on http://localhost:4173.

## What's inside

- `src/App.tsx` picks the screen from the side menu and loads its data.
- `src/api/` talks to the backend: `client.ts` for requests, `types.ts` for what each
  endpoint returns.
- `src/components/<Name>/` holds one screen or part of a screen each, with its own CSS:
  Home (and Widgets, the grid of widgets it's made of, with every kind of widget in
  `catalog.tsx`), Summary (with the KT tab; `ktPdf.ts` writes its PDF), Ask, Overview
  (this branch), FlowGraph (branch flow), ProjectMap, FileChanges, CommitList, Digest
  (the AI's changes), Settings (with Ollama's model suggestions), Tour (the first-time
  walkthrough), and the menus, sign-in and help around them.
- `src/lib/aiJobs.ts` keeps AI runs going when you leave a screen, and paces the KT's
  progress bar.
- `src/styles/` has the colours and type shared by every screen, in dark and light themes.

The backend's README lists every endpoint the page uses.

## License

DevDash is created by [Vardaan Shukla](https://github.com/VardaanShukla) and released under the [Apache License 2.0](LICENSE). Copies and forks must keep the [NOTICE](NOTICE) file with that credit.
