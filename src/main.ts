import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { app, BrowserWindow, Notification } from "electron";
import { ClaudeRunner } from "./main/claude";
import { CodexRunner } from "./main/codex";
import { CodexAppServer } from "./main/codex-app-server";
import {
  captureDemoScreenshot,
  createDemoBackend,
  isDemoMode,
  registerDemoIpcHandlers,
} from "./main/demo-mode";
import {
  registerIpcHandlers,
  removeIpcHandlers,
  sendCodexTaskProgress,
  sendImplementationProgress,
  sendReviewProgress,
} from "./main/ipc";
import {
  configureWindowsNotificationIdentity,
  notifyReviewCompletion,
  type ReviewNotificationGateway,
} from "./main/review-notification";
import {
  type AppState,
  createDefaultState,
  loadMigratedState,
  ReviewService,
} from "./main/review-service";
import { materializeReviewSchema } from "./main/schema";
import { AtomicJsonStore } from "./main/store";
import { IPC_CHANNELS } from "./shared/contracts";

let mainWindow: BrowserWindow | null = null;
let storePromise: Promise<AtomicJsonStore<AppState>> | null = null;
const activeReviewNotifications = new Set<Notification>();
const reviewNotifications: ReviewNotificationGateway = {
  isSupported: () => Notification.isSupported(),
  show: ({ onClick, ...options }) => {
    const notification = new Notification(options);
    activeReviewNotifications.add(notification);
    notification.once("click", () => {
      activeReviewNotifications.delete(notification);
      onClick();
    });
    notification.once("close", () => activeReviewNotifications.delete(notification));
    notification.show();
  },
};
configureWindowsNotificationIdentity(
  process.platform,
  process.execPath,
  (appUserModelId) => app.setAppUserModelId(appUserModelId),
);

// デモモードのスクリーンショットは仮想フレームバッファ上で撮影されることが多い。
// GPU 合成が有効だと capturePage() が空の画像を返すため、ソフトウェア描画に固定する。
if (isDemoMode()) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("disable-gpu-compositing");
  app.commandLine.appendSwitch("disable-gpu");
}

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
  const service = new ReviewService(store, codex, schemaPath, (event) => {
    sendReviewProgress(window, event);
    notifyReviewCompletion(event, reviewNotifications, (projectId) => {
      if (window.isDestroyed()) return;
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
      window.webContents.send(IPC_CHANNELS.reviewsOpenRequested, projectId);
    });
  });
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

const DEFAULT_SCREENSHOT_PATH = join("docs", "images", "app.png");
const DEFAULT_CAPTURE_DELAY_MS = 2_500;

async function createDemoWindow(): Promise<void> {
  // 通常起動より縦長にして、要約に加えて最初の変更グループの指摘・修正提案・
  // 自分のメモまで 1 枚の README 画像に収める。
  const window = new BrowserWindow({
    width: 1280,
    height: 1240,
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

  registerDemoIpcHandlers(createDemoBackend());

  window.once("ready-to-show", () => window.show());
  window.on("closed", () => {
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

  // スクリーンショットの出力先が指定されているときだけ撮影して終了する。
  // 未指定なら対話的にデモ画面を確認できる（自動終了しない）。
  const requestedPath = process.env.DIFFENDER_DEMO_SCREENSHOT;
  if (requestedPath === undefined) return;
  const outputPath = isAbsolute(requestedPath)
    ? requestedPath
    : resolve(process.cwd(), requestedPath || DEFAULT_SCREENSHOT_PATH);
  const delayMs = Number.parseInt(process.env.DIFFENDER_DEMO_CAPTURE_DELAY ?? "", 10);
  try {
    await captureDemoScreenshot(
      window,
      outputPath,
      async (path, data) => {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, data);
      },
      Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : DEFAULT_CAPTURE_DELAY_MS,
    );
    console.log(`Diffender demo screenshot written to ${outputPath}`);
  } catch (error) {
    console.error("Diffender demo screenshot failed:", error);
    process.exitCode = 1;
  } finally {
    app.quit();
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
  if (isDemoMode()) {
    await createDemoWindow();
    return;
  }
  await createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
