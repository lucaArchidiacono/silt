# Silt Electron App Design

Date: 2026-03-17
Status: Approved
Owner: Codex + user

## Summary

Add a new `electron/` desktop app alongside the existing TUI. The Electron app targets macOS first and reaches feature parity with the TUI for:

- Write interface
- Search interface
- AI interface
- Settings for cloud sync providers
- Settings for LLM providers
- Auto/manual sync behaviors
- Log viewing

This first milestone is a developer app only. It does not include signing, notarization, or release packaging.

## Product Decisions

- Keep the existing TUI and add Electron as a sibling client.
- Include full AI parity in v1, not just provider configuration.
- Target macOS first.
- Use a standard desktop UI, not a TUI-style modal interaction model.
- Open Settings in a separate window from a gear icon in the main window header.
- Treat the Electron renderer importing NAPI directly as acceptable for the macOS dev-only milestone.

## Goals

- Deliver a desktop-native app shell for Silt without changing the Rust data model.
- Reuse the existing Rust core and NAPI bindings as much as possible.
- Preserve the current local-first storage model and config schema.
- Keep the main writing experience focused, with configuration isolated to a dedicated settings window.

## Non-Goals

- Replacing the TUI
- Building a shared component system between TUI and Electron in v1
- Signing, notarization, and polished release packaging
- Reworking the Rust sync or AI architecture unless an Electron-specific gap forces it
- Supporting Windows or Linux in the first milestone

## Approaches Considered

### 1. Electron shell with preload/IPC bridge

This is the safest long-term Electron architecture. The renderer talks to a typed preload API and never touches the native module directly.

Trade-offs:

- Better isolation
- Cleaner path to future hardening
- More upfront scaffolding
- Slower route to first working app

### 2. Electron renderer imports NAPI directly

This is the selected approach for v1. The renderer uses an Electron-specific wrapper around the existing native module and owns most app behavior.

Trade-offs:

- Fastest path to a working app
- Maximum reuse of current JS-side patterns
- Tighter coupling between renderer and native APIs
- Not the architecture to keep unchanged for a later signed release

### 3. Shared frontend package before building Electron

This would extract reusable app logic for both TUI and Electron before building the new UI.

Trade-offs:

- Cleanest long-term structure
- Highest upfront cost
- Delays shipping the Electron client

## Recommended Architecture

Add a sibling `electron/` app with:

- Electron main process for window lifecycle and desktop integrations
- React renderer for the main app UI
- React renderer for the settings window UI
- Electron-specific `silt` wrapper that imports the NAPI addon directly

The main process stays thin. It is responsible for:

- Creating the main window
- Creating or focusing a single-instance settings window
- Opening external OAuth URLs
- Owning small desktop-only helpers when needed

The renderer owns:

- Entry creation, editing, deletion
- Search
- AI queries
- Sync status UI
- Log viewer UI
- Settings forms and provider connection flow

We do not share UI components with the TUI in v1. We share backend behavior through Rust and NAPI, and optionally share small JS utility functions later if that becomes worthwhile.

## Package Layout

Proposed structure:

```text
silt/
├── electron/
│   ├── package.json
│   ├── tsconfig.json
│   ├── electron-main/
│   │   └── main.ts
│   ├── src/
│   │   ├── main.tsx
│   │   ├── settings.tsx
│   │   ├── app/
│   │   ├── settings/
│   │   ├── components/
│   │   └── silt.ts
│   └── vite.config.ts or equivalent renderer build config
```

This app remains separate from `tui/` to keep the first milestone small and avoid pulling terminal-specific state assumptions into the desktop UI.

## UI Design

### Main Window

The main window contains:

- Header with app title and gear icon at top right
- Main navigation for `Write`, `Search`, and `AI`
- Main content area for the selected view
- Status area for sync and AI progress

The UI is mouse-first and desktop-native. Keyboard shortcuts can be layered on later, but they are not the primary interaction model.

### Settings Window

The settings window opens when the user clicks the gear icon. It is a separate window, not an in-place panel.

Requirements:

- Single-instance behavior
- Focus the existing settings window if already open
- Separate sections for `Sync Providers` and `LLM Providers`
- Provider connection/disconnection state
- API key and URL editing where applicable

### Write View

- Markdown textarea
- Save action
- Recent entries list in the same window
- Edit/delete actions for selected entries
- Inline error handling that does not discard unsaved text

### Search View

- Search field
- Results list
- Selected result detail preview
- Actions for edit/delete when appropriate

### AI View

- Prompt input
- Response panel
- Loading state
- Error state
- Uses provider/model configuration from shared settings

### Log Viewer

- Accessible from the desktop UI
- Read current in-memory log buffer
- Refresh logs
- Clear logs
- Copy logs

## Feature Mapping from TUI

### Entry Operations

- `new_entry`
- `list_entries`
- `search`
- `edit_entry`
- `delete_entry`
- `rebuild_index`

