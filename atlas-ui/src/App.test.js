import { render, screen, waitFor } from "@testing-library/react";
import App from "./App";

jest.mock("./services/api/http", () => ({
  ...jest.requireActual("./services/api/http"),
  getAuthToken: jest.fn(() => null),
}));

jest.mock("./services/api", () => ({
  getClients: jest.fn().mockResolvedValue([]),
  describeApiTargetForHumans: jest.fn(() => "localhost:8001"),
  getSession: jest.fn(),
  logout: jest.fn().mockResolvedValue({ ok: true }),
  clearAuthToken: jest.fn(),
}));

test("renders login screen when unauthenticated", async () => {
  render(<App />);
  await waitFor(() => {
    expect(
      screen.getByRole("heading", { name: /post generation pipeline/i })
    ).toBeInTheDocument();
  });
  expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
});

test("renders workspace home when authenticated", async () => {
  const http = require("./services/api/http");
  http.getAuthToken.mockReturnValue("test-token");

  const api = require("./services/api");
  api.getSession.mockResolvedValue({ user: { username: "admin" } });

  render(<App />);
  await waitFor(() => {
    expect(screen.getByRole("heading", { name: /workspaces/i })).toBeInTheDocument();
  });
});
