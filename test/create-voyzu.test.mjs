import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
          dev: 'node -e "console.log(process.env.VOYZU_MODULES_DIR)"',
          build: 'node -e "console.log(process.env.VOYZU_MODULES_DIR)"',
          start: 'node -e "console.log(process.env.VOYZU_MODULES_DIR)"',
        },
      },
      null,
      2,
    ),
  });

  await createRepository(modulesRepository, {
    "package.json": JSON.stringify(
      { name: "test-voyzu-modules", private: true },
      null,
      2,
    ),
    "packages/@voyzu/modules/example/README.md": "# Example\n",
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
  await run("npm", ["run", "dev"], { cwd: generatedProject });

  await run(process.execPath, [cliPath, "dev", "--skip-install"], {
    cwd: modulesRepository,
    env: environment,
  });
  await run(process.execPath, [join(modulesRepository, ".dev/run-voyzu.mjs"), "dev"], {
    cwd: modulesRepository,
  });

  const gitignore = await readFile(join(modulesRepository, ".gitignore"), "utf8");
  if (!gitignore.includes(".dev/")) {
    throw new Error("Development setup did not add .dev/ to .gitignore.");
  }

  console.log("create-voyzu tests passed.");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
