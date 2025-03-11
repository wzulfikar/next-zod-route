/* eslint-disable @typescript-eslint/no-explicit-any */
import { Schema } from 'zod';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export class RouteResponse<T> extends Response {
  declare json: () => Promise<any>;
}

export type HandlerFunction<TParams, TQuery, TBody, TContext, TReturn = any> = (
  request: Request,
  context: { params: TParams; query: TQuery; body: TBody; data: TContext },
) => Promise<RouteResponse<TReturn> | TReturn> | RouteResponse<TReturn> | TReturn;

export interface RouteHandlerBuilderConfig {
  paramsSchema: Schema;
  querySchema: Schema;
  bodySchema: Schema;
}

export type OriginalRouteHandler<TReturn = any> = (
  request: Request,
  context: { params: Promise<Record<string, unknown>> },
) => Promise<RouteResponse<TReturn>>;

export type HandlerServerErrorFn = (error: Error) => Response;

type UnwrapResponse<T> = T extends RouteResponse<infer U> ? U : T extends Promise<infer U> ? UnwrapResponse<U> : T;

/**
 * Type helper to extract the return type of a route handler
 */
export type RouteResult<T extends (...args: any[]) => any> = UnwrapResponse<ReturnType<T>>;
