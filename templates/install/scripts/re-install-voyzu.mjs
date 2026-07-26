#!/usr/bin/env node

import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const installationRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
const runtimeDirectory = resolve(installationRoot, ".run");

function runUpdate() {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) {
    throw new Error("Run the re-installer through npm: npm run re-install");
  }

  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      [npmCli, "run", "update"],
      {
        cwd: installationRoot,
        stdio: "inherit",
      },
    );

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      reject(new Error(`npm run update exited with code ${code}`));
    });
  });
}

console.log("Removing the existing Voyzu runtime...");
await rm(runtimeDirectory, { recursive: true, force: true });
await runUpdate();
