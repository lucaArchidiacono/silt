import { BG, FG, DIM } from "../theme";

export function ListMode() {
  return (
    <box
      title="List"
      style={{
        border: true,
        height: 3,
        backgroundColor: BG,
        borderColor: DIM,
      }}
    >
      <text
        content="j/k: navigate  e: edit  d: delete  Tab: switch"
        style={{ fg: DIM, bg: BG }}
      />
    </box>
  );
}
