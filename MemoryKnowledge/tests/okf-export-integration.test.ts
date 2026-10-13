import { it, expect, vi } from "vitest";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

it("the actual bundle exporter refuses an oversized file before readFileSync allocation", async () => {
  const root = fs.mkdtempSync(join(tmpdir(), "export-boundary-"));
  const file = join(root, "large.bin"); fs.writeFileSync(file, ""); fs.truncateSync(file, 64 * 1024 * 1024);
  const original = fs.readFileSync; let bytes = 0;
  vi.spyOn(fs, "readFileSync").mockImplementation(((...args: any[]) => {
    const data = (original as any)(...args); if (String(args[0]) === file) bytes = data.length; return data;
  }) as typeof fs.readFileSync);
  syncBuiltinESMExports();
  try {
    const { exportBundle, BundleValidationError } = await import("../src/engines/wiki/okf-bundle.js");
    expect(() => exportBundle(root)).toThrow(BundleValidationError); expect(bytes).toBe(0);
  } finally {
    vi.restoreAllMocks(); syncBuiltinESMExports(); fs.rmSync(root, { recursive: true, force: true });
  }
});
