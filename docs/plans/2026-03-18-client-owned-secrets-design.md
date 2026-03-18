# Silt Client-Owned Secrets Design

Date: 2026-03-18
Status: Approved
Owner: Codex + user

## Summary

Move sync tokens and remote AI API keys out of `settings.json`.

Silt will use a client-owned secret storage model:

- each client owns secure secret persistence and OAuth flow state
- Rust consumes explicit credentials and provider config as inputs
- Rust returns updated provider state, including refreshed tokens, back to the client
- `settings.json` stores only non-secret metadata

This design intentionally optimizes for a straightforward cutover, not backwards compatibility.

## Product Decisions

- Use client-owned secret storage, not backend-owned secret storage.
- Keep `settings.json` free of secrets.
- Treat the current implementation as TUI-first on macOS and Linux.
- Keep future room for desktop, web, and mobile clients to use the same logical model.
- Accept breaking existing stored auth state if that simplifies the change.
- Use a hard cut for legacy plaintext secrets instead of a tracked migration.

## Goals

- Stop persisting OAuth tokens and remote AI API keys in `settings.json`.
- Keep safe, non-secret settings visible and editable in the settings UI.
- Make the secret model portable across TUI, desktop, web, and mobile clients.
- Keep Rust focused on business logic instead of platform-specific secret persistence.
- Ensure sync and AI flows still support token refresh and provider-specific metadata updates.

## Non-Goals

- Preserving existing plaintext secrets in `settings.json`
- Building a shared secure-storage implementation for all future clients in this milestone
- Defining desktop, web, and mobile UI details beyond the configuration model
- Making the current Rust layer behave like a single server-style backend

## Approaches Considered

### 1. Backend-owned secret store

Rust would own secret persistence and read/write platform secure storage internally.

Trade-offs:

- Thin frontend
- Fits a traditional backend mental model
- Harder to map cleanly to web and Expo clients
- Couples Rust APIs to platform storage concerns

### 2. Client-owned secret store

This is the selected approach. Each client owns secure storage and auth session state. Rust accepts explicit provider credentials and returns refreshed values when state changes.

Trade-offs:

- Portable across native, web, and mobile clients
- Keeps Rust reusable and storage-agnostic
- Requires more explicit request/response types
- Makes the client part of the application workflow

### 3. Keep using `settings.json`

Trade-offs:

- Lowest effort
- Fails the security requirement
- Not acceptable

## Selected Architecture

Silt will use a split between client orchestration and Rust business logic.

### Client responsibilities

- Start OAuth flows
- Receive OAuth callbacks
- Persist secrets in platform-appropriate secure storage
- Read secrets when sync or AI calls are made
- Persist refreshed credentials returned by Rust
- Manage non-secret settings UI state

### Rust responsibilities

- Validate provider configuration
- Execute sync and AI operations
- Refresh provider tokens as needed
- Return updated provider state to the client
- Continue owning entry, index, sync-adapter, and AI business logic

### Boundary rule

Rust should not read secrets from `settings.json`, Keychain, Secret Service, browser storage, or mobile secure storage directly in this design.

## Data Model

### Secrets

Secrets move out of `settings.json` and into client-managed secure storage.

Canonical logical secret keys:

- `sync.dropbox.access_token`
- `sync.dropbox.refresh_token`
- `sync.google_drive.access_token`
- `sync.google_drive.refresh_token`
- `ai.openrouter.api_key`

### Settings

`settings.json` keeps only non-secret metadata.

Expected settings:

- `sync_providers`
- `ai_provider`
- `ai_model`
- `ollama_url`
- `google_drive_folder_id`

`sync_providers` should represent which providers are enabled for use. Connection state comes from the presence or absence of secrets in the client store, not from raw token values in settings.

## API Shape

The current implicit config lookup pattern in the CLI and NAPI layer should be replaced with explicit request and response objects.

### Sync request

Each sync operation should accept provider-specific input such as:

- provider name
- access token
- refresh token
- provider metadata such as cached Google Drive folder ID

### Sync response

Each sync operation should return:

- operation result data such as counts or filenames
- refreshed access token if it changed
- updated provider metadata such as Google Drive folder ID

### AI request

AI operations should accept:

- provider
- model
- `ollama_url` when using Ollama
- OpenRouter API key when using OpenRouter

### AI response

AI operations should return:

- response text
- any normalized provider metadata needed by the client

## TUI Implications

The current TUI is the first client to implement this model.

For the TUI:

- the auth flow in `tui/src/silt.ts` remains client-owned
- the TUI secure-store wrapper becomes responsible for secret persistence
- the settings dialog should stop reading or displaying token values
- provider screens should render connection status only
- disconnect should delete secrets and clear any related safe metadata

The TUI should treat a provider as connected when the required secrets exist in the secure store.

## Future Client Model

This design maps cleanly to future clients:

- macOS desktop: client-owned Keychain storage
- web: client-owned browser-local secret storage
- Expo mobile: client-owned secure storage via platform facilities

The logical secret keys and request/response model should stay consistent across clients even if the storage implementation differs.

## Migration Strategy

Use a hard cut.

- Do not migrate existing plaintext secrets from `settings.json`.
- On startup, clients may ignore or delete legacy secret keys if present.
- Users reconnect sync providers and re-enter remote AI keys after the change.

Legacy secret fields to remove or ignore:

- `dropbox_token`
- `dropbox_refresh_token`
- `google_drive_token`
- `google_drive_refresh_token`
- `openrouter_api_key`

This is the simplest implementation path and is acceptable for this milestone.

## Error Handling

- Missing secret in client storage should surface as a disconnected provider or missing-key state before calling Rust when possible.
- Rust should still validate incoming requests and return explicit errors for missing or invalid credentials.
- If a token refresh succeeds, the updated token must be returned to the client so the client can persist it immediately.
- If a token refresh fails, the client should surface the provider as needing reconnection.

## Testing

### Rust tests

- Sync request/response behavior with explicit credentials
- Token refresh output handling
- Google Drive folder ID update handling
- AI request validation with explicit provider inputs

### Client tests

- Secure-store read/write/delete behavior
- Connection-state derivation from secure-store contents
- Settings UI showing status without reading raw secrets
- Persistence of refreshed tokens returned from Rust

### End-to-end validation

- Connect Dropbox
- Connect Google Drive
- Push and pull successfully
- Persist refreshed tokens outside `settings.json`
- Disconnect providers
- Run OpenRouter-backed AI queries with the API key outside `settings.json`

## Implementation Notes

- The first implementation can focus only on the TUI on macOS and Linux.
- Cross-client reuse should happen through logical request/response shapes, not by forcing one shared secret-storage backend.
- Favor simple, explicit APIs over hidden configuration lookup.
