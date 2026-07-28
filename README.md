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
│  ├─ voyzu-packages/
│  └─ package.json
├─ voyzu-package-repos/
│  └─ voyzu-packages/
├─ .env.development
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
npm run dev
```

The project-local CLI requires no global install:

```shell
npm exec voyzu -- --help
npm exec voyzu -- install @voyzu-packages/ice-creams
```

The root environment and instance configuration files are installation-owned.
Neither create-voyzu nor the Voyzu CLI overwrites them after creation.

## Repository and package commands

```shell
npm exec voyzu -- clone repo https://github.com/example/fred-packages.git
npm exec voyzu -- pull-repos
npm exec voyzu -- pull repo fred-packages
npm exec voyzu -- install @fred-packages/example
npm exec voyzu -- compose
npm exec voyzu -- run @fred-packages/example sampleData
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

The existing special development bootstrap remains available:

```shell
create-voyzu dev
```

## Requirements

- Node.js 20 or later
- npm
- Git
