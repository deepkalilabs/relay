import type { Profile, ProfileInput } from "@/shared/contracts/profile";

export interface ProfileListResult {
  profiles: Profile[];
  invalidFileCount: number;
}

export interface ProfileRepository {
  list(): Promise<ProfileListResult>;
  create(input: ProfileInput): Promise<Profile>;
  get(id: string): Promise<Profile>;
  save(id: string, input: ProfileInput, expectedRevision: number): Promise<Profile>;
  delete(id: string, expectedRevision: number): Promise<void>;
}
