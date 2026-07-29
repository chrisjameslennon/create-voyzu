# {{PROJECT_NAME}}

This is a Git-backed Voyzu installation.

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

`.env.local` and `voyzu.instance.config.ts` belong to this installation. Voyzu
commands never overwrite them.

## Update Voyzu

Fast-forward the downloaded Voyzu platform and build it:

```shell
npm run voyzu:refresh
```

Restart the web server after the command completes.

## Package repositories

The official package repository is cloned into:

```text
voyzu-package-repos/voyzu-packages
```

Clone another package repository:

```shell
npm run voyzu:add-repo -- https://github.com/example/fred-packages.git
```

Add a repository and immediately install one package from it:

```shell
npm run voyzu:install -- https://github.com/example/fred-packages.git @fred-packages/example
```

Update all cloned package repositories:

```shell
npm run voyzu:refresh-repos
```

Update one repository:

```shell
npm run voyzu:refresh-repo -- voyzu-packages
```

## Packages

Initialize the preinstalled Voyzu platform after configuring `.env.local`:

```shell
npm run voyzu:initialize
```

Install a package by its npm name:

```shell
npm run voyzu:install -- https://github.com/chrisjameslennon/voyzu-packages.git @voyzu/ice-creams
```

The command copies the package into `.run/packages`, installs its npm
dependencies, runs the ordered SQL declared by `voyzu.package.ts`, and
recomposes the application.

Refresh every currently installed package from its cloned source:

```shell
npm run voyzu:install-package
```

Run a package script:

```shell
npm run voyzu:run -- @voyzu/ice-creams sampleData
```
