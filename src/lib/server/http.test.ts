import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { toErrorResponse } from './http';

describe('toErrorResponse', () => {
	it('maps Zod errors to validation failed', async () => {
		const res = toErrorResponse(new ZodError([]));
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: 'Validation failed' });
	});

	it('maps not-found messages to 404', async () => {
		const res = toErrorResponse(new Error('Scene not found'));
		expect(res.status).toBe(404);
	});

	it('hides internal error details', async () => {
		const res = toErrorResponse(new Error('ENOENT: something obscure'));
		expect(res.status).toBe(500);
		expect(await res.json()).toEqual({ error: 'Internal server error' });
	});

	it('returns client-safe validation messages', async () => {
		const res = toErrorResponse(new Error('Invalid scene id'));
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: 'Invalid scene id' });
	});
});
