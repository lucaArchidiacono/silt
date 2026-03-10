import { createCliRenderer } from "@opentui/core";
import type { TextareaRenderable } from "@opentui/core";
import {
  createRoot,
  useKeyboard,
  useRenderer,
  useTerminalDimensions,
} from "@opentui/react";
import { useState, useCallback, useRef } from "react";
import {
  listEntries,
  newEntry,
  searchEntries,
  editEntry,
  deleteEntry,
  getConfig,
  setConfig,
  authDropbox,
  authGoogleDrive,
  syncPushEntries,
  syncPullAsync,
  syncPushAll,
  syncPushEntriesGDrive,
  syncPullAsyncGDrive,
  syncPushAllGDrive,
  rebuildIndex,
  getLogs,
  clearLogs,
  type Entry,
} from "./silt";

const BG = "#000000";
const FG = "#CCCCCC";
const DIM = "#666666";
const HIGHLIGHT_BG = "#FFFF00";
const HIGHLIGHT_FG = "#000000";
const ACCENT = "#FFFF00";

type Mode = "write" | "list" | "search" | "edit";
type Dialog = "settings" | "logs" | null;
type SettingsScreen = "menu" | "providers" | "dropbox" | "gdrive";

function maskToken(token: string): string {
  if (token.length <= 8) return "****";
  return token.slice(0, 4) + "****" + token.slice(-4);
}

function hasDropbox(): boolean {
  const token = getConfig("dropbox_token");
  return token !== null && token !== "";
}

function hasGDrive(): boolean {
  const token = getConfig("google_drive_token");
  return token !== null && token !== "";
}

