import { describe, expect, it, vi } from "vitest";
import {
  configureWindowsNotificationIdentity,
  notifyReviewCompletion,
  type ReviewNotificationGateway,
} from "../src/main/review-notification";
import type { ReviewProgressEvent } from "../src/shared/contracts";

function progress(stage: ReviewProgressEvent["stage"]): ReviewProgressEvent {
  return {
    projectId: "project-1",
    stage,
    message: stage === "complete" ? "レビューが完了しました。" : "処理中です。",
  };
}

function gateway(overrides: Partial<ReviewNotificationGateway> = {}) {
  return {
    isSupported: vi.fn(() => true),
    show: vi.fn(),
    ...overrides,
  } satisfies ReviewNotificationGateway;
}

describe("notifyReviewCompletion", () => {
  it("shows the completion message through the native notification gateway", () => {
    const notifications = gateway();

    notifyReviewCompletion(progress("complete"), notifications);

    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Diffender",
        body: "レビューが完了しました。",
      }),
    );
  });

  it("opens the reviewed worktree when the notification is clicked", () => {
    const show = vi.fn<ReviewNotificationGateway["show"]>();
    const notifications = gateway({ show });
    const openWorktree = vi.fn();

    notifyReviewCompletion(progress("complete"), notifications, openWorktree);
    const options = show.mock.calls[0]?.[0];
    options?.onClick();

    expect(openWorktree).toHaveBeenCalledWith("project-1");
  });

  it("does not notify for progress stages before completion", () => {
    const notifications = gateway();

    for (const stage of ["queued", "reading", "analyzing", "failed"] as const) {
      notifyReviewCompletion(progress(stage), notifications);
    }

    expect(notifications.isSupported).not.toHaveBeenCalled();
    expect(notifications.show).not.toHaveBeenCalled();
  });

  it("does not notify when desktop notifications are unsupported", () => {
    const notifications = gateway({ isSupported: vi.fn(() => false) });

    notifyReviewCompletion(progress("complete"), notifications);

    expect(notifications.show).not.toHaveBeenCalled();
  });

  it("does not let notification failures fail the completed review", () => {
    const notifications = gateway({
      show: vi.fn(() => {
        throw new Error("notification failed");
      }),
    });

    expect(() =>
      notifyReviewCompletion(progress("complete"), notifications),
    ).not.toThrow();
  });
});

describe("configureWindowsNotificationIdentity", () => {
  it("sets the executable path as the AppUserModelID on Windows", () => {
    const setAppUserModelId = vi.fn();

    configureWindowsNotificationIdentity(
      "win32",
      "C:\\Apps\\Diffender\\diffender.exe",
      setAppUserModelId,
    );

    expect(setAppUserModelId).toHaveBeenCalledWith("C:\\Apps\\Diffender\\diffender.exe");
  });

  it("does not configure an AppUserModelID on other platforms", () => {
    const setAppUserModelId = vi.fn();

    configureWindowsNotificationIdentity(
      "darwin",
      "/Applications/Diffender.app",
      setAppUserModelId,
    );

    expect(setAppUserModelId).not.toHaveBeenCalled();
  });
});
