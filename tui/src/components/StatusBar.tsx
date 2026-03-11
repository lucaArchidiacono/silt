import { useApp } from "../context";
import { BG, DIM } from "../theme";

const SHORTCUTS = "Ctrl+S: settings  Ctrl+U: push  Ctrl+P: pull  Ctrl+L: logs  Ctrl+Q: quit";

export function StatusBar() {
  const { state } = useApp();
  const content = state.status || SHORTCUTS;
  return <text content={content} style={{ fg: DIM, height: 1, bg: BG }} />;
}
