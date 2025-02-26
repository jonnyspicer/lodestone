import { useCallback, useState } from "react";
import {
	useCommands,
	useHelpers,
	useRemirrorContext,
	useChainedCommands,
} from "@remirror/react";
import type { RemirrorJSON } from "remirror";
import { EntityReferenceExtension } from "remirror/extensions";
import {
	getHighlight,
	setHighlight,
	deleteHighlight,
} from "../utils/highlightMap";
import { LABEL_CONFIGS } from "../utils/constants";
import { transparentize, mix } from "color2k";
import { createDocumentWithMarks } from "../services/annotation/documentUtils";
import { Node, Mark } from "@remirror/pm/model";
import { createEntityReference } from "../utils/entityUtils";

type HighlightButtonsProps = {
	onSave: (json: RemirrorJSON) => void;
};

export const HighlightButtons = ({ onSave }: HighlightButtonsProps) => {
	const { getEntityReferencesAt } = useHelpers<EntityReferenceExtension>();
	const commands = useCommands<EntityReferenceExtension>();
	const chain = useChainedCommands();
	const { getState } = useRemirrorContext();
	const highlightsAt = getEntityReferencesAt();
	const [error, setError] = useState<string | null>(null);

	// Function to check for highlight limits and debug issues
	const checkHighlightLimit = (
		currentHighlights: Array<{
			id: string;
			labelType: string;
			text: string;
			startIndex: number;
			endIndex: number;
			attrs?: {
				labelType: string;
				type: string;
			};
		}>,
		newHighlight: {
			id: string;
			labelType: string;
			text: string;
			startIndex: number;
			endIndex: number;
			attrs?: {
				labelType: string;
				type: string;
			};
		}
	) => {
		// Check for potential overlap issues
		const overlapping = currentHighlights.filter(
			(h) =>
				newHighlight.startIndex <= h.endIndex &&
				newHighlight.endIndex >= h.startIndex
		);

		if (overlapping.length > 0) {
			overlapping.forEach((h) => {
				console.log(
					`[DEBUG-LIMIT] - Overlap with: ${h.id} (${h.labelType}), range: ${h.startIndex}-${h.endIndex}`
				);
			});
		}
	};

	const handleHighlight = useCallback(
		(labelId: string) => {
			try {
				// Clear any previous errors
				setError(null);

				const state = getState();
				const { from, to } = state.selection;

				// Check if there's a selection
				const hasSelection = from !== to;
				const selectedText = hasSelection
					? state.doc.textBetween(from, to)
					: "";

				if (!hasSelection) {
					setError("Please select some text to highlight");
					return;
				}

				// Find highlights of this type at the current position
				const highlightsOfType = highlightsAt.filter(
					(h) => getHighlight(h.id) === labelId
				);

				// If this type of highlight already exists, remove it first
				if (highlightsOfType.length > 0) {
					highlightsOfType.forEach((highlight) => {
						try {
							commands.removeEntityReference(highlight.id);
							deleteHighlight(highlight.id);
						} catch (e) {
							console.error(`Failed to remove highlight ${highlight.id}:`, e);
						}
					});
				}

				// Generate a unique ID for the new highlight
				const id = crypto.randomUUID();

				// Add the highlight ID to our map - IMPORTANT - this ensures the highlight type is stored
				setHighlight(id, labelId);

				// Create a new highlight object with explicit labelType in both places
				const newHighlight = {
					id,
					labelType: labelId,
					text: selectedText,
					startIndex: from,
					endIndex: to,
					// Make sure we include the correct attributes for entity references
					attrs: {
						labelType: labelId,
						type: labelId,
					},
				};

				// Get current content and extract existing highlights
				const currentContent = state.doc.toJSON();
				const currentHighlights = extractHighlightsFromDocument(state);

				console.log(
					`[Debug] Before applying new highlight - ${currentHighlights.length} existing highlights`
				);

				// Apply the highlight using proper command chaining (as per Remirror docs)
				try {
					// Using the chain command pattern
					chain
						.addEntityReference(id, {
							labelType: labelId,
							type: labelId,
						})
						.setMeta("highlightOperation", true)
						.run();
				} catch (e) {
					console.error("Error adding entity reference:", e);

					// Fallback to the document rebuild approach if direct command fails
					console.log("Falling back to document rebuild approach");

					// Add new highlight to collection
					checkHighlightLimit(currentHighlights, newHighlight);
					currentHighlights.push(newHighlight);

					// Create document with all highlights applied as marks
					const contentWithMarks = createDocumentWithMarks(
						currentContent,
						currentHighlights
					);

					// Explicitly add the highlights array to the content to preserve metadata
					const contentWithHighlightsMetadata = {
						...contentWithMarks,
						highlights: currentHighlights,
					};

					// Apply the new document to the editor with the highlights array included
					commands.setContent(contentWithHighlightsMetadata);
				}

				// Read the highlights directly from the document to confirm they were applied
				const finalState = getState();
				const finalHighlights = extractHighlightsFromDocument(finalState);

				console.log(
					`[Debug] After applying - extracted ${finalHighlights.length} highlights from document`
				);

				// Combine all highlights to ensure none are lost
				const allHighlights = [...currentHighlights];

				// Update or add the new highlight to ensure it's properly recorded
				const existingIndex = allHighlights.findIndex((h) => h.id === id);
				if (existingIndex >= 0) {
					allHighlights[existingIndex] = newHighlight;
				} else {
					allHighlights.push(newHighlight);
				}

				// Add any highlights from finalHighlights that aren't already in allHighlights
				finalHighlights.forEach((highlight) => {
					if (!allHighlights.some((h) => h.id === highlight.id)) {
						allHighlights.push(highlight);
					}
				});

				// Make sure highlight map is in sync with all highlights
				allHighlights.forEach((highlight) => {
					setHighlight(highlight.id, highlight.labelType);
				});

				// Save the updated content with highlights explicitly included
				const contentWithHighlights = {
					...finalState.doc.toJSON(),
					highlights: allHighlights,
				};

				onSave(contentWithHighlights);
			} catch (error) {
				console.error("Error applying highlight:", error);
				setError(
					`Error applying highlight: ${
						error instanceof Error ? error.message : String(error)
					}`
				);
			}
		},
		[getState, highlightsAt, commands, chain, onSave]
	);

	// Helper function to extract highlights from the document
	const extractHighlightsFromDocument = (
		state: ReturnType<typeof getState>
	) => {
		const highlights: Array<{
			id: string;
			labelType: string;
			text: string;
			startIndex: number;
			endIndex: number;
			attrs?: {
				labelType: string;
				type: string;
			};
		}> = [];

		const seenIds = new Set<string>();

		if (!state || !state.doc) {
			console.warn("Cannot extract highlights: state or doc is undefined");
			return highlights;
		}

		console.log("[Debug] Starting highlight extraction from document");

		// Extract all highlights from the document
		state.doc.descendants((node: Node, pos: number) => {
			if (node.marks && node.isText && node.text) {
				const entityMarks = node.marks.filter(
					(mark: Mark) => mark.type.name === "entity-reference"
				);

				if (entityMarks.length > 0) {
					console.log(
						`[Debug] Found ${entityMarks.length} entity marks at position ${pos} with text "${node.text}"`
					);
				}

				entityMarks.forEach((mark: Mark) => {
					// Safely extract mark attributes
					const attrs = mark.attrs as
						| {
								id?: string;
								labelType?: string;
								type?: string;
						  }
						| undefined;

					if (attrs?.id && !seenIds.has(attrs.id)) {
						// Extract labelType with improved fallback strategy
						const id = attrs.id;
						const labelType =
							attrs.labelType || attrs.type || getHighlight(id) || "claim";

						console.log(
							`[Debug] Extracted highlight: id=${id}, labelType=${labelType}, text="${node.text}", pos=${pos}`
						);

						highlights.push({
							id,
							labelType,
							text: node.text || "",
							startIndex: pos,
							endIndex: pos + (node.text?.length || 0),
							attrs: {
								labelType,
								type: labelType,
							},
						});
						seenIds.add(id);
					}
				});
			}
			return true;
		});

		console.log(
			`[Debug] Finished extraction - found ${highlights.length} highlights`
		);
		return highlights;
	};

	return (
		<div>
			{error && <div className="text-red-500 mb-2 text-sm">{error}</div>}
			{LABEL_CONFIGS.map((label) => {
				const active = highlightsAt.some(
					(h) => getHighlight(h.id) === label.id
				);

				return (
					<button
						key={label.id}
						onClick={() => handleHighlight(label.id)}
						className={`
							mr-2 px-2 py-1 rounded
							border transition-opacity duration-200
							${active ? "opacity-100" : "opacity-70"}
						`}
						style={{
							backgroundColor: transparentize(label.color, 0.4),
							borderColor: transparentize(label.color, 0.2),
							color: mix(label.color, "#000000", 0.7),
						}}
					>
						{label.name}
					</button>
				);
			})}
		</div>
	);
};
