# Voyzu Packages Development Runtime

This disposable development runtime installs Voyzu beneath `.run` and links installed
packages directly to the parent `voyzu-packages` working tree.

Run development commands from the `voyzu-packages` repository root:

```shell
npm run voyzu:initialize
npm run voyzu:install-package -- @voyzu-packages/ice-creams --link
npm run dev
npm run build
npm run typecheck
```
