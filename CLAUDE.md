# Silt

Local-first, write-only log app. Users write short markdown entries. No editing — append-only with soft deletes. Markdown files are the source of truth, SQLite is a local rebuildable index.

## Architecture

Rust core library + CLI binary. Clients are thin UI shells that call the CLI.

```
silt/
├── core/           silt-core Rust library (all logic)
│   └── src/
│       ├── lib.rs       Silt API: open, new_entry, delete_entry, search, list_entries
│       ├── entry.rs     Entry struct, ULID generation, markdown frontmatter parse/serialize
│       ├── storage.rs   FileStorage: read/write/list/soft_delete .md files
│       ├── index.rs     SQLite + FTS5 full-text search index
│       ├── sync.rs      SyncAdapter trait (no implementations yet)
│       └── ai.rs        AiProvider trait (no implementations yet)
│
├── cli/            silt-cli binary (JSON interface to core)
│   └── src/main.rs  subcommands: new, list, search, delete
│
├── tui/            React TUI client (OpenTUI + bun)
│   └── src/
│       ├── index.tsx    App component: Write, List, Search modes
│       └── silt.ts      Calls silt-cli binary, parses JSON
│
├── apple/          (planned) macOS + iOS via SwiftUI + UniFFI
├── web/            (planned) WASM build + minimal frontend
└── android/        (planned) Kotlin + UniFFI
```

## Key Design Decisions

- Each entry = one `.md` file with ULID filename + frontmatter (id, created, deleted)
- SQLite index is local-only, never synced, fully rebuildable from .md files
- Sync = moving .md files via adapters (S3, Dropbox, Git, WebDAV, SFTP)
- AI = optional, user brings their own API key (Ollama local, OpenAI/Anthropic remote)
- No backend server — every client is a full peer
- No editing entries — write a new one instead. Soft delete only.
- Data dir: `~/.silt/` with `entries/` subfolder and `index.db`
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

## Dependencies

- **core**: ulid, rusqlite (bundled), anyhow, chrono
- **cli**: silt-core, serde, serde_json, anyhow, dirs
- **tui**: @opentui/core, @opentui/react, react (bun)

## Testing

Tests live in each core module as `#[cfg(test)] mod tests`. Use `tempfile` for isolated temp dirs.

- `entry.rs` — frontmatter roundtrip, soft delete serialization, invalid input rejection
- `storage.rs` — write/read/list/soft_delete lifecycle
- `index.rs` — upsert/list/search, deleted entries excluded from results
- `lib.rs` — full Silt API integration test (write, search, delete, rebuild)

Always run `cargo test -p silt-core` after changes to the core library.

## Commands

```sh
# Rust
cargo check                    # type-check workspace
cargo test -p silt-core        # run core tests
cargo build --release          # build CLI binary

# CLI usage
./target/release/silt-cli new "some text"
./target/release/silt-cli list
./target/release/silt-cli search "query"
./target/release/silt-cli delete <id>

# TUI (requires CLI built first)
cd tui && bun run start        # launch TUI
cd tui && bun run dev          # launch with --watch
```

## TUI Controls

- **Tab**: cycle Write → List → Search
- **Write mode**: type text, Enter to save
- **List mode**: scroll entries
- **Search mode**: type query, Enter to search
- **Ctrl+Q / Ctrl+C**: quit
