#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
  access,
  cp,
  mkdir,
  readFile,
  rm,
} from "node:fs/promises";
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const installationRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
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

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function assertInside(parent, child) {
  const relativePath = relative(parent, child);
  if (
    relativePath === ""
    || relativePath === ".."
    || relativePath.startsWith(`..${sep}`)
    || isAbsolute(relativePath)
  ) {
    throw new Error(`Path escapes its expected parent: ${child}`);
  }
}

async function pullRepository(directory, label) {
  console.log(`Updating ${label}...`);
  await run("git", ["pull", "--ff-only"], { cwd: directory });
}

async function updateRepository({
  directory,
  label,
  repository,
  ref,
}) {
  if (await pathExists(join(directory, ".git"))) {
    await pullRepository(directory, label);
    return;
  }

  if (await pathExists(directory)) {
    throw new Error(
      `${label} directory exists but is not a Git checkout: ${directory}`,
    );
  }

  if (!repository) {
    throw new Error(`No repository is configured for ${label}.`);
  }

  console.log(`Downloading ${label}...`);
  await mkdir(dirname(directory), { recursive: true });

  const cloneArguments = ["clone", "--depth", "1"];
  if (ref && ref !== "repository default") {
    cloneArguments.push("--branch", ref);
  }
  cloneArguments.push(repository, directory);

  await run("git", cloneArguments);
}

async function installPlatformDependencies(platformDirectory) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) {
    throw new Error("Run the updater through npm: npm run update");
  }

  console.log("Installing Voyzu dependencies...");
  if (await pathExists(join(platformDirectory, "package-lock.json"))) {
    await run(process.execPath, [npmCli, "ci"], {
      cwd: platformDirectory,
    });
    return;
  }

  await run(
    process.execPath,
    [npmCli, "install", "--package-lock=false"],
    { cwd: platformDirectory },
  );
}

const installationPackage = JSON.parse(
  await readFile(join(installationRoot, "package.json"), "utf8"),
);
const platformDirectory = resolve(
  installationRoot,
  installationPackage.voyzu.platform.directory,
);
const modulesDirectory = resolve(
  installationRoot,
  installationPackage.voyzu.modules.directory,
);
const modulesSource = join(
  modulesDirectory,
  "packages",
  "@voyzu-modules",
);
const modulesTarget = join(
  platformDirectory,
  "packages",
  "@voyzu-modules",
);

assertInside(installationRoot, platformDirectory);
assertInside(installationRoot, modulesDirectory);
assertInside(platformDirectory, modulesTarget);

await updateRepository({
  directory: platformDirectory,
  label: "Voyzu",
  repository: installationPackage.voyzu.platform.repository,
  ref: installationPackage.voyzu.platform.ref,
});
await updateRepository({
  directory: modulesDirectory,
  label: "Voyzu Modules",
  repository: installationPackage.voyzu.modules.repository,
  ref: installationPackage.voyzu.modules.ref,
});

console.log("Refreshing Voyzu Modules inside Voyzu...");
await rm(modulesTarget, { recursive: true, force: true });
await mkdir(dirname(modulesTarget), { recursive: true });
await cp(modulesSource, modulesTarget, { recursive: true });

await installPlatformDependencies(platformDirectory);

console.log("");
console.log("Voyzu updated successfully.");
console.log("Run npm start to build and launch the updated installation.");
