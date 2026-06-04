extends Node
## Reference dialogue runner for Dialogsys JSON exports.
## Autoload this script, set dialogue_root, then call start("dialog_id").

signal line_shown(speaker: String, text: String, node_id: String)
signal choices_shown(options: Array, node_id: String)
signal dialogue_ended
signal run_command(command: String, args: Dictionary)

@export var dialogue_root: String = "res://dialogue/"

var _data: Dictionary = {}
var _dialog_id: String = ""
var _current_id: String = ""
var _game_state: Dictionary = {}

func load_dialog_file(relative_path: String) -> bool:
	var path := dialogue_root.path_join(relative_path)
	if not path.ends_with(".json"):
		path += ".json"
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		push_error("DialogueRunner: cannot open %s" % path)
		return false
	var parsed = JSON.parse_string(file.get_as_text())
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("DialogueRunner: invalid JSON in %s" % path)
		return false
	_data = parsed
	return true

func start(dialog_id: String) -> void:
	_dialog_id = dialog_id
	if not load_dialog_file("dialogs/%s.json" % dialog_id):
		return
	_current_id = str(_data.get("start", "end"))
	_advance()

func set_game_state(state: Dictionary) -> void:
	_game_state = state

func get_game_state() -> Dictionary:
	return _game_state

func choose(index: int) -> void:
	var node = _get_node(_current_id)
	if node.get("type") != "choice":
		return
	var options: Array = node.get("options", [])
	if index < 0 or index >= options.size():
		return
	var opt: Dictionary = options[index]
	if not _conditions_met(opt.get("conditions", [])):
		return
	_current_id = str(opt.get("next", "end"))
	_advance()

func advance() -> void:
	_advance()

func _advance() -> void:
	while _current_id != "" and _current_id != "end":
		var node := _get_node(_current_id)
		var t: String = node.get("type", "")
		match t:
			"line":
				line_shown.emit(
					str(node.get("speaker", "")),
					str(node.get("text", "")),
					_current_id,
				)
				_current_id = str(node.get("next", "end"))
				return
			"choice":
				var visible: Array = []
				for opt in node.get("options", []):
					if _conditions_met(opt.get("conditions", [])):
						visible.append(opt)
				choices_shown.emit(visible, _current_id)
				return
			"set_var":
				for op in node.get("ops", []):
					run_command.emit("set_var", op)
				_current_id = str(node.get("next", "end"))
			"branch":
				var key := _branch_key(node)
				var val = _game_state.get(key, 0)
				var check = val
				if check:
					_current_id = str(node.get("trueNext", "end"))
				else:
					_current_id = str(node.get("falseNext", "end"))
			"jump":
				var target_id: String = str(node.get("dialogId", ""))
				run_command.emit("jump", { "dialogId": target_id })
				dialogue_ended.emit()
				return
			"end":
				_current_id = "end"
			_:
				push_warning("DialogueRunner: unknown node type %s" % t)
				_current_id = "end"
	dialogue_ended.emit()

func _get_node(node_id: String) -> Dictionary:
	var nodes: Dictionary = _data.get("nodes", {})
	if nodes.has(node_id):
		return nodes[node_id]
	if node_id == "end":
		return { "type": "end" }
	return { "type": "end" }

func _branch_key(node: Dictionary) -> String:
	if node.get("scope") == "character":
		return "%s.%s" % [node.get("characterId", ""), node.get("var", "")]
	return str(node.get("var", ""))

func _conditions_met(groups: Array) -> bool:
	if groups.is_empty():
		return true
	for group in groups:
		if typeof(group) != TYPE_DICTIONARY:
			continue
		if group.has("all"):
			for atom in group["all"]:
				if not _atom_met(atom):
					return false
			return true
		if group.has("any"):
			for atom in group["any"]:
				if _atom_met(atom):
					return true
			return false
	return true

func _atom_met(atom) -> bool:
	if typeof(atom) != TYPE_DICTIONARY:
		return true
	if atom.has("all") or atom.has("any"):
		return _conditions_met([atom])
	var key := ""
	if atom.get("scope") == "character":
		key = "%s.%s" % [atom.get("characterId", ""), atom.get("var", "")]
	else:
		key = str(atom.get("var", ""))
	var actual = _game_state.get(key, atom.get("value"))
	var expected = atom.get("value")
	var op: String = atom.get("op", "eq")
	match op:
		"eq": return actual == expected
		"neq": return actual != expected
		"gt": return actual > expected
		"gte": return actual >= expected
		"lt": return actual < expected
		"lte": return actual <= expected
	return true
