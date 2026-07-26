# create-voyzu

Creates Voyzu installations and module-development runtimes directly from GitHub. Voyzu itself does not need to be published to the npm registry.

`npm exec` is used only to run this GitHub-hosted CLI. The CLI then obtains `voyzu` and `voyzu-modules` using Git.

## Create a virgin installation

```shell
npm exec --yes --package=github:chrisjameslennon/create-voyzu#main -- create-voyzu install my-voyzu
```

The shorter form is also supported:

```shell
npm exec --yes --package=github:chrisjameslennon/create-voyzu#main -- create-voyzu my-voyzu
```

This creates:

```text
my-voyzu/
├─ .run/
│  ├─ voyzu/
│  └─ voyzu-modules/
├─ scripts/
│  ├─ update-voyzu.mjs
│  └─ re-install-voyzu.mjs
├─ package.json
└─ README.md
```

Both GitHub repositories are shallow-cloned and retain their `.git` directories
so live installations can pull updates. The generated project is also
initialised as its own Git repository with no remote.

The `.run` directory is intentionally **not** ignored. It is the source used by development and production builds.

```shell
cd my-voyzu
npm start
```

The start command builds Voyzu before launching the production server.

Update a stopped live installation with:

```shell
npm run update
npm start
```

The updater pulls both shallow checkouts with `--ff-only`, recopies Voyzu
Modules into Voyzu, and reinstalls platform dependencies. Ignored, untracked
configuration such as `.env.local` remains in place during an in-place pull.

To discard and recreate a live runtime, run `npm run re-install`. This removes
`.run` and then uses the updater to clone both repositories again.

## Voyzu Modules development

Add these scripts to the root `package.json` in `voyzu-modules`:

```json
{
  "scripts": {
    "create-dev": "npm exec --yes --package=github:chrisjameslennon/create-voyzu#main -- create-voyzu dev",
    "re-install": "npm run create-dev -- --force",
    "dev": "npm --prefix .dev run dev",
    "build": "npm --prefix .dev run build"
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
│  ├─ package.json
│  └─ README.md
└─ packages/
   └─ @voyzu-modules/
```

The development setup:

1. Shallow-clones Voyzu into `.dev/voyzu`.
2. Removes `.dev/voyzu/.git`.
3. Links `.dev/voyzu/packages/@voyzu-modules` directly to the current
   `packages/@voyzu-modules` directory.
4. Generates `.dev/package.json` and `.dev/README.md` from development
   templates.
5. Runs `npm install` inside `.dev/voyzu`.
6. Runs the Next.js application through `.dev/package.json`.

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
