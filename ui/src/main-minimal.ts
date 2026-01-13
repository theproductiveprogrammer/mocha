/**
 * ABSOLUTE MINIMUM - just render logs, nothing else
 * NO CSS imports
 */

import { html, render } from "lit-html";
import { readFile } from "./api";
import { parseLogFile } from "./parser";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import type { LogEntry } from "./types";

// NO CSS - import './index.css'

function renderLog(log: LogEntry) {
  return html`<div
    style="padding:4px 8px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px"
  >
    ${log.parsed?.content || log.data}
  </div>`;
}

function renderApp(logs: LogEntry[]) {
  console.time("render");
  console.log(Date.now(), "render");

  render(
    html`
      <div style="height:100vh;display:flex;flex-direction:column">
        <button @click=${openFile} style="padding:8px;margin:8px">
          Open File (with dialog)
        </button>
        <button
          @click=${() =>
            loadDirect(
              "/Users/charleslobo/Desktop/chaRcoal/me/mocha/_tmp/logs/Logs-2025-12-22 11_43_31.txt",
            )}
          style="padding:8px;margin:8px"
        >
          Load Direct (no dialog)
        </button>
        <div style="flex:1;overflow:auto">${logs.map(renderLog)}</div>
      </div>
    `,
    document.getElementById("root") as HTMLElement,
  );
  console.timeEnd("render");
  console.log(Date.now(), "DONE");
}

// Load without file dialog - TEST: render to fresh container like testDirectRender
async function loadDirect(path: string) {
  console.time("total-direct");
  console.time("read");
  const result = await readFile(path, 0);
  console.timeEnd("read");

  if (!result.success || !result.content) return;

  console.time("parse");
  const parsed = parseLogFile(result.content, "file");
  console.timeEnd("parse");

  console.log(`${parsed.logs.length} logs`);

  // TEST: Render to fresh container (like testDirectRender does)
  console.time("render-fresh");
  const freshContainer = document.createElement("div");
  freshContainer.style.cssText =
    "position:absolute;top:80px;left:0;right:0;bottom:0;overflow:auto;background:white";
  document.body.appendChild(freshContainer);

  const reversed = [...parsed.logs].reverse();
  render(
    html`${reversed.map(
      (log) =>
        html`<div
          style="padding:4px 8px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px"
        >
          ${log.parsed?.content || log.data}
        </div>`,
    )}`,
    freshContainer,
  );
  console.timeEnd("render-fresh");

  console.timeEnd("total-direct");
}

async function openFile() {
  const path = await openFileDialog({
    multiple: false,
    filters: [{ name: "Log Files", extensions: ["log", "txt"] }],
  });

  if (!path) return;

  console.time("total");
  console.time("read");
  const result = await readFile(path, 0);
  console.timeEnd("read");

  if (!result.success || !result.content) return;

  console.time("parse");
  const parsed = parseLogFile(result.content, "file");
  console.timeEnd("parse");

  console.log(`${parsed.logs.length} logs`);

  renderApp([...parsed.logs].reverse().slice(0, 100));
  console.timeEnd("total");
}

// Initial render
renderApp([]);

// Test function for console
(window as any).testDirectRender = async (
  path: string,
  container: HTMLElement,
) => {
  console.time("TOTAL");
  console.time("read");
  const result = await readFile(path, 0);
  console.timeEnd("read");
  if (!result.success || !result.content) return;
  console.time("parse");
  const parsed = parseLogFile(result.content, "test");
  console.timeEnd("parse");
  console.time("render");
  render(
    html`${parsed.logs
      .slice(0, 500)
      .map(
        (log) =>
          html`<div
            style="padding:4px;border-bottom:1px solid #eee;font:12px monospace"
          >
            ${log.parsed?.content || log.data}
          </div>`,
      )}`,
    container,
  );
  console.timeEnd("render");
  console.timeEnd("TOTAL");
};
