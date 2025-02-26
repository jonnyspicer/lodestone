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
	// Ensure both labelType and type are set to the same value
	const attrs = {
		id,
		labelType,
		type: labelType,
	};

	// Add the entity reference with the configured attributes
	try {
		const result = commands.addEntityReference({
			id,
			attrs,
		})(from, to);

		// Store in the highlight map for persistence
		setHighlight(id, labelType);

		return result;
	} catch (error) {
		console.error("Error adding entity reference:", error);
		throw error;
	}
}
