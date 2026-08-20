# Voyzu Packages Development Runtime

This disposable development runtime installs Voyzu beneath `.run`. Packages
being developed are copied from the repository's `packages` workspace into
`.run/packages` and kept synchronized while `npm run dev` is running.
The platform repository and branch are configured in the root `package.json`.
`npm run voyzu:update` switches the disposable checkout to that branch before
fast-forwarding it.

Configure the database connection in the repository root `.env.local`, then
run development commands from that repository root:

```shell
npm run voyzu:initialize
npm run voyzu:create-package "@acme/customer orders"
npm run voyzu:link-package @voyzu/ice-creams
npm run voyzu:list-packages
npm run dev
npm run build
```

Stop `npm run dev` before uninstalling a package so its runtime copy is no
longer being mirrored, then run:

```shell
npm run voyzu:uninstall-package @voyzu/ice-creams
```
