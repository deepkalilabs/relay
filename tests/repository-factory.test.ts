import { describe, expect, it } from "vitest";
import {
  createWorkflowRepositoryResolver,
} from "@/server/infrastructure/storage/repository-factory";
import { FileWorkflowRepository } from "@/server/workflows/filesystem-repository";

describe("createWorkflowRepositoryResolver", () => {
  it("keeps development usable with local storage when Relay is not configured", async () => {
    const resolver = createWorkflowRepositoryResolver({}, { development: true });

    await expect(resolver.listWorkspaces()).resolves.toEqual({
      workspaces: [{ key: "local", name: "Local", source: "local" }],
      defaultKey: "local",
      namespaceWarning: "Relay namespaces are not configured.",
    });
    await expect(resolver.resolve("local")).resolves.toBeInstanceOf(FileWorkflowRepository);
  });

  it("requires Relay configuration in production", () => {
    expect(() => createWorkflowRepositoryResolver({}, { development: false }))
      .toThrow("REMOTE_STORAGE_BASE_URL");
  });

  it("rejects invalid or incomplete Relay configuration safely", () => {
    expect(() => createWorkflowRepositoryResolver({
      REMOTE_STORAGE_BASE_URL: "not a URL",
      REMOTE_STORAGE_BEARER_TOKEN: "secret",
    }, { development: true })).toThrow("REMOTE_STORAGE_BASE_URL");
    expect(() => createWorkflowRepositoryResolver({
      REMOTE_STORAGE_BASE_URL: "https://storage.example.test",
    }, { development: true })).toThrow("REMOTE_STORAGE_BEARER_TOKEN");
    expect(() => createWorkflowRepositoryResolver({
      REMOTE_STORAGE_BASE_URL: "https://user:password@storage.example.test/api?tenant=private",
      REMOTE_STORAGE_BEARER_TOKEN: "secret",
    }, { development: true })).toThrow("REMOTE_STORAGE_BASE_URL");
  });
});
