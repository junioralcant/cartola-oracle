import { render, screen } from "@testing-library/react";
import Home from "./page";

describe("Home", () => {
  it("renders the bootstrap message", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: "Cartola Oracle" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/A aplicacao base esta pronta/i),
    ).toBeInTheDocument();
  });
});
