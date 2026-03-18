import { useEffect, useMemo, useState } from "react";
import {
  authDropbox,
  authGoogleDrive,
  disconnectDropbox,
  disconnectGoogleDrive,
  getAiSettings,
  getSyncProviderState,
  notifySettingsChanged,
  saveAiSettings,
  syncPushAll,
  syncPushAllGDrive,
} from "./silt";

type Section = "sync" | "ai";

export function SettingsApp() {
  const [section, setSection] = useState<Section>("sync");
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("Configure providers and runtime settings.");
  const [error, setError] = useState("");
  const [syncState, setSyncState] = useState(() => getSyncProviderState());
  const [provider, setProvider] = useState("ollama");
  const [model, setModel] = useState("llama3.2");
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");
  const [openrouterApiKey, setOpenrouterApiKey] = useState("");

  useEffect(() => {
    const ai = getAiSettings();
    setProvider(ai.provider);
    setModel(ai.model);
    setOllamaUrl(ai.ollamaUrl);
    setOpenrouterApiKey(ai.openrouterApiKey ?? "");
    setSyncState(getSyncProviderState());
  }, []);

  const aiSummary = useMemo(
    () =>
      provider === "ollama"
        ? `Ollama at ${ollamaUrl || "http://localhost:11434"}`
        : `OpenRouter key ${openrouterApiKey ? "configured" : "missing"}`,
    [ollamaUrl, openrouterApiKey, provider],
  );

  async function handleConnectDropbox() {
    setBusy("dropbox");
    setError("");
    setStatus("Connecting Dropbox...");

    try {
      await authDropbox();
      await syncPushAll();
      setSyncState(getSyncProviderState());
      notifySettingsChanged({ scope: "sync" });
      setStatus("Dropbox connected and seeded with your local entries.");
    } catch (connectError) {
      const message =
        connectError instanceof Error ? connectError.message : String(connectError);
      setError(message);
      setStatus("Dropbox connection failed.");
    } finally {
      setBusy("");
    }
  }

  async function handleConnectGDrive() {
    setBusy("gdrive");
    setError("");
    setStatus("Connecting Google Drive...");

    try {
      await authGoogleDrive();
      await syncPushAllGDrive();
      setSyncState(getSyncProviderState());
      notifySettingsChanged({ scope: "sync" });
      setStatus("Google Drive connected and seeded with your local entries.");
    } catch (connectError) {
      const message =
        connectError instanceof Error ? connectError.message : String(connectError);
      setError(message);
      setStatus("Google Drive connection failed.");
    } finally {
      setBusy("");
    }
  }

  function handleDisconnectDropbox() {
    disconnectDropbox();
    setSyncState(getSyncProviderState());
    notifySettingsChanged({ scope: "sync" });
    setStatus("Dropbox disconnected.");
  }

  function handleDisconnectGDrive() {
    disconnectGoogleDrive();
    setSyncState(getSyncProviderState());
    notifySettingsChanged({ scope: "sync" });
    setStatus("Google Drive disconnected.");
  }

  function handleSaveAi() {
    if (!model.trim()) {
      setError("Model is required.");
      return;
    }

    if (provider === "ollama" && !ollamaUrl.trim()) {
      setError("Ollama URL is required.");
      return;
    }

    if (provider === "openrouter" && !openrouterApiKey.trim()) {
      setError("OpenRouter API key is required.");
      return;
    }

    setError("");
    saveAiSettings({
      provider,
      model: model.trim(),
      ollamaUrl: ollamaUrl.trim(),
      openrouterApiKey: openrouterApiKey.trim(),
    });
    notifySettingsChanged({ scope: "ai" });
    setStatus("AI settings saved.");
  }

  return (
    <div className="window-shell settings-shell">
      <header className="topbar settings-topbar">
        <div className="traffic-lights-space" aria-hidden="true" />
        <div className="chrome-title-group">
          <span className="chrome-title">Settings</span>
        </div>
        <div className="chrome-actions settings-chrome-actions">
          <p className="settings-summary">
            {section === "sync" ? "Cloud sync providers" : aiSummary}
          </p>
        </div>
      </header>

      <div className="window-body settings-body">
        <section className="hero-strip settings-hero">
          <div className="hero-copy">
            <span className="signal-dot" data-active={Boolean(busy)}>
              {busy ? "busy" : "ready"}
            </span>
            <p>{status}</p>
          </div>
        </section>

        {error ? <div className="error-banner">{error}</div> : null}

        <main className="settings-grid">
        <aside className="panel settings-nav">
          <button
            className={section === "sync" ? "nav-tab active" : "nav-tab"}
            type="button"
            onClick={() => setSection("sync")}
          >
            Sync
          </button>
          <button
            className={section === "ai" ? "nav-tab active" : "nav-tab"}
            type="button"
            onClick={() => setSection("ai")}
          >
            LLM
          </button>
        </aside>

        <section className="panel settings-panel">
          {section === "sync" ? (
            <div className="settings-stack">
              <div className="provider-card">
                <div>
                  <p className="panel-kicker">Dropbox</p>
                  <h2>{syncState.dropboxConnected ? "Connected" : "Not connected"}</h2>
                  <p className="status-copy">Token: {syncState.dropboxLabel}</p>
                </div>
                <div className="inline-actions">
                  {syncState.dropboxConnected ? (
                    <button className="action-button" type="button" onClick={handleDisconnectDropbox}>
                      Disconnect
                    </button>
                  ) : (
                    <button
                      className="action-button strong"
                      type="button"
                      onClick={() => void handleConnectDropbox()}
                      disabled={busy === "dropbox"}
                    >
                      {busy === "dropbox" ? "Connecting..." : "Connect"}
                    </button>
                  )}
                </div>
              </div>

              <div className="provider-card">
                <div>
                  <p className="panel-kicker">Google Drive</p>
                  <h2>{syncState.gdriveConnected ? "Connected" : "Not connected"}</h2>
                  <p className="status-copy">Token: {syncState.gdriveLabel}</p>
                </div>
                <div className="inline-actions">
                  {syncState.gdriveConnected ? (
                    <button className="action-button" type="button" onClick={handleDisconnectGDrive}>
                      Disconnect
                    </button>
                  ) : (
                    <button
                      className="action-button strong"
                      type="button"
                      onClick={() => void handleConnectGDrive()}
                      disabled={busy === "gdrive"}
                    >
                      {busy === "gdrive" ? "Connecting..." : "Connect"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="settings-stack">
              <div className="field-grid">
                <label className="field-label" htmlFor="provider">
                  Provider
                </label>
                <select
                  id="provider"
                  className="text-input"
                  value={provider}
                  onChange={(event) => setProvider(event.target.value)}
                >
                  <option value="ollama">Ollama</option>
                  <option value="openrouter">OpenRouter</option>
                </select>

                <label className="field-label" htmlFor="model">
                  Model
                </label>
                <input
                  id="model"
                  className="text-input"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                />

                {provider === "ollama" ? (
                  <>
                    <label className="field-label" htmlFor="ollama-url">
                      Ollama URL
                    </label>
                    <input
                      id="ollama-url"
                      className="text-input"
                      value={ollamaUrl}
                      onChange={(event) => setOllamaUrl(event.target.value)}
                    />
                  </>
                ) : (
                  <>
                    <label className="field-label" htmlFor="openrouter-api-key">
                      OpenRouter API key
                    </label>
                    <input
                      id="openrouter-api-key"
                      className="text-input"
                      value={openrouterApiKey}
                      onChange={(event) => setOpenrouterApiKey(event.target.value)}
                    />
                  </>
                )}
              </div>
              <div className="inline-actions spread">
                <div className="status-copy">{aiSummary}</div>
                <button className="action-button strong" type="button" onClick={handleSaveAi}>
                  Save AI settings
                </button>
              </div>
            </div>
          )}
        </section>
        </main>
      </div>
    </div>
  );
}
