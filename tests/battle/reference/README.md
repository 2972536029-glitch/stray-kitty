# Historical preview references

These files retain the independent L00 preview's pure reward rules and browser-storage
transaction model so that all 176 original battle tests remain available after migration.
They are test references, not production inventory, reward settlement, or persistence code.

- `rewards.ts` is exercised by 4 reward-rule tests.
- `warehouse.ts` is exercised by 16 preview-warehouse tests using in-memory storage.
- The remaining 156 tests exercise the production L00 module under
  `web/src/modules/battle/l00`.

The reference implementations come from independent battle commit
`38545c3b9b93698b3a2cbbc23608c51e192388cc`. Only their imports and these boundary comments
were adapted. Production modules must not import this directory. In particular, the
browser preview's localStorage records, random reward draws, and first-clear bookkeeping
must not be treated as authoritative account inventory or server receipts.

Run the complete migrated suite from the repository root:

```sh
node node_modules/tsx/dist/cli.mjs --test tests/battle/*.test.ts
```

These 176 tests do not establish production server settlement correctness, React lifecycle
behavior, CSS isolation, or browser interaction behavior; those require the main project's
integration and browser checks.
