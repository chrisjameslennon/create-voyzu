#!/usr/bin/env node

import { spawn } from "node:child_process";
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
const DEFAULT_PACKAGES_REPOSITORY =
  process.env.VOYZU_PACKAGES_REPOSITORY ||
  process.env.VOYZU_MODULES_REPOSITORY ||
  "https://github.com/chrisjameslennon/voyzu-packages.git";
const DEFAULT_VOYZU_REF = process.env.VOYZU_REF;
const DEFAULT_PACKAGES_REF =
  process.env.VOYZU_PACKAGES_REF ||
  process.env.VOYZU_MODULES_REF;
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
    packagesRef: DEFAULT_PACKAGES_REF,
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

    if (argument === "--modules-ref") {
      options.packagesRef = args.shift();
      if (!options.packagesRef) {
        throw new Error("--modules-ref requires a Git branch or tag.");
      }
      continue;
    }

    if (argument === "--packages-ref") {
      options.packagesRef = args.shift();
      if (!options.packagesRef) {
        throw new Error("--packages-ref requires a Git branch or tag.");
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
  await rm(join(options.targetDirectory, ".git"), {
    recursive: true,
    force: true,
  });
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
      "Usage: create-voyzu install <project-directory> [--ref <tag>] [--packages-ref <tag>]",
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
  const installedPackagesDirectory = join(runtimeDirectory, "voyzu-packages");
  const packageRepositoriesDirectory = join(
    targetDirectory,
    "voyzu-package-repos",
  );
  const packagesRepositoryDirectory = join(
    packageRepositoriesDirectory,
    "voyzu-packages",
  );

  try {
    console.log(`Creating ${projectName}...`);
    await mkdir(runtimeDirectory, { recursive: true });
    await mkdir(installedPackagesDirectory, { recursive: true });
    await mkdir(packageRepositoriesDirectory, { recursive: true });

    await cloneLiveRepository({
      repository: DEFAULT_VOYZU_REPOSITORY,
      ref: options.voyzuRef,
      targetDirectory: platformDirectory,
      label: "Voyzu",
    });

    await cloneLiveRepository({
      repository: DEFAULT_PACKAGES_REPOSITORY,
      ref: options.packagesRef,
      targetDirectory: packagesRepositoryDirectory,
      label: "Voyzu Packages",
    });

    await writeFile(
      join(runtimeDirectory, "package.json"),
      await renderTemplate("install", "runtime.package.json", {
        PROJECT_NAME: jsonStringTemplateValue(projectName),
      }),
      "utf8",
    );

    if (!options.skipInstall) {
      await installDependencies(runtimeDirectory, "Voyzu runtime");
    }

    await writeFile(
      join(targetDirectory, "package.json"),
      await renderTemplate("install", "package.json", {
        PROJECT_NAME: jsonStringTemplateValue(projectName),
      }),
      "utf8",
    );

    await writeFile(
      join(targetDirectory, "README.md"),
      await renderTemplate("install", "README.md", {
        PROJECT_NAME: projectName,
      }),
      "utf8",
    );

    await writeFile(
      join(targetDirectory, ".env.development"),
      await renderTemplate("install", "env.development", {}),
      { encoding: "utf8", flag: "wx" },
    );
    await writeFile(
      join(targetDirectory, ".env.local"),
      await renderTemplate("install", "env.local", {}),
      { encoding: "utf8", flag: "wx" },
    );
    await writeFile(
      join(targetDirectory, "voyzu.instance.config.ts"),
      await renderTemplate("install", "voyzu.instance.config.ts", {}),
      { encoding: "utf8", flag: "wx" },
    );

    if (!options.skipInstall) {
      await installDependencies(targetDirectory, "Voyzu project CLI");
    }

    console.log("Initialising the generated project Git repository...");
    await run("git", ["init", "--initial-branch=main"], { cwd: targetDirectory });

    console.log("");
    console.log("Voyzu created successfully.");
    console.log("");
    console.log(`  cd ${options.target}`);
    console.log("  edit .env.local");
    console.log("  npm run dev");
  } catch (error) {
    await rm(targetDirectory, { recursive: true, force: true });
    throw error;
  }
}

async function createDevelopmentRuntime(options) {
  const packagesRoot = resolve(options.target || process.cwd());
  const developmentDirectory = join(packagesRoot, ".dev");
  const platformDirectory = join(developmentDirectory, "voyzu");
  const installedPackagesDirectory = join(
    developmentDirectory,
    "voyzu-packages",
  );

  if (!(await pathExists(join(packagesRoot, "package.json")))) {
    throw new Error(
      `No package.json found in the Voyzu Packages directory: ${packagesRoot}`,
    );
  }

  const packagesPackageJson = JSON.parse(
    await readFile(join(packagesRoot, "package.json"), "utf8"),
  );
  if (packagesPackageJson.name !== "voyzu-packages") {
    throw new Error(
      `create-voyzu dev must run from the voyzu-packages repository root: ${packagesRoot}`,
    );
  }

  if (!(await pathExists(join(packagesRoot, "voyzu-packages")))) {
    throw new Error(
      `No voyzu-packages directory found in: ${packagesRoot}`,
    );
  }

  if (await pathExists(developmentDirectory)) {
    if (!options.force) {
      throw new Error(
        `${developmentDirectory} already exists. Run again with --force to recreate it.`,
      );
    }

    await rm(developmentDirectory, { recursive: true, force: true });
  }

  try {
    await mkdir(developmentDirectory, { recursive: true });
    await mkdir(installedPackagesDirectory, { recursive: true });

    await cloneDevelopmentRepository({
      repository: DEFAULT_VOYZU_REPOSITORY,
      ref: options.voyzuRef,
      targetDirectory: platformDirectory,
      label: "Voyzu",
    });

    await writeFile(
      join(developmentDirectory, "package.json"),
      await renderTemplate("dev", "package.json", {
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
      join(developmentDirectory, "README.md"),
      await renderTemplate("dev", "README.md", {}),
      "utf8",
    );

    await writeFileIfMissing(
      join(packagesRoot, ".env.development"),
      await renderTemplate("install", "env.development", {}),
    );
    await writeFileIfMissing(
      join(packagesRoot, ".env.local"),
      await renderTemplate("install", "env.local", {}),
    );
    await writeFileIfMissing(
      join(packagesRoot, "voyzu.instance.config.ts"),
      await renderTemplate("install", "voyzu.instance.config.ts", {}),
    );

    if (!options.skipInstall) {
      await installDependencies(developmentDirectory, "Voyzu development runtime");
    }

    console.log("");
    console.log("Voyzu development runtime created successfully.");
    console.log("");
    console.log("The downloaded Voyzu source has no nested Git repository.");
    console.log("Installed development packages will link directly to this repository.");
    console.log("");
    console.log("Run:");
    console.log("  npm run voyzu -- install @voyzu-packages/ice-creams");
    console.log("  npm run dev");
  } catch (error) {
    await rm(developmentDirectory, { recursive: true, force: true });
    throw error;
  }
}

function printHelp() {
  console.log(`create-voyzu

GitHub-based Voyzu installer and local package-development runtime.

Commands:
  create-voyzu install <directory>  Create a deployable Voyzu installation
  create-voyzu <directory>          Alias for install
  create-voyzu dev [packages-dir]   Create .dev for package development

Options:
  --ref <branch-or-tag>             Voyzu Git ref (default: repository default)
  --packages-ref <branch-or-tag>    Voyzu Packages Git ref (default: repository default)
  --modules-ref <branch-or-tag>     Deprecated alias for --packages-ref
  --force                           Recreate an existing .dev directory
  --skip-install                    Do not run npm install

Environment:
  VOYZU_REPOSITORY                  Override the Voyzu Git repository URL
  VOYZU_PACKAGES_REPOSITORY         Override the Voyzu Packages repository URL
  VOYZU_REF                         Override the default Voyzu Git ref
  VOYZU_PACKAGES_REF                Override the default packages Git ref
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
