# create-voyzu

Creates a new Voyzu application from the `chrisjameslennon/voyzu` GitHub repository.

## Intended command after publishing

```bash
npm create voyzu@latest my-voyzu
```

This is equivalent to running the `create-voyzu` executable.

## What it does

1. Downloads the `main` branch of `chrisjameslennon/voyzu` as a GitHub archive.
2. Extracts the application into the requested directory.
3. Runs `npm install`.
4. Runs `git init`.
5. Prints the commands needed to start development.

The generated Git repository has no remote configured.

## Local testing

From this repository:

```bash
npm link
create-voyzu test-voyzu
```

Or run the executable directly:

```bash
node ./bin/create-voyzu.js test-voyzu
```

To remove the global link later:

```bash
npm unlink --global create-voyzu
```

## Publishing

Sign in to npm:

```bash
npm login
```

Check what will be published:

```bash
npm pack --dry-run
```

Publish:

```bash
npm publish
```

After publication:

```bash
npm create voyzu@latest my-voyzu
```

## Requirements

- Node.js 20 or later
- npm
- Git
- `tar` available on the command line
- Internet access to GitHub and npm

## Current defaults

```text
GitHub owner: chrisjameslennon
Repository:   voyzu
Branch:       main
```

These values are defined at the top of `bin/create-voyzu.js`.
