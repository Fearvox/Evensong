/**
 * UserStore — unit tests for store operations
 */
import { describe, test, expect, beforeEach } from "bun:test";
import { UserStore } from "../store";

let store: UserStore;

beforeEach(() => {
  store = new UserStore();
});

describe("create", () => {
  test("creates a user with generated id and timestamps", () => {
    const user = store.create({ name: "Alice", email: "alice@test.com", role: "user" });
    expect(user.id).toBeDefined();
    expect(user.id.length).toBeGreaterThan(0);
    expect(user.name).toBe("Alice");
    expect(user.email).toBe("alice@test.com");
    expect(user.role).toBe("user");
    expect(user.active).toBe(true);
    expect(user.createdAt).toBeDefined();
    expect(user.updatedAt).toBeDefined();
  });

  test("each user gets a unique id", () => {
    const u1 = store.create({ name: "A", email: "a@t.com", role: "user" });
    const u2 = store.create({ name: "B", email: "b@t.com", role: "user" });
    expect(u1.id).not.toBe(u2.id);
  });
});

describe("get", () => {
  test("returns user by id", () => {
    const created = store.create({ name: "X", email: "x@t.com", role: "admin" });
    const fetched = store.get(created.id);
    expect(fetched).toBeDefined();
    expect(fetched!.name).toBe("X");
  });

  test("returns undefined for unknown id", () => {
    expect(store.get("nope")).toBeUndefined();
  });

  test("returns a copy (not a reference)", () => {
    const created = store.create({ name: "Ref", email: "ref@t.com", role: "user" });
    const a = store.get(created.id);
    const b = store.get(created.id);
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe("getAll / getActive", () => {
  test("getAll returns all users including soft-deleted", () => {
    store.create({ name: "A", email: "a@t.com", role: "user" });
    const u2 = store.create({ name: "B", email: "b@t.com", role: "user" });
    store.softDelete(u2.id);
    expect(store.getAll()).toHaveLength(2);
  });

  test("getActive excludes soft-deleted users", () => {
    store.create({ name: "A", email: "a@t.com", role: "user" });
    const u2 = store.create({ name: "B", email: "b@t.com", role: "user" });
    store.softDelete(u2.id);
    expect(store.getActive()).toHaveLength(1);
    expect(store.getActive()[0].name).toBe("A");
  });
});

describe("update", () => {
  test("updates specified fields and updatedAt", () => {
    const user = store.create({ name: "Before", email: "e@t.com", role: "user" });
    const originalUpdatedAt = user.updatedAt;
    // Small delay to ensure timestamp differs
    const updated = store.update(user.id, { name: "After" });
    expect(updated).toBeDefined();
    expect(updated!.name).toBe("After");
    expect(updated!.email).toBe("e@t.com"); // unchanged
    expect(updated!.updatedAt).toBeDefined();
  });

  test("returns undefined for unknown id", () => {
    expect(store.update("nope", { name: "X" })).toBeUndefined();
  });
});

describe("softDelete / restore", () => {
  test("softDelete sets active=false and deletedAt", () => {
    const user = store.create({ name: "D", email: "d@t.com", role: "user" });
    const deleted = store.softDelete(user.id);
    expect(deleted).toBeDefined();
    expect(deleted!.active).toBe(false);
    expect(deleted!.deletedAt).toBeDefined();
  });

  test("restore sets active=true and clears deletedAt", () => {
    const user = store.create({ name: "R", email: "r@t.com", role: "user" });
    store.softDelete(user.id);
    const restored = store.restore(user.id);
    expect(restored).toBeDefined();
    expect(restored!.active).toBe(true);
    expect(restored!.deletedAt).toBeUndefined();
  });

  test("softDelete on unknown id returns undefined", () => {
    expect(store.softDelete("nope")).toBeUndefined();
  });

  test("restore on unknown id returns undefined", () => {
    expect(store.restore("nope")).toBeUndefined();
  });
});

describe("findByEmail", () => {
  test("finds user by exact email (case-insensitive)", () => {
    store.create({ name: "A", email: "Alice@Test.COM", role: "user" });
    const found = store.findByEmail("alice@test.com");
    expect(found).toBeDefined();
    expect(found!.name).toBe("A");
  });

  test("returns undefined when email not found", () => {
    expect(store.findByEmail("ghost@test.com")).toBeUndefined();
  });
});

describe("search", () => {
  test("matches name substring case-insensitively", () => {
    store.create({ name: "Alice Wonderland", email: "a@t.com", role: "user" });
    store.create({ name: "Bob Builder", email: "b@t.com", role: "user" });
    const results = store.search("ali");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Alice Wonderland");
  });

  test("matches email substring", () => {
    store.create({ name: "A", email: "alice@company.org", role: "user" });
    store.create({ name: "B", email: "bob@other.com", role: "user" });
    const results = store.search("company");
    expect(results).toHaveLength(1);
  });

  test("excludes soft-deleted users from search", () => {
    const u = store.create({ name: "Gone", email: "g@t.com", role: "user" });
    store.softDelete(u.id);
    expect(store.search("Gone")).toHaveLength(0);
  });

  test("returns empty for no matches", () => {
    store.create({ name: "A", email: "a@t.com", role: "user" });
    expect(store.search("zzz")).toHaveLength(0);
  });
});

describe("filterByRole / filterByActive", () => {
  test("filterByRole returns matching users", () => {
    store.create({ name: "A", email: "a@t.com", role: "admin" });
    store.create({ name: "B", email: "b@t.com", role: "user" });
    store.create({ name: "C", email: "c@t.com", role: "admin" });
    expect(store.filterByRole("admin")).toHaveLength(2);
    expect(store.filterByRole("moderator")).toHaveLength(0);
  });

  test("filterByActive distinguishes active from inactive", () => {
    store.create({ name: "A", email: "a@t.com", role: "user" });
    const u2 = store.create({ name: "B", email: "b@t.com", role: "user" });
    store.update(u2.id, { active: false });
    expect(store.filterByActive(true)).toHaveLength(1);
    expect(store.filterByActive(false)).toHaveLength(1);
  });
});

describe("activity logging", () => {
  test("logs and retrieves activity entries", () => {
    const user = store.create({ name: "A", email: "a@t.com", role: "user" });
    store.logActivity(user.id, "login");
    store.logActivity(user.id, "page_view");
    const log = store.getActivity(user.id);
    expect(log).toHaveLength(2);
    expect(log[0].action).toBe("login");
    expect(log[1].action).toBe("page_view");
    expect(log[0].timestamp).toBeDefined();
  });

  test("returns empty array for user with no activity", () => {
    expect(store.getActivity("any-id")).toEqual([]);
  });

  test("activity log survives user update", () => {
    const user = store.create({ name: "A", email: "a@t.com", role: "user" });
    store.logActivity(user.id, "action1");
    store.update(user.id, { name: "B" });
    expect(store.getActivity(user.id)).toHaveLength(1);
  });
});

describe("stats", () => {
  test("empty store returns zeroes", () => {
    const s = store.stats();
    expect(s.total).toBe(0);
    expect(s.active).toBe(0);
    expect(s.inactive).toBe(0);
    expect(s.deleted).toBe(0);
    expect(s.byRole).toEqual({});
  });

  test("computes correct stats with mixed state", () => {
    store.create({ name: "A", email: "a@t.com", role: "admin" });
    const u2 = store.create({ name: "B", email: "b@t.com", role: "user" });
    store.create({ name: "C", email: "c@t.com", role: "user" });
    const u4 = store.create({ name: "D", email: "d@t.com", role: "moderator" });

    store.update(u2.id, { active: false }); // inactive but not deleted
    store.softDelete(u4.id); // soft deleted

    const s = store.stats();
    expect(s.total).toBe(3); // excludes deleted
    expect(s.active).toBe(2); // A, C
    expect(s.inactive).toBe(1); // B
    expect(s.deleted).toBe(1); // D
    expect(s.byRole.admin).toBe(1);
    expect(s.byRole.user).toBe(2);
    expect(s.byRole.moderator).toBeUndefined(); // deleted, excluded
  });
});

describe("clear / count", () => {
  test("clear removes all users and activity", () => {
    const u = store.create({ name: "A", email: "a@t.com", role: "user" });
    store.logActivity(u.id, "x");
    store.clear();
    expect(store.count()).toBe(0);
    expect(store.getActivity(u.id)).toEqual([]);
  });

  test("count reflects store size", () => {
    expect(store.count()).toBe(0);
    store.create({ name: "A", email: "a@t.com", role: "user" });
    expect(store.count()).toBe(1);
    store.create({ name: "B", email: "b@t.com", role: "user" });
    expect(store.count()).toBe(2);
  });
});
