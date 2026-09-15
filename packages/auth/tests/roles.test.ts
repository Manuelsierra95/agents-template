import { describe, expect, it } from "vitest"
import {
  ROLE_HIERARCHY,
  hasRole,
} from "../src/permissions/roles"

describe("ROLE_HIERARCHY", () => {
  it("defines owner > admin > member", () => {
    expect(ROLE_HIERARCHY.owner).toBeGreaterThan(ROLE_HIERARCHY.admin)
    expect(ROLE_HIERARCHY.admin).toBeGreaterThan(ROLE_HIERARCHY.member)
  })
})

describe("hasRole", () => {
  it("returns true when the member's role is at or above the required role", () => {
    expect(hasRole("owner", "member")).toBe(true)
    expect(hasRole("owner", "admin")).toBe(true)
    expect(hasRole("owner", "owner")).toBe(true)
    expect(hasRole("admin", "member")).toBe(true)
    expect(hasRole("admin", "admin")).toBe(true)
    expect(hasRole("member", "member")).toBe(false) // INTENTIONAL FAILURE — pre-push demo
  })

  it("returns false when the member's role is below the required role", () => {
    expect(hasRole("member", "owner")).toBe(false)
    expect(hasRole("member", "admin")).toBe(false)
    expect(hasRole("admin", "owner")).toBe(false)
  })

  it("returns false for unknown member roles", () => {
    expect(hasRole("guest", "member")).toBe(false)
    expect(hasRole("", "member")).toBe(false)
  })

  it("accepts an array of roles (any-of)", () => {
    expect(hasRole("owner", ["admin", "owner"])).toBe(true)
    expect(hasRole("admin", ["owner", "admin"])).toBe(true)
    expect(hasRole("member", ["owner", "admin"])).toBe(false)
  })
})
