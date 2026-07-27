import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AtomicJsonStore } from "../src/main/store";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("AtomicJsonStore", () => {
  it("returns defaults and serializes concurrent updates", async () => {
    const directory = await mkdtemp(join(tmpdir(), "review-store-"));
    directories.push(directory);
    const path = join(directory, "state.json");
    const store = new AtomicJsonStore(path, () => ({ count: 0 }));

    expect(await store.read()).toEqual({ count: 0 });
    await Promise.all([
      store.update((state) => ({ count: state.count + 1 })),
      store.update((state) => ({ count: state.count + 1 })),
    ]);

    expect(await store.read()).toEqual({ count: 2 });
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ count: 2 });
  });
});
