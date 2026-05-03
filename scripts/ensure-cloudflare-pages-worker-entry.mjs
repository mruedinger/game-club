import { access, writeFile } from "node:fs/promises";
import { constants } from "node:fs";

const workerDir = new URL("../dist/_worker.js/", import.meta.url);
const entryUrl = new URL("entry.mjs", workerDir);
const indexUrl = new URL("index.js", workerDir);

await access(entryUrl, constants.R_OK);
await writeFile(indexUrl, 'export { default } from "./entry.mjs";\n');
