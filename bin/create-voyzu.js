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
const VOYZU_BRANCH = "main";
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

async function ensureDevelopmentConfiguration(manifestPath) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const existing = manifest.voyzu;
  if (existing && existing.mode !== "development") {
    throw new Error("The root package.json voyzu.mode must be development for a development install.");
  }
  const platform = existing?.platform ?? {};
  if (typeof platform !== "object" || Array.isArray(platform)) {
    throw new Error("The root package.json voyzu.platform value must be an object.");
  }
  const platformConfiguration = { ...platform };
  delete platformConfiguration.directory;
  manifest.voyzu = {
    ...existing,
    mode: "development",
    platform: {
      ...platformConfiguration,
      repository: platform.repository || DEFAULT_VOYZU_REPOSITORY,
      branch: platform.branch || VOYZU_BRANCH,
    },
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest.voyzu.platform;
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
  targetDirectory,
  label,
  branch = VOYZU_BRANCH,
}) {
  console.log(`Downloading ${label} from GitHub (${branch})...`);

  const cloneArguments = [
    "clone",
    "--depth",
    "1",
    "--branch",
    branch,
    "--single-branch",
  ];

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

async function synchronizeRuntimePackage(runtimeDirectory, platformDirectory) {
  const runtimePackagePath = join(runtimeDirectory, "package.json");
  const platformPackagePath = join(platformDirectory, "package.json");
  const [runtimePackage, platformPackage] = await Promise.all([
    readFile(runtimePackagePath, "utf8").then(JSON.parse),
    readFile(platformPackagePath, "utf8").then(JSON.parse),
  ]);

  runtimePackage.dependencies = { ...(platformPackage.dependencies ?? {}) };
  runtimePackage.devDependencies = {
    ...(platformPackage.devDependencies ?? {}),
  };
  if (platformPackage.packageManager) {
    runtimePackage.packageManager = platformPackage.packageManager;
  }

  await writeFile(
    runtimePackagePath,
    `${JSON.stringify(runtimePackage, null, 2)}\n`,
    "utf8",
  );
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
      "Usage: create-voyzu install <project-directory>",
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
    await synchronizeRuntimePackage(runtimeDirectory, platformDirectory);

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
      VOYZU_REPOSITORY: jsonStringTemplateValue(
        DEFAULT_VOYZU_REPOSITORY,
      ),
    }),
  );
  const platformConfiguration = await ensureDevelopmentConfiguration(
    join(packagesRoot, "package.json"),
  );
  await writeFileIfMissing(
    join(packagesRoot, ".gitignore"),
    await renderTemplate("dev", "gitignore", {}),
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
      repository: platformConfiguration.repository,
      branch: platformConfiguration.branch,
      targetDirectory: platformDirectory,
      label: "Voyzu",
    });

    await writeFile(
      join(runtimeDirectory, "package.json"),
      await renderTemplate("dev", "runtime.package.json", {
        PROJECT_NAME: jsonStringTemplateValue(basename(packagesRoot)),
      }),
      "utf8",
    );
    await synchronizeRuntimePackage(runtimeDirectory, platformDirectory);

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
    console.log("Installed development packages are watched physical copies of this repository's package source.");
    console.log("");
    console.log("Configure the database connection in .env.local and run:");
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
  --force                           Recreate an existing .run directory
  --skip-install                    Do not run npm install

Environment:
  VOYZU_REPOSITORY                  Override the Voyzu Git repository URL
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
