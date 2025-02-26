import type { RemirrorJSON } from "remirror";
import type { HighlightWithText } from "../models/types";
import { setHighlight } from "../../utils/highlightMap";

/**
 * Creates a Remirror document with marks applied for annotations
 * @param originalContent The original Remirror JSON content
 * @param annotations The annotations to apply as marks
 * @returns A new Remirror JSON document with the annotations applied as marks
 */
export function createDocumentWithMarks(
	originalContent: RemirrorJSON,
	annotations: HighlightWithText[]
): RemirrorJSON {
	if (!annotations || annotations.length === 0) {
		return { ...originalContent };
	}

	// Debug log - number of annotations to apply
	console.log(`[Debug] Applying ${annotations.length} annotations to document`);
	console.log(
		`[Debug] Annotation details:`,
		annotations.map((a) => ({
			id: a.id,
			labelType: a.labelType,
			text:
				a.text && a.text.length > 20 ? a.text.substring(0, 20) + "..." : a.text,
		}))
	);

	annotations.forEach((annotation) => {
		// Ensure every annotation's label type is in the highlight map
		if (annotation.id && annotation.labelType) {
			setHighlight(annotation.id, annotation.labelType);
		}
	});

	// Deep clone the original content to avoid mutation
	const newContent = JSON.parse(
		JSON.stringify(originalContent)
	) as RemirrorJSON;

	// Group annotations by paragraph to process them all at once
	// for each paragraph, rather than one by one
	const annotationsByParagraph = new Map<number, HighlightWithText[]>();

	// First pass: identify which paragraph each annotation belongs to
	if (newContent.content) {
		newContent.content.forEach((paragraph, paragraphIndex) => {
			if (paragraph.type !== "paragraph") return;

			// Extract full paragraph text
			const paragraphText =
				paragraph.content?.map((node) => node.text || "").join("") || "";

			// Check each annotation
			for (const annotation of annotations) {
				if (!annotation.text) continue;

				// If this annotation text is in this paragraph
				if (paragraphText.includes(annotation.text)) {
					// Add to map
					if (!annotationsByParagraph.has(paragraphIndex)) {
						annotationsByParagraph.set(paragraphIndex, []);
					}
					annotationsByParagraph.get(paragraphIndex)?.push(annotation);
				}
			}
		});
	}

	// Second pass: process annotations paragraph by paragraph
	annotationsByParagraph.forEach((paragraphAnnotations, paragraphIndex) => {
		const paragraph = newContent.content?.[paragraphIndex];
		if (!paragraph || paragraph.type !== "paragraph" || !paragraph.content)
			return;

		// Skip if no annotations for this paragraph
		if (paragraphAnnotations.length === 0) return;

		// Extract full paragraph text
		const paragraphText = paragraph.content
			.map((node) => node.text || "")
			.join("");

		// Log debug info
		console.log(
			`[Debug] Processing paragraph ${paragraphIndex} with ${paragraphAnnotations.length} annotations`
		);

		// Collect all text segments and their highlights
		// This will help us rebuild the paragraph with all highlights intact
		interface TextSegment {
			text: string;
			highlights: Array<{
				id: string;
				labelType: string;
			}>;
			startPos: number;
		}

		// Start with the entire paragraph as one segment
		const segments: TextSegment[] = [
			{
				text: paragraphText,
				highlights: [],
				startPos: 0,
			},
		];

		// Extract existing highlights in this paragraph
		const existingHighlights: Array<{
			id: string;
			labelType: string;
			text: string;
			startIndex: number;
			endIndex: number;
		}> = [];

		if (paragraph.content) {
			let pos = 0;
			paragraph.content.forEach((node) => {
				if (node.marks && node.text) {
					const entityMarks = node.marks.filter(
						(m) =>
							typeof m === "object" && m.type === "entity-reference" && m.attrs
					);

					entityMarks.forEach((mark) => {
						if (typeof mark === "object" && mark.attrs) {
							const id = mark.attrs.id?.toString() || "";
							const labelType =
								mark.attrs.labelType?.toString() ||
								mark.attrs.type?.toString() ||
								"";

							if (id && labelType) {
								existingHighlights.push({
									id,
									labelType,
									text: node.text || "",
									startIndex: pos,
									endIndex: pos + (node.text?.length || 0),
								});
							}
						}
					});
				}
				pos += node.text?.length || 0;
			});
		}

		console.log(
			`[Debug] Found ${existingHighlights.length} existing highlights in paragraph`
		);

		// Combine existing and new highlights
		const allHighlights = [...existingHighlights];

		// Add new highlights that aren't duplicates
		paragraphAnnotations.forEach((annotation) => {
			if (!allHighlights.some((h) => h.id === annotation.id)) {
				const textIndex = paragraphText.indexOf(annotation.text || "");
				if (textIndex >= 0) {
					allHighlights.push({
						id: annotation.id,
						labelType: annotation.labelType,
						text: annotation.text || "",
						startIndex: textIndex,
						endIndex: textIndex + (annotation.text?.length || 0),
					});
				}
			}
		});

		// Sort highlights by their position in text
		allHighlights.sort((a, b) => a.startIndex - b.startIndex);

		// Split segments at each highlight boundary
		for (const highlight of allHighlights) {
			// Find the segment this highlight belongs to
			let segmentIndex = -1;
			for (let i = 0; i < segments.length; i++) {
				const segment = segments[i];
				const highlightRelativeStart = highlight.startIndex - segment.startPos;
				const highlightRelativeEnd = highlight.endIndex - segment.startPos;

				// If this highlight is in this segment
				if (
					highlightRelativeStart >= 0 &&
					highlightRelativeStart < segment.text.length
				) {
					segmentIndex = i;

					// Split the segment if needed
					const newSegments: TextSegment[] = [];

					// Text before highlight
					if (highlightRelativeStart > 0) {
						newSegments.push({
							text: segment.text.substring(0, highlightRelativeStart),
							highlights: [...segment.highlights],
							startPos: segment.startPos,
						});
					}

					// Highlighted text
					newSegments.push({
						text: segment.text.substring(
							highlightRelativeStart,
							Math.min(highlightRelativeEnd, segment.text.length)
						),
						highlights: [
							...segment.highlights,
							{
								id: highlight.id,
								labelType: highlight.labelType,
							},
						],
						startPos: segment.startPos + highlightRelativeStart,
					});

					// Text after highlight
					if (highlightRelativeEnd < segment.text.length) {
						newSegments.push({
							text: segment.text.substring(highlightRelativeEnd),
							highlights: [...segment.highlights],
							startPos: segment.startPos + highlightRelativeEnd,
						});
					}

					// Replace the segment with our new segments
					segments.splice(segmentIndex, 1, ...newSegments);
					break;
				}
			}

			if (segmentIndex === -1) {
				console.warn(
					`[Debug] Could not find segment for highlight ${highlight.id}`
				);
			}
		}

		// Create new paragraph content from segments
		const newParagraphContent: Array<{
			type: string;
			text: string;
			marks?: Array<{
				type: string;
				attrs: {
					id: string;
					labelType: string;
					type: string;
				};
			}>;
		}> = segments.map((segment) => {
			const node: {
				type: string;
				text: string;
				marks?: Array<{
					type: string;
					attrs: {
						id: string;
						labelType: string;
						type: string;
					};
				}>;
			} = {
				type: "text",
				text: segment.text,
			};

			// Add marks if this segment has highlights
			if (segment.highlights.length > 0) {
				node.marks = segment.highlights.map((highlight) => ({
					type: "entity-reference",
					attrs: {
						id: highlight.id,
						labelType: highlight.labelType,
						type: highlight.labelType,
					},
				}));
			}

			return node;
		});

		// Log what we're doing
		console.log(
			`[Debug] Replacing paragraph content with ${newParagraphContent.length} segments containing ${allHighlights.length} highlights`
		);

		// Replace the paragraph content
		paragraph.content = newParagraphContent;
	});

	return newContent;
}
