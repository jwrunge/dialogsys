<script lang="ts">
import { nanoid } from 'nanoid';
import { onMount, tick } from 'svelte';
import EditorStatusBanner from '../components/EditorStatusBanner.svelte';
import { api, apiValidated } from '../lib/api';
import { applyScenePatchWithMerge, isSceneGraphPath } from '../lib/client/apply-doc-patch';
import { sceneGraphPath, setCoauthorFocusPath } from '../lib/client/coauthor-focus';
import { DebouncedTask, SAVE_DEBOUNCE_MS } from '../lib/client/debouncedSave';
import { markClean, markDirty, notifySaveConflict } from '../lib/client/dirty-state';
import { savePatchWithRebase } from '../lib/client/patch-save';
import { isProjectReadOnly } from '../lib/client/project-access';
import {
	type CanvasEdge,
	type CanvasNode,
	canvasNodeToGraphNode,
	canvasToDialogGraph,
	dialogGraphToCanvas,
} from '../lib/graph/canvasBridge';
import {
	insertNodeBefore,
	removeChoiceOption,
	setBranchTarget,
	unlinkNode,
} from '../lib/graph/graphEdit';
import { findEntryNode, singleNextTarget } from '../lib/graph/graphUtils';
import { bindLiveGraphNodeSelect } from '../lib/graph/liveNodeSelect';
import { createBlankNode } from '../lib/graph/nodeFactory';
import { computeGraphPatch } from '../lib/graph/patch';
import { settingsResponseSchema } from '../lib/schema/api-responses';
import type { Character, CharactersFile } from '../lib/schema/characters';
import type { GameStateFile, GameStateProperty } from '../lib/schema/gameState';
import type { DialogGraph, GraphEdge, GraphNode } from '../lib/schema/graph';
import { COAUTHOR_GRAPH_PATCH_EVENT, type CoauthorGraphPatch } from '../lib/sync/realtime';
import { applySceneTextBlocks, type SceneTextBlock } from '../lib/writer/sceneText';
import DialoguePreviewPanel from './DialoguePreviewPanel.svelte';
import DialogFlowCanvas from './DialogFlowCanvas.svelte';
import NodeInspector from './NodeInspector.svelte';
import SceneTextEditor from './SceneTextEditor.svelte';
import SceneTitle from './SceneTitle.svelte';

interface Props {
	slug: string;
	dialogId: string;
	displayName?: string;
	description?: string;
	nodeCount?: number;
	sequenceCount?: number;
	embedded?: boolean;
}

let {
	slug,
	dialogId,
	displayName: initialDisplayName = '',
	description: initialDescription = '',
	nodeCount = 0,
	sequenceCount = 0,
	embedded = false,
}: Props = $props();

let loading = $state(true);
let ready = $state(false);
let loadError = $state('');
let saveStatus = $state('');
let selectedNodeId = $state<string | null>(null);
let characters = $state<Character[]>([]);
let gameStateProperties = $state<GameStateProperty[]>([]);
let dialogIds = $state<string[]>([]);
let graphMeta = $state({ displayName: initialDisplayName, description: initialDescription });
let syncKey = $state('');
let confirmDialogEl = $state<HTMLDialogElement | null>(null);
let confirmMode = $state<'node' | 'edge'>('node');
let confirmMessage = $state('');
let pendingEdge = $state<CanvasEdge | null>(null);
let savedGraph = $state.raw<DialogGraph | null>(null);
let contentHash = $state('');
let clientId = $state('');
let applyingRemotePatch = $state(false);
let editorView = $state<'graph' | 'text'>('graph');
let previewOpen = $state(false);
let previewGraph = $state<DialogGraph | null>(null);
let textRevision = $state(0);

let canvasNodes = $state.raw<CanvasNode[]>([]);
let canvasEdges = $state.raw<CanvasEdge[]>([]);

const selectedNode = $derived.by((): GraphNode | null => {
	if (!selectedNodeId) return null;
	const n = canvasNodes.find((cn) => cn.id === selectedNodeId);
	return n ? canvasNodeToGraphNode(n) : null;
});

