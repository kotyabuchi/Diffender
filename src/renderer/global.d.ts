import type { DiffenderApi } from "../shared/contracts";

declare global {
  interface Window {
    diffender: DiffenderApi;
  }
}
