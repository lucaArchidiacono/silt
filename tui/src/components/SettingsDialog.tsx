import { useTerminalDimensions } from "@opentui/react";
import { useApp, type SettingsScreen } from "../context";
import { getConfig, setConfig } from "../silt";
import { BG, FG, DIM, HIGHLIGHT_BG, HIGHLIGHT_FG, ACCENT } from "../theme";

function maskToken(token: string): string {
  if (token.length <= 8) return "****";
  return token.slice(0, 4) + "****" + token.slice(-4);
}

function SettingsMenu({ selected }: { selected: number }) {
  const items = ["Sync Providers", "AI Provider"];
  return (
    <box style={{ flexDirection: "column", flexGrow: 1 }}>
      {items.map((label, i) => (
        <box
          key={label}
          style={{
            flexDirection: "row",
            height: 1,
            backgroundColor: selected === i ? HIGHLIGHT_BG : BG,
          }}
        >
          <text
            content={`  ${label}`}
            style={{
              fg: selected === i ? HIGHLIGHT_FG : FG,
              bg: selected === i ? HIGHLIGHT_BG : BG,
            }}
          />
        </box>
      ))}
      <text
        content={" ".repeat(58)}
        style={{ fg: BG, bg: BG, height: 1 }}
      />
      <text
        content="  j/k: navigate  Enter: select  Esc: close"
        style={{ fg: DIM }}
      />
    </box>
  );
}

function ProvidersMenu({
  items,
  selected,
}: {
  items: { label: string; screen: SettingsScreen }[];
  selected: number;
}) {
  return (
    <box style={{ flexDirection: "column", flexGrow: 1 }}>
      {items.map((item, i) => (
        <box
          key={item.screen}
          style={{
            flexDirection: "row",
            height: 1,
            backgroundColor: selected === i ? HIGHLIGHT_BG : BG,
          }}
        >
          <text
            content={`  ${item.label}`}
            style={{
              fg: selected === i ? HIGHLIGHT_FG : FG,
              bg: selected === i ? HIGHLIGHT_BG : BG,
            }}
          />
        </box>
      ))}
      <text
        content={" ".repeat(58)}
        style={{ fg: BG, bg: BG, height: 1 }}
      />
      <text content="  Enter: select  Esc: back" style={{ fg: DIM }} />
    </box>
  );
}

function ProviderScreen({
  name,
  syncPath,
  token,
  authInProgress,
  connectLabel,
}: {
  name: string;
  syncPath: string;
  token: string | null;
  authInProgress: boolean;
  connectLabel: string;
}) {
  return (
    <box style={{ flexDirection: "column", flexGrow: 1 }}>
      <text content={`${name} Sync`} style={{ fg: FG, height: 1 }} />
      <text content={`Syncs to ${syncPath}`} style={{ fg: DIM, height: 1 }} />
      <text
        content={" ".repeat(58)}
        style={{ fg: BG, bg: BG, height: 1 }}
      />
      {token ? (
        <box style={{ flexDirection: "column" }}>
          <text
            content="Status: Connected"
            style={{ fg: "#00FF00", height: 1 }}
          />
          <text
            content={`Token:  ${maskToken(token)}`}
            style={{ fg: FG, height: 1 }}
          />
          <text
            content={" ".repeat(58)}
            style={{ fg: BG, bg: BG, height: 1 }}
          />
          <text
            content="  d: disconnect  Esc: back"
            style={{ fg: DIM }}
          />
        </box>
      ) : authInProgress ? (
        <box style={{ flexDirection: "column" }}>
          <text
            content="Waiting for authorization..."
            style={{ fg: ACCENT, height: 1 }}
          />
          <text
            content="Your browser should open automatically."
            style={{ fg: DIM, height: 1 }}
          />
          <text
            content={" ".repeat(58)}
            style={{ fg: BG, bg: BG, height: 1 }}
          />
          <text content="  Esc: cancel" style={{ fg: DIM }} />
        </box>
      ) : (
        <box style={{ flexDirection: "column" }}>
          <text
            content="Status: Not connected"
            style={{ fg: DIM, height: 1 }}
          />
          <text
            content={" ".repeat(58)}
            style={{ fg: BG, bg: BG, height: 1 }}
          />
          <text
            content={`  Enter: ${connectLabel}  Esc: back`}
            style={{ fg: DIM }}
          />
        </box>
      )}
    </box>
  );
}

function AiConfigMenu({ selected }: { selected: number }) {
  const provider = getConfig("ai_provider") || "not set";
  const model = getConfig("ai_model") || "not set";
  const isOllama = provider === "ollama";

  const items = [
    { label: "Provider", value: provider, hint: "Enter: toggle" },
    { label: "Model", value: model, hint: "Enter: edit" },
    ...(isOllama
      ? [{ label: "Ollama URL", value: getConfig("ollama_url") || "http://localhost:11434", hint: "Enter: edit" }]
      : [{ label: "API Key", value: getConfig("openrouter_api_key") ? "****" : "not set", hint: "Enter: edit" }]),
  ];

  return (
    <box style={{ flexDirection: "column", flexGrow: 1 }}>
      {items.map((item, i) => (
        <box
          key={item.label}
          style={{
            flexDirection: "row",
            height: 1,
            backgroundColor: selected === i ? HIGHLIGHT_BG : BG,
          }}
        >
          <text
            content={`  ${item.label}: ${item.value}`}
            style={{
              fg: selected === i ? HIGHLIGHT_FG : FG,
              bg: selected === i ? HIGHLIGHT_BG : BG,
            }}
          />
        </box>
      ))}
      <text content={" ".repeat(58)} style={{ fg: BG, bg: BG, height: 1 }} />
      <text
        content="  j/k: navigate  Enter: edit  Esc: back"
        style={{ fg: DIM }}
      />
    </box>
  );
}