const graphNodes = $derived(
	canvasNodes.map((n) => ({
		id: n.id,
		type: n.type as GraphNode['type'],
		position: n.position,
		data: (n.data ?? {}) as GraphNode['data'],
	})),
);

const graphEdges = $derived(
	canvasEdges.map((e) => ({
		id: e.id,
		source: e.source,
		target: e.target,
		sourceHandle: e.sourceHandle ?? undefined,
		targetHandle: e.targetHandle ?? undefined,
		data: e.data as GraphEdge['data'],
	})),
);

function toCanvas(graph: DialogGraph) {
	const mapped = dialogGraphToCanvas(graph);
	canvasNodes = mapped.nodes;
	canvasEdges = mapped.edges;
	syncKey = mapped.syncKey;
}

function fromCanvas(): DialogGraph {
	return canvasToDialogGraph({
		id: dialogId,
		displayName: graphMeta.displayName,
		description: graphMeta.description,
		nodes: canvasNodes,
		edges: canvasEdges,
	});
}

function onTextBlocksChange(blocks: SceneTextBlock[]) {
	if (!savedGraph || applyingRemotePatch) return;
	const next = applySceneTextBlocks(savedGraph, blocks, characters);
	savedGraph = { ...next, displayName: graphMeta.displayName, description: graphMeta.description };
	scheduleSave();
}

function setEditorView(view: 'graph' | 'text') {
	if (view === 'graph' && savedGraph) {
		toCanvas(savedGraph);
	}
	if (view === 'text') {
		textRevision += 1;
	}
	editorView = view;
}

function openPreview() {
	previewGraph = editorView === 'text' && savedGraph ? savedGraph : fromCanvas();
	previewOpen = true;
}

const saveTask = new DebouncedTask(SAVE_DEBOUNCE_MS, () => void save());

function scheduleSave() {
	if (loading || !ready || isProjectReadOnly() || applyingRemotePatch) return;
	markDirty();
	saveTask.schedule();
}

async function syncGraphFromServer() {
	const res = await api<{ graph: DialogGraph; contentHash: string }>(
		`/api/projects/${slug}/dialogs/${dialogId}`,
	);
	savedGraph = res.graph;
	contentHash = res.contentHash;
	graphMeta = { displayName: res.graph.displayName, description: res.graph.description };
	toCanvas(res.graph);
}

async function save() {
	if (!savedGraph) return;
	const next = editorView === 'text' ? savedGraph : fromCanvas();
	const ops = computeGraphPatch(savedGraph, next);
	if (ops.length === 0) {
		markClean();
		if (saveStatus === 'Saving…') saveStatus = '';
		return;
	}
	saveStatus = 'Saving…';
	try {
		const result = await savePatchWithRebase({
			url: `/api/projects/${slug}/dialogs/${dialogId}/graph`,
			path: sceneGraphPath(dialogId),
			saved: savedGraph,
			next,
			contentHash,
			ops,
			computeOps: computeGraphPatch,
			parseSuccess: (res) => ({ saved: res.graph, contentHash: res.contentHash }),
			parseConflict: (body) => {
				const graph = body.graph as DialogGraph | undefined;
				const hash = body.currentContentHash;
				if (!graph || typeof hash !== 'string') return null;
				return { saved: graph, contentHash: hash };
			},
		});
		savedGraph = result.saved;
		contentHash = result.contentHash;
		graphMeta = {
			displayName: result.saved.displayName,
			description: result.saved.description,
		};
		saveStatus = result.rebased ? 'Merged teammate edits and saved' : 'Saved';
		markClean();
		setTimeout(() => {
			if (saveStatus === 'Saved') saveStatus = '';
		}, 1500);
	} catch (e) {
		notifySaveConflict(e);
		saveStatus = (e as Error).message;
	}
}

