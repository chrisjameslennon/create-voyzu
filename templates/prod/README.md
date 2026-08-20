# {{PROJECT_NAME}}

This is a Git-backed Voyzu installation.

The platform runtime tracks only the Voyzu `main` branch.

## First run

Set the PostgreSQL password and any local provider secrets in `.env.local`,
then start the development server:

```shell
npm run voyzu:dev
```

Production startup builds first. Both commands are available:

```shell
npm start
npm run voyzu:start
```

`.env.local` belongs to this installation. Voyzu commands never overwrite it.

## Update Voyzu

Fast-forward the downloaded Voyzu platform and build it:

```shell
npm run voyzu:update
```

Restart the web server after the command completes.

## Package repositories

`.package-sources` is initially empty. Repositories are downloaded when a
package is explicitly installed or when `voyzu:add-repo` is run.

Downloaded repositories expose packages beneath
`packages/@publisher/package-name`. The `package.json` name must match that
scope and directory.

Clone another package repository:

```shell
npm run voyzu:add-repo https://github.com/example/fred-packages.git
```

Add a repository and immediately install one package from it:

```shell
npm run voyzu:install https://github.com/example/fred-packages.git @fred-packages/example
```

Update all cloned package repositories:

```shell
npm run voyzu:update-repos
```

Update one repository:

```shell
npm run voyzu:update-repo voyzu-packages
```

## Packages

Initialize the preinstalled Voyzu platform after configuring `.env.local`:

```shell
npm run voyzu:initialize
```

Install a package by its npm name:

```shell
npm run voyzu:install https://github.com/chrisjameslennon/voyzu-packages.git @voyzu/ice-creams
```

The command copies the package into `.run/packages`, installs its npm
dependencies, runs the ordered SQL declared by `voyzu.package.ts`, and
recomposes the application.

Reinstall one package from its already downloaded source:

```shell
npm run voyzu:install-package @voyzu/ice-creams
```

Uninstall a package after stopping the Voyzu web server:

```shell
npm run voyzu:uninstall-package @voyzu/ice-creams
```

The command runs the package's uninstall SQL, removes its copy from
`.run/packages`, and recomposes the application. Package audit records remain.

List the packages currently installed beneath `.run/packages`:

```shell
npm run voyzu:list-packages
```

Run a package script:

```shell
npm run voyzu:run-script @voyzu/ice-creams sampleData
```
