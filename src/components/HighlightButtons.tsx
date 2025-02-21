import { useCallback } from "react";
import { useCommands, useHelpers, useRemirrorContext } from "@remirror/react";
import type { RemirrorJSON } from "remirror";
import { EntityReferenceExtension } from "remirror/extensions";
import { highlightMap } from "../utils/highlightMap";
import { LABEL_CONFIGS } from "../utils/constants";
import { transparentize, mix } from "color2k";

type HighlightButtonsProps = {
	onSave: (json: RemirrorJSON) => void;
};

export const HighlightButtons = ({ onSave }: HighlightButtonsProps) => {
	const { getEntityReferencesAt } = useHelpers<EntityReferenceExtension>();
	const commands = useCommands<EntityReferenceExtension>();
	const { getState } = useRemirrorContext();
	const highlightsAt = getEntityReferencesAt();

	const handleHighlight = useCallback(
		(labelId: string) => {
			const highlightsOfType = highlightsAt.filter(
				(h) => highlightMap.get(h.id) === labelId
			);

			if (highlightsOfType.length > 0) {
				highlightsOfType.forEach((highlight) => {
					commands.removeEntityReference(highlight.id);
					highlightMap.delete(highlight.id);
				});
			} else {
				const state = getState();
				const { from, to } = state.selection;
				const selectedText = state.doc.textBetween(from, to);

				const id = crypto.randomUUID();
				// Create highlight with consistent type and attributes
				const highlight = {
					id,
					labelType: labelId,
					text: selectedText,
					startIndex: from,
					endIndex: to,
					attrs: {
						labelType: labelId,
						type: labelId,
					},
				};

				commands.addEntityReference(id, {
					id,
					labelType: labelId,
					type: "entity-reference",
					attrs: {
						labelType: labelId,
						type: labelId,
					},
				});
				highlightMap.set(id, labelId);

				// Extract all highlights from the document
				const currentHighlights: Array<{
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

				// First add all existing highlights from the document
				state.doc.descendants((node, pos) => {
					if (node.marks && node.isText && node.text) {
						const entityMarks = node.marks.filter(
							(mark) => mark.type.name === "entity-reference"
						);

						entityMarks.forEach((mark) => {
							currentHighlights.push({
								id: mark.attrs.id,
								labelType: mark.attrs.labelType,
								text: node.text!,
								startIndex: pos,
								endIndex: pos + node.text!.length,
								attrs: {
									labelType: mark.attrs.labelType,
									type: mark.attrs.type,
								},
							});
						});
					}
					return true;
				});

				// Add the new highlight
				currentHighlights.push(highlight);

				const json = state.doc.toJSON();
				const contentWithHighlights = {
					...json,
					highlights: currentHighlights,
				};

				onSave(contentWithHighlights);
			}
		},
		[commands, highlightsAt, onSave, getState]
	);

	return (
		<div>
			{LABEL_CONFIGS.map((label) => {
				const active = highlightsAt.some(
					(h) => highlightMap.get(h.id) === label.id
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
