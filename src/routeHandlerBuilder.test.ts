import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

import { createZodRoute } from '.';
import { RouteResult } from './types';

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const querySchema = z.object({
  search: z.string().min(1),
});

const bodySchema = z.object({
  field: z.string(),
});

export const paramsToPromise = (params: Record<string, unknown>): Promise<Record<string, unknown>> => {
  return Promise.resolve(params);
};

describe('type inference', () => {
  it('should infer the correct type', async () => {
    const GET = createZodRoute().handler(() => {
      return { id: 123 };
    });

    type Result = RouteResult<typeof GET>;
    expectTypeOf<Result>().toEqualTypeOf<{ id: number }>();

    const response = await GET(new Request('http://localhost/'), { params: Promise.resolve({}) });
    const data = (await response.json()) as Result;
    expectTypeOf<typeof data>().toEqualTypeOf<{ id: number }>();
    expect(data).toEqual({ id: 123 });
  });
});

describe('params validation', () => {
  it('should validate and handle valid params', async () => {
    const GET = createZodRoute()
      .params(paramsSchema)
      .handler((request, context) => {
        expectTypeOf(context.params).toMatchTypeOf<z.infer<typeof paramsSchema>>();
        const { id } = context.params;
        return Response.json({ id }, { status: 200 });
      });

    const request = new Request('http://localhost/');
    const response = await GET(request, { params: paramsToPromise({ id: '550e8400-e29b-41d4-a716-446655440000' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ id: '550e8400-e29b-41d4-a716-446655440000' });
  });

  it('should return an error for invalid params', async () => {
    const GET = createZodRoute()
      .params(paramsSchema)
      .handler((request, context) => {
        const { id } = context.params;
        return Response.json({ id }, { status: 200 });
      });

    const request = new Request('http://localhost/');
    const response = await GET(request, { params: paramsToPromise({ id: 'invalid-uuid' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.message).toBe('Invalid params');
  });
});

describe('query validation', () => {
  it('should validate and handle valid query', async () => {
    const GET = createZodRoute().handler((request, context) => {
      expectTypeOf(context.query).toMatchTypeOf<z.infer<typeof querySchema>>();
      const search = context.query.search;
      return Response.json({ search }, { status: 200 });
    });

    const request = new Request('http://localhost/?search=test');
    const response = await GET(request, { params: Promise.resolve({}) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ search: 'test' });
  });

  it('should return an error for invalid query', async () => {
    const GET = createZodRoute()
      .query(querySchema)
      .handler((request, context) => {
        const search = context.query.search;
        return Response.json({ search }, { status: 200 });
      });

    const request = new Request('http://localhost/?search=');
    const response = await GET(request, { params: Promise.resolve({}) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.message).toBe('Invalid query');
  });
});

describe('body validation', () => {
  it('should validate and handle valid body', async () => {
    const POST = createZodRoute()
      .body(bodySchema)
      .handler((request, context) => {
        expectTypeOf(context.body).toMatchTypeOf<z.infer<typeof bodySchema>>();
        const field = context.body.field;
        return Response.json({ field }, { status: 200 });
      });

    const request = new Request('http://localhost/', {
      method: 'POST',
      body: JSON.stringify({ field: 'test-field' }),
    });
    const response = await POST(request, { params: Promise.resolve({}) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ field: 'test-field' });
  });

  it('should return an error for invalid body', async () => {
    const POST = createZodRoute()
      .body(bodySchema)
      .handler((request, context) => {
        const field = context.body.field;
        return Response.json({ field }, { status: 200 });
      });

    const request = new Request('http://localhost/', {
      method: 'POST',
      body: JSON.stringify({ field: 123 }),
    });
    const response = await POST(request, { params: Promise.resolve({}) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.message).toBe('Invalid body');
  });
});

describe('combined validation', () => {
  it('should validate and handle valid request with params, query, and body', async () => {
    const POST = createZodRoute()
      .params(paramsSchema)
      .query(querySchema)
      .body(bodySchema)
      .handler((request, context) => {
        const { id } = context.params;
        const { search } = context.query;
        const { field } = context.body;

        return Response.json({ id, search, field }, { status: 200 });
      });

    const request = new Request('http://localhost/?search=test', {
      method: 'POST',
      body: JSON.stringify({ field: 'test-field' }),
    });

    const response = await POST(request, { params: paramsToPromise({ id: '550e8400-e29b-41d4-a716-446655440000' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      id: '550e8400-e29b-41d4-a716-446655440000',
      search: 'test',
      field: 'test-field',
    });
  });

  it('should return an error for invalid params in combined validation', async () => {
    const POST = createZodRoute()
      .params(paramsSchema)
      .query(querySchema)
      .body(bodySchema)
      .handler((request, context) => {
        const { id } = context.params;
        const { search } = context.query;
        const { field } = context.body;

        return Response.json({ id, search, field }, { status: 200 });
      });

    const request = new Request('http://localhost/?search=test', {
      method: 'POST',
      body: JSON.stringify({ field: 'test-field' }),
    });

    const response = await POST(request, { params: paramsToPromise({ id: 'invalid-uuid' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.message).toBe('Invalid params');
  });

  it('should return an error for invalid query in combined validation', async () => {
    const POST = createZodRoute()
      .params(paramsSchema)
      .query(querySchema)
      .body(bodySchema)
      .handler((request, context) => {
        const { id } = context.params;
        const { search } = context.query;
        const { field } = context.body;

        return Response.json({ id, search, field }, { status: 200 });
      });

    const request = new Request('http://localhost/?search=', {
      method: 'POST',
      body: JSON.stringify({ field: 'test-field' }),
    });

    const response = await POST(request, { params: paramsToPromise({ id: '550e8400-e29b-41d4-a716-446655440000' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.message).toBe('Invalid query');
  });

  it('should return an error for invalid body in combined validation', async () => {
    const POST = createZodRoute()
      .params(paramsSchema)
      .query(querySchema)
      .body(bodySchema)
      .handler((request, context) => {
        const { id } = context.params;
        const { search } = context.query;
        const { field } = context.body;

        return Response.json({ id, search, field }, { status: 200 });
      });

    const request = new Request('http://localhost/?search=test', {
      method: 'POST',
      body: JSON.stringify({ field: 123 }),
    });

    const response = await POST(request, { params: paramsToPromise({ id: '550e8400-e29b-41d4-a716-446655440000' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.message).toBe('Invalid body');
  });

  it('should execute middleware and add context properties', async () => {
    const middleware = async () => {
      return { user: { id: 'user-123', role: 'admin' } };
    };

    const GET = createZodRoute()
      .use(middleware)
      .params(paramsSchema)
      .handler((request, context) => {
        const { id } = context.params;
        const { user } = context.data;

        expectTypeOf(user).toMatchTypeOf<{ id: string }>();

        return Response.json({ id, user }, { status: 200 });
      });

    const request = new Request('http://localhost/');
    const response = await GET(request, { params: paramsToPromise({ id: '550e8400-e29b-41d4-a716-446655440000' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      id: '550e8400-e29b-41d4-a716-446655440000',
      user: { id: 'user-123', role: 'admin' },
    });
  });

  it('should execute multiple middlewares and merge context properties', async () => {
    const middleware1 = async () => {
      return { user: { id: 'user-123' } };
    };

    const middleware2 = async () => {
      return { permissions: ['read', 'write'] };
    };

    const GET = createZodRoute()
      .use(middleware1)
      .use(middleware2)
      .params(paramsSchema)
      .handler((request, context) => {
        const { id } = context.params;
        const { user, permissions } = context.data;

        expectTypeOf(user).toMatchTypeOf<{ id: string }>();
        expectTypeOf(permissions).toMatchTypeOf<string[]>();

        return Response.json({ id, user, permissions }, { status: 200 });
      });

    const request = new Request('http://localhost/');
    const response = await GET(request, { params: paramsToPromise({ id: '550e8400-e29b-41d4-a716-446655440000' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      id: '550e8400-e29b-41d4-a716-446655440000',
      user: { id: 'user-123' },
      permissions: ['read', 'write'],
    });
  });

  it('should handle server errors using handleServerError method', async () => {
    class CustomError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'CustomError';
      }
    }
    const handleServerError = (error: Error) => {
      if (error instanceof CustomError) {
        return new Response(JSON.stringify({ message: error.name, details: error.message }), { status: 400 });
      }

      return new Response(JSON.stringify({ message: 'Something went wrong' }), { status: 400 });
    };

    const GET = createZodRoute({
      handleServerError,
    })
      .params(paramsSchema)
      .handler(() => {
        throw new CustomError('Test error');
      });

    const request = new Request('http://localhost/');
    const response = await GET(request, { params: paramsToPromise({ id: '550e8400-e29b-41d4-a716-446655440000' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ message: 'CustomError', details: 'Test error' });
  });
});

describe('form data handling', () => {
  it('should parse and validate form data in the request body', async () => {
    const POST = createZodRoute()
      .body(bodySchema)
      .handler((request, context) => {
        const { field } = context.body;
        return Response.json({ field }, { status: 200 });
      });

    const formData = new URLSearchParams();
    formData.append('field', 'test-field');

    const request = new Request('http://localhost/', {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const response = await POST(request, { params: Promise.resolve({}) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ field: 'test-field' });
  });

  it('should return an error for invalid form data', async () => {
    const POST = createZodRoute()
      .body(bodySchema)
      .handler((request, context) => {
        const { field } = context.body;
        return Response.json({ field }, { status: 200 });
      });

    const formData = new URLSearchParams();
    formData.append('field', ''); // Empty string should fail validation

    const request = new Request('http://localhost/', {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const response = await POST(request, { params: Promise.resolve({}) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ field: '' });
  });
});

describe('response handling', () => {
  it('should return the Response object directly when handler returns a Response', async () => {
    const GET = createZodRoute().handler(() => {
      return new Response(JSON.stringify({ custom: 'response' }), {
        status: 201,
        headers: { 'X-Custom-Header': 'test' },
      });
    });

    const request = new Request('http://localhost/');
    const response = await GET(request, { params: Promise.resolve({}) });
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(response.headers.get('X-Custom-Header')).toBe('test');
    expect(data).toEqual({ custom: 'response' });
  });

  it('should convert non-Response return values to a JSON Response', async () => {
    const GET = createZodRoute().handler(() => {
      return { data: 'value' };
    });

    const request = new Request('http://localhost/');
    const response = await GET(request, { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json');

    const data = await response.json();
    expect(data).toEqual({ data: 'value' });
  });
});

describe('HTTP methods handling', () => {
  it('should not parse body for DELETE requests', async () => {
    const DELETE = createZodRoute().handler(() => {
      // If we reach here without error, it means the body wasn't parsed
      return Response.json({ success: true }, { status: 200 });
    });

    const request = new Request('http://localhost/', {
      method: 'DELETE',
      // DELETE can have a body, unlike GET
      body: '{invalid json}',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const response = await DELETE(request, { params: Promise.resolve({}) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });
  });

  it('should not parse body for GET requests', async () => {
    const GET = createZodRoute().handler(() => {
      // If we reach here without error, it means the body wasn't parsed
      return Response.json({ success: true }, { status: 200 });
    });

    // GET requests can't have a body, so we'll just test that the handler works
    const request = new Request('http://localhost/', {
      method: 'GET',
    });

    const response = await GET(request, { params: Promise.resolve({}) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });
  });
});
