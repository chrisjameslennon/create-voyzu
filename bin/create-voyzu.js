#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import process from "node:process";

const REPOSITORY_OWNER = "chrisjameslennon";
const REPOSITORY_NAME = "voyzu";
const DEFAULT_REF = "main";

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      ...options,
    });

    child.on("error", reject);

    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function directoryIsEmpty(directory) {
  try {
    return (await readdir(directory)).length === 0;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return true;
    }

    throw error;
  }
}

async function downloadFile(url, destination) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "create-voyzu",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(
      `Could not download Voyzu: ${response.status} ${response.statusText}`,
    );
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(destination, bytes);
}

async function moveDirectoryContents(sourceDirectory, targetDirectory) {
  const entries = await readdir(sourceDirectory);

  for (const entry of entries) {
    await rename(
      join(sourceDirectory, entry),
      join(targetDirectory, entry),
    );
  }
}

async function main() {
  const projectArgument = process.argv[2];

  if (!projectArgument) {
    console.error("Usage: npm create voyzu@latest <project-directory>");
    process.exitCode = 1;
    return;
  }

  const targetDirectory = resolve(projectArgument);
  const projectName = basename(targetDirectory);

  if (!(await directoryIsEmpty(targetDirectory))) {
    throw new Error(`Target directory is not empty: ${targetDirectory}`);
  }

  await mkdir(targetDirectory, { recursive: true });

  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "create-voyzu-"),
  );

  try {
    const archivePath = join(temporaryDirectory, "voyzu.tar.gz");
    const extractPath = join(temporaryDirectory, "extracted");

    await mkdir(extractPath);

    const archiveUrl =
      `https://github.com/${REPOSITORY_OWNER}/${REPOSITORY_NAME}` +
      `/archive/refs/heads/${DEFAULT_REF}.tar.gz`;

    console.log(`Creating ${projectName}...`);
    console.log("Downloading Voyzu...");

    await downloadFile(archiveUrl, archivePath);

    console.log("Extracting project...");

    await run("tar", [
      "-xzf",
      archivePath,
      "-C",
      extractPath,
    ]);

    const extractedEntries = await readdir(extractPath);

    if (extractedEntries.length !== 1) {
      throw new Error("Unexpected GitHub archive structure.");
    }

    const extractedRoot = join(extractPath, extractedEntries[0]);
    await moveDirectoryContents(extractedRoot, targetDirectory);

    console.log("Installing dependencies...");

    await run("npm", ["install"], {
      cwd: targetDirectory,
    });

    console.log("Initialising Git...");

    await run("git", ["init"], {
      cwd: targetDirectory,
    });

    console.log("");
    console.log("Voyzu created successfully.");
    console.log("");
    console.log(`  cd ${projectArgument}`);
    console.log("  npm run dev");
  } catch (error) {
    await rm(targetDirectory, {
      recursive: true,
      force: true,
    });

    throw error;
  } finally {
    await rm(temporaryDirectory, {
      recursive: true,
      force: true,
    });
  }
}

main().catch((error) => {
  console.error("");
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
