import { EntityReferenceMetaData, findMinMaxRange } from "remirror/extensions";
import { Decoration } from "@remirror/pm/view";
import { highlightMap } from "./highlightMap";
import { LABEL_CONFIGS } from "./constants";
import { mix, transparentize } from "color2k";

const mixColors = (colors: string[]): string => {
	if (colors.length === 0) return "transparent";
	if (colors.length === 1) {
		return transparentize(colors[0], 0.4);
	}
	return colors.reduce((acc, color) =>
		mix(acc, transparentize(color, 0.3), 0.5)
	);
};

export const decorateHighlights = (
	highlights: EntityReferenceMetaData[][]
): Decoration[] => {
	return highlights.map((overlappingHighlights) => {
		const labelIds = overlappingHighlights
			.map((h) => highlightMap.get(h.id))
			.filter(Boolean);

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

		const [from, to] = findMinMaxRange(overlappingHighlights);
		const style = `background: ${mixColors(colors)}; padding: 2px 0;`;

		return Decoration.inline(from, to, { style });
	});
};
