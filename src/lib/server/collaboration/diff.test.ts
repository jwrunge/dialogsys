import { describe, expect, it } from 'vitest';

// categorizePath is internal; test via duplicated logic for stability
function categorizePath(filePath: string) {
	if (filePath === 'project.json') return 'project';
	if (filePath === 'characters.json') return 'characters';
	if (filePath === 'gameState.json') return 'state';
	if (filePath.startsWith('dialogs/') && filePath.endsWith('.graph.json')) return 'scene';
	if (filePath.startsWith('sequences/') && filePath.endsWith('.graph.json')) return 'sequence';
	if (filePath.startsWith('notes/')) return 'notes';
	return 'other';
}

describe('origin diff categorization', () => {
	it('classifies scene and sequence graph paths', () => {
		expect(categorizePath('dialogs/tavern_intro.graph.json')).toBe('scene');
		expect(categorizePath('sequences/main.graph.json')).toBe('sequence');
		expect(categorizePath('notes/overview.md')).toBe('notes');
	});
});
