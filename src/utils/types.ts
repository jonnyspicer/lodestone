import type { RemirrorJSON } from "remirror";
import type { Relationship } from "./relationshipTypes";

export type Highlight = {
	id: string;
	labelType: string;
	text: string;
	startIndex?: number;
	endIndex?: number;
	attrs?: {
		labelType: string;
		type: string;
	};
};

export type AnalysedContent = {
	content: RemirrorJSON;
	highlights: Highlight[];
	relationships: Relationship[];
};
