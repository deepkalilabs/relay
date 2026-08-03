import { FileProfileRepository } from "@/server/profiles/filesystem-repository";
import { RemoteProfileRepository } from "@/server/profiles/http-repository";
import type { ProfileRepository } from "@/server/profiles/repository";
import { FileWorkflowRepository } from "@/server/workflows/filesystem-repository";
import { RemoteWorkflowRepository } from "@/server/workflows/http-repository";
import type { WorkflowRepository } from "@/server/workflows/repository";

export interface RepositorySet {
  profileRepository: ProfileRepository;
  workflowRepository: WorkflowRepository;
}

export function createRepositories(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): RepositorySet {
  const dataSource = environment.DATA_SOURCE || "filesystem";
  if (dataSource === "filesystem") {
    return {
      profileRepository: new FileProfileRepository(),
      workflowRepository: new FileWorkflowRepository(),
    };
  }
  if (dataSource !== "remote") {
    throw new Error('DATA_SOURCE must be either "filesystem" or "remote".');
  }

  const baseUrl = environment.REMOTE_STORAGE_BASE_URL;
  if (!baseUrl) throw new Error("REMOTE_STORAGE_BASE_URL is required when DATA_SOURCE=remote.");
  let parsedBaseUrl: URL;
  try {
    parsedBaseUrl = new URL(baseUrl);
  } catch {
    throw new Error("REMOTE_STORAGE_BASE_URL must be a valid HTTP or HTTPS URL.");
  }
  if (parsedBaseUrl.protocol !== "http:" && parsedBaseUrl.protocol !== "https:") {
    throw new Error("REMOTE_STORAGE_BASE_URL must be a valid HTTP or HTTPS URL.");
  }
  if (parsedBaseUrl.username || parsedBaseUrl.password || parsedBaseUrl.search || parsedBaseUrl.hash) {
    throw new Error("REMOTE_STORAGE_BASE_URL must not include credentials, query parameters, or a fragment.");
  }
  if (!parsedBaseUrl.pathname.endsWith("/")) parsedBaseUrl.pathname += "/";

  const bearerToken = environment.REMOTE_STORAGE_BEARER_TOKEN;
  if (!bearerToken?.trim()) {
    throw new Error("REMOTE_STORAGE_BEARER_TOKEN is required when DATA_SOURCE=remote.");
  }

  return {
    profileRepository: new RemoteProfileRepository(parsedBaseUrl.toString(), bearerToken.trim()),
    workflowRepository: new RemoteWorkflowRepository(parsedBaseUrl.toString(), bearerToken.trim()),
  };
}
