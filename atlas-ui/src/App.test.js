import { render, screen } from "@testing-library/react";
import App from "./App";

jest.mock("./services/api", () => ({
  getClients: jest.fn().mockResolvedValue([]),
  describeApiTargetForHumans: jest.fn(() => "localhost:8001"),
}));

test("renders workspace home", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: /workspaces/i })).toBeInTheDocument();
});