async function applyRemotePatch(patch: CoauthorGraphPatch) {
	if (!isSceneGraphPath(patch.path, dialogId)) return;
	if (patch.deviceId === clientId) return;
	if (!savedGraph || applyingRemotePatch) return;

	applyingRemotePatch = true;
	try {
		const { value: next, staleBase } = applyScenePatchWithMerge(
			savedGraph,
			fromCanvas(),
			patch,
			contentHash,
		);
		if (!staleBase) {
			savedGraph = next;
			contentHash = patch.contentHash;
		} else {
			saveStatus = `${patch.displayName || 'Teammate'} merged remote edits`;
		}
		graphMeta = { displayName: next.displayName, description: next.description };
		if (editorView === 'graph') {
			toCanvas(next);
		} else {
			textRevision += 1;
		}
	} finally {
		applyingRemotePatch = false;
	}
}

async function load() {
	loading = true;
	ready = false;
	loadError = '';
	try {
		const [{ graph, contentHash: loadedHash }, chars, gameState, dialogs] = await Promise.all([
			api<{ graph: DialogGraph; contentHash: string }>(`/api/projects/${slug}/dialogs/${dialogId}`),
			api<CharactersFile>(`/api/projects/${slug}/characters`),
			api<GameStateFile>(`/api/projects/${slug}/game-state`),
			api<{ dialogs: { id: string }[] }>(`/api/projects/${slug}/dialogs`),
		]);
		graphMeta = { displayName: graph.displayName, description: graph.description };
		savedGraph = graph;
		contentHash = loadedHash;
		if (!Array.isArray(graph.nodes)) throw new Error('Scene has no nodes array');
		if (!Array.isArray(graph.edges)) throw new Error('Scene has no edges array');
		toCanvas(graph);
		textRevision += 1;
		characters = Array.isArray(chars.characters) ? chars.characters : [];
		gameStateProperties = Array.isArray(gameState.properties) ? gameState.properties : [];
		dialogIds = dialogs.dialogs.map((d) => d.id);
		ready = true;
		selectFromHash();
	} catch (e) {
		loadError = (e as Error).message;
	} finally {
		loading = false;
	}
}

function setCanvasNodes(nodes: CanvasNode[]) {
	canvasNodes = nodes;
	scheduleSave();
}

function setCanvasEdges(edges: CanvasEdge[]) {
	canvasEdges = edges;
	scheduleSave();
}

function selectNode(id: string) {
	selectedNodeId = id;
	if (typeof window !== 'undefined') {
		const hash = id ? `#${id}` : '';
		if (window.location.hash !== hash) {
			history.replaceState(null, '', `${window.location.pathname}${hash}`);
		}
	}
}

$effect(() => bindLiveGraphNodeSelect(selectNode));

