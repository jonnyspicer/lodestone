import type { RemirrorJSON } from "remirror";

/**
 * Extracts plain text content from a RemirrorJSON document
 * This utility function traverses the nested structure of a RemirrorJSON document
 * and extracts all text content.
 */
export const extractTextFromContent = (json: RemirrorJSON): string => {
	let text = "";

	const traverse = (node: unknown) => {
		// Type guard to check if the node has a text property
		if (
			node &&
			typeof node === "object" &&
			"text" in node &&
			typeof node.text === "string"
		) {
			text += node.text;
		}

		// Type guard to check if the node has content array
		if (
			node &&
			typeof node === "object" &&
			"content" in node &&
			Array.isArray(node.content)
		) {
			node.content.forEach((childNode) => traverse(childNode));
		}
	};

	// Start traversal from the root
	if (json.content && Array.isArray(json.content)) {
		json.content.forEach((node) => traverse(node));
	}

	return text;
};
