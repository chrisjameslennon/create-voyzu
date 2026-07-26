import { spawn } from "node:child_process";
import {
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

  const installedLink = join(
    generatedProject,
    ".run/voyzu/packages/@voyzu-modules",
  );
  if (!(await lstat(installedLink)).isSymbolicLink()) {
    throw new Error("Virgin installation did not create the modules link.");
  }
  const installedModules = join(
    generatedProject,
    ".run/voyzu-modules/packages/@voyzu-modules",
  );
  if ((await realpath(installedLink)) !== (await realpath(installedModules))) {
    throw new Error("Virgin installation modules link has the wrong target.");
  }

  await run(process.execPath, [cliPath, "dev", "--skip-install"], {
    cwd: modulesRepository,
    env: environment,
  });
  await run("npm", ["run", "dev"], {
    cwd: join(modulesRepository, ".dev/voyzu"),
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

  const gitignore = await readFile(join(modulesRepository, ".gitignore"), "utf8");
  if (!gitignore.includes(".dev/")) {
    throw new Error("Development setup did not add .dev/ to .gitignore.");
  }

  console.log("create-voyzu tests passed.");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
