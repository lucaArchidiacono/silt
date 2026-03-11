import { useTerminalDimensions } from "@opentui/react";
import { useApp } from "../context";
import { BG, FG, DIM, HIGHLIGHT_BG, HIGHLIGHT_FG } from "../theme";

export function EntryList() {
  const dimensions = useTerminalDimensions();
  const { state } = useApp();
  const { mode, entries, selected, panelFocus } = state;

  const bottomFocused = panelFocus === "bottom";
  const showSelection = bottomFocused;

  return (
    <scrollbox
      focused={bottomFocused}
      style={{
        border: true,
        ...(mode === "write"
          ? { height: Math.max(6, Math.floor(dimensions.height * 0.25)) }
          : { flexGrow: 1 }),
        backgroundColor: BG,
        borderColor: bottomFocused ? FG : DIM,
      }}
      title={
        bottomFocused
          ? `Entries (${entries.length}) — j/k: scroll  e: edit  d: delete  h/l: nav`
          : `Entries (${entries.length})`
      }
    >
      {entries.map((e, i) => {
        const isSelected = showSelection && i === selected;
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
  );
}
