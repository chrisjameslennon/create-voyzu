# Voyzu Packages Development Runtime

This disposable development runtime installs Voyzu beneath `.run`. Packages
being developed are linked from the repository's `packages` workspace.

Run development commands from the `voyzu-packages` repository root:

```shell
npm run voyzu:initialize
npm run voyzu:link-package -- @voyzu/ice-creams
npm run voyzu:list-packages
npm run dev
npm run build
```
