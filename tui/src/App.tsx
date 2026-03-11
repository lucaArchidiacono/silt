import { useTerminalDimensions } from "@opentui/react";
import { useRef } from "react";
import { AppProvider, useApp } from "./context";
import { useAppKeyboard } from "./hooks/useAppKeyboard";
import { useSync, hasAnySyncProvider } from "./hooks/useSync";
import { BG } from "./theme";
import { TabBar } from "./components/TabBar";
import { StatusBar } from "./components/StatusBar";
import { WriteMode } from "./components/WriteMode";
import { ListMode } from "./components/ListMode";
import { SearchMode } from "./components/SearchMode";
import { EditMode } from "./components/EditMode";
import { EntryList } from "./components/EntryList";
import { SettingsDialog } from "./components/SettingsDialog";
import { LogViewer } from "./components/LogViewer";

function AppLayout() {
  const dimensions = useTerminalDimensions();
  const { state, actions } = useApp();
  const { mode, dialog } = state;
  const { pullFromAll } = useSync();

  // Pull from all providers on startup
  const startupPullDone = useRef(false);
  if (!startupPullDone.current && hasAnySyncProvider()) {
    startupPullDone.current = true;
    pullFromAll((count) => {
      actions.setStatus(
        count > 0 ? `Pulled ${count} entries.` : "Up to date.",
      );
    });
  }

  useAppKeyboard();

  return (
    <box
      width={dimensions.width}
      height={dimensions.height}
      backgroundColor={BG}
      style={{ flexDirection: "column" }}
    >
      <TabBar />
      {mode === "write" && <WriteMode />}
      {mode === "search" && <SearchMode />}
      {mode === "edit" && <EditMode />}
      {mode === "list" && <ListMode />}
      <EntryList />
      {dialog === "settings" && <SettingsDialog />}
      {dialog === "logs" && <LogViewer />}
      <StatusBar />
    </box>
  );
}

export function App() {
  return (
    <AppProvider>
      <AppLayout />
    </AppProvider>
  );
}