function selectFromHash() {
	if (typeof window === 'undefined') return;
	const id = window.location.hash.replace(/^#/, '');
	if (id && canvasNodes.some((n) => n.id === id)) {
		selectedNodeId = id;
	}
}

function updateNode(updated: GraphNode) {
	canvasNodes = canvasNodes.map((n) =>
		n.id === updated.id ? { ...n, data: updated.data, type: updated.type } : n,
	);
	syncKey = `local-${Date.now()}`;
	scheduleSave();
}

function updateEdge(updated: GraphEdge) {
	canvasEdges = canvasEdges.map((e) => (e.id === updated.id ? { ...e, data: updated.data } : e));
	scheduleSave();
}

function handleSetBranchTarget(sourceId: string, handle: string, targetId: string) {
	if (!targetId) return;
	const next = setBranchTarget(graphEdges, sourceId, handle, targetId);
	canvasEdges = next.map((e) => ({
		id: e.id,
		source: e.source,
		target: e.target,
		sourceHandle: e.sourceHandle,
		targetHandle: e.targetHandle,
		data: e.data,
	}));
	scheduleSave();
}

function handleRemoveChoiceOption(optionId: string) {
	if (!selectedNode || selectedNode.type !== 'choice') return;
	const nodeId = selectedNode.id;
	const result = removeChoiceOption(graphNodes, graphEdges, nodeId, optionId);
	if (!result) return;
	canvasNodes = result.nodes.map((n) => ({
		id: n.id,
		type: n.type,
		position: n.position,
		data: n.data,
	}));
	canvasEdges = result.edges.map((e) => ({
		id: e.id,
		source: e.source,
		target: e.target,
		sourceHandle: e.sourceHandle,
		targetHandle: e.targetHandle,
		data: e.data,
	}));
	syncKey = `local-${Date.now()}`;
	scheduleSave();
}

async function openDeleteNodeConfirm() {
	if (!selectedNodeId) return;
	const node = canvasNodes.find((n) => n.id === selectedNodeId);
	if (!node || node.type === 'entry') return;
	const label =
		(node.data?.label as string | undefined) ||
		(node.data?.speaker as string | undefined) ||
		node.type ||
		node.id;
	confirmMode = 'node';
	pendingEdge = null;
	confirmMessage = `Delete "${label}" from this scene?`;
	await tick();
	confirmDialogEl?.showModal();
}

function edgeMatches(a: CanvasEdge, b: CanvasEdge): boolean {
	return (
		a.source === b.source &&
		a.target === b.target &&
		(a.sourceHandle ?? null) === (b.sourceHandle ?? null) &&
		(a.targetHandle ?? null) === (b.targetHandle ?? null)
	);
}

async function requestDeleteEdge(edge: CanvasEdge) {
	confirmMode = 'edge';
	pendingEdge = edge;
	confirmMessage = 'Remove this connection from the scene graph?';
	await tick();
	confirmDialogEl?.showModal();
}

function closeConfirmDialog() {
	confirmDialogEl?.close();
	pendingEdge = null;
}

function applyConfirmDelete() {
	if (confirmMode === 'node') {
		if (!selectedNodeId) return;
		const result = unlinkNode(graphNodes, graphEdges, selectedNodeId);
		canvasNodes = result.nodes.map((n) => ({
			id: n.id,
			type: n.type,
			position: n.position,
			data: n.data,
		}));
		canvasEdges = result.edges.map((e) => ({
			id: e.id,
			source: e.source,
			target: e.target,
			sourceHandle: e.sourceHandle,
			targetHandle: e.targetHandle,
			data: e.data,
		}));
		selectedNodeId = null;
	} else if (pendingEdge) {
		const target = pendingEdge;
		canvasEdges = canvasEdges.filter((e) => e.id !== target.id && !edgeMatches(e, target));
		pendingEdge = null;
	}
	syncKey = `local-${Date.now()}`;
	closeConfirmDialog();
	scheduleSave();
}

function onConnectEndToPane(params: {
	sourceNodeId: string;
	sourceHandle: string | null;
	position: { x: number; y: number };
}) {
	const blank = createBlankNode();
	blank.position = params.position;
	const id = `e-${params.sourceNodeId}-${blank.id}-${nanoid(4)}`;
	canvasNodes = [
		...canvasNodes,
		{
			id: blank.id,
			type: blank.type,
			position: blank.position,
			data: blank.data,
		},
	];
	canvasEdges = [
		...canvasEdges,
		{
			id,
			source: params.sourceNodeId,
			target: blank.id,
			sourceHandle: params.sourceHandle,
		},
	];
	selectedNodeId = blank.id;
	syncKey = `local-${Date.now()}`;
	scheduleSave();
}

function onConnect() {
	scheduleSave();
}

function isEditableTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	const tag = target.tagName;
	if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
	return target.isContentEditable;
}

function onKeyDown(event: KeyboardEvent) {
	if (event.key !== 'Delete' && event.key !== 'Backspace') return;
	if (isEditableTarget(event.target)) return;
	if (!selectedNodeId) return;
	const node = canvasNodes.find((n) => n.id === selectedNodeId);
	if (!node || node.type === 'entry') return;
	event.preventDefault();
	openDeleteNodeConfirm();
}

