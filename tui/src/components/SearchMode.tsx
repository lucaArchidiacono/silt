import { useCallback } from "react";
import { useApp } from "../context";
import { listEntries, searchEntries } from "../silt";
import { BG, FG, DIM, ACCENT } from "../theme";

export function SearchMode() {
  const { state, actions, refs } = useApp();
  const { insertMode, panelFocus, dialog } = state;
  const { setEntries, setSelected, setStatus } = actions;
  const { searchInputRef } = refs;

  const topFocused = panelFocus === "top";
  const isInsert = insertMode && topFocused;

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
      title={
        isInsert
          ? " INSERT — Esc: visual  Enter: search "
          : " NORMAL — i: insert  h/l: nav "
      }
      style={{
        border: true,
        height: 3,
        backgroundColor: BG,
        borderColor: isInsert ? ACCENT : topFocused ? FG : DIM,
      }}
    >
      <input
        ref={searchInputRef}
        placeholder="Search your entries..."
        focused={isInsert && dialog === null}
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
