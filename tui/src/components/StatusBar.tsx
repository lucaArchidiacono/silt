import { useEffect, useRef } from "react";
import { useApp } from "../context";
import { BG, DIM } from "../theme";

const SHORTCUTS = "Ctrl+S: settings  Ctrl+U: push  Ctrl+P: pull  Ctrl+L: logs  Ctrl+Q: quit";
const CLEAR_DELAY = 3000;

export function StatusBar() {
  const { state, actions } = useApp();
  const { status } = state;
  const { setStatus } = actions;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (status) {
      timerRef.current = setTimeout(() => setStatus(""), CLEAR_DELAY);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [status, setStatus]);

  const content = status || SHORTCUTS;
  return <text content={content} style={{ fg: DIM, height: 1, bg: BG }} />;
}
