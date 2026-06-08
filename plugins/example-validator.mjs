/**
 * Example Dialogsys validator plugin.
 * Add to dialogsys.config.json:
 *   "plugins": { "validators": ["plugins/example-validator.mjs"] }
 */
export default function exampleValidator({ graphs }) {
	const issues = [];
	for (const graph of graphs) {
		for (const node of graph.nodes) {
			if (node.type === 'line' && (node.data.text?.length ?? 0) > 500) {
				issues.push({
					level: 'warning',
					code: 'line_too_long',
					message: 'Line exceeds 500 characters (example plugin)',
					dialogId: graph.id,
					nodeId: node.id,
				});
			}
		}
	}
	return issues;
}
