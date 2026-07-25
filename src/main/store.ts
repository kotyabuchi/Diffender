import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import { dirname } from "node:path";

export class AtomicJsonStore<T> {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly createDefault: () => T,
  ) {}

  async read(): Promise<T> {
    try {
      return JSON.parse(await readFile(this.filePath, "utf8")) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return this.createDefault();
      }
      throw new Error(`Unable to read application state: ${errorMessage(error)}`);
    }
  }

  async write(value: T): Promise<void> {
    const operation = this.writeQueue.then(() => this.writeNow(value));
    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }

  async update(mutator: (current: T) => T | Promise<T>): Promise<T> {
    let updated!: T;
    const operation = this.writeQueue.then(async () => {
      updated = await mutator(await this.read());
      await this.writeNow(updated);
    });
    this.writeQueue = operation.catch(() => undefined);
    await operation;
    return updated;
  }

  private async writeNow(value: T): Promise<void> {
    const directory = dirname(this.filePath);
    await mkdir(directory, { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    const handle = await open(temporaryPath, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, this.filePath);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
