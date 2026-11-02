# pages-common

Shared code for Alex's GitHub Pages sites (alexknight0.github.io/*).

## update.js: the update light

A green dot when the device runs the latest deploy, an orange "Update" pill when it doesn't, a
hollow grey dot when it couldn't check. Besides comparing versions, it hashes every app file in
the browser's cache against the live hashes in `version.js`, so a mix of old and new files
(possible for 10 minutes after a deploy, because Pages sets `max-age=600`) also shows Update.

Sites load a pinned release from jsDelivr, so the file never changes under them:

```js
const { initUpdateLight } = await import("https://cdn.jsdelivr.net/gh/alexknight0/pages-common@1.0.0/update.js");
initUpdateLight({ version: VERSION, buttons: "#version", report: setStatus, beforeUpdate: save });
```

Use a dynamic `import()` with a `.catch`, so the site still works if jsDelivr is unreachable.
Options are documented at `initUpdateLight` in update.js.

## pre-commit: stamps version.js

Writes `VERSION` (commit time) and `VERSION_FILES` (SHA-256 of each tracked top-level
.html/.js/.css/.webmanifest/.svg file, staged content) into the site's `version.js`.
Each site has `tools/pre-commit` that runs this one, and `.git/hooks/pre-commit` links to it:

```sh
ln -sf ../../tools/pre-commit .git/hooks/pre-commit
```

## Releasing

1. Change update.js, test it on a site (tests route the jsDelivr URL to the local file).
2. Commit, `git tag 1.x.y`, `git push --tags`.
3. Bump the version in each site's import (`tools/bump-sites.sh 1.x.y` does all of them).
