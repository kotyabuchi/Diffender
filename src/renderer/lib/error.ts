export interface ErrorState {
  title: string;
  detail: string;
  retry?: () => void;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "予期しない問題が発生しました。";
}
