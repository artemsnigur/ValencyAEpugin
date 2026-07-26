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

## Host layer constraints — read before editing src/jsx/

Code in `src/jsx/` compiles down to ES3. The build will NOT catch violations;
they fail at runtime inside After Effects.

Forbidden: const, let, arrow functions, template literals, destructuring,
spread, Promise, async/await, Array.map/filter/forEach/indexOf/find,
Object.keys, JSON methods beyond what the bundled JSON2 provides.

Use only: var, function declarations, for loops, plain string concatenation.

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

## Conventions

Branch per tool: tool/<tool-name>
Commit messages: clean, no Co-Authored-By, no mentions of Claude Code.
