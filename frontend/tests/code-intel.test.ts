// @vitest-environment node

import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");

describe("Ralph code-intelligence service", () => {
  it("loads ast-grep and SolidLSP and answers a structural smoke request", () => {
    const result = spawnSync(
      resolve(projectRoot, ".venv/bin/python"),
      [resolve(projectRoot, "tools/ralph_code_intel.py"), "--smoke"],
      { cwd: projectRoot, encoding: "utf8" },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      astMatch: "value",
      solidlspAvailable: true,
    });
  });

  it("registers the localhost service in project-scoped Codex config", () => {
    const config = readFileSync(
      resolve(projectRoot, ".codex/config.toml"),
      "utf8",
    );

    expect(config).toContain("[mcp_servers.ralph-code-intel]");
    expect(config).toContain('url = "http://127.0.0.1:8765/mcp"');
    expect(config).toContain("required = false");
  });
});
