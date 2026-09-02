# Valency AE Panel

CEP panel for After Effects, built on Bolt CEP (Vite + React + TypeScript + Sass).

## Architecture

Two layers with a hard boundary between them:

- `src/js/` — UI and ALL application logic. Modern TypeScript, React.
- `src/jsx/aeft/aeft.ts` — host layer. ONLY thin wrappers around the After
  Effects DOM. No calculations, no state, no business logic here.

Calls from UI into the host layer go through `evalTS("functionName", args)`.

When adding a feature, decide first which layer each piece belongs to.
If logic can live in `src/js/`, it must live there.

## Exposing host functions

Declaring a function in `src/jsx/aeft/aeft.ts` is not enough for `evalTS()`
to see it. It must also be re-exported through `src/jsx/index.ts`, which is
where the `Scripts` type is assembled. Adding a host function is always two
edits, never one.

## Host layer constraints — read before editing src/jsx/

Code in `src/jsx/` is written in ES6 and compiled down to ES3 by Babel.

SYNTAX IS FINE. const, let, arrow functions, template literals,
destructuring and spread are all transpiled by @babel/preset-env.

RUNTIME METHODS ARE NOT. Babel does not polyfill them, and they fail at
runtime inside After Effects with no build-time warning.

Never use in src/jsx/:
- Array.prototype.map / filter / forEach / indexOf / find / includes
- Object.keys, Object.assign, Object.entries
- String.prototype.includes / trim / startsWith / endsWith
- Promise, async/await — there is no event loop in ExtendScript
- Array.isArray, Object.freeze — use the ponyfilled versions

Replacements already exist in `src/jsx/utils/utils.ts`
(forEach, map, filter, includes, indexOf, join). Import from there.
When you need a helper that is missing, add it to utils.ts rather than
writing an inline loop each time.

Every operation that modifies the project must be wrapped:
  app.beginUndoGroup("Action name");
  ... changes ...
  app.endUndoGroup();

## Documentation

After Effects scripting API: https://ae-scripting.docsforadobe.dev/
Do not invent AE API methods from memory — verify against the docs.

## Commands

yarn build — build + create symlink into the CEP extensions folder
yarn dev   — hot reload development mode
yarn zxp   — package as ZXP for installation

## Never chain an edit and a commit in one shell invocation

Write the edit. **Stop.** Check the tree in a separate command. Commit in a
third. Do not join those steps with `&&`, `;`, or a heredoc that ends in a
`git commit`.

The reason is mechanical. A broken chain skips everything after the break —
silently. But `git add -A && git commit` is not skipped when the break is a
Python `AssertionError` on a stale anchor, because that failure happens inside
the heredoc and the shell moves on. The result is a commit whose message
describes work the tree does not contain, with no error anywhere and exit 0.

This has happened three times:

- a commit adding a dev-only licensing bypass shipped the release guard and the
  CSS but none of the four source edits that made the flag do anything;
- a merge conflict stopped a chain, so four wiring edits never ran while the
  commit that followed them did;
- a post-parity summary commit claimed a table of completed items and their
  commits that had failed to write.

Each was caught only by checking afterwards. **Describing the symptom did not
prevent it — separating the steps does**, because a commit that is its own
invocation cannot inherit a failure from an edit that never ran.

**What to check between the two steps:** grep for the thing the message claims,
in the file it claims to be in. For a build-time flag or a token, check the
built bundle rather than the source — Vite can eliminate a branch entirely, and
SCSS can compile a variable away.

## Conventions

Branch per tool: tool/<tool-name>
Commit messages: clean, no Co-Authored-By, no mentions of Claude Code.
