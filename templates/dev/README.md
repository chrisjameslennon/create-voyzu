# Voyzu Packages Development Runtime

This disposable runtime installs Voyzu beneath `.dev` and links installed
packages directly to the parent `voyzu-packages` working tree.

Run development commands from the `voyzu-packages` repository root:

```shell
npm run voyzu -- install @voyzu-packages/ice-creams --link
npm run dev
npm run build
npm run typecheck
```
