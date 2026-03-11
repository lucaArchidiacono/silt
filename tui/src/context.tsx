import type {
  TextareaRenderable,
  ScrollBoxRenderable,
  InputRenderable,
} from "@opentui/core";
import { createContext, use, useState, useRef, useCallback } from "react";
import { listEntries, type Entry } from "./silt";

export type Mode = "write" | "list" | "search" | "edit";
export type Dialog = "settings" | "logs" | null;
export type SettingsScreen = "menu" | "providers" | "dropbox" | "gdrive";

export interface AppState {
  mode: Mode;
  entries: Entry[];
  selected: number;
  editingEntry: Entry | null;
  writeInsert: boolean;
  writeText: string;
  status: string;
  dialog: Dialog;
  settingsScreen: SettingsScreen;
  settingsSelected: number;
  dropboxToken: string | null;
  gdriveToken: string | null;
  authInProgress: boolean;
  logLines: string[];
  logScroll: number;
}

export interface AppActions {
  setMode: React.Dispatch<React.SetStateAction<Mode>>;
  setEntries: React.Dispatch<React.SetStateAction<Entry[]>>;
  setSelected: React.Dispatch<React.SetStateAction<number>>;
  setEditingEntry: React.Dispatch<React.SetStateAction<Entry | null>>;
  setWriteInsert: React.Dispatch<React.SetStateAction<boolean>>;
  setWriteText: React.Dispatch<React.SetStateAction<string>>;
  setStatus: React.Dispatch<React.SetStateAction<string>>;
  setDialog: React.Dispatch<React.SetStateAction<Dialog>>;
  setSettingsScreen: React.Dispatch<React.SetStateAction<SettingsScreen>>;
  setSettingsSelected: React.Dispatch<React.SetStateAction<number>>;
  setDropboxToken: React.Dispatch<React.SetStateAction<string | null>>;
  setGdriveToken: React.Dispatch<React.SetStateAction<string | null>>;
  setAuthInProgress: React.Dispatch<React.SetStateAction<boolean>>;
  setLogLines: React.Dispatch<React.SetStateAction<string[]>>;
  setLogScroll: React.Dispatch<React.SetStateAction<number>>;
}

export interface AppRefs {
  textareaRef: React.RefObject<TextareaRenderable | null>;
  searchInputRef: React.RefObject<InputRenderable | null>;
  logScrollRef: React.RefObject<ScrollBoxRenderable | null>;
  spinnerRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>;
  spinnerFrameRef: React.MutableRefObject<number>;
}

export interface AppContextValue {
  state: AppState;
  actions: AppActions;
  refs: AppRefs;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = use(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>("write");
  const [entries, setEntries] = useState<Entry[]>(() => listEntries());
  const [selected, setSelected] = useState(0);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [writeInsert, setWriteInsert] = useState(false);
  const [writeText, setWriteText] = useState("");
  const [status, setStatus] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [settingsScreen, setSettingsScreen] = useState<SettingsScreen>("menu");
  const [settingsSelected, setSettingsSelected] = useState(0);
  const [dropboxToken, setDropboxToken] = useState<string | null>(null);
  const [gdriveToken, setGdriveToken] = useState<string | null>(null);
  const [authInProgress, setAuthInProgress] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [logScroll, setLogScroll] = useState(0);

  const textareaRef = useRef<TextareaRenderable>(null);
  const searchInputRef = useRef<InputRenderable>(null);
  const logScrollRef = useRef<ScrollBoxRenderable>(null);
  const spinnerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const spinnerFrameRef = useRef(0);

  const value: AppContextValue = {
    state: {
      mode,
      entries,
      selected,
      editingEntry,
      writeInsert,
      writeText,
      status,
      dialog,
      settingsScreen,
      settingsSelected,
      dropboxToken,
      gdriveToken,
      authInProgress,
      logLines,
      logScroll,
    },
    actions: {
      setMode,
      setEntries,
      setSelected,
      setEditingEntry,
      setWriteInsert,
      setWriteText,
      setStatus,
      setDialog,
      setSettingsScreen,
      setSettingsSelected,
      setDropboxToken,
      setGdriveToken,
      setAuthInProgress,
      setLogLines,
      setLogScroll,
    },
    refs: {
      textareaRef,
      searchInputRef,
      logScrollRef,
      spinnerRef,
      spinnerFrameRef,
    },
  };

  return <AppContext value={value}>{children}</AppContext>;
}
