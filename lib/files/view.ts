import type { FileRecord } from "./model";

export type PublicFile = Pick<FileRecord, "id" | "name" | "size" | "type" | "sha256" | "note" | "readyAt"> & {
  /** Site-relative download link; counts the download, then redirects to R2. */
  url: string;
};

/** What a link holder sees of a file: no upload ids, uploader names or keys. */
export function publicFile(f: FileRecord): PublicFile {
  return {
    id: f.id,
    name: f.name,
    size: f.size,
    type: f.type,
    ...(f.sha256 ? { sha256: f.sha256 } : {}),
    ...(f.note ? { note: f.note } : {}),
    ...(f.readyAt ? { readyAt: f.readyAt } : {}),
    url: `/dl/${f.id}`,
  };
}
