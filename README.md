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
npm run build
npm run start
```

## Voyzu Modules development

Add these scripts to the root `package.json` in `voyzu-modules`:

```json
{
  "scripts": {
    "create-dev": "npm exec --yes --package=github:chrisjameslennon/create-voyzu#main -- create-voyzu dev",
    "dev": "npm --prefix .dev/voyzu run dev",
    "build": "npm --prefix .dev/voyzu run build"
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
│  └─ voyzu/
└─ packages/
   └─ @voyzu-modules/
```

The development setup:

1. Adds `/.dev/` to the current repository's `.gitignore` when necessary.
2. Shallow-clones Voyzu into `.dev/voyzu`.
3. Removes `.dev/voyzu/.git`.
4. Links `.dev/voyzu/packages/@voyzu-modules` directly to the current
   `packages/@voyzu-modules` directory.
5. Runs `npm install` inside `.dev/voyzu`.
6. Runs the Next.js application from `.dev/voyzu`.

The downloaded Voyzu source is not rewritten or rearranged. The only source-tree
addition is the filesystem link that recreates the combined package layout.

To recreate the runtime:

```shell
npm run create-dev -- --force
```

## Combined filesystem layout

Voyzu Platform and Voyzu Modules retain their existing package and import
structure.

```text
<voyzu-runtime>/packages/@voyzu-modules
```

For a virgin installation, the module directory is copied into the Voyzu
runtime. This makes production builds portable across Git, deployment tools,
archives, containers, and operating systems.

For module development, the current `voyzu-modules/packages/@voyzu-modules`
directory is linked into `.dev/voyzu/packages/@voyzu-modules`. Windows uses a
directory junction; macOS and Linux use a symbolic link. Edits are therefore
immediately visible to the development application.

No environment-based module loader or discovery mechanism is used.

## Git refs

With no explicit ref, each Git repository's default branch is used. A branch or
tag can be selected explicitly:

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
