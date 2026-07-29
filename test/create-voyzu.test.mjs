import { spawn } from "node:child_process";
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false,
      ...options,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function createRepository(directory, files) {
  await mkdir(directory, { recursive: true });
  for (const [filename, contents] of Object.entries(files)) {
    const path = join(directory, filename);
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, contents, "utf8");
  }
  await run("git", ["init", "--initial-branch=main"], { cwd: directory });
  await run("git", ["config", "user.email", "test@example.com"], { cwd: directory });
  await run("git", ["config", "user.name", "Test"], { cwd: directory });
  await run("git", ["add", "."], { cwd: directory });
  await run("git", ["commit", "-m", "Initial-test-repository"], { cwd: directory });
}

const temporaryRoot = await mkdtemp(join(tmpdir(), "create-voyzu-test-"));
const platformRepository = join(temporaryRoot, "voyzu");
const packagesRepository = join(temporaryRoot, "voyzu-packages");
const generatedProject = join(temporaryRoot, "generated");
const cliPath = resolve("bin/create-voyzu.js");

try {
  await createRepository(platformRepository, {
    "package.json": JSON.stringify({ name: "voyzu", private: true }),
    "packages/@voyzu/cli/package.json": JSON.stringify({
      name: "@voyzu/cli",
      private: true,
    }),
  });
  await createRepository(packagesRepository, {
    "package.json": JSON.stringify({ name: "voyzu-packages", private: true }),
    "packages/@voyzu/example/package.json": JSON.stringify({
      name: "@voyzu/example",
      private: true,
      voyzu: { "voyzu-package": true, isActive: true },
    }),
  });

  await run(
    process.execPath,
    [cliPath, "install", generatedProject, "--skip-install"],
    {
      env: {
        ...process.env,
        VOYZU_REPOSITORY: platformRepository,
        VOYZU_PACKAGES_REPOSITORY: packagesRepository,
      },
    },
  );

  const expectedPaths = [
    ".run/package.json",
    ".run/voyzu/.git",
    ".run/packages",
    "voyzu-package-repos/voyzu-packages/.git",
    ".env.local",
    "voyzu.instance.config.ts",
    "package.json",
    "README.md",
  ];
  for (const path of expectedPaths) {
    if (!(await pathExists(join(generatedProject, path)))) {
      throw new Error(`Virgin installation did not create ${path}.`);
    }
  }

  if (await pathExists(
    join(generatedProject, ".run/packages/@voyzu/example"),
  )) {
    throw new Error("Virgin installation pre-installed an external package.");
  }

  const rootPackage = JSON.parse(
    await readFile(join(generatedProject, "package.json"), "utf8"),
  );
  if (
    rootPackage.scripts["voyzu:dev"] !== "npm --prefix .run/voyzu run dev"
    || rootPackage.scripts["voyzu:initialize"]
      !== "npm --prefix .run/voyzu run voyzu:initialize"
    || rootPackage.scripts["voyzu:install"]
      !== "npm --prefix .run/voyzu run voyzu:install --"
    || rootPackage.scripts["voyzu:install-package"]
      !== "npm --prefix .run/voyzu run voyzu:install-package --"
    || rootPackage.workspaces !== undefined
  ) {
    throw new Error("Root package.json does not expose the Voyzu package commands.");
  }

  const runtimePackage = JSON.parse(
    await readFile(join(generatedProject, ".run/package.json"), "utf8"),
  );
  if (
    !runtimePackage.workspaces.includes("packages/@*/*")
    || runtimePackage.voyzu.mode !== "production"
    || runtimePackage.voyzu.composedPackages.length !== 0
  ) {
    throw new Error("Runtime package.json is not the expected empty workspace.");
  }

  const localEnv = await readFile(join(generatedProject, ".env.local"), "utf8");
  if (!localEnv.includes("CHANGE_ME") || /password@/.test(localEnv)) {
    throw new Error(".env.local does not use safe placeholder values.");
  }
  const authSecret = localEnv.match(/^VOYZU_AUTH_SECRET=(.+)$/m)?.[1];
  if (
    !authSecret
    || Buffer.from(authSecret, "base64url").length < 32
  ) {
    throw new Error(".env.local does not contain a generated authentication secret.");
  }

  await run(
    process.execPath,
    [cliPath, "dev", packagesRepository, "--skip-install"],
    {
      env: {
        ...process.env,
        VOYZU_REPOSITORY: platformRepository,
      },
    },
  );

  const expectedDevelopmentPaths = [
    ".run/package.json",
    ".run/voyzu/package.json",
    ".run/packages",
    ".env.local",
    "voyzu.instance.config.ts",
  ];
  for (const path of expectedDevelopmentPaths) {
    if (!(await pathExists(join(packagesRepository, path)))) {
      throw new Error(`Development installation did not create ${path}.`);
    }
  }
  if (await pathExists(join(packagesRepository, ".run/voyzu/.git"))) {
    throw new Error("Development installation retained the nested Voyzu Git repository.");
  }

  const developmentPackage = JSON.parse(
    await readFile(join(packagesRepository, ".run/package.json"), "utf8"),
  );
  if (
    developmentPackage.voyzu.mode !== "development"
    || developmentPackage.voyzu.packageSource.directory !== ".."
    || !developmentPackage.workspaces.includes("packages/@*/*")
  ) {
    throw new Error("Development runtime package.json is not configured for linked packages.");
  }

  console.log("create-voyzu tests passed.");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
