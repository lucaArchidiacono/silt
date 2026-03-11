import { useApp } from "../context";
import { BG, DIM } from "../theme";

export function TabBar() {
  const { state } = useApp();
  const { mode } = state;

  return (
    <box style={{ flexDirection: "row", height: 1, backgroundColor: BG }}>
      <text
        content={` Write `}
        style={{
          fg: mode === "write" || mode === "edit" ? BG : DIM,
          bg: mode === "write" || mode === "edit" ? "#FFFFFF" : BG,
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
        content={` AI `}
        style={{
          fg: mode === "ai" ? BG : DIM,
          bg: mode === "ai" ? "#FFFFFF" : BG,
        }}
      />
      <text
        content="  Tab: switch  Ctrl+S: settings  Ctrl+U: push  Ctrl+P: pull  Ctrl+L: logs  Ctrl+Q: quit"
        style={{ fg: DIM, bg: BG }}
      />
    </box>
  );
}
