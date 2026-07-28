import type { ReviewProgressEvent } from "../shared/contracts";

export interface ReviewNotificationOptions {
  title: string;
  body: string;
  onClick(): void;
}

export interface ReviewNotificationGateway {
  isSupported(): boolean;
  show(options: ReviewNotificationOptions): void;
}

export function configureWindowsNotificationIdentity(
  platform: NodeJS.Platform,
  executablePath: string,
  setAppUserModelId: (appUserModelId: string) => void,
): void {
  if (platform === "win32") setAppUserModelId(executablePath);
}

export function notifyReviewCompletion(
  event: ReviewProgressEvent,
  notifications: ReviewNotificationGateway,
  openWorktree: (projectId: string) => void = () => undefined,
): void {
  if (event.stage !== "complete") return;

  try {
    if (!notifications.isSupported()) return;
    notifications.show({
      title: "Diffender",
      body: event.message,
      onClick: () => openWorktree(event.projectId),
    });
  } catch {
    // 通知は補助機能のため、OS側の失敗で完了済みレビューを失敗扱いにしない。
  }
}
