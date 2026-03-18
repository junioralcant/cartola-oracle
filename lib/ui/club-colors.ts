const FALLBACK_CLUB_PRIMARY_COLOR = "#94A3B8";

export const CLUB_PRIMARY_COLOR_BY_ABBR: Record<string, string> = {
  // Brasileirao Serie A 2026
  CAM: "#E5E7EB",
  BAH: "#1E3A8A",
  BOT: "#F8FAFC",
  CHA: "#166534",
  COR: "#F3F4F6",
  CFC: "#065F46",
  CRU: "#1D4ED8",
  FLA: "#C62828",
  FLU: "#2E7D32",
  GRE: "#1976D2",
  INT: "#D32F2F",
  MIR: "#F59E0B",
  PAL: "#1B5E20",
  CAP: "#C62828",
  RBB: "#D32F2F",
  REM: "#1D4ED8",
  SAN: "#F8FAFC",
  SAO: "#B71C1C",
  VAS: "#E5E7EB",
  VIT: "#B91C1C",
};

const normalizeAbbreviation = (value?: string): string => value?.trim().toUpperCase() ?? "";

type RgbTuple = [number, number, number];

const parseHexToRgb = (hex: string): RgbTuple | null => {
  const value = hex.replace("#", "");
  const expanded = value.length === 3
    ? value
        .split("")
        .map((char) => `${char}${char}`)
        .join("")
    : value;

  if (!/^[\da-fA-F]{6}$/.test(expanded)) {
    return null;
  }

  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);

  return [red, green, blue];
};

const tupleToRgbString = ([red, green, blue]: RgbTuple): string => `${red}, ${green}, ${blue}`;

const mixRgb = (base: RgbTuple, target: RgbTuple, amount: number): RgbTuple => {
  const safeAmount = Math.min(1, Math.max(0, amount));
  const mixChannel = (baseValue: number, targetValue: number) =>
    Math.round(baseValue + (targetValue - baseValue) * safeAmount);

  return [
    mixChannel(base[0], target[0]),
    mixChannel(base[1], target[1]),
    mixChannel(base[2], target[2]),
  ];
};

const toLinear = (channel: number): number => {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
};

const getRelativeLuminance = ([red, green, blue]: RgbTuple): number =>
  0.2126 * toLinear(red) + 0.7152 * toLinear(green) + 0.0722 * toLinear(blue);

const getContrastAdjustedRgb = (input: RgbTuple): RgbTuple => {
  const luminance = getRelativeLuminance(input);

  if (luminance < 0.12) {
    return mixRgb(input, [255, 255, 255], 0.62);
  }

  if (luminance < 0.24) {
    return mixRgb(input, [255, 255, 255], 0.48);
  }

  if (luminance < 0.35) {
    return mixRgb(input, [255, 255, 255], 0.28);
  }

  return input;
};

export const getClubCardTint = (
  clubAbbreviation?: string,
): { surfaceStrongRgb: string; surfaceSoftRgb: string; borderRgb: string; isFallback: boolean } => {
  const normalizedAbbreviation = normalizeAbbreviation(clubAbbreviation);
  const primaryColor = CLUB_PRIMARY_COLOR_BY_ABBR[normalizedAbbreviation];
  const rawRgb = parseHexToRgb(primaryColor ?? FALLBACK_CLUB_PRIMARY_COLOR)
    ?? parseHexToRgb(FALLBACK_CLUB_PRIMARY_COLOR)
    ?? [148, 163, 184];
  const adjustedRgb = getContrastAdjustedRgb(rawRgb);
  const borderBase = getRelativeLuminance(adjustedRgb) > 0.8
    ? mixRgb(adjustedRgb, [0, 0, 0], 0.3)
    : mixRgb(adjustedRgb, [255, 255, 255], 0.08);
  const softLayer = mixRgb(adjustedRgb, [255, 255, 255], 0.14);

  return {
    surfaceStrongRgb: tupleToRgbString(adjustedRgb),
    surfaceSoftRgb: tupleToRgbString(softLayer),
    borderRgb: tupleToRgbString(borderBase),
    isFallback: !primaryColor,
  };
};
