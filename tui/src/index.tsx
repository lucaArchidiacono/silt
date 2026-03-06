import { createCliRenderer } from "@opentui/core"
import { createRoot, useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useState, useCallback } from "react"
import { listEntries, newEntry, searchEntries, editEntry, deleteEntry, getConfig, setConfig, authDropbox, type Entry } from "./silt"

const BG = "#000000"
const FG = "#CCCCCC"
const DIM = "#666666"
const HIGHLIGHT_BG = "#FFFF00"
const HIGHLIGHT_FG = "#000000"
const ACCENT = "#FFFF00"

type Mode = "write" | "list" | "search" | "edit"
type SettingsScreen = "menu" | "providers" | "dropbox"

function maskToken(token: string): string {
  if (token.length <= 8) return "****"
  return token.slice(0, 4) + "****" + token.slice(-4)
}

const App = () => {
  const renderer = useRenderer()
  const dimensions = useTerminalDimensions()
  const [mode, setMode] = useState<Mode>("write")
  const [entries, setEntries] = useState<Entry[]>(() => listEntries())
  const [selected, setSelected] = useState(0)
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null)
  const [status, setStatus] = useState("")
  const [showSettings, setShowSettings] = useState(false)
  const [settingsScreen, setSettingsScreen] = useState<SettingsScreen>("menu")
  const [settingsSelected, setSettingsSelected] = useState(0)
  const [dropboxToken, setDropboxToken] = useState<string | null>(null)
  const [authInProgress, setAuthInProgress] = useState(false)

  const menuItems: { label: string; screen: SettingsScreen }[] =
    settingsScreen === "menu"
      ? [{ label: "Sync Providers", screen: "providers" }]
      : settingsScreen === "providers"
        ? [{ label: "Dropbox", screen: "dropbox" }]
        : []

  useKeyboard((key) => {
    if (key.ctrl && (key.name === "c" || key.name === "q")) {
      renderer?.destroy()
      process.exit(0)
    }

    // Toggle settings overlay
    if (key.ctrl && key.name === "s") {
      setShowSettings((s) => {
        if (!s) {
          setSettingsScreen("menu")
          setSettingsSelected(0)
        }
        return !s
      })
      return
    }

    // Settings overlay keyboard handling
    if (showSettings) {
      if (key.name === "escape") {
        if (settingsScreen === "dropbox") {
          setSettingsScreen("providers")
          setSettingsSelected(0)
        } else if (settingsScreen === "providers") {
          setSettingsScreen("menu")
          setSettingsSelected(0)
        } else {
          setShowSettings(false)
        }
        return
      }

      if (settingsScreen === "dropbox") {
        if (key.name === "return" && !dropboxToken && !authInProgress) {
          setAuthInProgress(true)
          setStatus("Opening browser...")
          authDropbox()
            .then((token) => {
              setDropboxToken(token)
              setAuthInProgress(false)
              setStatus("Dropbox connected!")
            })
            .catch(() => {
              setAuthInProgress(false)
              setStatus("Dropbox authorization failed.")
            })
        }
        if (key.name === "d" && dropboxToken) {
          setConfig("dropbox_token", "")
          setConfig("dropbox_refresh_token", "")
          setDropboxToken(null)
          setStatus("Dropbox disconnected.")
        }
        return
      }

      // Menu / providers navigation
      if (key.name === "j" || key.name === "down") {
        setSettingsSelected((s) => Math.min(s + 1, menuItems.length - 1))
      }
      if (key.name === "k" || key.name === "up") {
        setSettingsSelected((s) => Math.max(s - 1, 0))
      }
      if (key.name === "return" && menuItems[settingsSelected]) {
        const target = menuItems[settingsSelected].screen
        if (target === "dropbox") {
          setDropboxToken(getConfig("dropbox_token"))
        }
        setSettingsScreen(target)
        setSettingsSelected(0)
      }
      return
    }

    // Main app keyboard handling (only when settings closed)
    if (mode === "edit") {
      if (key.name === "escape") {
        setMode("list")
        setEditingEntry(null)
      }
      return
    }

    if (key.name === "tab") {
      setMode((m) => {
        const next = m === "write" ? "list" : m === "list" ? "search" : "write"
        if (next === "list") {
          setEntries(listEntries())
          setSelected(0)
        }
        return next
      })
    }

    if (mode === "list") {
      if (key.name === "j" || key.name === "down") {
        setSelected((s) => Math.min(s + 1, entries.length - 1))
      }
      if (key.name === "k" || key.name === "up") {
        setSelected((s) => Math.max(s - 1, 0))
      }
      if (key.name === "e" && entries[selected]) {
        setEditingEntry(entries[selected])
        setMode("edit")
      }
      if (key.name === "d" && entries[selected]) {
        const entry = entries[selected]
        deleteEntry(entry.id)
        setEntries(listEntries())
        setSelected((s) => Math.max(0, Math.min(s, entries.length - 2)))
        setStatus(`Deleted entry.`)
      }
    }
  })

  const handleWrite = useCallback((value: string) => {
    const body = value.trim()
    if (!body) return
    newEntry(body)
    setEntries(listEntries())
    setStatus("Entry saved.")
  }, [])

  const handleSearch = useCallback((value: string) => {
    const query = value.trim()
    if (!query) return
    const results = searchEntries(query)
    setEntries(results)
    setSelected(0)
    setMode("list")
    setStatus(`${results.length} result${results.length === 1 ? "" : "s"}`)
  }, [])

  const handleEdit = useCallback(
    (value: string) => {
      if (!editingEntry) return
      const body = value.trim()
      if (!body) return
      editEntry(editingEntry.id, body)
      setEntries(listEntries())
      setEditingEntry(null)
      setMode("list")
      setStatus("Entry updated.")
    },
    [editingEntry],
  )

  const isListActive = mode === "list" || mode === "edit"

  return (
    <box width={dimensions.width} height={dimensions.height} backgroundColor={BG} style={{ flexDirection: "column" }}>
      {/* Tab bar */}
      <box style={{ flexDirection: "row", height: 1, bg: BG }}>
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
        <text content="  Tab: switch  Ctrl+S: settings  Ctrl+Q: quit" style={{ fg: DIM, bg: BG }} />
      </box>

      {/* Input area */}
      {mode === "write" && (
        <box title="Write (Enter to save)" style={{ border: true, height: 5, bg: BG, borderColor: DIM }}>
          <input
            placeholder="What's on your mind?"
            focused={!showSettings}
            onSubmit={handleWrite}
            style={{ bg: BG, fg: FG, focusedBackgroundColor: BG }}
          />
        </box>
      )}
      {mode === "search" && (
        <box title="Search (Enter to search)" style={{ border: true, height: 5, bg: BG, borderColor: DIM }}>
          <input
            placeholder="Search your entries..."
            focused={!showSettings}
            onSubmit={handleSearch}
            style={{ bg: BG, fg: FG, focusedBackgroundColor: BG }}
          />
        </box>
      )}
      {mode === "edit" && editingEntry && (
        <box title="Edit (Enter to save, Esc to cancel)" style={{ border: true, height: 5, bg: BG, borderColor: DIM }}>
          <input
            value={editingEntry.body}
            focused={!showSettings}
            onSubmit={handleEdit}
            style={{ bg: BG, fg: FG, focusedBackgroundColor: BG }}
          />
        </box>
      )}
      {mode === "list" && (
        <box title="List" style={{ border: true, height: 5, bg: BG, borderColor: DIM }}>
          <text content="j/k: navigate  e: edit  d: delete  Tab: switch" style={{ fg: DIM, bg: BG }} />
        </box>
      )}

      {/* Entries */}
      <scrollbox
        focused={mode === "list"}
        style={{ border: true, flexGrow: 1, bg: BG, borderColor: DIM }}
        title={`Entries (${entries.length})`}
      >
        {entries.map((e, i) => {
          const isSelected = mode === "list" && i === selected
          return (
            <box
              key={e.id}
              style={{
                flexDirection: "row",
                height: 1,
                width: "100%",
                bg: isSelected ? HIGHLIGHT_BG : BG,
              }}
            >
              <text
                content={`${(e.createdAt ?? "").slice(0, 16)}  `}
                style={{ fg: isSelected ? HIGHLIGHT_FG : DIM, bg: isSelected ? HIGHLIGHT_BG : BG }}
              />
              <text
                content={e.body.replace(/\n/g, " ").slice(0, 120)}
                style={{ fg: isSelected ? HIGHLIGHT_FG : FG, bg: isSelected ? HIGHLIGHT_BG : BG }}
              />
            </box>
          )
        })}
      </scrollbox>

      {/* Settings overlay */}
      {showSettings && (
        <box
          style={{
            position: "absolute",
            width: 60,
            height: 18,
            left: Math.floor((dimensions.width - 60) / 2),
            top: Math.floor((dimensions.height - 18) / 2),
            border: true,
            borderColor: ACCENT,
            bg: BG,
            flexDirection: "column",
            zIndex: 10,
          }}
          title={
            settingsScreen === "menu"
              ? "Settings"
              : settingsScreen === "providers"
                ? "Sync Providers"
                : "Dropbox"
          }
        >
          {settingsScreen === "menu" && (
            <box style={{ flexDirection: "column", paddingX: 2, paddingY: 1 }}>
              <box style={{ flexDirection: "row", height: 1, bg: settingsSelected === 0 ? HIGHLIGHT_BG : BG }}>
                <text content="  Sync Providers" style={{ fg: settingsSelected === 0 ? HIGHLIGHT_FG : FG, bg: settingsSelected === 0 ? HIGHLIGHT_BG : BG }} />
              </box>
              <text content="" style={{ fg: DIM, height: 1 }} />
              <text content="  j/k: navigate  Enter: select  Esc: close" style={{ fg: DIM }} />
            </box>
          )}

          {settingsScreen === "providers" && (
            <box style={{ flexDirection: "column", paddingX: 2, paddingY: 1 }}>
              <box style={{ flexDirection: "row", height: 1, bg: settingsSelected === 0 ? HIGHLIGHT_BG : BG }}>
                <text content="  Dropbox" style={{ fg: settingsSelected === 0 ? HIGHLIGHT_FG : FG, bg: settingsSelected === 0 ? HIGHLIGHT_BG : BG }} />
              </box>
              <text content="" style={{ fg: DIM, height: 1 }} />
              <text content="  Enter: select  Esc: back" style={{ fg: DIM }} />
            </box>
          )}

          {settingsScreen === "dropbox" && (
            <box style={{ flexDirection: "column", paddingX: 2, paddingY: 1 }}>
              <text content="Dropbox Sync" style={{ fg: FG, height: 1 }} />
              <text content={`Syncs to /Apps/silt/entries/`} style={{ fg: DIM, height: 1 }} />
              <text content="" style={{ fg: DIM, height: 1 }} />

              {dropboxToken ? (
                <box style={{ flexDirection: "column" }}>
                  <text content="Status: Connected" style={{ fg: "#00FF00", height: 1 }} />
                  <text content={`Token:  ${maskToken(dropboxToken)}`} style={{ fg: FG, height: 1 }} />
                  <text content="" style={{ fg: DIM, height: 1 }} />
                  <text content="  d: disconnect  Esc: back" style={{ fg: DIM }} />
                </box>
              ) : authInProgress ? (
                <box style={{ flexDirection: "column" }}>
                  <text content="Waiting for authorization..." style={{ fg: ACCENT, height: 1 }} />
                  <text content="Your browser should open automatically." style={{ fg: DIM, height: 1 }} />
                  <text content="" style={{ fg: DIM, height: 1 }} />
                  <text content="  Esc: cancel" style={{ fg: DIM }} />
                </box>
              ) : (
                <box style={{ flexDirection: "column" }}>
                  <text content="Status: Not connected" style={{ fg: DIM, height: 1 }} />
                  <text content="" style={{ fg: DIM, height: 1 }} />
                  <text content="  Enter: connect Dropbox  Esc: back" style={{ fg: DIM }} />
                </box>
              )}
            </box>
          )}
        </box>
      )}

      {/* Status */}
      <text content={status} style={{ fg: DIM, height: 1, bg: BG }} />
    </box>
  )
}

const renderer = await createCliRenderer({ exitOnCtrlC: true, backgroundColor: "#000000" })
createRoot(renderer).render(<App />)