These continue to come from the existing `SiltSession` NAPI API.

### Sync Operations

Parity requirements:

- Pull on startup when any provider is connected
- Push after save/edit/delete
- Manual push-all
- Manual pull-all
- Dropbox connect/disconnect
- Google Drive connect/disconnect

### AI Operations

Parity requirements:

- Select provider: `ollama` or `openrouter`
- Set model
- Set Ollama base URL
- Set OpenRouter API key
- Submit AI query through the existing async `ai_query` call

## Data Flow

### Main Window

On startup:

1. Load entries from NAPI
2. Inspect sync configuration from `settings.json`
3. If any sync provider is configured, start a background pull
4. Rebuild or refresh the list after pull completion if files changed

On save/edit/delete:

1. Execute the local entry mutation through NAPI
2. Refresh the local entry list
3. If sync providers are connected, push changed entries in the background
4. Show concise status in the main window

On AI query:

1. Read provider configuration indirectly through the existing async `ai_query` task
2. Run the request
3. Show response or error in the AI view

### Settings Window

The settings window reads and writes the same `settings.json` file through the existing config APIs.

When settings change:

- Persist the updated value immediately or on explicit save, depending on final form design
- Notify the main window that settings changed
- Refresh provider status in the main window
- Trigger initial sync behavior after a provider is newly connected

## OAuth Flow

OAuth remains in the settings window because that is where provider configuration lives.

The flow reuses the current TUI behavior conceptually:

1. Generate PKCE verifier/challenge
2. Open the provider authorization page in the external browser
3. Start a localhost callback server from the Electron/Node side
4. Receive authorization code
5. Exchange code for tokens
6. Persist tokens through config APIs
7. Trigger initial sync

Implementation note:

- The existing TUI helper uses Bun-specific APIs. Electron will need Node/Electron replacements for the local callback server, browser launch, and clipboard helpers.

## NAPI and Core Changes

The first Electron milestone should avoid large Rust changes. Most of the current native surface is reusable as-is.

Expected reusable APIs:

- `SiltSession`
- `get_config`
- `set_config`
- `sync_push_entries`
- `sync_push_all`
- `sync_pull_async`
- Google Drive equivalents
- `get_logs`
- `clear_logs`
- `ai_query`

Potential ergonomic additions, but not blockers:

- `remove_config(key)` for cleaner disconnect flows
- `get_settings_snapshot()` to reduce repeated per-key reads
- A higher-level sync status helper if the renderer ends up duplicating too much logic

## Error Handling

### Entry Operations

- Show inline errors near write/search/edit flows
- Never discard unsaved text because of an operation failure
- Keep detailed diagnostics available through logs

### Sync

- Sync failures do not block local writes
- Show concise status in the main window
- Keep detailed provider-tagged messages in logs

### OAuth

Handle:

- Timeout
- User-canceled flow
- Invalid callback payload
- Token exchange failure
- Persist failure after token exchange

Connection is only considered complete after tokens are written successfully.

### AI

Handle:

- Invalid Ollama URL
- Ollama unavailable
- Missing OpenRouter key
- Provider HTTP failures
- Empty or malformed responses

User-facing errors stay readable. Technical detail remains available in logs.

## Testing Strategy

For this milestone:

- Extend `make check` to include Electron typechecking
- Add renderer tests for entry mutation flows and settings state
- Add integration coverage for startup pull and mutation-triggered push behavior
- Add coverage for settings-window auth helpers where practical
- Continue to rely on Rust/core tests for entry, index, sync-adapter, and AI-provider correctness

## Build and Development

Developer milestone requirements:

- `make electron-dev` runs the Electron app in development mode
- `make electron` builds a runnable macOS developer app
- Existing `make check` includes Electron typechecking

No release installer, signing, or notarization is required in this phase.

## Risks

- Direct NAPI usage in the renderer is expedient but not ideal for a hardened desktop release
- OAuth logic currently lives in Bun-flavored helpers and must be reimplemented carefully for Electron
- TUI behavior and Electron UX can diverge if parity is defined loosely; parity should mean capability parity, not identical interaction patterns
- Settings-window-to-main-window synchronization must stay simple to avoid stale status or duplicated sync triggers

## Rollout Boundary

The first Electron milestone is complete when:

- The repo contains a new `electron/` app
- The app runs on macOS in developer mode
- The main window supports Write, Search, and AI
- The main window includes a top-right gear icon
- Clicking the gear opens a single-instance settings window
- The settings window supports sync-provider configuration and LLM-provider configuration
- Startup pull, mutation-triggered push, manual sync, and logs are available
- The app uses the same local storage and config files as the TUI and CLI

## Follow-up Work After v1

- Migrate from direct renderer NAPI imports to a preload/IPC boundary
- Add packaging for local distribution
- Add signing and notarization
- Evaluate extracting shared JS domain logic between TUI and Electron
- Expand to Windows and Linux if the Electron app proves out
