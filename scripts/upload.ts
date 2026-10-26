// Uploads files to a shared-files collection on the site.
//
//   PW_FILES_TOKEN=pwf_… npx tsx scripts/upload.ts --collection <id> [--note "…"] [--site URL] [--no-hash] <file>…
//
// Interrupted uploads resume when the same command runs again: progress is
// kept under the OS temp dir until the file finishes.

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { formatBytes, isId } from "../lib/files/model";
import { fetchPut, httpFilesApi, uploadFile, type UploadState } from "../lib/files/upload-client";

const DEFAULT_SITE = "https://puddings-world.com";
const STATE_DIR = join(tmpdir(), "puddings-world-uploads");

function usage(message: string): never {
  console.error(`${message}

Usage: PW_FILES_TOKEN=pwf_… npx tsx scripts/upload.ts --collection <id> [--note "…"] [--site URL] [--no-hash] <file>…
Create a token and a collection at /admin/files.`);
  process.exit(2);
}

async function sha256Of(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      collection: { type: "string" },
      note: { type: "string" },
      site: { type: "string" },
      "no-hash": { type: "boolean" },
    },
  });
  const token = process.env.PW_FILES_TOKEN;
  if (!token) usage("PW_FILES_TOKEN is not set.");
  const collectionId = values.collection;
  if (!isId(collectionId)) usage("--collection must be a collection id (16 letters/digits).");
  if (!positionals.length) usage("Name at least one file.");
  const site = (values.site ?? process.env.PW_SITE ?? DEFAULT_SITE).replace(/\/$/, "");
  const api = httpFilesApi(site, { authorization: `Bearer ${token}` });
  await mkdir(STATE_DIR, { recursive: true });

  for (const arg of positionals) {
    const path = resolve(arg);
    const info = await stat(path);
    const name = basename(path);
    const stateFile = join(
      STATE_DIR,
      `${createHash("sha256").update(`${site}|${collectionId}|${path}|${info.size}|${info.mtimeMs}`).digest("hex").slice(0, 24)}.json`,
    );
    const resume = await readFile(stateFile, "utf8").then((s) => JSON.parse(s) as UploadState, () => undefined);
    const sha256 = values["no-hash"] ? undefined : await sha256Of(path);
    console.log(`${name} (${formatBytes(info.size)})${resume ? " — resuming" : ""}`);

    const handle = await open(path, "r");
    let lastPct = -1;
    let saving = Promise.resolve();
    try {
      await uploadFile(
        { collectionId, name, size: info.size, sha256, note: values.note },
        {
          api,
          resume,
          read: async (start, end) => {
            const buf = Buffer.alloc(end - start);
            await handle.read(buf, 0, end - start, start);
            return buf;
          },
          put: fetchPut,
          onState: (state) => {
            const snapshot = JSON.stringify(state);
            saving = saving.then(() => writeFile(stateFile, snapshot));
          },
          onProgress: (sent, total) => {
            const pct = total ? Math.floor((sent / total) * 100) : 100;
            if (pct !== lastPct) process.stdout.write(`\r  ${pct}%`);
            lastPct = pct;
          },
        },
      );
    } finally {
      await handle.close();
      await saving;
    }
    await rm(stateFile, { force: true });
    console.log(`\r  done${sha256 ? `  sha256 ${sha256}` : ""}`);
  }
  console.log(`Share: ${site}/downloads/${collectionId}`);
}

main().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
