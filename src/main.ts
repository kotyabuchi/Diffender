import { join } from "node:path";
import { app, BrowserWindow } from "electron";
import { ClaudeRunner } from "./main/claude";
import { CodexRunner } from "./main/codex";
import { CodexAppServer } from "./main/codex-app-server";
import {
  registerIpcHandlers,
  removeIpcHandlers,
  sendCodexTaskProgress,
  sendImplementationProgress,
  sendReviewProgress,
} from "./main/ipc";
import {
  type AppState,
  createDefaultState,
  loadMigratedState,
  ReviewService,
} from "./main/review-service";
import { materializeReviewSchema } from "./main/schema";
import { AtomicJsonStore } from "./main/store";

let mainWindow: BrowserWindow | null = null;
let storePromise: Promise<AtomicJsonStore<AppState>> | null = null;

async function createWindow(): Promise<void> {
  const userDataPath = app.getPath("userData");
  const store = await applicationStore(userDataPath);
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  mainWindow = window;
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());

  const codex = new CodexRunner();
  const appServer = new CodexAppServer((event) => {
    sendCodexTaskProgress(window, event);
    sendImplementationProgress(window, {
      projectId: event.projectId,
      agent: "codex",
      operationId: event.turnId,
      status: event.status,
      message: event.message,
    });
  });
  const claude = new ClaudeRunner((event) => sendImplementationProgress(window, event));
  const schemaPath = await materializeReviewSchema(userDataPath);
  const service = new ReviewService(store, codex, schemaPath, (event) =>
    sendReviewProgress(window, event),
  );
  registerIpcHandlers(window, service, codex, appServer, claude);

  window.once("ready-to-show", () => window.show());
  window.on("closed", () => {
    appServer.dispose();
    claude.dispose();
    removeIpcHandlers();
    if (mainWindow === window) mainWindow = null;
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    await window.loadFile(
      join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
}

function applicationStore(userDataPath: string): Promise<AtomicJsonStore<AppState>> {
  if (!storePromise) {
    const store = new AtomicJsonStore<AppState>(
      join(userDataPath, "diffender-state.json"),
      createDefaultState,
    );
    storePromise = loadMigratedState(store).then(() => store);
  }
  return storePromise;
}

app.whenReady().then(async () => {
  await createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
