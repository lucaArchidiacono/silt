import { useTerminalDimensions } from "@opentui/react";
import { useApp, type SettingsScreen } from "../context";
import { BG, FG, DIM, HIGHLIGHT_BG, HIGHLIGHT_FG, ACCENT } from "../theme";

function maskToken(token: string): string {
  if (token.length <= 8) return "****";
  return token.slice(0, 4) + "****" + token.slice(-4);
}

function SettingsMenu({ selected }: { selected: number }) {
  return (
    <box style={{ flexDirection: "column", flexGrow: 1 }}>
      <box
        style={{
          flexDirection: "row",
          height: 1,
          backgroundColor: selected === 0 ? HIGHLIGHT_BG : BG,
        }}
      >
        <text
          content="  Sync Providers"
          style={{
            fg: selected === 0 ? HIGHLIGHT_FG : FG,
            bg: selected === 0 ? HIGHLIGHT_BG : BG,
          }}
        />
      </box>
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

export function SettingsDialog() {
  const dimensions = useTerminalDimensions();
  const { state } = useApp();
  const {
    settingsScreen,
    settingsSelected,
    dropboxToken,
    gdriveToken,
    authInProgress,
  } = state;

  const menuItems: { label: string; screen: SettingsScreen }[] =
    settingsScreen === "menu"
      ? [{ label: "Sync Providers", screen: "providers" }]
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
          : "Google Drive";

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
    </box>
  );
}
