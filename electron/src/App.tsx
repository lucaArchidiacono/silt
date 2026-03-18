import {
  startTransition,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  aiQuery,
  clearLogs,
  copyText,
  deleteEntry,
  editEntry,
  getAiSettings,
  getLogs,
  getSyncProviderState,
  listEntries,
  newEntry,
  onSettingsChanged,
  openSettingsWindow,
  rebuildIndex,
  searchEntries,
  syncPullAsync,
  syncPullAsyncGDrive,
  syncPushAll,
  syncPushAllGDrive,
  syncPushEntries,
  syncPushEntriesGDrive,
  type Entry,
} from "./silt";

type View = "write" | "search" | "ai";
type ProviderState = ReturnType<typeof getSyncProviderState>;
type AiSettings = ReturnType<typeof getAiSettings>;

function formatEntryDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

function summarizeBody(body: string): string {
  const normalized = body.replace(/\s+/g, " ").trim();
  return normalized.length > 140
    ? `${normalized.slice(0, 140).trimEnd()}...`
    : normalized;
}

function GearIcon() {
  return (
    <svg
      aria-hidden="true"
      className="gear-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3.25" />
      <path d="M19.4 15a1 1 0 0 0 .2 1.09l.05.05a1.75 1.75 0 0 1 0 2.47 1.75 1.75 0 0 1-2.47 0l-.05-.05a1 1 0 0 0-1.09-.2 1 1 0 0 0-.6.91V19.5A1.75 1.75 0 0 1 13.7 21h-3.4a1.75 1.75 0 0 1-1.75-1.75v-.08a1 1 0 0 0-.6-.91 1 1 0 0 0-1.09.2l-.05.05a1.75 1.75 0 0 1-2.47 0 1.75 1.75 0 0 1 0-2.47l.05-.05a1 1 0 0 0 .2-1.09 1 1 0 0 0-.91-.6H3.5A1.75 1.75 0 0 1 1.75 12.7v-1.4A1.75 1.75 0 0 1 3.5 9.55h.08a1 1 0 0 0 .91-.6 1 1 0 0 0-.2-1.09l-.05-.05a1.75 1.75 0 0 1 0-2.47 1.75 1.75 0 0 1 2.47 0l.05.05a1 1 0 0 0 1.09.2 1 1 0 0 0 .6-.91V4.5A1.75 1.75 0 0 1 10.3 2.75h3.4A1.75 1.75 0 0 1 15.45 4.5v.08a1 1 0 0 0 .6.91 1 1 0 0 0 1.09-.2l.05-.05a1.75 1.75 0 0 1 2.47 0 1.75 1.75 0 0 1 0 2.47l-.05.05a1 1 0 0 0-.2 1.09 1 1 0 0 0 .91.6h.08A1.75 1.75 0 0 1 22.25 11.3v1.4A1.75 1.75 0 0 1 20.5 14.45h-.08a1 1 0 0 0-.91.55Z" />
    </svg>
  );
}

function PullIcon() {
  return (
    <svg
      aria-hidden="true"
      className="chrome-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 4v13" />
      <path d="m7 12 5 5 5-5" />
    </svg>
  );
}

function PushIcon() {
  return (
    <svg
      aria-hidden="true"
      className="chrome-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20V7" />
      <path d="m7 12 5-5 5 5" />
    </svg>
  );
}

function LogsIcon() {
  return (
    <svg
      aria-hidden="true"
      className="chrome-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
      <path d="M9 9h2" />
    </svg>
  );
}

function ChromeIconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className="chrome-icon-button"
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

