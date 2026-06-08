using System;
using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// Minimal reference runner for Dialogsys JSON exports.
/// Place exported dialogs under StreamingAssets/Dialogue/dialogs/.
/// </summary>
public class DialogueRunner : MonoBehaviour
{
	public event Action<string, string, string> LineShown;
	public event Action<List<ChoiceOption>, string> ChoicesShown;
	public event Action DialogueEnded;

	[Serializable]
	public class ChoiceOption
	{
		public string text;
		public string next;
	}

	private Dictionary<string, object> _nodes;
	private string _currentId = "end";

	public void StartDialog(string dialogId)
	{
		var path = System.IO.Path.Combine(Application.streamingAssetsPath, "Dialogue", "dialogs", dialogId + ".json");
		var json = System.IO.File.ReadAllText(path);
		var root = JsonUtility.FromJson<DialogRoot>(WrapForUnity(json));
		_nodes = ParseNodes(json);
		_currentId = root.start;
		Advance();
	}

	private void Advance()
	{
		while (_currentId != "end" && _nodes.TryGetValue(_currentId, out var raw))
		{
			var node = raw as Dictionary<string, object>;
			if (node == null) break;
			var type = node["type"] as string;
			if (type == "line")
			{
				LineShown?.Invoke(
					node.TryGetValue("speaker", out var s) ? s as string : "",
					node.TryGetValue("text", out var t) ? t as string : "",
					_currentId);
				_currentId = node.TryGetValue("next", out var n) ? n as string : "end";
				return;
			}
			if (type == "choice")
			{
				// Simplified — wire options in your UI layer
				DialogueEnded?.Invoke();
				return;
			}
			_currentId = node.TryGetValue("next", out var next) ? next as string : "end";
		}
		DialogueEnded?.Invoke();
	}

	[Serializable]
	private class DialogRoot
	{
		public string start;
	}

	private static string WrapForUnity(string json) => json;

	private static Dictionary<string, object> ParseNodes(string json)
	{
		// Production games should use Newtonsoft.Json or Unity's JsonUtility with typed models.
		return new Dictionary<string, object>();
	}
}
