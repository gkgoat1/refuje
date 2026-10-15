# Phase 1 task 1 — plugin contract and consent

## 1. Where this task sits

- **Phase**: Phase 1 Prove consented dynamic Web Worker loading; goal: install and unload a plugin cleanly.
- **Moves**: R-2 Dynamic Web Worker plugin loading and R-6 Versioned, testable plugin integrations.
- **Starts after**: the approved recipe plan; **waits on**: the Worker loader and headless host.

## 2. What the developer needs to know

**Read first**

- `RECIPE_SYSTEM_PLAN.md` — resolved plugin consent, dependency graph, and storage decisions.
- `package.json` — current browser build and test commands.
- `web/tsconfig.json` — browser TypeScript boundary.

**Settled**

- User consent, not cryptographic verification, gates installation.
- A fresh Web Worker belongs to one plugin instance.
- Local uploads use OPFS; consent may be temporary or persistent.

**Edges and seam**

- Touches the headless recipe package model and local storage adapters.
- Seam: manifest/package parsing and consent decision.

**Run**

- `npm run build:web`; add focused tests before the phase commit.

**Unknowns**

- Browser support for OPFS and directory uploads. Keep a memory fallback if unavailable.

## 3. The workflow

1. Read this brief and restate the task in one line.
2. Define manifest, module, package, capability, and consent types.
3. Parse and validate local package metadata without executing plugin code.
4. Add OPFS and memory storage interfaces with consent lifetime options.
5. Add focused valid, invalid, temporary, and persistent cases.
6. Run the web build and commit the phase work.

## 4. The test cases

| Case | Input | Expected | Seam |
|---|---|---|---|
| 1 | valid manifest and modules | normalized package accepted | package parser |
| 2 | missing entry module | package rejected | package parser |
| 3 | temporary consent | package absent after session cleanup | storage adapter |
| 4 | persistent consent | package metadata reloads | OPFS adapter |
| 5 | unavailable OPFS | memory fallback remains usable | storage adapter |
