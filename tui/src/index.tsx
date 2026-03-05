import { createCliRenderer } from "@opentui/core"
import { createRoot, useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useState, useCallback } from "react"
import { listEntries, newEntry, searchEntries, editEntry, deleteEntry, type Entry } from "./silt"

const BG = "#000000"
const FG = "#CCCCCC"
const DIM = "#666666"
const HIGHLIGHT_BG = "#FFFF00"
const HIGHLIGHT_FG = "#000000"

type Mode = "write" | "list" | "search" | "edit"

const App = () => {
  const renderer = useRenderer()
  const dimensions = useTerminalDimensions()
  const [mode, setMode] = useState<Mode>("write")
  const [entries, setEntries] = useState<Entry[]>(() => listEntries())
  const [selected, setSelected] = useState(0)
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null)
  const [status, setStatus] = useState("")

  useKeyboard((key) => {
    if (key.ctrl && (key.name === "c" || key.name === "q")) {
      renderer?.destroy()
      process.exit(0)
    }

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
        <text content="  Tab: switch  Ctrl+Q: quit" style={{ fg: DIM, bg: BG }} />
      </box>

      {/* Input area */}
      {mode === "write" && (
        <box title="Write (Enter to save)" style={{ border: true, height: 5, bg: BG, borderColor: DIM }}>
          <input
            placeholder="What's on your mind?"
            focused={true}
            onSubmit={handleWrite}
            style={{ bg: BG, fg: FG, focusedBackgroundColor: BG }}
          />
        </box>
      )}
      {mode === "search" && (
        <box title="Search (Enter to search)" style={{ border: true, height: 5, bg: BG, borderColor: DIM }}>
          <input
            placeholder="Search your entries..."
            focused={true}
            onSubmit={handleSearch}
            style={{ bg: BG, fg: FG, focusedBackgroundColor: BG }}
          />
        </box>
      )}
      {mode === "edit" && editingEntry && (
        <box title="Edit (Enter to save, Esc to cancel)" style={{ border: true, height: 5, bg: BG, borderColor: DIM }}>
          <input
            value={editingEntry.body}
            focused={true}
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
                content={`${(e.created_at ?? "").slice(0, 16)}  `}
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

      {/* Status */}
      <text content={status} style={{ fg: DIM, height: 1, bg: BG }} />
    </box>
  )
}

const renderer = await createCliRenderer({ exitOnCtrlC: true, backgroundColor: "#000000" })
createRoot(renderer).render(<App />)
