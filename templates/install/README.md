# {{PROJECT_NAME}}

This is a Git-backed Voyzu installation.

## First run

Set the PostgreSQL password and any local provider secrets in `.env.local`,
then start the development server:

```shell
npm run dev
```

Production startup builds first:

```shell
npm start
```

`.env.development`, `.env.local`, and `voyzu.instance.config.ts` belong to this
installation. Voyzu commands never overwrite them.

## Package repositories

The official package repository is cloned into:

```text
voyzu-package-repos/voyzu-packages
```

Clone another package repository:

```shell
npm exec voyzu -- clone repo https://github.com/example/fred-packages.git
```

Update all cloned package repositories:

```shell
npm exec voyzu -- pull-repos
```

Update one repository:

```shell
npm exec voyzu -- pull repo voyzu-packages
```

## Packages

Install a package by its npm name:

```shell
npm exec voyzu -- install @voyzu-packages/ice-creams
```

The command copies the package into `.run/voyzu-packages`, installs its npm
dependencies, runs the ordered SQL declared by `voyzu.package.ts`, and
recomposes the application.

Refresh every currently installed package from its cloned source:

```shell
npm exec voyzu -- install
```

Run a package script:

```shell
npm exec voyzu -- run @voyzu-packages/ice-creams sampleData
```
