import { useCallback } from "react";
import { useApp } from "../context";
import { BG, FG, DIM, ACCENT } from "../theme";

export function WriteMode() {
  const { state, actions, refs } = useApp();
  const { insertMode, panelFocus, writeText, dialog } = state;
  const { setWriteText } = actions;
  const { textareaRef } = refs;

  const topFocused = panelFocus === "top";
  const isInsert = insertMode && topFocused;

  const handleContentChange = useCallback(() => {
    setWriteText(textareaRef.current?.plainText ?? "");
  }, [setWriteText, textareaRef]);

  return (
    <box
      title={
        isInsert
          ? " INSERT — Esc: visual "
          : " NORMAL — i: insert  Enter: save  h/l: nav "
      }
      style={{
        border: true,
        flexGrow: 1,
        backgroundColor: BG,
        borderColor: isInsert ? ACCENT : topFocused ? FG : DIM,
      }}
    >
      <textarea
        ref={textareaRef}
        placeholder="What's on your mind?"
        initialValue={writeText}
        focused={isInsert && dialog === null}
        onContentChange={handleContentChange}
        wrapMode="word"
        backgroundColor={BG}
        textColor={FG}
        focusedBackgroundColor={BG}
        showCursor={isInsert}
      />
    </box>
  );
}
