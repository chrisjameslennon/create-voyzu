#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
  access,
  appendFile,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import process from "node:process";

const DEFAULT_VOYZU_REPOSITORY =
  process.env.VOYZU_REPOSITORY ||
  "https://github.com/chrisjameslennon/voyzu.git";
const DEFAULT_MODULES_REPOSITORY =
  process.env.VOYZU_MODULES_REPOSITORY ||
  "https://github.com/chrisjameslennon/voyzu-modules.git";
const DEFAULT_VOYZU_REF = process.env.VOYZU_REF;
const DEFAULT_MODULES_REF = process.env.VOYZU_MODULES_REF;

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
    modulesRef: DEFAULT_MODULES_REF,
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
      options.modulesRef = args.shift();
      if (!options.modulesRef) {
        throw new Error("--modules-ref requires a Git branch or tag.");
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

async function cloneDetachedCopy({ repository, ref, targetDirectory, label }) {
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

  // The generated runtime is source copied from GitHub, not a nested checkout.
  await rm(join(targetDirectory, ".git"), {
    recursive: true,
    force: true,
  });
}

async function linkModulesIntoVoyzu(platformDirectory, modulesDirectory) {
  const source = join(modulesDirectory, "packages", "@voyzu-modules");
  const target = join(platformDirectory, "packages", "@voyzu-modules");

  if (!(await pathExists(source))) {
    throw new Error(
      `Voyzu Modules package directory was not found: ${source}`,
    );
  }

  await rm(target, { recursive: true, force: true });
  await mkdir(dirname(target), { recursive: true });
  await symlink(
    source,
    target,
    process.platform === "win32" ? "junction" : "dir",
  );
}

function runtimeRunnerSource(platformDirectory) {
  return `#!/usr/bin/env node

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";

const command = process.argv[2];
const forwardedArguments = process.argv.slice(3);

if (!command) {
  console.error("Usage: node run-voyzu.mjs <npm-script> [...arguments]");
  process.exit(1);
}

const child = spawn(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["run", command, ...(forwardedArguments.length ? ["--", ...forwardedArguments] : [])],
  {
    cwd: resolve(${JSON.stringify(platformDirectory)}),
    stdio: "inherit",
    env: process.env,
  },
);

child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
`;
}

async function ensureIgnored(rootDirectory, entry) {
  const gitignorePath = join(rootDirectory, ".gitignore");
  let contents = "";

  if (await pathExists(gitignorePath)) {
    contents = await readFile(gitignorePath, "utf8");
  }

  const lines = contents.split(/\r?\n/).map((line) => line.trim());
  if (lines.includes(entry) || lines.includes(`/${entry}`)) {
    return;
  }

  const separator = contents.length > 0 && !contents.endsWith("\n") ? "\n" : "";
  await appendFile(gitignorePath, `${separator}${entry}\n`, "utf8");
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

async function createVirginInstall(options) {
  if (!options.target) {
    throw new Error(
      "Usage: create-voyzu install <project-directory> [--ref <tag>] [--modules-ref <tag>]",
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
  const modulesDirectory = join(runtimeDirectory, "voyzu-modules");
  const scriptsDirectory = join(targetDirectory, "scripts");

  try {
    console.log(`Creating ${projectName}...`);
    await mkdir(runtimeDirectory, { recursive: true });

    await cloneDetachedCopy({
      repository: DEFAULT_VOYZU_REPOSITORY,
      ref: options.voyzuRef,
      targetDirectory: platformDirectory,
      label: "Voyzu",
    });

    await cloneDetachedCopy({
      repository: DEFAULT_MODULES_REPOSITORY,
      ref: options.modulesRef,
      targetDirectory: modulesDirectory,
      label: "Voyzu Modules",
    });

    console.log("Linking Voyzu Modules into Voyzu...");
    await linkModulesIntoVoyzu(platformDirectory, modulesDirectory);

    if (!options.skipInstall) {
      await installDependencies(platformDirectory, "Voyzu");
    }

    await mkdir(scriptsDirectory, { recursive: true });
    await writeFile(
      join(scriptsDirectory, "run-voyzu.mjs"),
      runtimeRunnerSource(".run/voyzu"),
      "utf8",
    );

    const packageJson = {
      name: projectName,
      private: true,
      version: "0.1.0",
      scripts: {
        build: "node ./scripts/run-voyzu.mjs build",
        start: "node ./scripts/run-voyzu.mjs start",
      },
      voyzu: {
        platform: {
          repository: DEFAULT_VOYZU_REPOSITORY,
          ref: options.voyzuRef,
          directory: ".run/voyzu",
        },
        modules: {
          repository: DEFAULT_MODULES_REPOSITORY,
          ref: options.modulesRef,
          directory: ".run/voyzu-modules",
        },
      },
    };

    await writeFile(
      join(targetDirectory, "package.json"),
      `${JSON.stringify(packageJson, null, 2)}\n`,
      "utf8",
    );

    await writeFile(
      join(targetDirectory, ".gitignore"),
      "node_modules/\n.next/\n.env*.local\n",
      "utf8",
    );

    await writeFile(
      join(targetDirectory, "README.md"),
      `# ${projectName}\n\nGenerated Voyzu installation.\n\n\`\`\`shell\nnpm run build\nnpm run start\n\`\`\`\n`,
      "utf8",
    );

    console.log("Initialising the generated project Git repository...");
    await run("git", ["init", "--initial-branch=main"], { cwd: targetDirectory });

    console.log("");
    console.log("Voyzu created successfully.");
    console.log("");
    console.log(`  cd ${options.target}`);
    console.log("  npm run build");
    console.log("  npm run start");
  } catch (error) {
    await rm(targetDirectory, { recursive: true, force: true });
    throw error;
  }
}

async function createDevelopmentRuntime(options) {
  const modulesRoot = resolve(options.target || process.cwd());
  const developmentDirectory = join(modulesRoot, ".dev");
  const platformDirectory = join(developmentDirectory, "voyzu");

  if (!(await pathExists(join(modulesRoot, "package.json")))) {
    throw new Error(
      `No package.json found in the Voyzu Modules directory: ${modulesRoot}`,
    );
  }

  const modulesPackageJson = JSON.parse(
    await readFile(join(modulesRoot, "package.json"), "utf8"),
  );
  if (modulesPackageJson.name !== "voyzu-modules") {
    throw new Error(
      `create-voyzu dev must run from the voyzu-modules repository root: ${modulesRoot}`,
    );
  }

  if (!(await pathExists(join(modulesRoot, "packages", "@voyzu-modules")))) {
    throw new Error(
      `No packages/@voyzu-modules directory found in: ${modulesRoot}`,
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
    await ensureIgnored(modulesRoot, ".dev/");

    await cloneDetachedCopy({
      repository: DEFAULT_VOYZU_REPOSITORY,
      ref: options.voyzuRef,
      targetDirectory: platformDirectory,
      label: "Voyzu",
    });

    console.log("Linking the current Voyzu Modules source into Voyzu...");
    await linkModulesIntoVoyzu(platformDirectory, modulesRoot);

    if (!options.skipInstall) {
      await installDependencies(platformDirectory, "Voyzu");
    }

    console.log("");
    console.log("Voyzu development runtime created successfully.");
    console.log("");
    console.log("The downloaded Voyzu source has no nested Git repository.");
    console.log("Voyzu Modules is linked directly from the current repository.");
    console.log("");
    console.log("Run:");
    console.log("  npm run dev");
  } catch (error) {
    await rm(developmentDirectory, { recursive: true, force: true });
    throw error;
  }
}

function printHelp() {
  console.log(`create-voyzu

GitHub-based Voyzu installer and local module-development runtime.

Commands:
  create-voyzu install <directory>  Create a deployable Voyzu installation
  create-voyzu <directory>          Alias for install
  create-voyzu dev [modules-dir]    Create .dev/voyzu for module development

Options:
  --ref <branch-or-tag>             Voyzu Git ref (default: repository default)
  --modules-ref <branch-or-tag>     Voyzu Modules Git ref (default: repository default)
  --force                           Recreate an existing .dev directory
  --skip-install                    Do not run npm install

Environment:
  VOYZU_REPOSITORY                  Override the Voyzu Git repository URL
  VOYZU_MODULES_REPOSITORY          Override the Voyzu Modules Git repository URL
  VOYZU_REF                         Override the default Voyzu Git ref
  VOYZU_MODULES_REF                 Override the default modules Git ref
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