function AiEditScreen({
  label,
  placeholder,
  inputRef,
  onSubmit,
}: {
  label: string;
  placeholder: string;
  inputRef: React.RefObject<any>;
  onSubmit: (value: string) => void;
}) {
  return (
    <box style={{ flexDirection: "column", flexGrow: 1 }}>
      <text content={label} style={{ fg: FG, height: 1 }} />
      <text content={" ".repeat(58)} style={{ fg: BG, bg: BG, height: 1 }} />
      <box
        style={{
          border: true,
          height: 3,
          backgroundColor: BG,
          borderColor: ACCENT,
        }}
      >
        <input
          ref={inputRef}
          placeholder={placeholder}
          focused={true}
          onSubmit={(event) => onSubmit(event.toString())}
          style={{
            backgroundColor: BG,
            textColor: FG,
            focusedBackgroundColor: BG,
          }}
        />
      </box>
      <text content={" ".repeat(58)} style={{ fg: BG, bg: BG, height: 1 }} />
      <text content="  Enter: save  Esc: cancel" style={{ fg: DIM }} />
    </box>
  );
}

export function SettingsDialog() {
  const dimensions = useTerminalDimensions();
  const { state, actions, refs } = useApp();
  const {
    settingsScreen,
    settingsSelected,
    dropboxToken,
    gdriveToken,
    authInProgress,
  } = state;
  const { setSettingsScreen, setSettingsSelected, setStatus } = actions;
  const { aiSettingsInputRef } = refs;

  const menuItems: { label: string; screen: SettingsScreen }[] =
    settingsScreen === "menu"
      ? [
          { label: "Sync Providers", screen: "providers" },
          { label: "AI Provider", screen: "ai-config" },
        ]
      : settingsScreen === "providers"
        ? [
            { label: "Dropbox", screen: "dropbox" },
            { label: "Google Drive", screen: "gdrive" },
          ]
        : [];

  const title =
    settingsScreen === "menu"
      ? "Settings"
      : settingsScreen === "providers"
        ? "Sync Providers"
        : settingsScreen === "dropbox"
          ? "Dropbox"
          : settingsScreen === "gdrive"
            ? "Google Drive"
            : settingsScreen === "ai-config"
              ? "AI Provider"
              : settingsScreen === "ai-model"
                ? "AI Model"
                : settingsScreen === "ai-url"
                  ? "Ollama URL"
                  : "OpenRouter API Key";

  const handleAiSave = (key: string) => (value: string) => {
    const trimmed = value.trim();
    if (trimmed) {
      setConfig(key, trimmed);
      setStatus(`Saved ${key}.`);
    }
    setSettingsScreen("ai-config");
    setSettingsSelected(0);
  };

  return (
    <box
      style={{
        position: "absolute",
        width: 60,
        height: 18,
        left: Math.floor((dimensions.width - 60) / 2),
        top: Math.floor((dimensions.height - 18) / 2),
        border: true,
        borderColor: ACCENT,
        backgroundColor: BG,
        flexDirection: "column",
        zIndex: 10,
      }}
      title={title}
    >
      {settingsScreen === "menu" && (
        <SettingsMenu selected={settingsSelected} />
      )}
      {settingsScreen === "providers" && (
        <ProvidersMenu items={menuItems} selected={settingsSelected} />
      )}
      {settingsScreen === "dropbox" && (
        <ProviderScreen
          name="Dropbox"
          syncPath="/Apps/silt/entries/"
          token={dropboxToken}
          authInProgress={authInProgress}
          connectLabel="connect Dropbox"
        />
      )}
      {settingsScreen === "gdrive" && (
        <ProviderScreen
          name="Google Drive"
          syncPath="My Drive/silt/"
          token={gdriveToken}
          authInProgress={authInProgress}
          connectLabel="connect Google Drive"
        />
      )}
      {settingsScreen === "ai-config" && (
        <AiConfigMenu selected={settingsSelected} />
      )}
      {settingsScreen === "ai-model" && (
        <AiEditScreen
          label="Enter model name (e.g. llama3.2, anthropic/claude-sonnet-4)"
          placeholder={getConfig("ai_model") || "llama3.2"}
          inputRef={aiSettingsInputRef}
          onSubmit={handleAiSave("ai_model")}
        />
      )}
      {settingsScreen === "ai-url" && (
        <AiEditScreen
          label="Enter Ollama URL"
          placeholder={getConfig("ollama_url") || "http://localhost:11434"}
          inputRef={aiSettingsInputRef}
          onSubmit={handleAiSave("ollama_url")}
        />
      )}
      {settingsScreen === "ai-key" && (
        <AiEditScreen
          label="Enter OpenRouter API key"
          placeholder="sk-or-..."
          inputRef={aiSettingsInputRef}
          onSubmit={handleAiSave("openrouter_api_key")}
        />
      )}
    </box>
  );
}
