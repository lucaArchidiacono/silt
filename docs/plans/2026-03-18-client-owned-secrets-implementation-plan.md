# Silt Client-Owned Secrets Implementation Plan

Date: 2026-03-18
Status: Drafted from approved design
Depends on: `docs/plans/2026-03-18-client-owned-secrets-design.md`

## Objective

Remove sync tokens and the OpenRouter API key from `settings.json` and move them to client-owned secure storage for the current TUI implementation on macOS and Linux.

The first implementation should:

- keep secrets out of `settings.json`
- keep safe settings in the existing config path
- make sync and AI calls use explicit credentials instead of implicit config lookup
- use a hard cut for old plaintext secrets

## Delivery Strategy

Build this in layers so the request/response boundary is stable before the TUI storage and UI changes land:

1. Define explicit native request/response types
2. Build the TUI secure-store adapter
3. Refactor sync flows to use client-supplied credentials
4. Refactor AI flows to use client-supplied provider config
5. Update settings UI and auth flows
6. Remove legacy secret usage and validate behavior

## Phase 1: Define Explicit Credential APIs

### Goals

- Remove implicit secret lookup from the NAPI sync and AI entry points
- Make refreshed provider state return to the TUI explicitly
- Keep the Rust side storage-agnostic for secrets

### Tasks

- Add NAPI request structs for Dropbox sync input
- Add NAPI request structs for Google Drive sync input
- Add NAPI response structs that can include refreshed access tokens
- Add NAPI response fields for updated Google Drive folder ID
- Add NAPI request struct for AI provider input
- Refactor async sync tasks in `napi/src/lib.rs` to consume request objects
- Refactor `ai_query` in `napi/src/lib.rs` to consume explicit provider input
- Keep existing entry and metadata config APIs unchanged where possible

### Exit Criteria

- No sync task in `napi/src/lib.rs` reads provider tokens from `settings.json`
- No AI call in `napi/src/lib.rs` reads `openrouter_api_key` from `settings.json`
- TypeScript definitions expose the new request/response types cleanly

## Phase 2: Build TUI Secure Store Adapter

### Goals

- Give the TUI a platform-specific secret store on macOS and Linux
- Keep the implementation simple and local to the client

### Tasks

- Create a TUI-side secret-store module, for example `tui/src/secureStore.ts`
- Define a minimal interface: `get`, `set`, `delete`, `exists`
- Implement a macOS backend using the `security` CLI
- Implement a Linux backend using the `secret-tool` CLI
- Use consistent logical secret keys:
  - `sync.dropbox.access_token`
  - `sync.dropbox.refresh_token`
  - `sync.google_drive.access_token`
  - `sync.google_drive.refresh_token`
  - `ai.openrouter.api_key`
- Add clear error messages when the required OS tool is unavailable

### Exit Criteria

- The TUI can persist, read, and delete secrets without touching `settings.json`
- macOS and Linux backends both compile and have testable call sites

## Phase 3: Refactor Sync Calls

### Goals

- Make the TUI supply sync credentials explicitly
- Persist refreshed tokens returned from Rust

### Tasks

- Update `tui/src/silt.ts` sync helpers to accept/request provider credentials from the secure store
- Pass Dropbox credentials explicitly into the new NAPI sync APIs
- Pass Google Drive credentials explicitly into the new NAPI sync APIs
- After each sync call, write any refreshed access token back into the secure store
- After Google Drive sync, persist any updated folder ID in safe config
- Update `tui/src/hooks/useSync.ts` to derive provider availability from the secure store instead of `getConfig("..._token")`

### Exit Criteria

- Dropbox sync works without token values in `settings.json`
- Google Drive sync works without token values in `settings.json`
- Token refresh updates the secure store instead of config

## Phase 4: Refactor AI Calls

### Goals

- Keep provider/model metadata in config
- Move the OpenRouter API key entirely into secure storage

### Tasks

- Update `tui/src/silt.ts` AI helper to read provider/model metadata from config
- Read the OpenRouter API key from the secure store only when needed
- Pass explicit AI provider input to the new NAPI `ai_query` API
- Remove any dependency on `getConfig("openrouter_api_key")`
- Keep `ollama_url` in normal config

### Exit Criteria

- OpenRouter AI requests work without `openrouter_api_key` in `settings.json`
- Ollama AI requests continue to work with config-only metadata

## Phase 5: Update Settings UI And Auth Flows

### Goals

- Keep the settings UI status-based instead of secret-value-based
- Store OAuth results and remote AI keys in the secure store

### Tasks

- Update `tui/src/components/SettingsDialog.tsx` to stop masking or rendering raw token values
- Update `tui/src/context.tsx` state so connection status is boolean or derived state instead of token strings
- Update `tui/src/hooks/useAppKeyboard.ts` disconnect flows to delete secure-store entries
- Update Dropbox OAuth in `tui/src/silt.ts` to persist returned access and refresh tokens in the secure store
- Update Google Drive OAuth in `tui/src/silt.ts` to persist returned access and refresh tokens in the secure store
- Update AI settings flow so OpenRouter key writes to the secure store instead of config
- Keep `ai_provider`, `ai_model`, and `ollama_url` in config

### Exit Criteria

- Provider settings screens show connected or disconnected state without reading token strings
- Disconnect clears secrets from the secure store
- OpenRouter key never enters normal config

## Phase 6: Hard Cut Cleanup And CLI Alignment

### Goals

- Remove or ignore legacy secret config keys
- Keep the workspace compiling without preserving old behavior

### Tasks

- Add a startup cleanup path in the TUI that deletes or blanks legacy secret config keys
- Remove secret-oriented config reads from `napi/src/lib.rs`
- Remove secret-oriented config writes from the TUI
- Adjust `cli/src/main.rs` so secrets are no longer persisted via `settings.json`
- Prefer env-based secret input for CLI sync and AI paths in the short term
- Decide whether `silt config set` should reject secret keys or silently treat them as unsupported

### Exit Criteria

- `settings.json` no longer contains sync tokens or the OpenRouter API key after normal TUI use
- CLI still builds cleanly
- Secret-related config behavior is no longer relied on anywhere in the TUI path

## Phase 7: Validation

### Goals

- Prove the new boundary works for the current TUI target
- Catch regressions in Rust typechecking, TUI typing, and core tests

### Tasks

- Add or update tests around NAPI request/response shaping where practical
- Validate Dropbox connect, push, pull, disconnect
- Validate Google Drive connect, push, pull, disconnect
- Validate OpenRouter query with secure-store key handling
- Validate Ollama query still works
- Validate startup with stale secret fields in config performs the hard cut cleanup
- Run `make check`

### Exit Criteria

- `make check` passes
- The TUI no longer depends on plaintext secrets in `settings.json`
- Sync and AI flows work end to end with client-owned secure storage

## Risks

- Bun runtime behavior around `security` and `secret-tool` subprocess use may require small platform-specific handling differences.
- Linux environments without `secret-tool` installed will need a clear failure mode.
- Returning refreshed credentials through NAPI changes TypeScript call sites and requires careful plumbing to avoid partial updates.

## Recommended Implementation Order

1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 4
5. Phase 5
6. Phase 6
7. Phase 7
