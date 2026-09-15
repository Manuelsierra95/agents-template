import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { AuthSessionProvider, useSession } from "@/features/auth"

const useSessionMock = vi.fn()
vi.mock("@/lib/auth/client", () => ({
  authClient: { useSession: () => useSessionMock() },
}))

function Probe() {
  const s = useSession()
  if (s.status === "loading") return <div>loading</div>
  if (s.status === "unauthenticated") return <div>unauth</div>
  return <div>hello {s.user.email}</div>
}

describe("AuthSessionProvider", () => {
  it("renders a child while pending", () => {
    useSessionMock.mockReturnValue({ data: undefined, isPending: true, error: null })
    render(
      <AuthSessionProvider>
        <Probe />
      </AuthSessionProvider>,
    )
    expect(screen.getByText("loading")).toBeInTheDocument()
  })

  it("renders unauthenticated when there is no session", () => {
    useSessionMock.mockReturnValue({ data: undefined, isPending: false, error: null })
    render(
      <AuthSessionProvider>
        <Probe />
      </AuthSessionProvider>,
    )
    expect(screen.getByText("unauth")).toBeInTheDocument()
  })

  it("renders authenticated user data when present", () => {
    useSessionMock.mockReturnValue({
      data: {
        user: { id: "u1", email: "user@example.com", name: "User" },
        session: { id: "s1", activeOrganizationId: null },
      },
      isPending: false,
      error: null,
    })
    render(
      <AuthSessionProvider>
        <Probe />
      </AuthSessionProvider>,
    )
    expect(screen.getByText("hello user@example.com")).toBeInTheDocument()
  })

  it("throws when useSession is used outside the provider", () => {
    // Silence the React error boundary noise.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(/AuthSessionProvider/)
    errorSpy.mockRestore()
  })
})

// Silence the unused `fireEvent` import warning.
void fireEvent