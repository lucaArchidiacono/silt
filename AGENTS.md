# Silt

Local-first, write-only log app. Users write short markdown entries. No editing — append-only with soft deletes. Markdown files are the source of truth, SQLite is a local rebuildable index.

## Architecture

Rust core library with NAPI-RS native bindings. TUI calls Rust directly (no CLI subprocess). CLI exists as a standalone JSON interface.

```
silt/
├── core/           silt-core Rust library (all logic)
│   └── src/
│       ├── lib.rs           Silt API: open, new_entry, edit_entry, delete_entry, search, list_entries, rebuild_index
│       ├── entry.rs         Entry struct, ULID generation, markdown frontmatter parse/serialize
│       ├── storage.rs       FileStorage: read/write/list/soft_delete/update_body .md files
│       ├── index.rs         SQLite + FTS5 full-text search index
│       ├── sync.rs          SyncAdapter trait + SyncStatus enum
│       ├── dropbox.rs       DropboxSync: Dropbox API v2, token refresh, 401 retry
│       ├── google_drive.rs  GoogleDriveSync: Google Drive API v3, folder management, token refresh
│       └── ai.rs            AiProvider trait (no implementations yet)
│
├── napi/           NAPI-RS native Node addon (bridges Rust → JS)
│   └── src/lib.rs   SiltSession class, async sync tasks, log collector, config API
│
├── cli/            silt-cli binary (JSON interface to core)
│   └── src/main.rs  subcommands: new, list, search, edit, delete, sync, config
│
├── tui/            React TUI client (OpenTUI + bun)
│   └── src/
│       ├── index.tsx    App component: Write, List, Search, Settings, Log viewer
│       └── silt.ts      NAPI wrappers + OAuth PKCE flows (Dropbox, Google Drive)
│
├── apple/          (planned) macOS + iOS via SwiftUI + UniFFI
├── web/            (planned) WASM build + minimal frontend
└── android/        (planned) Kotlin + UniFFI
```

## Implemented Features

### Core
- **Entries**: create, edit (body replacement), soft delete, list, full-text search (FTS5)
- **Storage**: each entry = one `.md` file with ULID filename + YAML frontmatter
- **Index**: SQLite + FTS5, local-only, fully rebuildable from .md files
- **Dropbox sync**: push/pull .md files via Dropbox API v2, automatic token refresh on 401
- **Google Drive sync**: push/pull via Drive API v3, auto-creates `silt` folder, multipart upload, token refresh
- **Logging**: `log` crate with info/warn/error at all sync operations, token refreshes, API errors

### TUI
- **Write mode**: multiline textarea with vim-style normal/insert modes
- **List mode**: scroll entries with j/k, edit (e), delete (d)
- **Search mode**: full-text search, results shown in list
- **Settings overlay** (Ctrl+S): connect/disconnect Dropbox and Google Drive via OAuth PKCE
- **Async sync**: non-blocking push/pull on background threads, braille spinner in status bar
- **Auto-sync**: pull on startup, push after save/edit/delete to all connected providers
- **Manual sync**: Ctrl+U (push all), Ctrl+P (pull all)
- **Log viewer** (Ctrl+L): scrollable overlay showing Rust log output, copy to clipboard (y), clear (x)
- **Initial sync**: full push of all entries after connecting a new provider

### CLI
- JSON output for all commands
- `silt sync push/pull/status` syncs to all connected providers (Dropbox + Google Drive)
- `silt config get/set` for managing settings

## Key Design Decisions

- Each entry = one `.md` file with ULID filename + frontmatter (id, created, deleted)
- SQLite index is local-only, never synced, fully rebuildable from .md files
- Sync = moving .md files via adapters (Dropbox, Google Drive; planned: S3, Git, WebDAV, SFTP)
- AI = optional, user brings their own API key (Ollama local, OpenAI/Anthropic remote)
- No backend server — every client is a full peer
- Data dir: `~/.silt/` with `entries/` subfolder, `index.db`, and `settings.json`
- TUI calls Rust directly via NAPI-RS (not CLI subprocess)
- CLI outputs JSON so any client can call it

## Entry Format

```markdown
---
id: 01JK7R3F9X...
created: 2025-03-05T14:32:00+00:00
deleted:
---
The actual entry body in markdown.
```

