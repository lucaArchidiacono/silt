import { execSync } from "child_process"
import { resolve } from "path"

export type Entry = {
  id: string
  body: string
  created_at: string
  deleted_at: string | null
}

const BIN = resolve(import.meta.dir, "../../target/release/silt-cli")

function run(args: string[]): string {
  return execSync([BIN, ...args].map((a) => `'${a}'`).join(" "), {
    encoding: "utf-8",
    timeout: 5000,
  }).trim()
}

export function newEntry(body: string): Entry {
  return JSON.parse(run(["new", body]))
}

export function listEntries(): Entry[] {
  return JSON.parse(run(["list"]))
}

export function searchEntries(query: string): Entry[] {
  return JSON.parse(run(["search", query]))
}

export function editEntry(id: string, body: string): Entry {
  return JSON.parse(run(["edit", id, body]))
}

export function deleteEntry(id: string): void {
  run(["delete", id])
}
