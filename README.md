# create-voyzu

Creates a Git-backed Voyzu installation directly from GitHub.

## Create an installation

PowerShell:

```powershell
npm exec --yes --package=github:chrisjameslennon/create-voyzu#main -- create-voyzu install my-voyzu
```

macOS, Linux, and other shells use the same command:

```shell
npm exec --yes --package=github:chrisjameslennon/create-voyzu#main -- create-voyzu install my-voyzu
```

The generated structure is:

```text
my-voyzu/
├─ .run/
│  ├─ voyzu/
│  ├─ packages/
│  └─ package.json
├─ voyzu-package-repos/
│  └─ voyzu-packages/
├─ .env.local
├─ package.json
├─ README.md
└─ voyzu.instance.config.ts
```

Voyzu and the official package repository are shallow Git clones. External
packages are not installed automatically.

Set local database credentials in `.env.local`, then:

```shell
cd my-voyzu
npm run voyzu:dev
```

Voyzu operations are exposed as project-local npm scripts:

```shell
npm run voyzu:initialize
npm run voyzu:install -- https://github.com/chrisjameslennon/voyzu-packages.git @voyzu/ice-creams
npm run voyzu:compose
```

The root environment file and instance configuration file are installation-owned.
Neither create-voyzu nor the Voyzu CLI overwrites them after creation.

## Repository and package commands

```shell
npm run voyzu:add-repo -- https://github.com/example/fred-packages.git
npm run voyzu:install -- https://github.com/example/fred-packages.git @fred-packages/example
npm run voyzu:refresh
npm run voyzu:refresh-repos
npm run voyzu:refresh-repo -- fred-packages
npm run voyzu:install -- https://github.com/example/fred-packages.git @fred-packages/example
npm run voyzu:compose
npm run voyzu:run -- @fred-packages/example sampleData
```

## Git refs and local testing

```shell
create-voyzu install my-voyzu --ref v0.1.0 --packages-ref v0.1.0
```

Environment overrides:

```text
VOYZU_REPOSITORY
VOYZU_PACKAGES_REPOSITORY
VOYZU_REF
VOYZU_PACKAGES_REF
```

`VOYZU_MODULES_REPOSITORY`, `VOYZU_MODULES_REF`, and `--modules-ref` remain
temporary compatibility aliases.

## Package development runtime

Run the development bootstrap from the root of a `voyzu-packages` working
repository:

```shell
npm exec --yes --package=github:chrisjameslennon/create-voyzu#main -- create-voyzu dev
npm run voyzu:initialize
npm run voyzu:install-package -- @voyzu/ice-creams --link
npm run dev
```

Voyzu is downloaded into `.run/voyzu`. Installed packages are linked from the
working repository into `.run/packages`, so package source edits are
available to the Next.js development server immediately.

## Requirements

- Node.js 20 or later
- npm
- Git
