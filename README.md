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
├─ .package-sources/
├─ .env.local
├─ package.json
└─ README.md
```

Voyzu is a shallow Git clone. Package repositories are downloaded only when a
package is explicitly installed.

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

The root environment file is installation-owned. Neither create-voyzu nor Voyzu
package commands overwrite it after creation.

## Repository and package commands

```shell
npm run voyzu:add-repo -- https://github.com/example/fred-packages.git
npm run voyzu:install -- https://github.com/example/fred-packages.git @fred-packages/example
npm run voyzu:update
npm run voyzu:update-repos
npm run voyzu:update-repo -- fred-packages
npm run voyzu:install -- https://github.com/example/fred-packages.git @fred-packages/example
npm run voyzu:list-packages
npm run voyzu:compose
npm run voyzu:run-script -- @fred-packages/example sampleData
```

## Git refs and local testing

```shell
create-voyzu install my-voyzu --ref v0.1.0
```

Environment overrides:

```text
VOYZU_REPOSITORY
VOYZU_REF
```

## Package development runtime

Run the development bootstrap from the root of a Voyzu package-development
repository:

```shell
npm exec --yes --package=github:chrisjameslennon/create-voyzu#main -- create-voyzu dev
npm run voyzu:initialize
npm run voyzu:link-package -- @voyzu/ice-creams
npm run dev
```

If the root `package.json` or `packages/` directory does not exist,
`create-voyzu dev` creates it. Existing files and package source are preserved.

Voyzu is downloaded into `.run/voyzu`. Despite its retained name,
`voyzu:link-package` installs a physical development copy from the working
repository's `packages` directory into `.run/packages`. While `npm run dev` is
running, Voyzu watches matching source packages and mirrors file changes into
their runtime copies. Git-installed packages remain unchanged copies.

## Requirements

- Node.js 20 or later
- npm
- Git
