<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { nanoid } from 'nanoid';
	import { api } from '../lib/api';
	import type { DialogListItem } from '../lib/server/projects';
	import type { DialogGraph } from '../lib/schema/graph';
	import type { CharactersFile } from '../lib/schema/characters';
	import type { FlowGraph, FlowNode, FlowEdge } from '../lib/schema/flow';
	import type { GameStateProperty } from '../lib/schema/gameState';
	import { analyzeFlowBranches, applyFirstMeetings } from '../lib/flow/branchAnalyzer';
	import { createSceneNode } from '../lib/flow/flowFactory';
	import GameFlowCanvas from './GameFlowCanvas.svelte';
	import FlowNodeInspector from './FlowNodeInspector.svelte';
	import DialogEditorModal from './DialogEditorModal.svelte';

	interface Props {
		slug: string;
	}

	let { slug }: Props = $props();

	type CanvasNode = {
		id: string;
		type?: string;
		position: { x: number; y: number };
		data?: Record<string, unknown>;
	};
	type CanvasEdge = {
		id: string;
		source: string;
		target: string;
		sourceHandle?: string | null;
		targetHandle?: string | null;
		data?: Record<string, unknown>;
	};

	let loading = $state(true);
	let ready = $state(false);
	let loadError = $state('');
	let saveStatus = $state('');
	let selectedNodeId = $state<string | null>(null);
	let dialogs = $state<DialogListItem[]>([]);
	let gameStateProperties = $state<GameStateProperty[]>([]);
	let syncKey = $state('');
	let confirmDialogEl = $state<HTMLDialogElement | null>(null);
	let confirmMode = $state<'node' | 'edge'>('node');
	let confirmMessage = $state('');
	let pendingEdge = $state<CanvasEdge | null>(null);
	let editorDialogId = $state<string | null>(null);
	let editorTitle = $state('Edit scene');
	let analyzing = $state(false);

	let flowNodes = $state<FlowNode[]>([]);
	let flowEdges = $state<FlowEdge[]>([]);
	let canvasNodes = $state.raw<CanvasNode[]>([]);
	let canvasEdges = $state.raw<CanvasEdge[]>([]);

	const selectedNode = $derived.by((): FlowNode | null => {
		if (!selectedNodeId) return null;
		const n = canvasNodes.find((cn) => cn.id === selectedNodeId);
		if (!n) return null;
		return {
			id: n.id,
			type: n.type as FlowNode['type'],
			position: n.position,
			data: (n.data ?? {}) as FlowNode['data'],
		};
	});

	function toCanvas(graph: FlowGraph) {
		canvasNodes = graph.nodes.map((n) => ({
			id: n.id,
			type: n.type,
			position: n.position,
			data: n.data,
		}));
		canvasEdges = graph.edges.map((e) => ({
			id: e.id,
			source: e.source,
			target: e.target,
			sourceHandle: e.sourceHandle,
			targetHandle: e.targetHandle,
			data: e.data,
		}));
		syncKey = `${graph.updatedAt ?? Date.now()}`;
	}

	function fromCanvas(): FlowGraph {
		return {
			id: 'main',
			displayName: 'Game flow',
			nodes: canvasNodes.map((n) => ({
				id: n.id,
				type: n.type as FlowNode['type'],
				position: n.position,
				data: (n.data ?? {}) as FlowNode['data'],
			})),
			edges: canvasEdges.map((e) => ({
				id: e.id,
				source: e.source,
				target: e.target,
				sourceHandle: e.sourceHandle ?? undefined,
				targetHandle: e.targetHandle ?? undefined,
				data: e.data as FlowEdge['data'],
			})),
		};
	}

	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	let analyzeTimer: ReturnType<typeof setTimeout> | undefined;

	function scheduleSave() {
		if (loading || !ready) return;
		flowNodes = fromCanvas().nodes;
		flowEdges = fromCanvas().edges;
		clearTimeout(saveTimer);
		saveTimer = setTimeout(save, 450);
		scheduleAnalyze();
	}

	function scheduleAnalyze() {
		if (loading || !ready) return;
		clearTimeout(analyzeTimer);
		analyzeTimer = setTimeout(runBranchAnalyzer, 500);
	}

	async function save() {
		saveStatus = 'Saving…';
		try {
			const graph = fromCanvas();
			const res = await api<{ graph: FlowGraph }>(`/api/projects/${slug}/flow`, {
				method: 'PUT',
				body: JSON.stringify({ graph }),
			});
			flowNodes = res.graph.nodes;
			flowEdges = res.graph.edges;
			saveStatus = 'Saved';
			setTimeout(() => {
				if (saveStatus === 'Saved') saveStatus = '';
			}, 1500);
		} catch (e) {
			saveStatus = (e as Error).message;
		}
	}

	async function loadDialogs() {
		const res = await api<{ dialogs: DialogListItem[] }>(`/api/projects/${slug}/dialogs`);
		dialogs = res.dialogs;
	}

	async function loadGameState() {
		const res = await api<{ properties: GameStateProperty[] }>(`/api/projects/${slug}/game-state`);
		gameStateProperties = res.properties;
	}

	async function load() {
		loading = true;
		ready = false;
		loadError = '';
		try {
			const [{ graph }] = await Promise.all([
				api<{ graph: FlowGraph }>(`/api/projects/${slug}/flow`),
				loadDialogs(),
				loadGameState(),
			]);
			flowNodes = graph.nodes;
			flowEdges = graph.edges;
			toCanvas(graph);
			ready = true;
			selectFromHash();
			scheduleAnalyze();
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

	function selectFromHash() {
		if (typeof window === 'undefined') return;
		const id = window.location.hash.replace(/^#/, '');
		if (id && canvasNodes.some((n) => n.id === id)) {
			selectedNodeId = id;
		}
	}

	function updateNode(updated: FlowNode) {
		canvasNodes = canvasNodes.map((n) =>
			n.id === updated.id
				? { ...n, data: updated.data, type: updated.type }
				: n,
		);
		flowNodes = flowNodes.map((n) => (n.id === updated.id ? updated : n));
		syncKey = `local-${Date.now()}`;
		scheduleSave();
	}

	function onConnect() {
		scheduleSave();
	}

	function changeNodeType(type: 'scene' | 'branch') {
		if (!selectedNodeId) return;
		const node = canvasNodes.find((n) => n.id === selectedNodeId);
		if (!node || (node.type !== 'scene' && node.type !== 'branch') || node.type === type) return;

		if (type === 'branch') {
			canvasNodes = canvasNodes.map((n) =>
				n.id === selectedNodeId
					? {
							...n,
							type: 'branch',
							data: {
								label: (n.data?.label as string | undefined) || 'Branch',
								branchStateId: undefined,
								options: [],
							},
						}
					: n,
			);
			canvasEdges = canvasEdges.filter((e) => e.source !== selectedNodeId);
		} else {
			canvasNodes = canvasNodes.map((n) =>
				n.id === selectedNodeId
					? {
							...n,
							type: 'scene',
							data: { label: (n.data?.label as string | undefined) || 'New scene' },
						}
					: n,
			);
			canvasEdges = canvasEdges.map((e) =>
				e.source === selectedNodeId ? { ...e, sourceHandle: null } : e,
			);
		}
		syncKey = `local-${Date.now()}`;
		scheduleSave();
	}

	async function openDeleteNodeConfirm() {
		if (!selectedNodeId) return;
		const node = canvasNodes.find((n) => n.id === selectedNodeId);
		if (!node || node.type === 'start') return;
		const label = (node.data?.label as string | undefined) ?? node.id;
		confirmMode = 'node';
		pendingEdge = null;
		confirmMessage = `Delete "${label}" from the flow chart?`;
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
		confirmMessage = 'Remove this connection from the flow chart?';
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
			canvasNodes = canvasNodes.filter((n) => n.id !== selectedNodeId);
			canvasEdges = canvasEdges.filter(
				(e) => e.source !== selectedNodeId && e.target !== selectedNodeId,
			);
			selectedNodeId = null;
		} else if (pendingEdge) {
			const target = pendingEdge;
			canvasEdges = canvasEdges.filter(
				(e) => e.id !== target.id && !edgeMatches(e, target),
			);
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
		const node = createSceneNode(params.position);
		const id = `e-${params.sourceNodeId}-${node.id}-${nanoid(4)}`;
		canvasNodes = [
			...canvasNodes,
			{
				id: node.id,
				type: node.type,
				position: node.position,
				data: node.data,
			},
		];
		canvasEdges = [
			...canvasEdges,
			{
				id,
				source: params.sourceNodeId,
				target: node.id,
				sourceHandle: params.sourceHandle,
			},
		];
		selectedNodeId = node.id;
		syncKey = `local-${Date.now()}`;
		scheduleSave();
	}

	function isEditableTarget(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;
		const tag = target.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
		return target.isContentEditable;
	}

	function openDialogEditor(dialogId: string, title?: string) {
		editorDialogId = dialogId;
		editorTitle = title?.trim() ? `Edit: ${title.trim()}` : `Edit: ${dialogId}`;
	}

	async function closeDialogEditor() {
		editorDialogId = null;
		await loadDialogs();
		scheduleAnalyze();
	}

	async function runBranchAnalyzer() {
		if (analyzing || loading || !ready) return;
		analyzing = true;
		try {
			const graph = fromCanvas();
			const sceneDialogIds = [
				...new Set(
					graph.nodes
						.filter((n) => n.type === 'scene' && n.data.dialogId)
						.map((n) => n.data.dialogId!),
				),
			];

			const [charactersRes, ...dialogGraphs] = await Promise.all([
				api<CharactersFile>(`/api/projects/${slug}/characters`),
				...sceneDialogIds.map((id) =>
					api<{ graph: DialogGraph }>(`/api/projects/${slug}/dialogs/${id}`),
				),
			]);

			const dialogs: Record<string, DialogGraph> = {};
			sceneDialogIds.forEach((id, i) => {
				dialogs[id] = dialogGraphs[i]!.graph;
			});

			const analysis = analyzeFlowBranches(graph, dialogs, charactersRes.characters);
			const updated = applyFirstMeetings(graph.nodes, analysis);

			canvasNodes = canvasNodes.map((n) => {
				const match = updated.find((u) => u.id === n.id);
				if (!match) return n;
				return { ...n, data: match.data };
			});
			syncKey = `local-${Date.now()}`;
			clearTimeout(saveTimer);
			await save();
		} catch {
			/* analyzer is best-effort; flow edits still save normally */
		} finally {
			analyzing = false;
		}
	}

	function onKeyDown(event: KeyboardEvent) {
		if (event.key !== 'Delete' && event.key !== 'Backspace') return;
		if (isEditableTarget(event.target)) return;
		if (!selectedNodeId) return;
		const node = canvasNodes.find((n) => n.id === selectedNodeId);
		if (!node || node.type === 'start') return;
		event.preventDefault();
		openDeleteNodeConfirm();
	}

	onMount(() => {
		load();
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	});
</script>

<div class="flow-editor">
	{#if loadError}
		<p class="error-banner">{loadError}</p>
	{:else if ready}
		<div class="editor-layout flow-layout">
			<div class="editor-canvas">
				<GameFlowCanvas
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
				<FlowNodeInspector
					{slug}
					node={selectedNode}
					{dialogs}
					{gameStateProperties}
					onchange={updateNode}
					onTypeChange={changeNodeType}
					ondelete={openDeleteNodeConfirm}
					onEditDialog={openDialogEditor}
					onDialogsRefresh={loadDialogs}
				/>
			</aside>
		</div>
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

<DialogEditorModal
	{slug}
	dialogId={editorDialogId}
	title={editorTitle}
	onclose={closeDialogEditor}
/>

<style>
	.flow-editor {
		position: relative;
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		width: 100%;
	}

	.flow-layout {
		flex: 1;
		min-height: 0;
		height: 100%;
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
