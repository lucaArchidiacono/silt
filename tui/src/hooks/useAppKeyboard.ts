import { useKeyboard, useRenderer } from "@opentui/react";
import {
  listEntries,
  newEntry,
  deleteEntry,
  getConfig,
  setConfig,
  authDropbox,
  authGoogleDrive,
  syncPushAll,
  syncPushAllGDrive,
  getLogs,
  clearLogs,
} from "../silt";
import { useApp } from "../context";
import { useSync, hasAnySyncProvider } from "./useSync";

export function useAppKeyboard() {
  const renderer = useRenderer();
  const { state, actions, refs } = useApp();
  const { startSync, pushToAll, pushAllToAll, pullFromAll } = useSync();

  const {
    mode,
    entries,
    selected,
    editingEntry,
    writeInsert,
    dialog,
    settingsScreen,
    settingsSelected,
    dropboxToken,
    gdriveToken,
    authInProgress,
    logLines,
    logScroll,
  } = state;

  const {
    setMode,
    setEntries,
    setSelected,
    setEditingEntry,
    setWriteInsert,
    setWriteText,
    setStatus,
    setDialog,
    setSettingsScreen,
    setSettingsSelected,
    setDropboxToken,
    setGdriveToken,
    setAuthInProgress,
    setLogLines,
    setLogScroll,
  } = actions;

  const { textareaRef, searchInputRef, logScrollRef } = refs;

  const menuItems =
    settingsScreen === "menu"
      ? [{ label: "Sync Providers", screen: "providers" as const }]
      : settingsScreen === "providers"
        ? [
            { label: "Dropbox", screen: "dropbox" as const },
            { label: "Google Drive", screen: "gdrive" as const },
          ]
        : [];

  useKeyboard((key) => {
    // --- Global shortcuts ---
    if (key.ctrl && key.name === "q") {
      renderer?.destroy();
      process.exit(0);
    }

    if (key.ctrl && key.name === "c") {
      if (mode === "search") {
        searchInputRef.current?.clear();
        setEntries(listEntries());
        setSelected(0);
        setStatus("");
        return;
      }
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

    // --- Log viewer ---
    if (dialog === "logs") {
      handleLogKeys(key);
      return;
    }

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

    // --- Settings dialog ---
    if (dialog === "settings") {
      handleSettingsKeys(key);
      return;
    }

    // --- Write insert sub-mode ---
    if (mode === "write" && writeInsert) {
      if (key.name === "escape") {
        setWriteInsert(false);
        setWriteText(textareaRef.current?.plainText ?? "");
      }
      return;
    }

    // --- Search mode ---
    if (mode === "search") {
      if (key.name === "escape") {
        searchInputRef.current?.clear();
        setEntries(listEntries());
        setSelected(0);
        setStatus("");
        return;
      }
    }

    // --- Edit mode ---
    if (mode === "edit") {
      if (key.name === "escape") {
        setMode("list");
        setEditingEntry(null);
      }
      return;
    }

    // --- Tab cycling ---
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

    // --- Write normal sub-mode ---
    if (mode === "write") {
      if (key.name === "i") {
        setWriteInsert(true);
      }
      if (key.name === "return") {
        const body = (textareaRef.current?.plainText ?? "").trim();
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

    // --- List mode ---
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

  function handleLogKeys(key: { name: string; shift?: boolean }) {
    const setScroll = (value: number) => {
      setLogScroll(value);
      if (logScrollRef.current) logScrollRef.current.scrollTop = value;
    };
    if (key.name === "escape") {
      setDialog(null);
      return;
    }
    if (key.name === "j" || key.name === "down") {
      setScroll(Math.min(logScroll + 1, Math.max(0, logLines.length - 1)));
      return;
    }
    if (key.name === "k" || key.name === "up") {
      setScroll(Math.max(logScroll - 1, 0));
      return;
    }
    if (key.name === "g" && key.shift) {
      setScroll(Math.max(0, logLines.length - 1));
      return;
    }
    if (key.name === "g" && !key.shift) {
      setScroll(0);
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
      setScroll(0);
      setStatus("Logs cleared.");
    }
  }

  function handleSettingsKeys(key: { name: string; ctrl?: boolean; shift?: boolean }) {
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
  }
}
