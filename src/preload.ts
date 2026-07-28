import { contextBridge, ipcRenderer } from "electron";
import {
  type CodexTaskProgressEvent,
  type DiffenderApi,
  type ImplementationProgressEvent,
  IPC_CHANNELS,
  type ReviewProgressEvent,
} from "./shared/contracts";

const api: DiffenderApi = {
  projects: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.projectsList),
    add: () => ipcRenderer.invoke(IPC_CHANNELS.projectsAdd),
    detectWorktrees: (repositoryId) =>
      ipcRenderer.invoke(IPC_CHANNELS.projectsDetectWorktrees, repositoryId),
    addWorktrees: (repositoryId, rootPaths) =>
      ipcRenderer.invoke(IPC_CHANNELS.projectsAddWorktrees, repositoryId, rootPaths),
    remove: (projectId) => ipcRenderer.invoke(IPC_CHANNELS.projectsRemove, projectId),
    refresh: (projectId) => ipcRenderer.invoke(IPC_CHANNELS.projectsRefresh, projectId),
  },
  reviews: {
    current: (projectId) => ipcRenderer.invoke(IPC_CHANNELS.reviewsCurrent, projectId),
    run: (projectId, options) =>
      ipcRenderer.invoke(IPC_CHANNELS.reviewsRun, projectId, options),
    models: () => ipcRenderer.invoke(IPC_CHANNELS.reviewsModels),
    cancel: (projectId) => ipcRenderer.invoke(IPC_CHANNELS.reviewsCancel, projectId),
    approve: (projectId, reviewId, groupId, approved) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.reviewsApprove,
        projectId,
        reviewId,
        groupId,
        approved,
      ),
    saveFindingNote: (projectId, reviewId, findingId, note) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.reviewsFindingNote,
        projectId,
        reviewId,
        findingId,
        note,
      ),
    addFeedback: (projectId, reviewId, groupId, draft) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.reviewsFeedbackAdd,
        projectId,
        reviewId,
        groupId,
        draft,
      ),
    removeFeedback: (projectId, reviewId, groupId, feedbackId) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.reviewsFeedbackRemove,
        projectId,
        reviewId,
        groupId,
        feedbackId,
      ),
    onProgress: (listener) => {
      const wrapped = (_event: Electron.IpcRendererEvent, event: ReviewProgressEvent) =>
        listener(event);
      ipcRenderer.on(IPC_CHANNELS.reviewsProgress, wrapped);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.reviewsProgress, wrapped);
    },
    onOpenRequested: (listener) => {
      const wrapped = (_event: Electron.IpcRendererEvent, projectId: string) =>
        listener(projectId);
      ipcRenderer.on(IPC_CHANNELS.reviewsOpenRequested, wrapped);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.reviewsOpenRequested, wrapped);
    },
  },
  codex: {
    status: () => ipcRenderer.invoke(IPC_CHANNELS.codexStatus),
    tasks: (projectId, includeAll) =>
      ipcRenderer.invoke(IPC_CHANNELS.codexTasks, projectId, includeAll),
    createTask: (projectId) =>
      ipcRenderer.invoke(IPC_CHANNELS.codexTaskCreate, projectId),
    linkTask: (projectId, threadId) =>
      ipcRenderer.invoke(IPC_CHANNELS.codexTaskLink, projectId, threadId),
    unlinkTask: (projectId) =>
      ipcRenderer.invoke(IPC_CHANNELS.codexTaskUnlink, projectId),
    copyFeedback: (projectId, reviewId) =>
      ipcRenderer.invoke(IPC_CHANNELS.codexFeedbackCopy, projectId, reviewId),
    sendFeedback: (projectId, reviewId) =>
      ipcRenderer.invoke(IPC_CHANNELS.codexFeedbackSend, projectId, reviewId),
    openTask: (threadId) => ipcRenderer.invoke(IPC_CHANNELS.codexTaskOpen, threadId),
    onTaskProgress: (listener) => {
      const wrapped = (
        _event: Electron.IpcRendererEvent,
        event: CodexTaskProgressEvent,
      ) => listener(event);
      ipcRenderer.on(IPC_CHANNELS.codexTaskProgress, wrapped);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.codexTaskProgress, wrapped);
    },
  },
  implementations: {
    detect: (projectId) =>
      ipcRenderer.invoke(IPC_CHANNELS.implementationsDetect, projectId),
    select: (projectId, agent) =>
      ipcRenderer.invoke(IPC_CHANNELS.implementationsSelect, projectId, agent),
    sendFeedback: (projectId, reviewId) =>
      ipcRenderer.invoke(IPC_CHANNELS.implementationsSend, projectId, reviewId),
    onProgress: (listener) => {
      const wrapped = (
        _event: Electron.IpcRendererEvent,
        event: ImplementationProgressEvent,
      ) => listener(event);
      ipcRenderer.on(IPC_CHANNELS.implementationsProgress, wrapped);
      return () =>
        ipcRenderer.removeListener(IPC_CHANNELS.implementationsProgress, wrapped);
    },
  },
};

contextBridge.exposeInMainWorld("diffender", api);
