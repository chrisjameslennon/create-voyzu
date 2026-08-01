#!/usr/bin/env node

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_VOYZU_REPOSITORY =
  process.env.VOYZU_REPOSITORY ||
  "https://github.com/chrisjameslennon/voyzu.git";
const DEFAULT_VOYZU_REF = process.env.VOYZU_REF;
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATES_ROOT = join(PACKAGE_ROOT, "templates");

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const useNpmCli = process.platform === "win32"
      && command === "npm"
      && process.env.npm_execpath;
    const executable = useNpmCli ? process.execPath : command;
    const executableArgs = useNpmCli
      ? [process.env.npm_execpath, ...args]
      : args;
    const child = spawn(executable, executableArgs, {
      stdio: "inherit",
      shell: process.platform === "win32" && command === "npm" && !useNpmCli,
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

function parseArguments(argv) {
  const args = [...argv];
  const options = {
    command: "install",
    target: undefined,
    force: false,
    skipInstall: false,
    voyzuRef: DEFAULT_VOYZU_REF,
  };

  if (args[0] === "install" || args[0] === "dev") {
    options.command = args.shift();
  }

  while (args.length > 0) {
    const argument = args.shift();

    if (argument === "--force") {
      options.force = true;
      continue;
    }

    if (argument === "--skip-install") {
      options.skipInstall = true;
      continue;
    }

    if (argument === "--ref") {
      options.voyzuRef = args.shift();
      if (!options.voyzuRef) {
        throw new Error("--ref requires a Git branch or tag.");
      }
      continue;
    }

    if (argument.startsWith("--")) {
      throw new Error(`Unknown option: ${argument}`);
    }

    if (options.target) {
      throw new Error(`Unexpected argument: ${argument}`);
    }

    options.target = argument;
  }

  return options;
}

async function cloneShallowRepository({
  repository,
  ref,
  targetDirectory,
  label,
}) {
  console.log(
    `Downloading ${label} from GitHub (${ref || "repository default branch"})...`,
  );

  const cloneArguments = [
    "clone",
    "--depth",
    "1",
  ];

  if (ref) {
    cloneArguments.push("--branch", ref);
  }

  cloneArguments.push(repository, targetDirectory);
  await run("git", cloneArguments);
}

async function cloneLiveRepository(options) {
  await cloneShallowRepository(options);
}

async function cloneDevelopmentRepository(options) {
  await cloneShallowRepository(options);
}

async function renderTemplate(templateDirectory, filename, replacements) {
  const templatePath = join(TEMPLATES_ROOT, templateDirectory, filename);
  let contents = await readFile(templatePath, "utf8");

  for (const [name, value] of Object.entries(replacements)) {
    contents = contents.replaceAll(`{{${name}}}`, value);
  }

  const unresolvedToken = contents.match(/\{\{[A-Z0-9_]+\}\}/);
  if (unresolvedToken) {
    throw new Error(
      `Template ${templatePath} contains unresolved token ${unresolvedToken[0]}.`,
    );
  }

  return contents.endsWith("\n") ? contents : `${contents}\n`;
}

function jsonStringTemplateValue(value) {
  return JSON.stringify(value).slice(1, -1);
}

async function renderEnvironmentTemplate() {
  return renderTemplate("shared", "env.local", {
    VOYZU_AUTH_SECRET: randomBytes(32).toString("base64url"),
  });
}

async function installDependencies(directory, label) {
  if (!(await pathExists(join(directory, "package.json")))) {
    console.log(`Skipping ${label} dependency installation (no package.json).`);
    return;
  }

  console.log(`Installing ${label} dependencies...`);

  if (await pathExists(join(directory, "package-lock.json"))) {
    await run("npm", ["ci"], { cwd: directory });
    return;
  }

  // Avoid creating a tracked lockfile inside the detached source copy.
  await run("npm", ["install", "--package-lock=false"], { cwd: directory });
}

async function writeFileIfMissing(path, contents) {
  if (await pathExists(path)) {
    console.log(`Preserving existing ${basename(path)}.`);
    return;
  }
  await writeFile(path, contents, { encoding: "utf8", flag: "wx" });
}

async function createVirginInstall(options) {
  if (!options.target) {
    throw new Error(
      "Usage: create-voyzu install <project-directory> [--ref <tag>]",
    );
  }

  const targetDirectory = resolve(options.target);
  const projectName = basename(targetDirectory);

  if (!(await directoryIsEmpty(targetDirectory))) {
    throw new Error(`Target directory is not empty: ${targetDirectory}`);
  }

  await mkdir(targetDirectory, { recursive: true });

  const runtimeDirectory = join(targetDirectory, ".run");
  const platformDirectory = join(runtimeDirectory, "voyzu");
  const installedPackagesDirectory = join(runtimeDirectory, "packages");
  const packageSourcesDirectory = join(
    targetDirectory,
    ".package-sources",
  );

  try {
    console.log(`Creating ${projectName}...`);
    await mkdir(runtimeDirectory, { recursive: true });
    await mkdir(installedPackagesDirectory, { recursive: true });
    await mkdir(packageSourcesDirectory, { recursive: true });

    await cloneLiveRepository({
      repository: DEFAULT_VOYZU_REPOSITORY,
      ref: options.voyzuRef,
      targetDirectory: platformDirectory,
      label: "Voyzu",
    });

    await writeFile(
      join(runtimeDirectory, "package.json"),
      await renderTemplate("prod", "runtime.package.json", {
        PROJECT_NAME: jsonStringTemplateValue(projectName),
      }),
      "utf8",
    );

    if (!options.skipInstall) {
      await installDependencies(runtimeDirectory, "Voyzu runtime");
    }

    await writeFile(
      join(targetDirectory, "package.json"),
      await renderTemplate("prod", "root.package.json", {
        PROJECT_NAME: jsonStringTemplateValue(projectName),
      }),
      "utf8",
    );

    await writeFile(
      join(targetDirectory, "README.md"),
      await renderTemplate("prod", "README.md", {
        PROJECT_NAME: projectName,
      }),
      "utf8",
    );

    await writeFile(
      join(targetDirectory, ".env.local"),
      await renderEnvironmentTemplate(),
      { encoding: "utf8", flag: "wx" },
    );
    console.log("Initialising the generated project Git repository...");
    await run("git", ["init", "--initial-branch=main"], { cwd: targetDirectory });

    console.log("");
    console.log("Voyzu created successfully.");
    console.log("");
    console.log(
      "Refer to the Voyzu installation documentation for configuration and next steps.",
    );
  } catch (error) {
    await rm(targetDirectory, { recursive: true, force: true });
    throw error;
  }
}

async function createDevelopmentRuntime(options) {
  const packagesRoot = resolve(options.target || process.cwd());
  const runtimeDirectory = join(packagesRoot, ".run");
  const packageSourcesDirectory = join(packagesRoot, ".package-sources");
  const platformDirectory = join(runtimeDirectory, "voyzu");
  const installedPackagesDirectory = join(
    runtimeDirectory,
    "packages",
  );

  await mkdir(packagesRoot, { recursive: true });
  await writeFileIfMissing(
    join(packagesRoot, "package.json"),
    await renderTemplate("dev", "root.package.json", {
      PROJECT_NAME: jsonStringTemplateValue(basename(packagesRoot)),
    }),
  );
  await mkdir(join(packagesRoot, "packages"), { recursive: true });

  if (await pathExists(runtimeDirectory)) {
    if (!options.force) {
      throw new Error(
        `${runtimeDirectory} already exists. Run again with --force to recreate it.`,
      );
    }

    await rm(runtimeDirectory, { recursive: true, force: true });
  }

  try {
    await mkdir(runtimeDirectory, { recursive: true });
    await mkdir(installedPackagesDirectory, { recursive: true });
    await mkdir(packageSourcesDirectory, { recursive: true });

    await cloneDevelopmentRepository({
      repository: DEFAULT_VOYZU_REPOSITORY,
      ref: options.voyzuRef,
      targetDirectory: platformDirectory,
      label: "Voyzu",
    });

    await writeFile(
      join(runtimeDirectory, "package.json"),
      await renderTemplate("dev", "runtime.package.json", {
        PROJECT_NAME: jsonStringTemplateValue(basename(packagesRoot)),
        VOYZU_REPOSITORY: jsonStringTemplateValue(
          DEFAULT_VOYZU_REPOSITORY,
        ),
        VOYZU_REF: jsonStringTemplateValue(
          options.voyzuRef ?? "repository default",
        ),
      }),
      "utf8",
    );

    await writeFile(
      join(runtimeDirectory, "README.md"),
      await renderTemplate("dev", "README.md", {}),
      "utf8",
    );

    await writeFileIfMissing(
      join(packagesRoot, ".env.local"),
      await renderEnvironmentTemplate(),
    );
    if (!options.skipInstall) {
      await installDependencies(runtimeDirectory, "Voyzu development runtime");
    }

    console.log("");
    console.log("Voyzu development runtime created successfully.");
    console.log("");
    console.log("The downloaded Voyzu source is a refreshable shallow Git checkout.");
    console.log("Installed development packages will link directly to this repository.");
    console.log("");
    console.log("Run:");
    console.log("  npm run voyzu:initialize");
    console.log("  npm run voyzu:link-package -- @voyzu/ice-creams");
    console.log("  npm run dev");
  } catch (error) {
    await rm(runtimeDirectory, { recursive: true, force: true });
    throw error;
  }
}

function printHelp() {
  console.log(`create-voyzu

GitHub-based Voyzu installer and local package-development runtime.

Commands:
  create-voyzu install <directory>  Create a deployable Voyzu installation
  create-voyzu <directory>          Alias for install
  create-voyzu dev [packages-dir]   Create .run for package development

Options:
  --ref <branch-or-tag>             Voyzu Git ref (default: repository default)
  --force                           Recreate an existing .run directory
  --skip-install                    Do not run npm install

Environment:
  VOYZU_REPOSITORY                  Override the Voyzu Git repository URL
  VOYZU_REF                         Override the default Voyzu Git ref
`);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return;
  }

  const options = parseArguments(process.argv.slice(2));

  if (options.command === "dev") {
    await createDevelopmentRuntime(options);
    return;
  }

  await createVirginInstall(options);
}

main().catch((error) => {
  console.error("");
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
