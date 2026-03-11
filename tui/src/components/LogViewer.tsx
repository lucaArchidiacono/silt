import { useTerminalDimensions } from "@opentui/react";
import { useApp } from "../context";
import { BG, FG, DIM, HIGHLIGHT_BG, HIGHLIGHT_FG, ACCENT } from "../theme";

export function LogViewer() {
  const dimensions = useTerminalDimensions();
  const { state, refs } = useApp();
  const { logLines, logScroll } = state;
  const { logScrollRef } = refs;

  const logHeight = Math.max(12, Math.floor(dimensions.height * 0.6)) - 2;
  const logWidth = dimensions.width - 6;

  const lines =
    logLines.length === 0
      ? [{ text: "  No logs yet.", fg: DIM, bg: BG }]
      : logLines.map((line, i) => {
          const isSelected = i === logScroll;
          const fg = line.includes("ERROR")
            ? "#FF5555"
            : line.includes("WARN")
              ? ACCENT
              : FG;
          return {
            text: `  ${line}`,
            fg: isSelected ? HIGHLIGHT_FG : fg,
            bg: isSelected ? HIGHLIGHT_BG : BG,
          };
        });

  while (lines.length < logHeight) {
    lines.push({ text: " ".repeat(logWidth), fg: BG, bg: BG });
  }

  return (
    <box
      style={{
        position: "absolute",
        width: dimensions.width - 4,
        height: Math.max(12, Math.floor(dimensions.height * 0.6)),
        left: 2,
        top: Math.floor(dimensions.height * 0.2),
        border: true,
        borderColor: ACCENT,
        backgroundColor: BG,
        flexDirection: "column",
        zIndex: 20,
      }}
      title={`Logs (${logLines.length}) — j/k: scroll  g/G: top/bottom  r: refresh  y: copy  x: clear  Esc: close`}
    >
      <scrollbox
        ref={logScrollRef}
        style={{ flexGrow: 1, backgroundColor: BG }}
      >
        {lines.map((l, i) => (
          <text
            key={i}
            content={l.text.padEnd(logWidth, " ")}
            style={{ fg: l.fg, bg: l.bg, height: 1 }}
          />
        ))}
      </scrollbox>
    </box>
  );
}