## Configuration

Settings stored in `~/.silt/settings.json`:

| Key | Description |
|-----|-------------|
| `dropbox_token` | Dropbox access token |
| `dropbox_refresh_token` | Dropbox refresh token |
| `google_drive_token` | Google Drive access token |
| `google_drive_refresh_token` | Google Drive refresh token |
| `google_drive_folder_id` | Cached Google Drive folder ID |

## Logging

Uses the Rust `log` crate. Logs are collected in-memory by a custom logger in the NAPI layer and surfaced in the TUI via the log viewer (Ctrl+L).

### Conventions
- Prefix with provider tag: `[dropbox]`, `[gdrive]`
- `log::info!` for normal operations: push/pull start/complete, file uploads/downloads, token refreshes, folder creation
- `log::warn!` for recoverable issues: 401 token expiry triggering refresh
- `log::error!` for failures: API errors, upload/download failures, token refresh failures
- Always include the filename or operation context in the message

### Examples
```rust
log::info!("[gdrive] pushing {} files", count);
log::info!("[gdrive] uploaded {}", filename);
log::warn!("[gdrive] 401 on upload {}, refreshing token", filename);
log::error!("[gdrive] upload failed for {} ({}): {}", filename, status, body);
```

### Viewing logs
- **TUI**: Ctrl+L opens the log viewer overlay
- **CLI**: set `RUST_LOG=info` environment variable (when env_logger is used)

## Dependencies

- **core**: ulid, rusqlite (bundled), anyhow, chrono, reqwest (blocking + json + multipart), serde, serde_json, log
- **napi**: napi 3, napi-derive, silt-core, anyhow, serde_json, dirs, log, chrono
- **cli**: silt-core, serde, serde_json, anyhow, dirs
- **tui**: @opentui/core, @opentui/react, react 19 (bun runtime)

## Testing

Tests live in each core module as `#[cfg(test)] mod tests`. Use `tempfile` for isolated temp dirs.

- `entry.rs` — frontmatter roundtrip, soft delete serialization, invalid input rejection
- `storage.rs` — write/read/list/soft_delete lifecycle
- `index.rs` — upsert/list/search, deleted entries excluded from results
- `lib.rs` — full Silt API integration test (write, search, delete, rebuild)
- `dropbox.rs` — path construction, upload arg serialization, file filtering, status
- `google_drive.rs` — metadata serialization, file deserialization, pagination, folder ID caching

Always run `cargo test -p silt-core` after changes to the core library.

## Commands

```sh
# Build
make tui              # build NAPI + compile TUI → dist/silt-tui
make tui-start        # build NAPI + run TUI
make tui-dev          # build NAPI + run with hot reload
make cli              # build CLI binary → dist/silt-cli
make all              # build everything
make clean            # remove build artifacts

# Rust
cargo check           # type-check workspace
cargo test -p silt-core  # run core tests

# CLI usage
silt new "some text"
silt list
silt search "query"
silt edit <id> "new body"
silt delete <id>
silt sync push        # push to all connected providers
silt sync pull        # pull from all connected providers
silt sync status      # show status of each provider
silt config get <key>
silt config set <key> <value>
```

## TUI Controls

| Key | Context | Action |
|-----|---------|--------|
| **Tab** | Global | Cycle Write → List → Search |
| **Ctrl+S** | Global | Toggle settings overlay |
| **Ctrl+U** | Global | Push all entries to connected providers |
| **Ctrl+P** | Global | Pull from all connected providers |
| **Ctrl+L** | Global | Toggle log viewer |
| **Ctrl+Q / Ctrl+C** | Global | Quit |
| **i** | Write (normal) | Enter insert mode |
| **Esc** | Write (insert) | Exit insert mode |
| **Enter** | Write (normal) | Save entry |
| **j/k** | List | Navigate entries |
| **e** | List | Edit selected entry |
| **d** | List | Delete selected entry |
| **Enter** | Search | Execute search |
| **j/k** | Log viewer | Scroll logs |
| **g/G** | Log viewer | Jump to top/bottom |
| **r** | Log viewer | Refresh logs |
| **y** | Log viewer | Copy all logs to clipboard |
| **x** | Log viewer | Clear all logs |
| **Esc** | Log viewer / Settings | Close overlay |
