# Bounded filesystem bundle export

`MemoryKnowledge/src/engines/wiki/okf-bundle-export.ts` adds an independently
usable filesystem exporter for native OKF exchange. It preserves visible file
bytes and relative paths in base64 transport entries. The module uses only Node
built-ins, requires no new dependency and does not fetch URLs, invoke models,
execute file contents, create routes or change stored data.

## API

```ts
import { exportBundle, BundleExportError }
  from "./src/engines/wiki/okf-bundle-export.js";

try {
  const files = exportBundle("/path/to/an/owned/immutable-wiki-snapshot");
  // Apply independent format preflight and transport/authorization policies.
} catch (error) {
  if (error instanceof BundleExportError) console.log(error.kind);
  else throw error;
}
```

The result contains `{ path, content, encoding: "base64" }` entries sorted by
relative path. An empty directory produces `[]`; empty regular files are allowed.
`BundleExportError.kind` distinguishes `budget`, `filesystem` and `path` failures.
Filesystem failures use generic messages rather than disclosing configured
absolute roots. Callers should retain their own appropriately scoped diagnostics.

## File and byte limits

Export permits at most 1000 regular files and 10 MiB of decoded content in total.
The next file is opened with `O_NOFOLLOW | O_NONBLOCK`, checked with `fstat`, and
refused before content reads if its size exceeds the remaining budget. Regular
files are read in chunks of at most 64 KiB. A single sentinel byte detects
over-budget growth after `fstat`; at most the remaining budget plus one byte is
read for that file. Descriptors are closed after success or refusal. The 1001st
file is refused before opening it.

Pre-existing visible symlinks, nonregular entries and symlinked roots/directories
are rejected. Hidden names are skipped without exporting private application
state; this is not a classifier for sensitive data in visible files. ASCII
control characters, backslashes and colons in visible filenames are refused
rather than renamed. Directory traversal is iterative, not recursively dependent
on the JavaScript call stack. Platforms lacking the checked-open flags cannot
export regular files through this helper. Linux is the verified target.

## Installation, migration and tests

This module fits the existing Knowledge source build without package changes.
The existing native export path delegates to this helper; route names and file
entry shapes are unchanged. Applications
may compose its structural file entries with a separately reviewed bundle
preflight validator. YAML schema, reserved-file rules, normalized aliases,
actor/freshness semantics, transport, authentication and durable recovery are
separate concerns. No data migration or automatic rewriting is performed.

```sh
cd MemoryKnowledge
npm test -- tests/okf-bundle-export.test.ts
```

Fifteen synthetic Linux Node 22 cases cover nested UTF-8/binary byte equality,
empty files/directories, exact limits, sparse oversized files rejected before
content reads, remaining aggregate budgets, real file growth during export,
file-count refusal, filename policy, symlinks, FIFO refusal, a leaf-link swap,
a FIFO replacement in a bounded subprocess, and sanitized errors. Filesystem
reads and file mutations are real; selected
Node function interception makes growth/open races deterministic. Tests run as
a non-root user without networking or production volumes.

## Real limits

Use a trusted root and protected ancestors, coordinate writers, and prefer an
immutable snapshot for consistent exports. Leaf `O_NOFOLLOW` is not protection
against ancestor-directory replacement or all filesystem races. Same-size edits
and truncation can yield a changed or mixed view; this helper does not provide a
cross-file transaction or an authenticated tenant boundary.

The payload budget does not bound all base64/JSON overhead, directory-entry
arrays, traversal metadata or concurrent requests. It does not guarantee
absence of vulnerabilities or establish native dependency trust. Complete
application/secret-provider recovery and independent final review remain
separate from these file-read tests.

The integrated service passes strict typechecking, its build and all 333
Knowledge tests across 23 files on Linux Node 22 with the prepared dependency
fixture. An additional actual-exporter regression verifies that a sparse 64 MiB
file is rejected without the preceding whole-file `readFileSync` allocation.
The existing whole-tree precheck remains in place; its traversal and concurrent
writer limitations are not removed by the bounded content reader.
