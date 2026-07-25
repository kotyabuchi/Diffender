import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import reviewOutputSchema from "../../resources/review-output.schema.json";

export async function materializeReviewSchema(userDataPath: string): Promise<string> {
  const schemaPath = join(userDataPath, "schemas", "review-output.schema.json");
  await mkdir(dirname(schemaPath), { recursive: true });
  await writeFile(schemaPath, `${JSON.stringify(reviewOutputSchema, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return schemaPath;
}
