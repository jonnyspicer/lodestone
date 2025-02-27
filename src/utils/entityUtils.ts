import { setHighlight } from "./highlightMap";

// Utility function to create properly configured entity references
export function createEntityReference(
	id: string,
	labelType: string,
	from: number,
	to: number,
	commands: {
		addEntityReference: (options: {
			id: string;
			attrs?: Record<string, unknown>;
		}) => (from: number, to: number) => boolean;
	}
) {
	// Simplified: no need for redundant attributes in the mark
	// Following Remirror's documentation pattern - only ID is needed in the mark
	// However, we need to include labelType and type for compatibility with existing code

	// Add the entity reference with minimal configuration
	try {
		const result = commands.addEntityReference({
			id,
			// Include required attributes for compatibility
			attrs: {
				labelType,
				type: labelType,
			},
		})(from, to);

		// Store the label type in the highlight map for persistence
		// This follows Remirror's recommended pattern
		setHighlight(id, labelType);

		return result;
	} catch (error) {
		console.error("Error adding entity reference:", error);
		throw error;
	}
}
