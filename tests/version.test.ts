import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { FALLBACK_VERSION, resolveVersion } from "../src/version.js";

describe("resolveVersion", () => {
  it("reports the version from package.json when it is resolvable", () => {
    const { version } = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );

    expect(resolveVersion()).toBe(version);
    expect(resolveVersion()).not.toBe(FALLBACK_VERSION);
  });
});
