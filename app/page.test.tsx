import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import Home from "./page";

const successPayload = {
  marketRound: 12,
  marketStatus: "open",
  lineup: {
    formation: "4-3-3",
    players: [
      { id: 1, name: "Rossi", position: "GOL", clubId: 10, clubAbbreviation: "FLA", opponentClubAbbreviation: "PAL", opponentClubShieldUrl: "https://example.com/pal.png", isHome: true, price: 8.4, score: 6.9, justification: "Sequencia consistente." },
      { id: 2, name: "Ayrton", position: "LAT", clubId: 10, clubAbbreviation: "FLA", opponentClubAbbreviation: "PAL", isHome: true, price: 9.1, score: 7.4, justification: "Boa chegada ao ataque." },
      { id: 3, name: "Leo Ortiz", position: "ZAG", clubId: 10, clubAbbreviation: "FLA", opponentClubAbbreviation: "PAL", isHome: true, price: 8.7, score: 7.2, justification: "Confronto favoravel." },
      { id: 4, name: "Gerson", position: "MEI", clubId: 10, clubAbbreviation: "FLA", opponentClubAbbreviation: "PAL", isHome: true, price: 12.2, score: 9.3, justification: "Participacao em jogadas decisivas." },
      { id: 5, name: "Pedro", position: "ATA", clubId: 10, clubAbbreviation: "FLA", opponentClubAbbreviation: "PAL", isHome: true, price: 15.9, score: 10.1, justification: "Volume alto de finalizacoes." },
      { id: 6, name: "Fabricio", position: "LAT", clubId: 20, clubAbbreviation: "PAL", opponentClubAbbreviation: "FLA", isHome: false, price: 7.3, score: 6.2, justification: "Regularidade defensiva." },
      { id: 7, name: "Murilo", position: "ZAG", clubId: 20, clubAbbreviation: "PAL", opponentClubAbbreviation: "FLA", isHome: false, price: 8.8, score: 6.8, justification: "Chance de SG elevada." },
      { id: 8, name: "Veiga", position: "MEI", clubId: 20, clubAbbreviation: "PAL", opponentClubAbbreviation: "FLA", isHome: false, price: 14.4, score: 9.1, justification: "Participa de bolas paradas." },
      { id: 9, name: "Alisson", position: "MEI", clubId: 30, clubAbbreviation: "SAO", opponentClubAbbreviation: "FOR", isHome: true, price: 10.1, score: 7.9, justification: "Bom valor por cartoleta." },
      { id: 10, name: "Lucero", position: "ATA", clubId: 40, clubAbbreviation: "FOR", opponentClubAbbreviation: "SAO", isHome: false, price: 11.2, score: 8.4, justification: "Enfrenta defesa vulneravel." },
      { id: 11, name: "Yuri", position: "ATA", clubId: 50, clubAbbreviation: "COR", opponentClubAbbreviation: "SAN", isHome: true, price: 9.8, score: 7.7, justification: "Boa fase recente." },
    ],
    coach: {
      id: 90,
      name: "Tite",
      clubId: 10,
      clubAbbreviation: "FLA",
      price: 8.2,
      score: 6.5,
      justification: "Time em alta no recorte recente.",
    },
    totalCost: 124.1,
    totalScore: 93.5,
    remainingBudget: 5.9,
  },
  summary: {
    formation: "4-3-3",
    totalCost: 124.1,
    remainingBudget: 5.9,
    totalScore: 93.5,
  },
  warnings: ["matches: missing matchup for club 40"],
  explanations: ["Time otimizado para maximizar o score total."],
};

describe("Home", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the lineup form", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", {
        name: /Monte seu time ideal com leitura de app esportivo/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Cartoletas disponiveis/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Formacao/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Gerar time/i })).toBeInTheDocument();
  });

  it("shows validation when budget is invalid", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<Home />);

    fireEvent.change(screen.getByLabelText(/Cartoletas disponiveis/i), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Gerar time/i }));

    expect(await screen.findByText(/maior que zero/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows loading state while requesting lineup", () => {
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>(() => {
          return undefined;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: /Gerar time/i }));

    expect(screen.getByRole("button", { name: /Gerando time/i })).toBeDisabled();
    expect(screen.getByText(/Montando o melhor time/i)).toBeInTheDocument();
  });

  it("renders the generated lineup on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => successPayload,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: /Gerar time/i }));

    expect((await screen.findAllByText(/Time sugerido para a rodada 12/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/11 jogadores escalados/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Pedro")).toBeInTheDocument();
    expect(screen.getByText("Tite")).toBeInTheDocument();
    expect(screen.getAllByText("PAL em casa").length).toBeGreaterThan(0);
    expect(screen.getByAltText("PAL escudo rival")).toBeInTheDocument();
    const attackerTrack = screen.getByTestId("player-track-ATA");
    expect(attackerTrack).toHaveAttribute("data-carousel-lib", "embla");
    expect(within(attackerTrack).getAllByTestId(/player-card-/i)).toHaveLength(3);
    expect(screen.getByTestId("player-card-5")).toHaveAttribute("data-team-color-source", "mapped");
    expect(screen.getByText(/matches: missing matchup for club 40/i)).toBeInTheDocument();
    expect(screen.getByText(/Time otimizado para maximizar o score total/i)).toBeInTheDocument();
  });

  it("uses fallback team tint when club abbreviation is not mapped", async () => {
    const payloadWithUnknownClub = {
      ...successPayload,
      lineup: {
        ...successPayload.lineup,
        players: successPayload.lineup.players.map((player) =>
          player.id === 10 ? { ...player, clubAbbreviation: "XYZ" } : player,
        ),
      },
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payloadWithUnknownClub,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: /Gerar time/i }));

    await screen.findByTestId("player-card-10");
    expect(screen.getByTestId("player-card-10")).toHaveAttribute("data-team-color-source", "fallback");
  });

  it("renders functional errors from the API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        error: {
          code: "LINEUP_NOT_POSSIBLE",
          message: "Nao foi possivel montar um time valido com esse orcamento e formacao.",
        },
        warnings: ["clubs: missing data for club 20"],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Home />);

    fireEvent.change(screen.getByLabelText(/Cartoletas disponiveis/i), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Gerar time/i }));

    expect(
      await screen.findByText(/Nao foi possivel montar um time valido/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/clubs: missing data for club 20/i)).toBeInTheDocument();
  });

  it("renders a technical error and allows retry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({
          error: {
            code: "UPSTREAM_UNAVAILABLE",
            message: "Nao foi possivel gerar o time agora. Tente novamente em instantes.",
          },
          warnings: [],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => successPayload,
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: /Gerar time/i }));

    expect(
      await screen.findByText(/Nao foi possivel carregar uma sugestao agora/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Tentar novamente/i }));

    await waitFor(() => {
      expect(screen.getByText(/Escolha o orcamento e a formacao/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Gerar time/i }));

    expect((await screen.findAllByText(/Time sugerido para a rodada 12/i)).length).toBeGreaterThan(0);
  });
});
