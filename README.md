# devdash-ui

The DevDash dashboard: shows what changed in your repos, in a way people who don't read
code can follow. It is a React and TypeScript page built with Vite. Everything it shows
comes from the DevDash backend, [DevDash-BE](https://github.com/VardaanShukla/DevDash-BE),
so the backend has to be running for the page to work.

## Run it with the backend

Needs Python 3.10 or newer, Node 18 or newer, and git.

1. Install the backend and start its API on port 8765. Leave it running:

   ```sh
   git clone https://github.com/VardaanShukla/DevDash-BE.git devdash-be
   cd devdash-be
   pipx install -e .          # or: python3 -m pip install -e .
   devdash serve
   ```

2. In a second terminal, install the UI and start it on port 5173:

   ```sh
   git clone https://github.com/VardaanShukla/DevDash-FE.git devdash-ui
   cd devdash-ui
   npm install
   npm run dev
   ```

3. Open http://localhost:5173. The first visit asks you to pick a username and password,
   then to add a project: the path of any git folder on your computer.

The dev server forwards every `/api` call to `http://127.0.0.1:8765` (see
`vite.config.ts`), so the page and the API never need to know each other's address. The
API only accepts requests from the page on port 5173 or 4173, so keep those ports.

## Build

```sh
npm run build      # type-checks, then writes the page to dist/
npm run preview    # serves dist/ on http://localhost:4173, forwarding /api the same way
```

## What's inside

- `src/App.tsx` picks the screen from the side menu and loads its data.
- `src/api/` talks to the backend: `client.ts` for requests, `types.ts` for what each
  endpoint returns.
- `src/components/<Name>/` holds one screen or part of a screen each, with its own CSS:
  Home, Summary, Overview (this branch), FlowGraph (branch flow), ProjectMap,
  Constellation, FileChanges, CommitList, Digest (Claude's changes), Agenda and Todos
  (my day), and the menus, sign-in and help around them.
- `src/styles/` has the colours and type shared by every screen, in dark and light themes.

The backend's README lists every endpoint the page uses.
