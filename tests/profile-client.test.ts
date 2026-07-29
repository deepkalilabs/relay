import { afterEach, describe, expect, it, vi } from "vitest";
import {
  profileClient,
  type ProfileClient,
} from "@/features/profile";
import type { Profile, ProfileInput } from "@/shared/contracts/profile";

const input: ProfileInput = {
  name: "Work — US",
  identity: { fullName: "Alex Johnson", email: "alex@example.com" },
  location: { countryRegion: "United States", postalCode: "94103" },
};

const profile: Profile = {
  schemaVersion: "1.1",
  id: "b2f93d58-0ff2-4dcf-9cf4-07fe48bf95d5",
  ...input,
  status: "ready",
  revision: 1,
  createdAt: "2026-07-28T12:00:00.000Z",
  updatedAt: "2026-07-28T12:00:00.000Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("profile client", () => {
  it("lists summaries and loads a selected profile", async () => {
    const list = {
      profiles: [{
        id: profile.id,
        name: profile.name,
        status: profile.status,
        updatedAt: profile.updatedAt,
      }],
      invalidFileCount: 0,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(list), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(profile), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(profileClient.list()).resolves.toEqual(list);
    await expect(profileClient.get(profile.id)).resolves.toEqual(profile);
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/profiles/${profile.id}`);
  });

  it("uses POST for creation and revision-protected PUT and DELETE requests", async () => {
    const updated = { ...profile, revision: 2 };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(profile), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(updated), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(profileClient.create(input)).resolves.toEqual(profile);
    await expect(profileClient.save(profile.id, input, profile.revision)).resolves.toEqual(updated);
    await expect(profileClient.delete(profile.id, updated.revision)).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/profiles", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ profile: input }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, `/api/profiles/${profile.id}`, expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({ profile: input, expectedRevision: profile.revision }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, `/api/profiles/${profile.id}`, expect.objectContaining({
      method: "DELETE",
      body: JSON.stringify({ expectedRevision: updated.revision }),
    }));
  });

  it("exposes conflicts with their status and safe server message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: "The profile changed since it was loaded." }),
      { status: 409, headers: { "content-type": "application/json" } },
    )));

    const client: ProfileClient = profileClient;
    await expect(client.save(profile.id, input, 1)).rejects.toMatchObject({
      status: 409,
      message: "The profile changed since it was loaded.",
    });
  });
});
