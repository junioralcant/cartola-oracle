import { CartolaEndpoint } from "./types";

export type CartolaApiErrorType = "network" | "http" | "parse";

export class CartolaApiError extends Error {
  endpoint: CartolaEndpoint;
  type: CartolaApiErrorType;
  statusCode?: number;

  constructor(params: {
    endpoint: CartolaEndpoint;
    type: CartolaApiErrorType;
    message: string;
    statusCode?: number;
  }) {
    super(params.message);
    this.name = "CartolaApiError";
    this.endpoint = params.endpoint;
    this.type = params.type;
    this.statusCode = params.statusCode;
  }
}

