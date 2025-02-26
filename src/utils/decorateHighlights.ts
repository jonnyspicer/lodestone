import { EntityReferenceMetaData, findMinMaxRange } from "remirror/extensions";
import { Decoration } from "@remirror/pm/view";
import { getHighlight } from "./highlightMap";
import { LABEL_CONFIGS } from "./constants";
import { mix, transparentize } from "color2k";

/**
 * Mixes colors for overlapping highlights
 * @param colors Array of colors to mix
 * @returns A CSS color string
 */
const mixColors = (colors: string[]): string => {
	if (colors.length === 0) return "transparent";
	if (colors.length === 1) {
		return transparentize(colors[0], 0.4);
	}

	// For multiple colors, mix them with increasing opacity
	// This ensures a more consistent visual appearance for overlapping highlights
	const baseOpacity = Math.max(0.2, 0.6 - colors.length * 0.1);

	return colors.reduce((acc, color, index) => {
		// Increase opacity slightly for each subsequent color
		const opacity = baseOpacity + index * 0.05;
		return mix(acc, transparentize(color, 1 - opacity), 0.5);
	});
};

/**
 * Creates decorations for highlights in the document
 * @param highlights Array of overlapping highlight arrays
 * @returns Array of decorations
 */
export const decorateHighlights = (
	highlights: EntityReferenceMetaData[][]
): Decoration[] => {
	return highlights.map((overlappingHighlights) => {
		// Get label IDs from the highlight map
		const labelIds = overlappingHighlights
			.map((h) => getHighlight(h.id))
			.filter(Boolean) as string[];

		// Get colors for each label
		const colors = labelIds
			.map((labelId) => {
				const config = LABEL_CONFIGS.find((config) => config.id === labelId);
				if (!config) {
					console.warn(`No color config found for label: ${labelId}`);
					return null;
				}
				return config.color;
			})
			.filter(Boolean) as string[];

		// Find the range for the decoration
		const [from, to] = findMinMaxRange(overlappingHighlights);

		// Create a style with mixed colors
		const backgroundColor = mixColors(colors);
		const style = `
			background: ${backgroundColor}; 
			padding: 2px 0;
			border-radius: 2px;
			transition: background-color 0.2s ease;
		`;

		// Create the decoration
		return Decoration.inline(from, to, { style });
	});
};
