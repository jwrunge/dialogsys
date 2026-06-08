import { describe, expect, it } from 'vitest';
import { assertAllowedSyncServerUrl, SyncUrlPolicyError } from './url-policy';

describe('assertAllowedSyncServerUrl', () => {
	it('allows localhost sync servers', () => {
		expect(assertAllowedSyncServerUrl('http://127.0.0.1:3210').hostname).toBe('127.0.0.1');
		expect(assertAllowedSyncServerUrl('http://localhost:3210').hostname).toBe('localhost');
	});

	it('blocks private network addresses', () => {
		expect(() => assertAllowedSyncServerUrl('http://192.168.1.10:3210')).toThrow(
			SyncUrlPolicyError,
		);
		expect(() => assertAllowedSyncServerUrl('http://10.0.0.5:3210')).toThrow(SyncUrlPolicyError);
		expect(() => assertAllowedSyncServerUrl('http://169.254.169.254/')).toThrow(SyncUrlPolicyError);
	});

	it('blocks embedded credentials', () => {
		expect(() => assertAllowedSyncServerUrl('http://user:pass@127.0.0.1:3210')).toThrow(
			SyncUrlPolicyError,
		);
	});
});
