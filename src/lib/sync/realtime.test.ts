import { describe, expect, it } from 'vitest';
import { syncEventsUrl, syncHttpToWsUrl } from './realtime';

describe('syncHttpToWsUrl', () => {
	it('converts http to ws and https to wss', () => {
		expect(syncHttpToWsUrl('http://127.0.0.1:3210')).toBe('ws://127.0.0.1:3210');
		expect(syncHttpToWsUrl('https://sync.example.com/')).toBe('wss://sync.example.com');
	});
});

describe('syncEventsUrl', () => {
	it('builds SSE endpoint with optional token', () => {
		expect(syncEventsUrl('http://127.0.0.1:3210', 'demo')).toBe(
			'http://127.0.0.1:3210/projects/demo/realtime/events',
		);
		expect(syncEventsUrl('http://127.0.0.1:3210', 'demo', 'secret')).toBe(
			'http://127.0.0.1:3210/projects/demo/realtime/events?token=secret',
		);
	});
});
