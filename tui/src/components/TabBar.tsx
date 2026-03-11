import { useApp } from "../context";
import { BG, DIM } from "../theme";

export function TabBar() {
  const { state } = useApp();
  const { mode } = state;
  const isListActive = mode === "list" || mode === "edit";

  return (
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
  );
}
