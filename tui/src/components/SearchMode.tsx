import { useCallback } from "react";
import { useApp } from "../context";
import { listEntries, searchEntries } from "../silt";
import { BG, FG, DIM } from "../theme";

export function SearchMode() {
  const { state, actions, refs } = useApp();
  const { dialog } = state;
  const { setEntries, setSelected, setStatus } = actions;
  const { searchInputRef } = refs;

  const handleSearchInput = useCallback(
    (value: string) => {
      if (!value.trim()) {
        setEntries(listEntries());
        setSelected(0);
        setStatus("");
      }
    },
    [setEntries, setSelected, setStatus],
  );

  const handleSearch = useCallback(
    (value: string) => {
      const query = value.trim();
      if (!query) {
        setEntries(listEntries());
        setSelected(0);
        setStatus("");
        return;
      }
      const results = searchEntries(query);
      setEntries(results);
      setSelected(0);
      setStatus(`${results.length} result${results.length === 1 ? "" : "s"}`);
    },
    [setEntries, setSelected, setStatus],
  );

  return (
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
        ref={searchInputRef}
        placeholder="Search your entries..."
        focused={dialog === null}
        onSubmit={(event) => handleSearch(event.toString())}
        onInput={(value) => handleSearchInput(value)}
        style={{
          backgroundColor: BG,
          textColor: FG,
          focusedBackgroundColor: BG,
        }}
      />
    </box>
  );
}
