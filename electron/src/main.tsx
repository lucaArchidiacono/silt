import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

function BrowserOnlyMessage() {
  return (
    <div className="boot-message-shell">
      <div className="boot-message-card">
        <p className="eyebrow">electron renderer</p>
        <h1>Open Silt from the Electron window</h1>
        <p>
          The URL shown in dev mode is only the renderer server. Opening it in a
          regular browser will not work because this app expects Electron APIs.
        </p>
        <p>
          Run <code>make electron-dev</code> and wait for the desktop window to
          appear.
        </p>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
const hasElectronRequire =
  typeof (window as Window & { require?: unknown }).require === "function";

if (hasElectronRequire) {
  root.render(<App />);
} else {
  root.render(<BrowserOnlyMessage />);
}
