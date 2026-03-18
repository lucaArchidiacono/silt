DIST = dist

.PHONY: all clean help

all: tui cli electron  ## Build all clients

# ─── Core ──────────────────────────────────────────────

.PHONY: napi
napi:  ## Build native Node addon (shared by JS-based clients)
	cd napi && bun run build

# ─── Clients ───────────────────────────────────────────

.PHONY: tui tui-dev tui-start
tui: napi  ## Build TUI as standalone binary → dist/silt-tui
	cd tui && bun build --compile src/index.tsx --outfile ../$(DIST)/silt-tui

tui-dev: napi  ## Run TUI in dev mode (hot reload)
	cd tui && bun run dev

tui-start: napi  ## Run TUI
	cd tui && bun run start

.PHONY: cli
cli:  ## Build CLI binary → dist/silt-cli
	cargo build --release -p silt-cli
	@mkdir -p $(DIST)
	cp target/release/silt-cli $(DIST)/silt-cli

# .PHONY: web
# web: napi  ## Build web client → dist/silt-web
# 	cd web && <build command>

.PHONY: electron electron-dev
electron: napi  ## Build Electron app (macOS dev build assets)
	cd electron && bun run build

electron-dev: napi  ## Run Electron app in dev mode
	cd electron && bun run dev

# .PHONY: apple
# apple:  ## Build macOS/iOS app (UniFFI)
# 	cd apple && <build command>

# .PHONY: android
# android:  ## Build Android app (UniFFI)
# 	cd android && <build command>

# ─── Checks ───────────────────────────────────────────

.PHONY: check typecheck test
check: typecheck test  ## Run all checks (types + tests)

typecheck:  ## Type-check Rust workspace + TUI TypeScript
	cargo check
	cd tui && bun run typecheck
	cd electron && bun run typecheck

test:  ## Run core tests
	cargo test -p silt-core

# ─── Housekeeping ──────────────────────────────────────

clean:  ## Remove build artifacts
	rm -rf $(DIST)
	cargo clean

help:  ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?##' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'
