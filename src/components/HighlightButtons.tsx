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
				const id = crypto.randomUUID();
				commands.addEntityReference(id, {
					id,
					labelType: labelId,
					type: labelId,
					attrs: {
						labelType: labelId,
						type: labelId,
					},
				});
				highlightMap.set(id, labelId);
			}

			const state = getState();
			const json = state.doc.toJSON();

			const contentWithHighlights = {
				...json,
				highlights: Array.from(highlightMap.entries()).map(
					([id, labelType]) => ({
						id,
						labelType,
						attrs: {
							labelType,
							type: labelType,
						},
					})
				),
			};

			onSave(contentWithHighlights);
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
