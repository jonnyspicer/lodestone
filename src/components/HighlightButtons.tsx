import { useCallback, useState } from "react";
import { useCommands, useHelpers, useRemirrorContext } from "@remirror/react";
import type { RemirrorJSON } from "remirror";
import { EntityReferenceExtension } from "remirror/extensions";
import {
	getHighlight,
	setHighlight,
	deleteHighlight,
} from "../utils/highlightMap";
import { LABEL_CONFIGS } from "../utils/constants";

type HighlightButtonsProps = {
	onSave: (json: RemirrorJSON) => void;
};

export const HighlightButtons = ({ onSave }: HighlightButtonsProps) => {
	const { getEntityReferencesAt } = useHelpers<EntityReferenceExtension>();
	const commands = useCommands<EntityReferenceExtension>();
	const { getState } = useRemirrorContext();
	const [error, setError] = useState<string | null>(null);

	// Handle highlight toggle (add or remove)
	const handleHighlight = useCallback(
		(labelId: string) => {
			try {
				// Clear any previous errors
				setError(null);

				const state = getState();
				const { from, to } = state.selection;
				const hasSelection = from !== to;

				// Get entity references at the current cursor position/selection
				const highlightsAt = getEntityReferencesAt();

				// Find highlights of the specified type
				const highlightsOfType = highlightsAt.filter((h) => {
					return getHighlight(h.id) === labelId;
				});

				// Check if there are any highlights of this type at the current position
				const active = highlightsOfType.length > 0;

				console.log(
					`[Debug] Highlight type ${labelId}: active=${active}, found=${highlightsOfType.length} at cursor`
				);

				if (active) {
					// REMOVE HIGHLIGHT: If this type is already highlighted, remove it
					highlightsOfType.forEach((highlight) => {
						console.log(`[Debug] Removing highlight ${highlight.id}`);
						commands.removeEntityReference(highlight.id);
						deleteHighlight(highlight.id);
					});
				} else if (hasSelection) {
					// ADD HIGHLIGHT: If we have a selection, add a new highlight
					const id = crypto.randomUUID();
					console.log(`[Debug] Adding highlight ${id} with type ${labelId}`);

					// Store the highlight type in our map
					setHighlight(id, labelId);

					// Add the entity reference to the document
					commands.addEntityReference(id, {
						labelType: labelId,
						type: labelId,
					});
				} else {
					// No selection - show error
					setError("Please select some text to highlight");
					return;
				}

				// After any change, save the updated content
				setTimeout(() => {
					const updatedState = getState();
					const json = updatedState.doc.toJSON();
					onSave(json);
				}, 0);
			} catch (error) {
				console.error("Error toggling highlight:", error);
				setError(
					`Error: ${error instanceof Error ? error.message : String(error)}`
				);
			}
		},
		[getState, getEntityReferencesAt, commands, onSave]
	);

	return (
		<div className="flex flex-col gap-3 highlight-buttons-sidebar">
			{error && <div className="text-red-500 mb-2 text-sm">{error}</div>}
			{LABEL_CONFIGS.map((label) => {
				// Get entity references at the current cursor position
				const highlightsAt = getEntityReferencesAt();

				// Check if any of these references match our label type
				const active = highlightsAt.some((h) => {
					return getHighlight(h.id) === label.id;
				});

				return (
					<button
						key={label.id}
						onClick={() => handleHighlight(label.id)}
						className={`
							flex items-center gap-2 text-left transition-all group
							${active ? "bg-gray-100 rounded p-1" : "p-1"}
						`}
						title={
							active
								? `Remove ${label.name} highlight`
								: `Add ${label.name} highlight`
						}
					>
						<div
							className={`w-3 h-3 rounded-full transition-all ${
								active ? "scale-110" : "group-hover:scale-110"
							}`}
							style={{ backgroundColor: label.color }}
						/>
						<span
							className={`
								${active ? "text-black font-medium" : "text-gray-700"} 
								group-hover:text-black transition-colors
							`}
						>
							{label.name}
							{active && (
								<span className="ml-1 text-xs text-gray-500">
									(click to remove)
								</span>
							)}
						</span>
					</button>
				);
			})}
		</div>
	);
};
