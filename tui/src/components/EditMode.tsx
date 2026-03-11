import { useCallback } from "react";
import { useApp } from "../context";
import { editEntry, listEntries } from "../silt";
import { hasAnySyncProvider, useSync } from "../hooks/useSync";
import { BG, FG, DIM } from "../theme";

export function EditMode() {
  const { state, actions } = useApp();
  const { editingEntry, dialog } = state;
  const { setEntries, setEditingEntry, setMode, setStatus } = actions;
  const { pushToAll } = useSync();

  const handleEdit = useCallback(
    (value: string) => {
      if (!editingEntry) return;
      const body = value.trim();
      if (!body) return;
      editEntry(editingEntry.id, body);
      setEntries(listEntries());
      setEditingEntry(null);
      setMode("write");
      if (hasAnySyncProvider()) {
        pushToAll([editingEntry.id], () =>
          setStatus("Entry updated & synced."),
        );
      } else {
        setStatus("Entry updated.");
      }
    },
    [editingEntry, setEntries, setEditingEntry, setMode, setStatus, pushToAll],
  );

  if (!editingEntry) return null;

  return (
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
        onSubmit={(value) => handleEdit(value.toString())}
        style={{
          backgroundColor: BG,
          textColor: FG,
          focusedBackgroundColor: BG,
        }}
      />
    </box>
  );
}
