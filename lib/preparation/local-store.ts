import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { empty, transition } from "./engine";
const dir = join(process.cwd(), ".preparation-local"), file = join(dir, "workspace.json");
let queue: Promise<unknown> = Promise.resolve();
export async function read() { try {
    return JSON.parse(await readFile(file, "utf8"));
}
catch (e: any) {
    if (e.code === "ENOENT")
        return empty();
    throw e;
} }
export function execute(input: unknown) { const task = queue.then(async () => { const result = transition(await read(), input); await mkdir(dir, { recursive: true, mode: 0o700 }); await writeFile(file + ".tmp", JSON.stringify(result.state), { mode: 0o600 }); await rename(file + ".tmp", file); return result.output; }); queue = task.catch(() => { }); return task; }
