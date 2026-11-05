# ADR 0005: The licence

- **Status:** accepted
- **Date:** 2026-11-05

## Context

The first code landed without a licence, because a licence is the maintainers' choice (Q-44). Every smalt repository
is MIT, with the copyright held by its contributors (`Copyright (c) 2026 smaltdb contributors`).

## Decision

smaltfl is MIT-licensed, `Copyright (c) 2026 smaltfl contributors`, as the rest of the family is. (Q-44)

## Consequences

- `LICENSE` is in the repository and in the package's files, and `package.json` says `"license": "MIT"`.
- The package stays `private` until its first publish, as `@smaltworks/smaltfl` (ARCHITECTURE.md §11), so it can't be
  published by accident before then.
