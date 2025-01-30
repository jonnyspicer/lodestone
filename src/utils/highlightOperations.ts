import { db } from "../db";
import { highlightMap } from "./highlightMap";
import type { EditorContent } from "../db";

/**
 * Deletes a highlight and its associated relationships
 * @param highlightId The ID of the highlight to delete
 * @param currentRecord The current editor content record
 * @returns The updated editor content
 */
export async function deleteHighlight(
	highlightId: string,
	currentRecord: EditorContent
): Promise<void> {
	if (!currentRecord.id) {
		throw new Error("Cannot delete highlight: No record ID found");
	}

	// Remove the highlight from highlights array
	const newHighlights = currentRecord.highlights.filter(
		(h) => h.id !== highlightId
	);

	// Remove any relationships that reference this highlight
	const newRelationships = currentRecord.relationships.filter(
		(rel) =>
			rel.sourceHighlightId !== highlightId &&
			rel.targetHighlightId !== highlightId
	);

	// Remove from the highlight map
	highlightMap.delete(highlightId);

	// Update the database with both changes
	await db.editorContent.update(currentRecord.id, {
		...currentRecord,
		highlights: newHighlights,
		relationships: newRelationships,
	});
}
