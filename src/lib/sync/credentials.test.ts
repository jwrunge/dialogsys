import { describe, expect, it } from 'vitest';
import { normalizeSyncCredentials, syncAuthHeaders } from './credentials';

describe('syncAuthHeaders', () => {
	it('adds Bearer authorization when token is set', () => {
		expect(syncAuthHeaders('secret-token')).toEqual({
			Authorization: 'Bearer secret-token',
		});
	});

	it('returns empty headers without a token', () => {
		expect(syncAuthHeaders()).toEqual({});
		expect(syncAuthHeaders('   ')).toEqual({});
	});
});

describe('normalizeSyncCredentials', () => {
	it('trims URL and token from object input', () => {
		expect(
			normalizeSyncCredentials({
				baseUrl: ' http://127.0.0.1:3210/ ',
				token: ' abc ',
			}),
		).toEqual({
			baseUrl: 'http://127.0.0.1:3210',
			token: 'abc',
		});
	});
});