/** If graph has only entry→end, add a blank step after entry on first edit. */
function ensureFirstStep() {
	const entry = findEntryNode(graphNodes);
	if (!entry) return;
	const next = singleNextTarget(graphEdges, entry.id);
	const nextNode = graphNodes.find((n) => n.id === next);
	if (nextNode?.type === 'end') {
		const blank = createBlankNode();
		blank.position = { x: entry.position.x + 200, y: entry.position.y };
		const result = insertNodeBefore(graphNodes, graphEdges, next, blank);
		canvasNodes = result.nodes.map((n) => ({
			id: n.id,
			type: n.type,
			position: n.position,
			data: n.data,
		}));
		canvasEdges = result.edges.map((e) => ({
			id: e.id,
			source: e.source,
			target: e.target,
			sourceHandle: e.sourceHandle,
			targetHandle: e.targetHandle,
			data: e.data,
		}));
		selectedNodeId = blank.id;
		syncKey = `local-${Date.now()}`;
		scheduleSave();
	}
}

$effect(() => {
	setCoauthorFocusPath(sceneGraphPath(dialogId));
	return () => setCoauthorFocusPath(null);
});

onMount(async () => {
	function onMetaUpdated(e: Event) {
		const detail = (e as CustomEvent<{ displayName: string; description: string }>).detail;
		if (!detail) return;
		graphMeta = { displayName: detail.displayName, description: detail.description };
		void syncGraphFromServer();
	}
	function onGraphPatch(e: Event) {
		const patch = (e as CustomEvent<CoauthorGraphPatch>).detail;
		void applyRemotePatch(patch);
	}

	try {
		const settings = await apiValidated('/api/settings', settingsResponseSchema);
		clientId = settings.clientId;
	} catch {
		clientId = '';
	}

	window.addEventListener('scene-meta-updated', onMetaUpdated);
	window.addEventListener('keydown', onKeyDown);
	window.addEventListener(COAUTHOR_GRAPH_PATCH_EVENT, onGraphPatch);
	await load();
	ensureFirstStep();
	return () => {
		window.removeEventListener('scene-meta-updated', onMetaUpdated);
		window.removeEventListener('keydown', onKeyDown);
		window.removeEventListener(COAUTHOR_GRAPH_PATCH_EVENT, onGraphPatch);
	};
});
</script>

