# Silt Electron App Implementation Plan

Date: 2026-03-17
Status: Drafted from approved design
Depends on: `docs/plans/2026-03-17-electron-app-design.md`

## Objective

Build a new macOS-first Electron app in `electron/` that reaches functional parity with the TUI for:

- Write
- Search
- AI query
- Settings in a separate window
- Cloud sync provider configuration
- LLM provider configuration
- Auto/manual sync
- Log viewing

This milestone is a developer app only. It does not include signing, notarization, or release packaging.

## Delivery Strategy

Build the Electron app in vertical slices, but sequence the work so that infrastructure lands first:

1. Electron app scaffold and build integration
2. Native bridge wrapper and shared app plumbing
3. Main window shell and navigation
4. Write/search/log flows
5. Settings window and provider configuration
6. OAuth flows for Dropbox and Google Drive
7. Sync automation and status handling
8. AI flow
9. Validation and polish

## Phase 1: Scaffold Electron App

### Goals

- Create `electron/` as a sibling app
- Establish Electron main process and React renderer build
- Support `make electron-dev` and `make electron`
- Add Electron typechecking to `make check`

### Tasks

- Add `electron/package.json`
- Add `electron/tsconfig.json`
- Add renderer build config
- Add Electron main entrypoint
- Add renderer entrypoint(s) for main window and settings window
- Wire development scripts for running Electron against the renderer
- Wire production build scripts for a runnable macOS developer app
- Update the root `Makefile`

### Exit Criteria

- Electron app launches successfully
- Main window renders placeholder content
- `make electron-dev` works
- `make electron` produces a runnable developer build
- `make check` runs Electron typechecking

## Phase 2: Create Electron Native Wrapper

### Goals

- Reuse the existing NAPI addon from the Electron renderer
- Isolate native calls behind `electron/src/silt.ts`
- Replace Bun-only helpers with Electron/Node equivalents where needed

### Tasks

- Create `electron/src/silt.ts`
- Port entry APIs from `tui/src/silt.ts`
- Port config APIs from `tui/src/silt.ts`
- Port sync APIs from `tui/src/silt.ts`
- Port log APIs from `tui/src/silt.ts`
- Port AI query API from `tui/src/silt.ts`
- Stub desktop-only helper functions for external URL opening and clipboard actions

### Exit Criteria

- Renderer can list entries
- Renderer can write a test entry and remove it manually during development
- Config reads/writes work through the wrapper

## Phase 3: Main Window App Shell

### Goals

- Build the desktop-native main window
- Add top-right gear icon
- Support navigation between `Write`, `Search`, and `AI`

### Tasks

- Create app shell layout
- Add header and gear-button action
- Add section navigation
- Add shared status area
- Add window-level loading and error state primitives
- Add simple state container for entries, selection, status, and in-flight actions

### Exit Criteria

- Main window loads with desktop-native structure
- Gear icon opens or focuses the settings window
- Navigation between sections works

## Phase 4: Write and Entry Management

### Goals

- Reach parity for writing, listing, editing, and soft deletion

### Tasks

- Build markdown textarea for new entries
- Build recent entries list
- Add save flow using `new_entry`
- Add edit flow using `edit_entry`
- Add delete flow using `delete_entry`
- Refresh list after each mutation
- Preserve unsaved text on failure
- Add inline error and success messaging

### Exit Criteria

- User can create an entry
- User can edit an entry
- User can delete an entry
- Recent entries update immediately

## Phase 5: Search Experience

### Goals

- Reach parity for full-text search

### Tasks

- Build search input
- Build results list
- Build selected result detail pane or preview panel
- Use NAPI search API for query execution
- Add empty-state, no-results, and error states

### Exit Criteria

- User can search entries
- Results render correctly
- Selecting a result reveals full content and available actions

## Phase 6: Logs Surface

### Goals

- Preserve TUI log visibility in a desktop-native form

### Tasks

- Add log viewer panel or modal in the main window
- Render current log buffer
- Add refresh action
- Add clear action
- Add copy action with Electron/Node clipboard support

### Exit Criteria

- User can view logs
- User can refresh, clear, and copy logs