function hasAnySyncProvider(): boolean {
  return hasDropbox() || hasGDrive();
}

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const App = () => {
  const renderer = useRenderer();
  const dimensions = useTerminalDimensions();
  const [mode, setMode] = useState<Mode>("write");
  const [entries, setEntries] = useState<Entry[]>(() => listEntries());
  const [selected, setSelected] = useState(0);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [writeInsert, setWriteInsert] = useState(false);
  const [writeText, setWriteText] = useState("");
  const textareaRef = useRef<TextareaRenderable>(null);
  const [status, setStatus] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [settingsScreen, setSettingsScreen] = useState<SettingsScreen>("menu");
  const [settingsSelected, setSettingsSelected] = useState(0);
  const [dropboxToken, setDropboxToken] = useState<string | null>(null);
  const [gdriveToken, setGdriveToken] = useState<string | null>(null);
  const [authInProgress, setAuthInProgress] = useState(false);
  const spinnerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const spinnerFrameRef = useRef(0);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [logScroll, setLogScroll] = useState(0);

  const startSync = useCallback(
    (
      label: string,
      promise: Promise<number>,
      onDone?: (count: number) => void,
    ) => {
      // Start spinner
      spinnerFrameRef.current = 0;
      setStatus(`${SPINNER[0]} ${label}`);
      spinnerRef.current = setInterval(() => {
        spinnerFrameRef.current =
          (spinnerFrameRef.current + 1) % SPINNER.length;
        setStatus(`${SPINNER[spinnerFrameRef.current]} ${label}`);
      }, 80);

      promise
        .then((count) => {
          if (spinnerRef.current) clearInterval(spinnerRef.current);
          spinnerRef.current = null;
          onDone?.(count);
        })
        .catch(() => {
          if (spinnerRef.current) clearInterval(spinnerRef.current);
          spinnerRef.current = null;
          setStatus("Sync failed.");
        });
    },
    [],
  );

  // Push specific entries to all connected providers
  const pushToAll = useCallback(
    (ids: string[], onDone?: () => void) => {
      const promises: Promise<number>[] = [];
      if (hasDropbox()) promises.push(syncPushEntries(ids));
      if (hasGDrive()) promises.push(syncPushEntriesGDrive(ids));
      if (promises.length === 0) {
        onDone?.();
        return;
      }
      startSync(
        "Syncing...",
        Promise.all(promises).then((counts) =>
          counts.reduce((a, b) => a + b, 0),
        ),
        onDone,
      );
    },
    [startSync],
  );

  // Push ALL entries to all connected providers
  const pushAllToAll = useCallback(
    (onDone?: (count: number) => void) => {
      const promises: Promise<number>[] = [];
      if (hasDropbox()) promises.push(syncPushAll());
      if (hasGDrive()) promises.push(syncPushAllGDrive());
      if (promises.length === 0) return;
      startSync(
        "Pushing all entries...",
        Promise.all(promises).then((counts) =>
          counts.reduce((a, b) => a + b, 0),
        ),
        onDone,
      );
    },
    [startSync],
  );

  // Pull from all connected providers
  const pullFromAll = useCallback(
    (onDone?: (count: number) => void) => {
      const promises: Promise<number>[] = [];
      if (hasDropbox()) promises.push(syncPullAsync());
      if (hasGDrive()) promises.push(syncPullAsyncGDrive());
      if (promises.length === 0) return;
      startSync(
        "Pulling...",
        Promise.all(promises).then((counts) =>
          counts.reduce((a, b) => a + b, 0),
        ),
        (count) => {
          if (count > 0) {
            rebuildIndex();
            setEntries(listEntries());
          }
          onDone?.(count);
        },
      );
    },
    [startSync],
  );

  // Pull from all providers on startup
  const startupPullDone = useRef(false);
  if (!startupPullDone.current && hasAnySyncProvider()) {
    startupPullDone.current = true;
    pullFromAll((count) => {
      setStatus(count > 0 ? `Pulled ${count} entries.` : "Up to date.");
    });
  }

  const menuItems: { label: string; screen: SettingsScreen }[] =
    settingsScreen === "menu"
      ? [{ label: "Sync Providers", screen: "providers" }]
      : settingsScreen === "providers"
        ? [
            { label: "Dropbox", screen: "dropbox" },
            { label: "Google Drive", screen: "gdrive" },
          ]
        : [];

  useKeyboard((key) => {
    if (key.ctrl && key.name === "q") {
      renderer?.destroy();
      process.exit(0);
    }

    if (key.ctrl && key.name === "c") {
      if (writeInsert) {
        setWriteInsert(false);
        setWriteText(textareaRef.current?.plainText ?? "");
        setStatus("Ctrl+C again to quit");
      } else {
        renderer?.destroy();
        process.exit(0);
      }
      return;
    }

    // Manual sync: Ctrl+U = push all, Ctrl+P = pull all
    if (key.ctrl && key.name === "u" && hasAnySyncProvider()) {
      pushAllToAll((count) => setStatus(`Pushed ${count} entries.`));
      return;
    }
    if (key.ctrl && key.name === "p" && hasAnySyncProvider()) {
      pullFromAll((count) =>
        setStatus(count > 0 ? `Pulled ${count} entries.` : "Up to date."),
      );
      return;
    }

    // Toggle log viewer
    if (key.ctrl && key.name === "l") {
      setDialog((d) => {
        if (d !== "logs") {
          setLogLines(getLogs());
          setLogScroll(0);
          return "logs";
        }
        return null;
      });
      return;
    }

    // Log viewer keyboard handling
    if (dialog === "logs") {
      if (key.name === "escape") {
        setDialog(null);
        return;
      }
      if (key.name === "j" || key.name === "down") {
        setLogScroll((s) => Math.min(s + 1, Math.max(0, logLines.length - 1)));
        return;
      }
      if (key.name === "k" || key.name === "up") {
        setLogScroll((s) => Math.max(s - 1, 0));
        return;
      }
      if (key.name === "g" && key.shift) {
        setLogScroll(Math.max(0, logLines.length - 1));
        return;
      }
      if (key.name === "g" && !key.shift) {
        setLogScroll(0);
        return;
      }
      if (key.name === "r") {
        setLogLines(getLogs());
        return;
      }
      if (key.name === "y") {
        const text = logLines.join("\n");
        Bun.spawn(["pbcopy"], { stdin: new Blob([text]) });
        setStatus("Logs copied to clipboard.");
        return;
      }
      if (key.name === "x") {
        clearLogs();
        setLogLines([]);
        setLogScroll(0);
        setStatus("Logs cleared.");
        return;
      }
      return;
    }

    // Toggle settings overlay
    if (key.ctrl && key.name === "s") {
      setDialog((d) => {
        if (d !== "settings") {
          setSettingsScreen("menu");
          setSettingsSelected(0);
          return "settings";
        }
        return null;
      });
      return;
    }

    // Settings overlay keyboard handling
    if (dialog === "settings") {
      if (key.name === "escape") {
        if (settingsScreen === "dropbox" || settingsScreen === "gdrive") {
          setSettingsScreen("providers");
          setSettingsSelected(0);
        } else if (settingsScreen === "providers") {
          setSettingsScreen("menu");
          setSettingsSelected(0);
        } else {
          setDialog(null);
        }
        return;
      }

      if (settingsScreen === "dropbox") {
        if (key.name === "return" && !dropboxToken && !authInProgress) {
          setAuthInProgress(true);
          setStatus("Opening browser...");
          authDropbox()
            .then((token) => {
              setDropboxToken(token);
              setAuthInProgress(false);
              startSync(
                "Pushing all entries to Dropbox...",
                syncPushAll(),
                (count) => {
                  setStatus(`Dropbox connected! Pushed ${count} entries.`);
                },
              );
            })
            .catch(() => {
              setAuthInProgress(false);
              setStatus("Dropbox authorization failed.");
            });
        }
        if (key.name === "d" && dropboxToken) {
          setConfig("dropbox_token", "");
          setConfig("dropbox_refresh_token", "");
          setDropboxToken(null);
          setStatus("Dropbox disconnected.");
        }
        return;
      }

      if (settingsScreen === "gdrive") {
        if (key.name === "return" && !gdriveToken && !authInProgress) {
          setAuthInProgress(true);
          setStatus("Opening browser...");
          authGoogleDrive()
            .then((token) => {
              setGdriveToken(token);
              setAuthInProgress(false);
              startSync(
                "Pushing all entries to Google Drive...",
                syncPushAllGDrive(),
                (count) => {
                  setStatus(`Google Drive connected! Pushed ${count} entries.`);
                },
              );
            })
            .catch(() => {
              setAuthInProgress(false);
              setStatus("Google Drive authorization failed.");
            });
        }
        if (key.name === "d" && gdriveToken) {
          setConfig("google_drive_token", "");
          setConfig("google_drive_refresh_token", "");
          setConfig("google_drive_folder_id", "");
          setGdriveToken(null);
          setStatus("Google Drive disconnected.");
        }
        return;
      }

      // Menu / providers navigation
      if (key.name === "j" || key.name === "down") {
        setSettingsSelected((s) => Math.min(s + 1, menuItems.length - 1));
      }
      if (key.name === "k" || key.name === "up") {
        setSettingsSelected((s) => Math.max(s - 1, 0));
      }
      if (key.name === "return" && menuItems[settingsSelected]) {
        const target = menuItems[settingsSelected].screen;
        if (target === "dropbox") {
          setDropboxToken(getConfig("dropbox_token"));
        } else if (target === "gdrive") {
          setGdriveToken(getConfig("google_drive_token"));
        }
        setSettingsScreen(target);
        setSettingsSelected(0);
      }
      return;
    }

    // Main app keyboard handling (only when settings closed)

    // Write insert sub-mode: textarea handles all keys, we only catch Esc
    if (mode === "write" && writeInsert) {
      if (key.name === "escape") {
        setWriteInsert(false);
        setWriteText(textareaRef.current?.plainText ?? "");
      }
      return;
    }

    if (mode === "edit") {
      if (key.name === "escape") {
        setMode("list");
        setEditingEntry(null);
      }
      return;
    }

    if (key.name === "tab") {
      if (mode === "write") {
        setWriteText(textareaRef.current?.plainText ?? "");
      }
      setMode((m) => {
        const next = m === "write" ? "list" : m === "list" ? "search" : "write";
        if (next === "list") {
          setEntries(listEntries());
          setSelected(0);
        }
        return next;
      });
    }

    // Write normal sub-mode
    if (mode === "write") {
      if (key.name === "i") {
        setWriteInsert(true);
      }
      if (key.name === "return") {
        const body = (textareaRef.current?.plainText ?? writeText).trim();
        if (body) {
          const entry = newEntry(body);
          setEntries(listEntries());
          textareaRef.current?.clear();
          setWriteText("");
          if (hasAnySyncProvider()) {
            pushToAll([entry.id], () => setStatus("Entry saved & synced."));
          } else {
            setStatus("Entry saved.");
          }
        }
      }
    }

    if (mode === "list") {
      if (key.name === "j" || key.name === "down") {
        setSelected((s) => Math.min(s + 1, entries.length - 1));
      }
      if (key.name === "k" || key.name === "up") {
        setSelected((s) => Math.max(s - 1, 0));
      }
      if (key.name === "e" && entries[selected]) {
        setEditingEntry(entries[selected]);
        setMode("edit");
      }
      if (key.name === "d" && entries[selected]) {
        const entry = entries[selected];
        deleteEntry(entry.id);
        setEntries(listEntries());
        setSelected((s) => Math.max(0, Math.min(s, entries.length - 2)));
        if (hasAnySyncProvider()) {
          pushToAll([entry.id], () => setStatus("Deleted & synced."));
        } else {
          setStatus("Deleted entry.");
        }
      }
    }
  });

  const handleWriteContentChange = useCallback(() => {
    setWriteText(textareaRef.current?.plainText ?? "");
  }, []);

  const handleSearch = useCallback((value: string) => {
    const query = value.trim();
    if (!query) return;
    const results = searchEntries(query);
    setEntries(results);
    setSelected(0);
    setMode("list");
    setStatus(`${results.length} result${results.length === 1 ? "" : "s"}`);
  }, []);

  const handleEdit = useCallback(
    (value: string) => {
      if (!editingEntry) return;
      const body = value.trim();
      if (!body) return;
      editEntry(editingEntry.id, body);
      setEntries(listEntries());
      setEditingEntry(null);
      setMode("list");
      if (hasAnySyncProvider()) {
        pushToAll([editingEntry.id], () =>
          setStatus("Entry updated & synced."),
        );
      } else {
        setStatus("Entry updated.");
      }
    },
    [editingEntry, startSync, pushToAll],
  );

  const isListActive = mode === "list" || mode === "edit";

  return (
    <box
      width={dimensions.width}
      height={dimensions.height}
      backgroundColor={BG}
      style={{ flexDirection: "column" }}
    >
      {/* Tab bar */}
      <box style={{ flexDirection: "row", height: 1, backgroundColor: BG }}>
        <text
          content={` Write `}
          style={{
            fg: mode === "write" ? BG : DIM,
            bg: mode === "write" ? "#FFFFFF" : BG,
          }}
        />
        <text
          content={` List `}
          style={{
            fg: isListActive ? BG : DIM,
            bg: isListActive ? "#FFFFFF" : BG,
          }}
        />
        <text
          content={` Search `}
          style={{
            fg: mode === "search" ? BG : DIM,
            bg: mode === "search" ? "#FFFFFF" : BG,
          }}
        />
        <text
          content="  Tab: switch  Ctrl+S: settings  Ctrl+U: push  Ctrl+P: pull  Ctrl+L: logs  Ctrl+Q: quit"
          style={{ fg: DIM, bg: BG }}
        />
      </box>

      {/* Write mode: textarea with normal/insert sub-modes */}
      {mode === "write" && (
        <box
          title={
            writeInsert
              ? " INSERT — Esc: done "
              : " NORMAL — i: insert  Enter: save "
          }
          style={{
            border: true,
            flexGrow: 1,
            backgroundColor: BG,
            borderColor: writeInsert ? ACCENT : DIM,
          }}
        >
          <textarea
            ref={textareaRef}
            placeholder="What's on your mind?"
            initialValue={writeText}
            focused={writeInsert && dialog === null}
            onContentChange={handleWriteContentChange}
            wrapMode="word"
            backgroundColor={BG}
            textColor={FG}
            focusedBackgroundColor={BG}
            showCursor={writeInsert}
          />
        </box>
      )}
      {mode === "search" && (
        <box
          title="Search (Enter to search)"
          style={{
            border: true,
            height: 3,
            backgroundColor: BG,
            borderColor: DIM,
          }}
        >
          <input
            placeholder="Search your entries..."
            focused={dialog === null}
            onSubmit={(event) => handleSearch(event.toString())}
            style={{
              backgroundColor: BG,
              textColor: FG,
              focusedBackgroundColor: BG,
            }}
          />
        </box>
      )}
      {mode === "edit" && editingEntry && (
        <box
          title="Edit (Enter to save, Esc to cancel)"
          style={{
            border: true,
            height: 5,
            backgroundColor: BG,
            borderColor: DIM,
          }}
        >
          <input
            value={editingEntry.body}
            focused={dialog === null}
            onSubmit={handleEdit}
            style={{
              backgroundColor: BG,
              textColor: FG,
              focusedBackgroundColor: BG,
            }}
          />
        </box>
      )}
      {mode === "list" && (
        <box
          title="List"
          style={{
            border: true,
            height: 3,
            backgroundColor: BG,
            borderColor: DIM,
          }}
        >
          <text
            content="j/k: navigate  e: edit  d: delete  Tab: switch"
            style={{ fg: DIM, bg: BG }}
          />
        </box>
      )}

      {/* Entries — compact in write mode, expanded otherwise */}
      <scrollbox
        focused={mode === "list"}
        style={{
          border: true,
          ...(mode === "write"
            ? { height: Math.max(6, Math.floor(dimensions.height * 0.25)) }
            : { flexGrow: 1 }),
          backgroundColor: BG,
          borderColor: DIM,
        }}
        title={`Entries (${entries.length})`}
      >
        {entries.map((e, i) => {
          const isSelected = mode === "list" && i === selected;
          return (
            <box
              key={e.id}
              style={{
                flexDirection: "row",
                height: 1,
                width: "100%",
                backgroundColor: isSelected ? HIGHLIGHT_BG : BG,
              }}
            >
              <text
                content={`${(e.createdAt ?? "").slice(0, 16)}  `}
                style={{
                  fg: isSelected ? HIGHLIGHT_FG : DIM,
                  bg: isSelected ? HIGHLIGHT_BG : BG,
                }}
              />
              <text
                content={e.body.replace(/\n/g, " ").slice(0, 120)}
                style={{
                  fg: isSelected ? HIGHLIGHT_FG : FG,
                  bg: isSelected ? HIGHLIGHT_BG : BG,
                }}
              />
            </box>
          );
        })}
      </scrollbox>

      {/* Settings overlay */}
      {dialog === "settings" && (
        <box
          style={{
            position: "absolute",
            width: 60,
            height: 18,
            left: Math.floor((dimensions.width - 60) / 2),
            top: Math.floor((dimensions.height - 18) / 2),
            border: true,
            borderColor: ACCENT,
            backgroundColor: BG,
            flexDirection: "column",
            zIndex: 10,
          }}
          title={
            settingsScreen === "menu"
              ? "Settings"
              : settingsScreen === "providers"
                ? "Sync Providers"
                : settingsScreen === "dropbox"
                  ? "Dropbox"
                  : "Google Drive"
          }
        >
          {settingsScreen === "menu" && (
            <box style={{ flexDirection: "column", flexGrow: 1 }}>
              <box
                style={{
                  flexDirection: "row",
                  height: 1,
                  backgroundColor: settingsSelected === 0 ? HIGHLIGHT_BG : BG,
                }}
              >
                <text
                  content="  Sync Providers"
                  style={{
                    fg: settingsSelected === 0 ? HIGHLIGHT_FG : FG,
                    bg: settingsSelected === 0 ? HIGHLIGHT_BG : BG,
                  }}
                />
              </box>
              <text
                content={" ".repeat(58)}
                style={{ fg: BG, bg: BG, height: 1 }}
              />
              <text
                content="  j/k: navigate  Enter: select  Esc: close"
                style={{ fg: DIM }}
              />
            </box>
          )}

          {settingsScreen === "providers" && (
            <box style={{ flexDirection: "column", flexGrow: 1 }}>
              {menuItems.map((item, i) => (
                <box
                  key={item.screen}
                  style={{
                    flexDirection: "row",
                    height: 1,
                    backgroundColor: settingsSelected === i ? HIGHLIGHT_BG : BG,
                  }}
                >
                  <text
                    content={`  ${item.label}`}
                    style={{
                      fg: settingsSelected === i ? HIGHLIGHT_FG : FG,
                      bg: settingsSelected === i ? HIGHLIGHT_BG : BG,
                    }}
                  />
                </box>
              ))}
              <text
                content={" ".repeat(58)}
                style={{ fg: BG, bg: BG, height: 1 }}
              />
              <text content="  Enter: select  Esc: back" style={{ fg: DIM }} />
            </box>
          )}

          {settingsScreen === "dropbox" && (
            <box style={{ flexDirection: "column", flexGrow: 1 }}>
              <text content="Dropbox Sync" style={{ fg: FG, height: 1 }} />
              <text
                content={`Syncs to /Apps/silt/entries/`}
                style={{ fg: DIM, height: 1 }}
              />
              <text
                content={" ".repeat(58)}
                style={{ fg: BG, bg: BG, height: 1 }}
              />

              {dropboxToken ? (
                <box style={{ flexDirection: "column" }}>
                  <text
                    content="Status: Connected"
                    style={{ fg: "#00FF00", height: 1 }}
                  />
                  <text
                    content={`Token:  ${maskToken(dropboxToken)}`}
                    style={{ fg: FG, height: 1 }}
                  />
                  <text
                    content={" ".repeat(58)}
                    style={{ fg: BG, bg: BG, height: 1 }}
                  />
                  <text
                    content="  d: disconnect  Esc: back"
                    style={{ fg: DIM }}
                  />
                </box>
              ) : authInProgress ? (
                <box style={{ flexDirection: "column" }}>
                  <text
                    content="Waiting for authorization..."
                    style={{ fg: ACCENT, height: 1 }}
                  />
                  <text
                    content="Your browser should open automatically."
                    style={{ fg: DIM, height: 1 }}
                  />
                  <text
                    content={" ".repeat(58)}
                    style={{ fg: BG, bg: BG, height: 1 }}
                  />
                  <text content="  Esc: cancel" style={{ fg: DIM }} />
                </box>
              ) : (
                <box style={{ flexDirection: "column" }}>
                  <text
                    content="Status: Not connected"
                    style={{ fg: DIM, height: 1 }}
                  />
                  <text
                    content={" ".repeat(58)}
                    style={{ fg: BG, bg: BG, height: 1 }}
                  />
                  <text
                    content="  Enter: connect Dropbox  Esc: back"
                    style={{ fg: DIM }}
                  />
                </box>
              )}
            </box>
          )}

          {settingsScreen === "gdrive" && (
            <box style={{ flexDirection: "column", flexGrow: 1 }}>
              <text content="Google Drive Sync" style={{ fg: FG, height: 1 }} />
              <text
                content={`Syncs to My Drive/silt/`}
                style={{ fg: DIM, height: 1 }}
              />
              <text
                content={" ".repeat(58)}
                style={{ fg: BG, bg: BG, height: 1 }}
              />

              {gdriveToken ? (
                <box style={{ flexDirection: "column" }}>
                  <text
                    content="Status: Connected"
                    style={{ fg: "#00FF00", height: 1 }}
                  />
                  <text
                    content={`Token:  ${maskToken(gdriveToken)}`}
                    style={{ fg: FG, height: 1 }}
                  />
                  <text
                    content={" ".repeat(58)}
                    style={{ fg: BG, bg: BG, height: 1 }}
                  />
                  <text
                    content="  d: disconnect  Esc: back"
                    style={{ fg: DIM }}
                  />
                </box>
              ) : authInProgress ? (
                <box style={{ flexDirection: "column" }}>
                  <text
                    content="Waiting for authorization..."
                    style={{ fg: ACCENT, height: 1 }}
                  />
                  <text
                    content="Your browser should open automatically."
                    style={{ fg: DIM, height: 1 }}
                  />
                  <text
                    content={" ".repeat(58)}
                    style={{ fg: BG, bg: BG, height: 1 }}
                  />
                  <text content="  Esc: cancel" style={{ fg: DIM }} />
                </box>
              ) : (
                <box style={{ flexDirection: "column" }}>
                  <text
                    content="Status: Not connected"
                    style={{ fg: DIM, height: 1 }}
                  />
                  <text
                    content={" ".repeat(58)}
                    style={{ fg: BG, bg: BG, height: 1 }}
                  />
                  <text
                    content="  Enter: connect Google Drive  Esc: back"
                    style={{ fg: DIM }}
                  />
                </box>
              )}
            </box>
          )}
        </box>
      )}

      {/* Log viewer overlay */}
      {dialog === "logs" && (
        <box
          style={{
            position: "absolute",
            width: dimensions.width - 4,
            height: Math.max(12, Math.floor(dimensions.height * 0.6)),
            left: 2,
            top: Math.floor(dimensions.height * 0.2),
            border: true,
            borderColor: ACCENT,
            backgroundColor: BG,
            flexDirection: "column",
            zIndex: 20,
          }}
          title={`Logs (${logLines.length}) — j/k: scroll  g/G: top/bottom  r: refresh  y: copy  x: clear  Esc: close`}
        >
          {(() => {
            const logHeight =
              Math.max(12, Math.floor(dimensions.height * 0.6)) - 2;
            const logWidth = dimensions.width - 6;
            const lines =
              logLines.length === 0
                ? [{ text: "  No logs yet.", fg: DIM, bg: BG }]
                : logLines.map((line, i) => {
                    const isSelected = i === logScroll;
                    const fg = line.includes("ERROR")
                      ? "#FF5555"
                      : line.includes("WARN")
                        ? ACCENT
                        : FG;
                    return {
                      text: `  ${line}`,
                      fg: isSelected ? HIGHLIGHT_FG : fg,
                      bg: isSelected ? HIGHLIGHT_BG : BG,
                    };
                  });
            // Pad with blank lines to fill the box
            while (lines.length < logHeight) {
              lines.push({ text: " ".repeat(logWidth), fg: BG, bg: BG });
            }
            return (
              <scrollbox
                style={{ flexGrow: 1, backgroundColor: BG }}
                scrollTop={logScroll}
              >
                {lines.map((l, i) => (
                  <text
                    key={i}
                    content={l.text.padEnd(logWidth, " ")}
                    style={{ fg: l.fg, bg: l.bg, height: 1 }}
                  />
                ))}
              </scrollbox>
            );
          })()}
        </box>
      )}

      {/* Status */}
      <text content={status} style={{ fg: DIM, height: 1, bg: BG }} />
    </box>
  );
};

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
  backgroundColor: "#000000",
});
createRoot(renderer).render(<App />);
