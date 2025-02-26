/**
 * Global highlight map to track highlight states
 * Maps highlight IDs to their label types
 */
export const highlightMap = new Map<string, string>();

/**
 * Safely sets a highlight in the map
 * @param id The highlight ID
 * @param labelType The label type
 */
export const setHighlight = (id: string, labelType: string): void => {
	if (!id) {
		console.warn("Attempted to set highlight with empty ID");
		return;
	}

	if (!labelType) {
		console.warn(`Attempted to set highlight ${id} with empty label type`);
		return;
	}

	highlightMap.set(id, labelType);
};

/**
 * Safely gets a highlight from the map
 * @param id The highlight ID
 * @returns The label type or undefined if not found
 */
export const getHighlight = (id: string): string | undefined => {
	if (!id) {
		console.warn("Attempted to get highlight with empty ID");
		return undefined;
	}

	return highlightMap.get(id);
};

/**
 * Safely deletes a highlight from the map
 * @param id The highlight ID
 * @returns True if the highlight was deleted, false otherwise
 */
export const deleteHighlight = (id: string): boolean => {
	if (!id) {
		console.warn("Attempted to delete highlight with empty ID");
		return false;
	}

	return highlightMap.delete(id);
};

/**
 * Clears all highlights from the map
 */
export const clearHighlights = (): void => {
	highlightMap.clear();
};

/**
 * Gets all highlights from the map
 * @returns An array of [id, labelType] pairs
 */
export const getAllHighlights = (): [string, string][] => {
	return Array.from(highlightMap.entries());
};

/**
 * Get the count of highlights in the map
 */
export function getHighlightCount(): number {
	return highlightMap.size;
}