## Phase 7: Settings Window Shell

### Goals

- Build the separate single-instance settings window
- Support both sync-provider and LLM-provider sections

### Tasks

- Add settings window creation in Electron main process
- Ensure repeated gear clicks focus the same window
- Build settings window navigation/layout
- Add provider status rows
- Add editable fields for AI configuration
- Add cross-window update signal back to the main window

### Exit Criteria

- Settings opens in a separate window
- Sync and AI settings can be viewed and edited
- Main window reacts to settings changes

## Phase 8: Dropbox and Google Drive OAuth

### Goals

- Restore provider connection flows without Bun
- Keep auth inside the settings window

### Tasks

- Reimplement PKCE helpers with web/Node APIs available in Electron
- Reimplement localhost callback listener with Node HTTP server
- Open auth URLs in the external browser
- Exchange code for access and refresh tokens
- Persist provider credentials through config APIs
- Add disconnect flows
- Trigger initial sync after first successful connection

### Exit Criteria

- Dropbox connect works end to end
- Google Drive connect works end to end
- Disconnect clears provider state cleanly

## Phase 9: Sync Behavior

### Goals

- Match current TUI sync behavior

### Tasks

- Detect configured providers on startup
- Trigger background pull on startup
- Trigger push after save/edit/delete
- Add manual push-all control
- Add manual pull-all control
- Refresh entries after successful pull
- Show progress and outcome in status UI
- Handle multi-provider aggregation cleanly

### Exit Criteria

- Startup pull works
- Mutation-triggered push works
- Manual push and pull work
- Provider failures do not block local writes

## Phase 10: AI View

### Goals

- Reach parity with the TUI AI mode using the Electron UI model

### Tasks

- Build AI prompt input
- Build response panel
- Add loading state
- Add error state
- Use existing `ai_query` async API
- Read active provider/model from shared settings
- Ensure settings changes affect the next AI request

### Exit Criteria

- User can query AI with Ollama
- User can query AI with OpenRouter
- Errors surface clearly when providers are unavailable or misconfigured

## Phase 11: Validation and Polish

### Goals

- Make the developer milestone stable enough to use

### Tasks

- Add Electron typecheck to `make check`
- Add renderer tests for entry flows and settings state
- Add targeted integration coverage for startup pull and sync-after-mutation behavior
- Verify logs, AI, and settings interactions manually
- Verify the settings window remains single-instance
- Verify startup and shutdown behavior on macOS

### Exit Criteria

- `make check` passes
- Electron app is usable end to end in development
- Major regression paths have automated coverage or explicit manual verification notes

## Suggested File-Level Breakdown

### Root

- `Makefile`
- Possibly root workspace metadata if build tooling needs it

### Electron app

- `electron/package.json`
- `electron/tsconfig.json`
- `electron/electron-main/main.ts`
- `electron/src/main.tsx`
- `electron/src/settings.tsx`
- `electron/src/silt.ts`
- `electron/src/app/*`
- `electron/src/settings/*`
- `electron/src/components/*`

### Potential native adjustments

- `napi/src/lib.rs` if config ergonomics need improvement

## Dependency Notes

- The settings window shell should land before OAuth so provider flows have a home.
- The native wrapper should land before any renderer feature work.
- Sync automation should not be finalized until both entry mutation flows and settings signals exist.
- AI UI can ship after settings because it depends on configured provider state.

## Verification Gates

Before moving from scaffold to feature work:

- Electron launches reliably
- Renderer can call NAPI

Before moving from entry flows to settings/OAuth:

- Write/search/edit/delete are stable
- Logs are visible

Before calling the milestone complete:

- End-to-end provider connection works
- End-to-end sync works
- End-to-end AI query works
- `make check` passes

## Open Implementation Questions

- Whether the main window should use top-level tabs, sidebar navigation, or segmented controls
- Whether settings fields save immediately or via explicit apply/save actions
- Whether logs should be modal, drawer, or dedicated panel in the main window
- Whether disconnect is implemented by overwriting config with empty strings or by adding a native `remove_config` API

These questions are implementation details, not blockers to starting the work.