<div class="scene-editor" class:embedded class:editor-shell={embedded} data-transmut="include">
	<EditorStatusBanner {loadError} />
	{#if !loadError && ready}
		<div class="editor-toolbar">
			<div class="view-toggle" role="group" aria-label="Editor view">
				<button
					type="button"
					class="btn"
					class:btn-primary={editorView === 'graph'}
					onclick={() => setEditorView('graph')}
				>
					Graph
				</button>
				<button
					type="button"
					class="btn"
					class:btn-primary={editorView === 'text'}
					onclick={() => setEditorView('text')}
				>
					Text
				</button>
			</div>
			<button type="button" class="btn btn-primary" onclick={openPreview}>
				Play
			</button>
		</div>
		{#if editorView === 'text' && savedGraph}
			<SceneTextEditor
				graph={savedGraph}
				{characters}
				revision={`text-${textRevision}`}
				onchange={onTextBlocksChange}
			/>
		{:else}
		<div class="editor-layout flow-layout">
			<div class="editor-canvas">
				<DialogFlowCanvas
					{characters}
					nodes={canvasNodes}
					edges={canvasEdges}
					{syncKey}
					setNodes={setCanvasNodes}
					setEdges={setCanvasEdges}
					onNodeSelect={selectNode}
					{onConnect}
					onDragStop={scheduleSave}
					onEdgeClick={requestDeleteEdge}
					{onConnectEndToPane}
				/>
			</div>
			<aside class="editor-inspector">
				{#if !embedded}
					<div class="inspector-scene-header">
						<SceneTitle
							{slug}
							{dialogId}
							displayName={graphMeta.displayName}
							description={graphMeta.description}
							{nodeCount}
							{sequenceCount}
						/>
					</div>
				{/if}
				<NodeInspector
					{slug}
					node={selectedNode}
					nodes={graphNodes}
					edges={graphEdges}
					{characters}
					{gameStateProperties}
					{dialogIds}
					onchange={updateNode}
					onedgechange={updateEdge}
					onSetBranchTarget={handleSetBranchTarget}
					onRemoveChoiceOption={handleRemoveChoiceOption}
					oncharacterschange={(chars) => {
						characters = chars;
					}}
					ondelete={openDeleteNodeConfirm}
				/>
			</aside>
		</div>
		{/if}
		{#if previewGraph}
			<DialoguePreviewPanel
				mode="scene"
				{slug}
				graph={previewGraph}
				{characters}
				title={graphMeta.displayName}
				open={previewOpen}
				onclose={() => (previewOpen = false)}
			/>
		{/if}
	{/if}

	{#if saveStatus || loading}
		<span class="status-toast" class:saved={saveStatus === 'Saved'}>
			{saveStatus || (loading ? 'Loading…' : '')}
		</span>
	{/if}
</div>

<dialog bind:this={confirmDialogEl} class="modal" onclose={closeConfirmDialog}>
	<form
		method="dialog"
		class="modal-panel modal-panel-sm"
		onsubmit={(e) => {
			e.preventDefault();
			applyConfirmDelete();
		}}
	>
		<header class="modal-header">
			<h2>{confirmMode === 'node' ? 'Delete node' : 'Remove connection'}</h2>
		</header>
		<div class="modal-body">
			<p>{confirmMessage}</p>
		</div>
		<footer class="modal-footer">
			<div class="modal-footer-right">
				<button type="button" class="btn" onclick={closeConfirmDialog}>Cancel</button>
				<button type="submit" class="btn btn-danger">
					{confirmMode === 'node' ? 'Delete' : 'Remove'}
				</button>
			</div>
		</footer>
	</form>
</dialog>

<style>
	.scene-editor {
		position: relative;
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		width: 100%;
	}

	.scene-editor.embedded {
		height: 100%;
	}

	.editor-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.5rem 1rem;
		border-bottom: 1px solid var(--border);
	}

	.view-toggle {
		display: flex;
		gap: 0.35rem;
	}

	.flow-layout {
		flex: 1;
		min-height: 0;
		height: 100%;
	}

	.inspector-scene-header {
		margin: -1rem -1rem 1rem;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--border);
	}

	.inspector-scene-header :global(.scene-header) {
		margin-bottom: 0;
	}

	.inspector-scene-header :global(h2) {
		font-size: 1rem;
	}

	.status-toast {
		position: absolute;
		right: 1.5rem;
		bottom: 0.75rem;
		z-index: 10;
		font-size: 0.85rem;
		color: var(--text-muted);
		pointer-events: none;
	}

	.status-toast.saved {
		color: var(--success);
	}

	.error-banner {
		padding: 1rem;
		margin: 0 1.5rem;
		color: var(--error);
		background: rgba(240, 113, 120, 0.1);
		border: 1px solid var(--error);
		border-radius: var(--radius);
	}

	.modal {
		border: none;
		padding: 0;
		background: transparent;
		max-width: min(28rem, calc(100vw - 2rem));
	}

	.modal::backdrop {
		background: rgba(0, 0, 0, 0.55);
	}

	.modal-panel {
		display: flex;
		flex-direction: column;
		max-height: min(90dvh, 40rem);
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
	}

	.modal-panel label {
		color: var(--text);
	}

	.modal-panel-sm {
		max-width: 24rem;
	}

	.modal-header {
		padding: 1rem 1.25rem 0.75rem;
		border-bottom: 1px solid var(--border);
	}

	.modal-header h2 {
		margin: 0;
		font-size: 1.1rem;
	}

	.modal-body {
		padding: 1rem 1.25rem;
		overflow-y: auto;
	}

	.modal-body p {
		margin: 0;
		color: var(--text-muted);
	}

	.modal-footer {
		padding: 0.75rem 1.25rem 1rem;
		border-top: 1px solid var(--border);
	}

	.modal-footer-right {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
</style>
