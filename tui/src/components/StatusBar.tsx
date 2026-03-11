import { useApp } from "../context";
import { BG, DIM } from "../theme";

export function StatusBar() {
  const { state } = useApp();
  return <text content={state.status} style={{ fg: DIM, height: 1, bg: BG }} />;
}
