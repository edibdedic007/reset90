import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { format } from "prettier";
import { z } from "zod";

import { jsonSchemaDocuments } from "../src/server/imports/json-schema";
import { importEnvelopeSchema } from "../src/server/imports/schemas";

const exampleFiles = [
  "examples/daily_plan_payload.json",
  "examples/daily_reflection_payload.json",
  "examples/weekly_review_payload.json",
];

async function main() {
  const root = process.cwd();
  const writeSchemas = process.argv.includes("--write");
  let failed = false;

  for (const relativePath of exampleFiles) {
    try {
      const raw = await readFile(path.join(root, relativePath), "utf8");
      const result = importEnvelopeSchema.safeParse(JSON.parse(raw));

      if (!result.success) {
        failed = true;
        console.error(`${relativePath}: invalid`);
        console.error(z.prettifyError(result.error));
        continue;
      }

      console.log(`${relativePath}: valid (${result.data.kind})`);
    } catch (error) {
      failed = true;
      console.error(
        `${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  for (const [fileName, schema] of Object.entries(jsonSchemaDocuments)) {
    const relativePath = path.join("schemas", fileName);
    const absolutePath = path.join(root, relativePath);
    const serialized = await format(JSON.stringify(schema), { parser: "json" });

    if (writeSchemas) {
      await writeFile(absolutePath, serialized, "utf8");
      console.log(`${relativePath}: generated`);
      continue;
    }

    try {
      const committed = await readFile(absolutePath, "utf8");
      if (committed !== serialized) {
        failed = true;
        console.error(
          `${relativePath}: stale; run \`pnpm run generate:schemas\``,
        );
      } else {
        console.log(`${relativePath}: current`);
      }
    } catch (error) {
      failed = true;
      console.error(
        `${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (failed) {
    process.exitCode = 1;
  }
}

void main();
