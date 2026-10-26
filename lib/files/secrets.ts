import { createHash } from "node:crypto";
import { customAlphabet } from "nanoid";
import { TOKEN_PREFIX } from "./model";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** 16 base62 characters ≈ 95 bits: a link nobody can guess. */
export const newId = customAlphabet(ALPHABET, 16);
const tokenBody = customAlphabet(ALPHABET, 40);

export function newTokenSecret(): string {
  return `${TOKEN_PREFIX}${tokenBody()}`;
}

export function hashToken(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}
