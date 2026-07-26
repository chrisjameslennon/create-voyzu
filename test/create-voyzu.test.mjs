import { spawn } from "node:child_process";
import {
  access,
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";

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

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      ...options,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function createRepository(directory, files) {
  await mkdir(directory, { recursive: true });

  for (const [filename, contents] of Object.entries(files)) {
    const path = join(directory, filename);
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, contents, "utf8");
  }

  await run("git", ["init", "--initial-branch=main"], { cwd: directory });
  await run("git", ["config", "user.email", "test@example.com"], {
    cwd: directory,
  });
  await run("git", ["config", "user.name", "Test"], { cwd: directory });
  await run("git", ["add", "."], { cwd: directory });
  await run("git", ["commit", "-m", "Initial test repository"], {
    cwd: directory,
  });
}

const temporaryRoot = await mkdtemp(join(tmpdir(), "create-voyzu-test-"));
const platformRepository = join(temporaryRoot, "voyzu");
const modulesRepository = join(temporaryRoot, "voyzu-modules");
const generatedProject = join(temporaryRoot, "generated");
const cliPath = resolve("bin/create-voyzu.js");

try {
  await createRepository(platformRepository, {
    "package.json": JSON.stringify(
      {
        name: "test-voyzu",
        private: true,
        scripts: {
          dev: 'node -e "console.log(\'dev\')"',
          build: 'node -e "console.log(\'build\')"',
          start: 'node -e "console.log(\'start\')"',
        },
      },
      null,
      2,
    ),
  });

  await createRepository(modulesRepository, {
    "package.json": JSON.stringify(
      { name: "voyzu-modules", private: true },
      null,
      2,
    ),
    "packages/@voyzu-modules/all-modules/package.json": JSON.stringify({
      name: "@voyzu-modules/all-modules",
      private: true,
    }),
    "packages/@voyzu-modules/types/package.json": JSON.stringify({
      name: "@voyzu-modules/types",
      private: true,
    }),
  });

  const environment = {
    ...process.env,
    VOYZU_REPOSITORY: platformRepository,
    VOYZU_MODULES_REPOSITORY: modulesRepository,
  };

  await run(
    process.execPath,
    [cliPath, "install", generatedProject, "--skip-install"],
    { env: environment },
  );
  await run("npm", ["run", "build"], { cwd: generatedProject });

  if (await pathExists(join(generatedProject, "scripts"))) {
    throw new Error("Virgin installation created an unnecessary scripts directory.");
  }
  if (await pathExists(join(generatedProject, ".gitignore"))) {
    throw new Error("Virgin installation created an unnecessary .gitignore.");
  }
  const generatedPackageJson = JSON.parse(
    await readFile(join(generatedProject, "package.json"), "utf8"),
  );
  if (
    generatedPackageJson.scripts.build
      !== "npm --prefix .run/voyzu run build"
    || generatedPackageJson.scripts.start
      !== "npm --prefix .run/voyzu run start"
  ) {
    throw new Error("Virgin package.json was not rendered from the install template.");
  }

  const installedModules = join(
    generatedProject,
    ".run/voyzu/packages/@voyzu-modules",
  );
  const installedModulesStat = await lstat(installedModules);
  if (
    !installedModulesStat.isDirectory()
    || installedModulesStat.isSymbolicLink()
  ) {
    throw new Error("Virgin installation did not copy the modules directory.");
  }
  const clonedModules = join(
    generatedProject,
    ".run/voyzu-modules/packages/@voyzu-modules",
  );
  if ((await realpath(installedModules)) === (await realpath(clonedModules))) {
    throw new Error("Virgin installation modules directory is still linked.");
  }
  if (!(await readFile(
    join(installedModules, "all-modules/package.json"),
    "utf8",
  )).includes('"@voyzu-modules/all-modules"')) {
    throw new Error("Virgin installation did not copy the module contents.");
  }

  await run(process.execPath, [cliPath, "dev", "--skip-install"], {
    cwd: modulesRepository,
    env: environment,
  });
  await run("npm", ["run", "dev"], {
    cwd: join(modulesRepository, ".dev"),
  });

  const developmentLink = join(
    modulesRepository,
    ".dev/voyzu/packages/@voyzu-modules",
  );
  if ((await realpath(developmentLink)) !== (
    await realpath(join(modulesRepository, "packages/@voyzu-modules"))
  )) {
    throw new Error("Development modules link has the wrong target.");
  }

  if (await pathExists(join(modulesRepository, ".gitignore"))) {
    throw new Error("Development setup created an unnecessary .gitignore.");
  }
  const developmentPackageJson = JSON.parse(
    await readFile(join(modulesRepository, ".dev/package.json"), "utf8"),
  );
  if (developmentPackageJson.scripts.dev !== "npm --prefix voyzu run dev") {
    throw new Error("Development package.json was not rendered from its template.");
  }
  if (!(await readFile(
    join(modulesRepository, ".dev/README.md"),
    "utf8",
  )).includes("Voyzu Modules Development Runtime")) {
    throw new Error("Development README was not rendered from its template.");
  }

  console.log("create-voyzu tests passed.");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
