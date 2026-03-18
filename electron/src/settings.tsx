import { createRoot } from "react-dom/client";
import { SettingsApp } from "./SettingsApp";
import "./styles.css";

function BrowserOnlyMessage() {
  return (
    <div className="boot-message-shell">
      <div className="boot-message-card">
        <p className="eyebrow">electron settings</p>
        <h1>Settings only run inside Electron</h1>
        <p>
          This page is part of the Electron app. Open it from the gear icon in
          the Silt desktop window instead of a normal browser tab.
        </p>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
const hasElectronRequire =
  typeof (window as Window & { require?: unknown }).require === "function";

if (hasElectronRequire) {
  root.render(<SettingsApp />);
} else {
  root.render(<BrowserOnlyMessage />);
}
