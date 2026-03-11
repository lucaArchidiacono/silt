import { useCallback } from "react";
import { useTerminalDimensions } from "@opentui/react";
import { useApp } from "../context";
import { aiQuery } from "../silt";
import { BG, FG, DIM, ACCENT, SPINNER } from "../theme";

export function AiMode() {
  const dimensions = useTerminalDimensions();
  const { state, actions, refs } = useApp();
  const { dialog, aiResponse, aiLoading, aiScroll, insertMode, panelFocus } = state;
  const { setAiResponse, setAiLoading, setAiScroll, setStatus } = actions;
  const { aiInputRef, spinnerRef, spinnerFrameRef } = refs;

  const topFocused = panelFocus === "top";
  const isInsert = insertMode && topFocused;

  const handleSubmit = useCallback(
    (value: string) => {
      const query = value.trim();
      if (!query || aiLoading) return;

      setAiResponse("");
      setAiLoading(true);
      setAiScroll(0);
      setStatus("Thinking...");

      // Start spinner
      if (spinnerRef.current) clearInterval(spinnerRef.current);
      spinnerFrameRef.current = 0;
      spinnerRef.current = setInterval(() => {
        spinnerFrameRef.current =
          (spinnerFrameRef.current + 1) % SPINNER.length;
        setStatus(`${SPINNER[spinnerFrameRef.current]} Thinking...`);
      }, 100);

      aiQuery(query)
        .then((response) => {
          setAiResponse(response);
          setStatus("Done. Esc then l to scroll, i to ask again.");
        })
        .catch((err) => {
          setAiResponse(`Error: ${err.message || err}`);
          setStatus("AI query failed.");
        })
        .finally(() => {
          setAiLoading(false);
          if (spinnerRef.current) {
            clearInterval(spinnerRef.current);
            spinnerRef.current = null;
          }
        });
    },
    [
      aiLoading,
      setAiResponse,
      setAiLoading,
      setAiScroll,
      setStatus,
      spinnerRef,
      spinnerFrameRef,
    ],
  );

  const responseLines = aiResponse ? aiResponse.split("\n") : [];
  const responseWidth = dimensions.width - 4;
  const bottomFocused = panelFocus === "bottom";

  return (
    <box style={{ flexDirection: "column", flexGrow: 1, backgroundColor: BG }}>
      <box
        title={
          isInsert
            ? " INSERT — Esc: visual  Enter: ask "
            : " NORMAL — i: insert  h/l: nav "
        }
        style={{
          border: true,
          height: 3,
          backgroundColor: BG,
          borderColor: aiLoading ? ACCENT : isInsert ? ACCENT : topFocused ? FG : DIM,
        }}
      >
        <input
          ref={aiInputRef}
          placeholder="Ask about your entries..."
          focused={isInsert && dialog === null}
          onSubmit={(event) => handleSubmit(event.toString())}
          style={{
            backgroundColor: BG,
            textColor: FG,
            focusedBackgroundColor: BG,
          }}
        />
      </box>
      {responseLines.length > 0 && (
        <scrollbox
          style={{
            border: true,
            flexGrow: 1,
            backgroundColor: BG,
            borderColor: bottomFocused ? FG : DIM,
          }}
          title={bottomFocused ? "Response (j/k: scroll  h/l: nav)" : "Response"}
        >
          {responseLines.map((line, i) => (
            <text
              key={i}
              content={`  ${line}`.padEnd(responseWidth, " ")}
              style={{ fg: FG, bg: BG, height: 1 }}
            />
          ))}
        </scrollbox>
      )}
    </box>
  );
}
