import { useEffect, useState } from "react";
import { api, ApiError } from "../../api/client";
import type { Repo, SetupStep } from "../../api/types";
import { VIEWS, type View } from "../SideMenu/SideMenu";
import "../AddProject/AddProject.css";
import "./Help.css";

// The setup steps for a project. Loaded in the app too, so the menu can show how many
// are left.
export function useSetup(repo: Repo | null) {
  const [steps, setSteps] = useState<SetupStep[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setSteps(null);
    setError(null);
    if (!repo) return;
    let stale = false;
    api
      .setup(repo.id)
      .then((result) => !stale && setSteps(result))
      .catch((e: ApiError) => !stale && setError(e.message));
    return () => {
      stale = true;
    };
  }, [repo?.id, repo?.ai]);
  // Picking an AI tool is optional, so it doesn't count as left to do.
  const todo = steps?.filter((step) => step.done === false && step.id !== "ai").length ?? 0;
  return { steps, error, todo };
}

// What each screen is for, in more words than the menu has room for.
const GUIDE: Partial<Record<View, string>> = {
  home: "Every project you've connected, with its branch, what isn't committed yet and its latest commit. Click a project to show it here: its branch changes (pick another branch, click a file to see it in Changes), its branch flow and a map of its parts. Double-click a project to open its summary. Each section's link opens its full screen (This branch, Branch flow, Project map). Your to-dos and the next few days on your calendar are at the bottom.",
  digest: "Every prompt you gave your AI coding tool on one day, in every connected project: the files and functions it changed and whether that's committed yet. Changes touching sign-in, payments, the database or tests, or adding something that looks like a key, come first under Needs a look. The flags come from simple rules, not AI. A prompt counts every file that changed while it ran, however the AI changed it; one changed without the tool's own edit tools (a shell command, or your own edit at the same time) is marked changed during this prompt. Work from a cloud session shows once it is committed and on a branch here, pushed and synced or pulled: any commit with an AI co-author counts, listed under its commit message and marked From a cloud session. Files written straight into the folder outside any AI prompt on this computer, with no commit, can't be told apart from your own edits, so they aren't counted here; you still see them under Changes and as uncommitted work.",
  summary: "The whole project in one place: what it is, how its parts work together, what it's built with, and who works on it. Your AI (picked in Settings) can write a plain-English description.",
  overview: "How big the change is on the speedometer, how much of it was made with AI, and the latest commits.",
  flow: "Each line is a branch. A line leaves the base branch when work starts and joins it again when it is merged. Point at a dot to see that commit.",
  map: "Each box is a part of the project. An arrow from one box to another means the first uses code from the second. Glowing boxes changed on this branch.",
  constellation: "The same parts as the project map, drawn as a sky: your project is the sun, each part an orb with a small tree of its folders and files. Files this branch changed glow, and light runs along the imports. Pick a part in the list or the sky and the camera flies to it, its tree opens with file names, and the panel on the right shows its files, functions and imports. Click a file dot or row to see that file's changes. Scroll to zoom, drag to move, Esc to go back.",
  changes: "One file at a time, function by function: what it looked like before, what it does now, and, from your AI, what the change improves and what it costs. Lines shows every changed line. Press j and k to move between files.",
  commits: "Every commit on this branch, newest first, with who made it and when.",
  planner: "Your to-dos, each for this branch, the whole project or anything, and the week ahead from your calendar. Double-click a to-do to edit it.",
  project: "Add another git folder, connect your AI coding tool to record the request behind each change, or remove a project.",
  settings: "Dark or light, whether uncommitted work shows from the start, your password and signing out, and the shortcut keys: click a key to change it. Settings are saved by DevDash, so every browser you sign in from gets the same.",
};

const COLOURS = [
  { swatch: "var(--dd-add)", text: "Added: new lines and new files" },
  { swatch: "var(--dd-del)", text: "Removed: deleted lines and files" },
  { swatch: "var(--dd-mod)", text: "Changed: files that were edited" },
  { swatch: "var(--dd-accent)", text: "Glowing: part of the branch on screen" },
  { swatch: "#f59e0b", text: "Gold dot: a commit made with AI" },
];

// The Help screen: the setup steps for this project beside a guide to every screen.
export default function Help({ repo, steps, error }: { repo: Repo; steps: SetupStep[] | null; error: string | null }) {
  const required = steps?.filter((step) => step.done !== null && step.id !== "ai") ?? [];
  const done = required.filter((step) => step.done).length;
  return (
    <div className="help">
      <section className="card help__setup">
        <header className="help__header">
          <div>
            <h2>Set up DevDash</h2>
            <p className="help__note">For {repo.name}</p>
          </div>
          {steps && required.length > 0 && (
            <span className={`help__progress${done === required.length ? " help__progress--done" : ""}`}>
              {done === required.length ? "All set" : `${done} of ${required.length} done`}
            </span>
          )}
        </header>
        {error ? (
          <p className="modal__error">{error}</p>
        ) : steps === null ? (
          <p className="help__note">Checking…</p>
        ) : (
          <ol className="steps">
            {steps.map((step) => (
              <Step key={step.id} step={step} />
            ))}
          </ol>
        )}
      </section>

      <section className="card help__guide">
        <h2>What each screen shows</h2>
        <ul className="guide">
          {VIEWS.filter((item) => GUIDE[item.id]).map((item, i) => (
            <li key={item.id}>
              <span className="guide__icon">{item.icon}</span>
              <div>
                <h3>
                  {item.label} <kbd>{i + 1}</kbd>
                </h3>
                <p>{GUIDE[item.id]}</p>
              </div>
            </li>
          ))}
        </ul>
        <h2 className="help__subheading">Colours</h2>
        <ul className="colours">
          {COLOURS.map((colour) => (
            <li key={colour.text}>
              <span style={{ background: colour.swatch }} />
              {colour.text}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Step({ step }: { step: SetupStep }) {
  const [copied, setCopied] = useState(false);
  const state = step.done === true ? "done" : step.done === false ? "todo" : "info";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(step.command ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; the text is still selectable */
    }
  };

  return (
    <li className={`step step--${state}`}>
      <span className="step__mark" aria-label={state === "done" ? "Done" : state === "todo" ? "Not done" : "To do yourself"}>
        {state === "done" ? "✓" : state === "todo" ? "" : "i"}
      </span>
      <div className="step__body">
        <h3>{step.title}</h3>
        <p>{step.detail}</p>
        {step.command && (
          <div className="step__command">
            <pre>{step.command}</pre>
            <button onClick={copy}>{copied ? "Copied" : "Copy"}</button>
          </div>
        )}
      </div>
    </li>
  );
}
