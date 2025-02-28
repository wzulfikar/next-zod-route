// eslint-disable-next-line import/no-named-as-default
import z from 'zod';

import { HandlerFunction, HandlerServerErrorFn, OriginalRouteHandler } from './types';

type Middleware<TContext = Record<string, unknown>, TReturnType = Record<string, unknown>> = (opts: {
  request: Request;
  context?: TContext;
}) => Promise<TReturnType>;

/**
 * Type of the middleware function passed to a safe action client.
 */
export type MiddlewareFn<TContext, TReturnType> = {
  (opts: { context: TContext; request: Request }): Promise<TReturnType>;
};

export class InternalRouteHandlerError extends Error {}

export class RouteHandlerBuilder<
  TParams extends z.Schema = z.Schema,
  TQuery extends z.Schema = z.Schema,
  TBody extends z.Schema = z.Schema,
  // eslint-disable-next-line @typescript-eslint/ban-types
  TContext = {},
  TMetadata = unknown,
> {
  readonly config: {
    paramsSchema: TParams;
    querySchema: TQuery;
    bodySchema: TBody;
  };
  readonly middlewares: Middleware<TContext, TMetadata>[];
  readonly handleServerError?: HandlerServerErrorFn;
  readonly metadataValue: TMetadata;
  readonly contextType!: TContext;

  constructor({
    config = {
      paramsSchema: undefined as unknown as TParams,
      querySchema: undefined as unknown as TQuery,
      bodySchema: undefined as unknown as TBody,
    },
    middlewares = [],
    handleServerError,
    contextType,
  }: {
    config?: {
      paramsSchema: TParams;
      querySchema: TQuery;
      bodySchema: TBody;
    };
    middlewares?: Middleware<TContext, TMetadata>[];
    handleServerError?: HandlerServerErrorFn;
    contextType: TContext;
  }) {
    this.config = config;
    this.middlewares = middlewares;
    this.handleServerError = handleServerError;
    this.contextType = contextType as TContext;
  }

  /**
   * Define the schema for the params
   * @param schema - The schema for the params
   * @returns A new instance of the RouteHandlerBuilder
   */
  params<T extends z.Schema>(schema: T) {
    return new RouteHandlerBuilder<T, TQuery, TBody, TContext, TMetadata>({
      ...this,
      config: { ...this.config, paramsSchema: schema },
    });
  }

  /**
   * Define the schema for the query
   * @param schema - The schema for the query
   * @returns A new instance of the RouteHandlerBuilder
   */
  query<T extends z.Schema>(schema: T) {
    return new RouteHandlerBuilder<TParams, T, TBody, TContext, TMetadata>({
      ...this,
      config: { ...this.config, querySchema: schema },
    });
  }

  /**
   * Define the schema for the body
   * @param schema - The schema for the body
   * @returns A new instance of the RouteHandlerBuilder
   */
  body<T extends z.Schema>(schema: T) {
    return new RouteHandlerBuilder<TParams, TQuery, T, TContext, TMetadata>({
      ...this,
      config: { ...this.config, bodySchema: schema },
    });
  }

  /**
   * Add a middleware to the route handler
   * @param middleware - The middleware function to be executed
   * @returns A new instance of the RouteHandlerBuilder
   */
  use<TNewContext>(middleware: MiddlewareFn<TContext, TNewContext>) {
    type MergedContext = TContext & TNewContext;
    return new RouteHandlerBuilder<TParams, TQuery, TBody, MergedContext, TMetadata>({
      ...this,
      middlewares: [...this.middlewares, middleware],
      contextType: {} as MergedContext,
    });
  }

  /**
   * Create the handler function that will be used by Next.js
   * @param handler - The handler function that will be called when the route is hit
   * @returns The original route handler that Next.js expects with the validation logic
   */
  handler(handler: HandlerFunction<z.infer<TParams>, z.infer<TQuery>, z.infer<TBody>, TContext>): OriginalRouteHandler {
    return async (request, context): Promise<Response> => {
      try {
        const url = new URL(request.url);
        let params = context?.params ? await context.params : {};
        let query = Object.fromEntries(url.searchParams.entries());

        // Support both JSON and FormData parsing
        let body: unknown = {};
        if (request.method !== 'GET' && request.method !== 'DELETE') {
          const contentType = request.headers.get('content-type') || '';
          if (
            contentType.includes('multipart/form-data') ||
            contentType.includes('application/x-www-form-urlencoded')
          ) {
            const formData = await request.formData();
            body = Object.fromEntries(formData.entries());
          } else {
            body = await request.json();
          }
        }

        // Validate the params against the provided schema
        if (this.config.paramsSchema) {
          const paramsResult = this.config.paramsSchema.safeParse(params);
          if (!paramsResult.success) {
            throw new InternalRouteHandlerError(
              JSON.stringify({ message: 'Invalid params', errors: paramsResult.error.issues }),
            );
          }
          params = paramsResult.data;
        }

        // Validate the query against the provided schema
        if (this.config.querySchema) {
          const queryResult = this.config.querySchema.safeParse(query);
          if (!queryResult.success) {
            throw new InternalRouteHandlerError(
              JSON.stringify({ message: 'Invalid query', errors: queryResult.error.issues }),
            );
          }
          query = queryResult.data;
        }

        // Validate the body against the provided schema
        if (this.config.bodySchema) {
          const bodyResult = this.config.bodySchema.safeParse(body);
          if (!bodyResult.success) {
            throw new InternalRouteHandlerError(
              JSON.stringify({ message: 'Invalid body', errors: bodyResult.error.issues }),
            );
          }
          body = bodyResult.data;
        }

        // Execute middlewares and build context
        let middlewareContext: TContext = {} as TContext;
        for (const middleware of this.middlewares) {
          const result = await middleware({
            request,
            context: middlewareContext,
          });
          middlewareContext = { ...middlewareContext, ...result };
        }

        // Call the handler function with the validated params, query, and body
        const result = await handler(request, {
          params: params as z.infer<TParams>,
          query: query as z.infer<TQuery>,
          body: body as z.infer<TBody>,
          data: middlewareContext,
        });

        // If the result is already a Response, return it
        if (result instanceof Response) {
          return result;
        }

        // Otherwise, return a new Response with the result (else NextJS will throw an error and nothing will be returned)
        return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch (error) {
        if (error instanceof InternalRouteHandlerError) {
          return new Response(error.message, { status: 400 });
        }

        if (this.handleServerError) {
          return this.handleServerError(error as Error);
        }

        return new Response(JSON.stringify({ message: 'Internal server error' }), { status: 500 });
      }
    };
  }
}
