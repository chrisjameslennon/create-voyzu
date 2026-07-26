# create-voyzu

Creates Voyzu installations and module-development runtimes directly from GitHub. Voyzu itself does not need to be published to the npm registry.

`npm exec` is used only to run this GitHub-hosted CLI. The CLI then obtains `voyzu` and `voyzu-modules` using Git.

## Create a virgin installation

```shell
npm exec --yes \
  --package=github:chrisjameslennon/create-voyzu#main \
  -- create-voyzu install my-voyzu
```

The shorter form is also supported:

```shell
npm exec --yes \
  --package=github:chrisjameslennon/create-voyzu#main \
  -- create-voyzu my-voyzu
```

This creates:

```text
my-voyzu/
├─ .run/
│  ├─ voyzu/
│  └─ voyzu-modules/
├─ scripts/
│  └─ run-voyzu.mjs
├─ package.json
└─ README.md
```

Both GitHub repositories are shallow-cloned and their nested `.git` directories are removed. The generated project is then initialised as its own Git repository with no remote.

The `.run` directory is intentionally **not** ignored. It is the source used by development and production builds.

```shell
cd my-voyzu
npm run dev
npm run build
npm run start
```

## Voyzu Modules development

Add these scripts to the root `package.json` in `voyzu-modules`:

```json
{
  "scripts": {
    "create-dev": "npm exec --yes --package=github:chrisjameslennon/create-voyzu#main -- create-voyzu dev",
    "dev": "node .dev/run-voyzu.mjs dev",
    "build": "node .dev/run-voyzu.mjs build"
  }
}
```

Then run:

```shell
npm run create-dev
npm run dev
```

This creates:

```text
voyzu-modules/
├─ .dev/
│  ├─ voyzu/
│  └─ run-voyzu.mjs
└─ packages/
```

The development setup:

1. Adds `.dev/` to the current repository's `.gitignore` when necessary.
2. Shallow-clones Voyzu into `.dev/voyzu`.
3. Removes `.dev/voyzu/.git`.
4. Runs `npm install` inside `.dev/voyzu`.
5. Runs the Next.js application from `.dev/voyzu`.
6. Supplies the current `voyzu-modules` repository through the `VOYZU_MODULES_DIR` environment variable.

The downloaded Voyzu source is not rewritten or rearranged. Only normal ignored runtime output such as `node_modules` and `.next` is created inside it.

To recreate the runtime:

```shell
npm run create-dev -- --force
```

## Runtime contract

Voyzu must discover the external module source from:

```text
VOYZU_MODULES_DIR
```

For a virgin installation this points to:

```text
.run/voyzu-modules
```

For module development this points to the current `voyzu-modules` repository.

This keeps the platform source unchanged in both modes and allows the virgin and development setup paths to use the same runtime model.

## Git refs

The default branch is `main`. A branch or tag can be selected explicitly:

```shell
create-voyzu install my-voyzu --ref v0.1.0 --modules-ref v0.1.0
create-voyzu dev --ref v0.1.0
```

Environment variables are also supported:

```text
VOYZU_REPOSITORY
VOYZU_MODULES_REPOSITORY
VOYZU_REF
VOYZU_MODULES_REF
```

These make local testing and private/SSH GitHub repository URLs possible.

## Requirements

- Node.js 20 or later
- npm
- Git
- Internet access to GitHub and the npm registry for third-party dependencies
