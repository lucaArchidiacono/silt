import { useCallback } from "react";
import { useApp } from "../context";
import { BG, FG, DIM, ACCENT } from "../theme";

export function WriteMode() {
  const { state, actions, refs } = useApp();
  const { writeInsert, writeText, dialog } = state;
  const { setWriteText } = actions;
  const { textareaRef } = refs;

  const handleContentChange = useCallback(() => {
    setWriteText(textareaRef.current?.plainText ?? "");
  }, [setWriteText, textareaRef]);

  return (
    <box
      title={
        writeInsert
          ? " INSERT — Esc: done "
          : " NORMAL — i: insert  Enter: save "
      }
      style={{
        border: true,
        flexGrow: 1,
        backgroundColor: BG,
        borderColor: writeInsert ? ACCENT : DIM,
      }}
    >
      <textarea
        ref={textareaRef}
        placeholder="What's on your mind?"
        initialValue={writeText}
        focused={writeInsert && dialog === null}
        onContentChange={handleContentChange}
        wrapMode="word"
        backgroundColor={BG}
        textColor={FG}
        focusedBackgroundColor={BG}
        showCursor={writeInsert}
      />
    </box>
  );
}
