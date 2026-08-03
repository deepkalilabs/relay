import { describe, expect, it } from "vitest";
import { createRepositories } from "@/server/infrastructure/storage/repository-factory";
import { FileProfileRepository } from "@/server/profiles/filesystem-repository";
import { RemoteProfileRepository } from "@/server/profiles/http-repository";
import { FileWorkflowRepository } from "@/server/workflows/filesystem-repository";
import { RemoteWorkflowRepository } from "@/server/workflows/http-repository";

describe("createRepositories", () => {
  it("defaults to filesystem repositories", () => {
    const repositories = createRepositories({});

    expect(repositories.profileRepository).toBeInstanceOf(FileProfileRepository);
    expect(repositories.workflowRepository).toBeInstanceOf(FileWorkflowRepository);
  });

  it("constructs both remote repositories from validated configuration", () => {
    const repositories = createRepositories({
      DATA_SOURCE: "remote",
      REMOTE_STORAGE_BASE_URL: "https://storage.example.test/api/",
      REMOTE_STORAGE_BEARER_TOKEN: "secret",
    });

    expect(repositories.profileRepository).toBeInstanceOf(RemoteProfileRepository);
    expect(repositories.workflowRepository).toBeInstanceOf(RemoteWorkflowRepository);
  });

  it("rejects invalid modes and incomplete remote configuration safely", () => {
    expect(() => createRepositories({ DATA_SOURCE: "database" })).toThrow("DATA_SOURCE");
    expect(() => createRepositories({ DATA_SOURCE: "remote" })).toThrow("REMOTE_STORAGE_BASE_URL");
    expect(() => createRepositories({
      DATA_SOURCE: "remote",
      REMOTE_STORAGE_BASE_URL: "not a URL",
      REMOTE_STORAGE_BEARER_TOKEN: "secret",
    })).toThrow("REMOTE_STORAGE_BASE_URL");
    expect(() => createRepositories({
      DATA_SOURCE: "remote",
      REMOTE_STORAGE_BASE_URL: "https://storage.example.test",
    })).toThrow("REMOTE_STORAGE_BEARER_TOKEN");
    expect(() => createRepositories({
      DATA_SOURCE: "remote",
      REMOTE_STORAGE_BASE_URL: "https://user:password@storage.example.test/api?tenant=private",
      REMOTE_STORAGE_BEARER_TOKEN: "secret",
    })).toThrow("REMOTE_STORAGE_BASE_URL");
  });
});
