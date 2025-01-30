// Interface for a directional relationship between two highlights
export interface Relationship {
	sourceHighlightId: string; // The highlight that is connecting from
	targetHighlightId: string; // The highlight that is being connected to
}
