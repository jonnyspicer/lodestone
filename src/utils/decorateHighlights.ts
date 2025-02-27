import { EntityReferenceMetaData, findMinMaxRange } from "remirror/extensions";
import { Decoration } from "@remirror/pm/view";
import { getHighlight } from "./highlightMap";
import { LABEL_CONFIGS } from "./constants";
import { transparentize, mix } from "color2k";

/**
 * Creates decorations for highlights in the document
 * This function is called by Remirror to style entity references
 * @param highlights Array of overlapping highlight arrays
 * @returns Array of decorations
 */
export const decorateHighlights = (
	highlights: EntityReferenceMetaData[][]
): Decoration[] => {
	return highlights.map((overlappingHighlights) => {
		// Get label IDs from the highlight map for each highlight
		const colors = overlappingHighlights
			.map((h) => {
				const labelId = getHighlight(h.id);
				if (!labelId) return null;

				const config = LABEL_CONFIGS.find((config) => config.id === labelId);
				return config?.color || null;
			})
			.filter(Boolean) as string[];

		// Find the range for the decoration
		const [from, to] = findMinMaxRange(overlappingHighlights);

		// Simple background color handling with transparency
		let backgroundColor;

		if (colors.length === 0) {
			// No colors - transparent background
			backgroundColor = "transparent";
		} else if (colors.length === 1) {
			// Single color with 50% transparency
			backgroundColor = transparentize(colors[0], 0.5);
		} else {
			// Multiple colors - mix them with equal weight
			let mixedColor = colors[0];
			for (let i = 1; i < colors.length; i++) {
				// Mix with the next color (equal weight)
				mixedColor = mix(mixedColor, colors[i], 0.5);
			}
			backgroundColor = transparentize(mixedColor, 0.4);
		}

		// Create a simple decoration with the background color
		return Decoration.inline(from, to, {
			style: `
				background: ${backgroundColor}; 
				padding: 2px 0;
				border-radius: 2px;
			`,
		});
	});
};
