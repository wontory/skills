# Changesets

Add a changeset with `bun run changeset` in any PR that changes published behavior.
When the PR is merged to main, the release workflow opens a "version packages" PR; merging that PR publishes to npm.