export function App() {
  const [view, setView] = useState<View>("write");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [composeText, setComposeText] = useState("");
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [editingText, setEditingText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Entry[]>([]);
  const [selectedSearchId, setSelectedSearchId] = useState<string | null>(null);
  const [searchStatus, setSearchStatus] = useState("Search the local index.");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [aiError, setAiError] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [status, setStatus] = useState("Ready.");
  const [error, setError] = useState("");
  const [logsOpen, setLogsOpen] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [providerState, setProviderState] = useState<ProviderState>(() =>
    getSyncProviderState(),
  );
  const [aiSettings, setAiSettings] = useState<AiSettings>(() => getAiSettings());
  const [syncBusy, setSyncBusy] = useState(false);

  const selectedEntry = useMemo(
    () =>
      entries.find((entry) => entry.id === selectedEntryId) ??
      entries[0] ??
      null,
    [entries, selectedEntryId],
  );

  const activeSearchEntry = useMemo(
    () =>
      searchResults.find((entry) => entry.id === selectedSearchId) ??
      searchResults[0] ??
      null,
    [searchResults, selectedSearchId],
  );

  function refreshEntries() {
    startTransition(() => {
      const nextEntries = listEntries();
      setEntries(nextEntries);
      setSelectedEntryId((current) =>
        current && nextEntries.some((entry) => entry.id === current)
          ? current
          : nextEntries[0]?.id ?? null,
      );
    });
  }

  function refreshSettings() {
    setProviderState(getSyncProviderState());
    setAiSettings(getAiSettings());
  }

  async function runPull(
    reason: "startup" | "manual" | "settings" = "manual",
    providers: ProviderState = providerState,
  ) {
    if (!providers.dropboxConnected && !providers.gdriveConnected) {
      if (reason === "manual") {
        setStatus("Connect Dropbox or Google Drive first.");
      }
      return;
    }

    setSyncBusy(true);
    setError("");
    setStatus(reason === "startup" ? "Pulling your cloud entries..." : "Pulling from connected providers...");

    try {
      const promises: Promise<number>[] = [];
      if (providers.dropboxConnected) promises.push(syncPullAsync());
      if (providers.gdriveConnected) promises.push(syncPullAsyncGDrive());
      const total = (await Promise.all(promises)).reduce((sum, count) => sum + count, 0);
      if (total > 0) {
        rebuildIndex();
        refreshEntries();
      }
      setStatus(total > 0 ? `Pulled ${total} entries.` : "Everything is already up to date.");
    } catch (pullError) {
      const message = pullError instanceof Error ? pullError.message : String(pullError);
      setError(message);
      setStatus("Sync pull failed.");
    } finally {
      setSyncBusy(false);
    }
  }

  async function runPush(ids?: string[]) {
    if (!providerState.dropboxConnected && !providerState.gdriveConnected) {
      return;
    }

    setSyncBusy(true);
    setError("");
    setStatus(ids?.length ? "Syncing this change..." : "Pushing all entries...");

    try {
      const promises: Promise<number>[] = [];
      if (providerState.dropboxConnected) {
        promises.push(ids?.length ? syncPushEntries(ids) : syncPushAll());
      }
      if (providerState.gdriveConnected) {
        promises.push(ids?.length ? syncPushEntriesGDrive(ids) : syncPushAllGDrive());
      }

      const total = (await Promise.all(promises)).reduce((sum, count) => sum + count, 0);
      setStatus(ids?.length ? "Change synced." : `Pushed ${total} entries.`);
    } catch (pushError) {
      const message = pushError instanceof Error ? pushError.message : String(pushError);
      setError(message);
      setStatus("Sync push failed.");
    } finally {
      setSyncBusy(false);
    }
  }

  useEffect(() => {
    refreshEntries();
    const currentProviders = getSyncProviderState();
    setProviderState(currentProviders);
    setAiSettings(getAiSettings());
    void runPull("startup", currentProviders);
  }, []);

  useEffect(() => {
    return onSettingsChanged((payload) => {
      const nextProviders = getSyncProviderState();
      setProviderState(nextProviders);
      setAiSettings(getAiSettings());
      if (payload.scope === "sync") {
        void runPull("settings", nextProviders);
      }
      if (payload.scope === "ai") {
        setStatus("AI settings refreshed.");
      }
    });
  }, [providerState]);

  async function handleSaveEntry() {
    const body = composeText.trim();
    if (!body) {
      setError("Write something first.");
      return;
    }

    try {
      setError("");
      const entry = newEntry(body);
      setComposeText("");
      refreshEntries();
      setSelectedEntryId(entry.id);
      setStatus("Entry saved locally.");
      await runPush([entry.id]);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : String(saveError);
      setError(message);
      setStatus("Save failed.");
    }
  }

  async function handleSaveEdit() {
    if (!editingEntry) return;

    try {
      setError("");
      const updated = editEntry(editingEntry.id, editingText.trim());
      setEditingEntry(null);
      setEditingText("");
      refreshEntries();
      setSelectedEntryId(updated.id);
      setStatus("Entry updated locally.");
      await runPush([updated.id]);
    } catch (editError) {
      const message = editError instanceof Error ? editError.message : String(editError);
      setError(message);
      setStatus("Edit failed.");
    }
  }

  async function handleDeleteEntry(id: string) {
    try {
      setError("");
      deleteEntry(id);
      refreshEntries();
      setSearchResults((current) => current.filter((entry) => entry.id !== id));
      setStatus("Entry deleted locally.");
      await runPush([id]);
    } catch (deleteError) {
      const message =
        deleteError instanceof Error ? deleteError.message : String(deleteError);
      setError(message);
      setStatus("Delete failed.");
    }
  }

  function handleOpenLogs() {
    setLogs(getLogs());
    setLogsOpen(true);
  }

  function handleSearch(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    try {
      setError("");
      if (!searchQuery.trim()) {
        setSearchResults([]);
        setSearchStatus("Search through your log and pull a thread when something matters.");
        return;
      }
      const results = searchEntries(searchQuery.trim());
      setSearchResults(results);
      setSelectedSearchId(results[0]?.id ?? null);
      setSearchStatus(
        results.length
          ? `${results.length} matches found.`
          : "No matches yet. Try a different phrase.",
      );
    } catch (searchError) {
      const message =
        searchError instanceof Error ? searchError.message : String(searchError);
      setError(message);
      setSearchStatus("Search failed.");
    }
  }

  async function handleAiSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const prompt = aiPrompt.trim();
    if (!prompt || aiLoading) return;

    setAiLoading(true);
    setAiError("");
    setAiResponse("");
    setStatus("Thinking with your full log as context...");

    try {
      const response = await aiQuery(prompt);
      setAiResponse(response);
      setStatus("AI response ready.");
    } catch (aiFailure) {
      const message = aiFailure instanceof Error ? aiFailure.message : String(aiFailure);
      setAiError(message);
      setStatus("AI query failed.");
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="window-shell">
      <header className="topbar">
        <div className="traffic-lights-space" aria-hidden="true" />
        <div className="chrome-title-group">
          <span className="chrome-title">Silt</span>
        </div>
        <div className="chrome-actions">
          <ChromeIconButton label="Open logs" onClick={handleOpenLogs}>
            <LogsIcon />
          </ChromeIconButton>
          <ChromeIconButton label="Pull from connected providers" onClick={() => void runPull("manual")}>
            <PullIcon />
          </ChromeIconButton>
          <ChromeIconButton label="Push to connected providers" onClick={() => void runPush()}>
            <PushIcon />
          </ChromeIconButton>
          <ChromeIconButton label="Open settings" onClick={openSettingsWindow}>
            <GearIcon />
          </ChromeIconButton>
        </div>
      </header>

      <div className="window-body">
        <section className="mode-strip">
          <div className="nav-tabs" role="tablist" aria-label="Main views">
            {(["write", "search", "ai"] as View[]).map((nextView) => (
              <button
                key={nextView}
                className={view === nextView ? "nav-tab active" : "nav-tab"}
                type="button"
                onClick={() => setView(nextView)}
              >
                {nextView}
              </button>
            ))}
          </div>
        </section>

        <section className="hero-strip">
          <div className="hero-copy">
            <span className="signal-dot" data-active={syncBusy}>
              {syncBusy ? "busy" : "local"}
            </span>
            <p>{status}</p>
          </div>
          <div className="hero-meta">
            <span>{providerState.dropboxConnected ? "Dropbox on" : "Dropbox off"}</span>
            <span>{providerState.gdriveConnected ? "Google Drive on" : "Google Drive off"}</span>
            <span>{aiSettings.provider} / {aiSettings.model}</span>
          </div>
        </section>

        {error ? <div className="error-banner">{error}</div> : null}

        <main className="main-grid">
        {view === "write" ? (
          <>
            <section className="panel panel-composer">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Write</p>
                  <h2>New entry</h2>
                </div>
                <button className="action-button strong" type="button" onClick={() => void handleSaveEntry()}>
                  Save entry
                </button>
              </div>
              <textarea
                className="editor-area"
                placeholder="Write in markdown."
                value={composeText}
                onChange={(event) => setComposeText(event.target.value)}
              />
            </section>
            <section className="panel panel-list">
              <div className="panel-header tight">
                <div>
                  <p className="panel-kicker">Recent</p>
                  <h2>{entries.length} indexed entries</h2>
                </div>
              </div>
              <div className="entry-list">
                {entries.map((entry) => (
                  <button
                    key={entry.id}
                    className={
                      selectedEntry?.id === entry.id ? "entry-card active" : "entry-card"
                    }
                    type="button"
                    onClick={() => setSelectedEntryId(entry.id)}
                  >
                    <strong>{formatEntryDate(entry.createdAt)}</strong>
                    <span>{summarizeBody(entry.body)}</span>
                  </button>
                ))}
                {!entries.length ? (
                  <div className="empty-state">
                    <h3>No entries yet.</h3>
                    <p>Your first entry will appear here after you save it.</p>
                  </div>
                ) : null}
              </div>
              {selectedEntry ? (
                <div className="entry-detail">
                  <div className="entry-detail-header">
                    <div>
                      <p className="panel-kicker">Selected</p>
                      <h3>{formatEntryDate(selectedEntry.createdAt)}</h3>
                    </div>
                    <div className="inline-actions">
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => {
                          setEditingEntry(selectedEntry);
                          setEditingText(selectedEntry.body);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="text-button danger"
                        type="button"
                        onClick={() => void handleDeleteEntry(selectedEntry.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <pre className="entry-body">{selectedEntry.body}</pre>
                </div>
              ) : null}
            </section>
          </>
        ) : null}

        {view === "search" ? (
          <>
            <section className="panel panel-search">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Search</p>
                  <h2>Search index</h2>
                </div>
              </div>
              <form className="search-form" onSubmit={handleSearch}>
                <input
                  className="text-input"
                  placeholder="Find a phrase, date, or thread..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
                <button className="action-button strong" type="submit">
                  Search
                </button>
              </form>
              <p className="status-copy">{searchStatus}</p>
              <div className="entry-list search-results">
                {searchResults.map((entry) => (
                  <button
                    key={entry.id}
                    className={
                      activeSearchEntry?.id === entry.id ? "entry-card active" : "entry-card"
                    }
                    type="button"
                    onClick={() => setSelectedSearchId(entry.id)}
                  >
                    <strong>{formatEntryDate(entry.createdAt)}</strong>
                    <span>{summarizeBody(entry.body)}</span>
                  </button>
                ))}
              </div>
            </section>
            <section className="panel panel-preview">
              <div className="panel-header tight">
                <div>
                  <p className="panel-kicker">Preview</p>
                  <h2>
                    {activeSearchEntry ? formatEntryDate(activeSearchEntry.createdAt) : "Select a result"}
                  </h2>
                </div>
              </div>
              {activeSearchEntry ? (
                <>
                  <pre className="entry-body">{activeSearchEntry.body}</pre>
                  <div className="inline-actions">
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => {
                        setView("write");
                        setSelectedEntryId(activeSearchEntry.id);
                        setEditingEntry(activeSearchEntry);
                        setEditingText(activeSearchEntry.body);
                      }}
                    >
                      Edit entry
                    </button>
                    <button
                      className="text-button danger"
                      type="button"
                      onClick={() => void handleDeleteEntry(activeSearchEntry.id)}
                    >
                      Delete entry
                    </button>
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <h3>No result selected.</h3>
                  <p>Run a query and open a match here.</p>
                </div>
              )}
            </section>
          </>
        ) : null}

        {view === "ai" ? (
          <>
            <section className="panel panel-ai-input">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">AI</p>
                  <h2>Ask across your archive</h2>
                </div>
              </div>
              <form className="stack-form" onSubmit={handleAiSubmit}>
                <div className="chip-row">
                  <span className="chip">{aiSettings.provider}</span>
                  <span className="chip">{aiSettings.model}</span>
                </div>
                <textarea
                  className="editor-area compact"
                  placeholder="Ask what changed, what repeats, or what stands out."
                  value={aiPrompt}
                  onChange={(event) => setAiPrompt(event.target.value)}
                />
                <button className="action-button strong" type="submit" disabled={aiLoading}>
                  {aiLoading ? "Thinking..." : "Ask"}
                </button>
              </form>
            </section>
            <section className="panel panel-ai-output">
              <div className="panel-header tight">
                <div>
                  <p className="panel-kicker">Response</p>
                  <h2>{aiError ? "Provider error" : "Model response"}</h2>
                </div>
              </div>
              {aiError ? <div className="error-banner">{aiError}</div> : null}
              {aiResponse ? (
                <pre className="entry-body">{aiResponse}</pre>
              ) : (
                <div className="empty-state">
                  <h3>No response yet.</h3>
                  <p>The next query will run against your full local archive.</p>
                </div>
              )}
            </section>
          </>
        ) : null}
        </main>
      </div>

      {editingEntry ? (
        <div className="modal-shell" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Edit entry</p>
                <h2>{formatEntryDate(editingEntry.createdAt)}</h2>
              </div>
            </div>
            <textarea
              className="editor-area compact"
              value={editingText}
              onChange={(event) => setEditingText(event.target.value)}
            />
            <div className="inline-actions spread">
              <button
                className="action-button"
                type="button"
                onClick={() => {
                  setEditingEntry(null);
                  setEditingText("");
                }}
              >
                Cancel
              </button>
              <button className="action-button strong" type="button" onClick={() => void handleSaveEdit()}>
                Save changes
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {logsOpen ? (
        <div className="modal-shell" role="dialog" aria-modal="true">
          <div className="modal-card log-modal">
            <div className="panel-header tight">
              <div>
                <p className="panel-kicker">Logs</p>
                <h2>Rust and sync activity</h2>
              </div>
              <div className="inline-actions">
                <button className="text-button" type="button" onClick={() => setLogs(getLogs())}>
                  Refresh
                </button>
                <button className="text-button" type="button" onClick={() => copyText(logs.join("\n"))}>
                  Copy
                </button>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => {
                    clearLogs();
                    setLogs([]);
                  }}
                >
                  Clear
                </button>
                <button className="text-button" type="button" onClick={() => setLogsOpen(false)}>
                  Close
                </button>
              </div>
            </div>
            <div className="log-surface">
              {logs.length ? logs.map((line, index) => <code key={`${line}-${index}`}>{line}</code>) : <p>No logs yet.</p>}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
