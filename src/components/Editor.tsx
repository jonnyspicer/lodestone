import { useCallback, forwardRef, useImperativeHandle, useEffect } from "react";
import {
	useRemirror,
	EditorComponent,
	Remirror,
	ReactFrameworkOutput,
} from "@remirror/react";
import type { RemirrorJSON } from "remirror";
import { EntityReferenceExtension } from "remirror/extensions";
import type {
	RemirrorEventListener,
	RemirrorEventListenerProps,
} from "@remirror/core";
import { highlightMap } from "../utils/highlightMap";
import { HighlightButtons } from "./HighlightButtons";
import { decorateHighlights } from "../utils/decorateHighlights";
import type { Relationship } from "../utils/relationshipTypes";
import type { Highlight } from "../utils/types";
import type { HighlightWithText } from "../services/models/types";

type EditorProps = {
	initialContent?: RemirrorJSON;
	placeholder?: string;
	showHighlightButtons?: boolean;
	highlights?: HighlightWithText[];
	relationships?: Relationship[];
	onChange?: RemirrorEventListener<EntityReferenceExtension>;
	onChangeJSON?: (json: RemirrorJSON) => void;
};

const Editor = forwardRef<
	ReactFrameworkOutput<EntityReferenceExtension>,
	EditorProps
>((props: EditorProps, ref) => {
	const { onChange, onChangeJSON } = props;

	// First create the manager and state
	const { manager, state, setState, getContext } = useRemirror({
		extensions: () => [
			new EntityReferenceExtension({
				getStyle: decorateHighlights,
			}),
		],
		content: props.initialContent ?? {
			type: "doc",
			content: [{ type: "paragraph" }],
		},
		stringHandler: "html",
		onError: ({ json, invalidContent }) => {
			console.log("🔧 Handling invalid content:", {
				invalidContent,
				json,
			});
			// Return a valid empty document if we can't handle the content
			return {
				type: "doc",
				content: [
					{
						type: "paragraph",
						content: [
							{
								type: "text",
								text: json.content?.[0]?.content?.[0]?.text || "",
							},
						],
					},
				],
			};
		},
	});

	useImperativeHandle(
		ref,
		() => getContext() as ReactFrameworkOutput<EntityReferenceExtension>,
		[getContext]
	);

	// Initialize highlights when component mounts or highlights change
	useEffect(() => {
		if (!props.highlights || !props.initialContent || !state || !manager)
			return;

		console.log("🎯 Initializing highlights:", props.highlights);

		// Get the document content
		const fullText =
			props.initialContent.content
				?.map((paragraph) =>
					paragraph.content
						?.map((node) => node.text)
						.filter(Boolean)
						.join("")
				)
				.filter(Boolean)
				.join("\n") || "";

		console.log("📝 Document content:", {
			length: fullText.length,
			content: fullText.slice(0, 50) + "...",
		});

		// Create a new state with highlights
		const tr = state.tr;
		let appliedCount = 0;

		// Add highlights to the map and mark the text
		props.highlights.forEach((highlight) => {
			if (!highlight.id || !highlight.labelType || !highlight.text) {
				return;
			}

			// Only set in map if it doesn't exist already
			if (!highlightMap.has(highlight.id)) {
				highlightMap.set(highlight.id, highlight.labelType);
			}

			// Find position of highlight in content
			const match = findBestMatch(highlight.text, fullText);
			if (match.index !== -1) {
				const markType = state.schema.marks.entityReference;
				if (markType) {
					tr.addMark(
						match.index,
						match.index + match.length,
						markType.create({
							id: highlight.id,
							labelType: highlight.labelType,
							type: highlight.labelType,
							attrs: {
								labelType: highlight.labelType,
								type: highlight.labelType,
							},
						})
					);
					appliedCount++;
				}
			}
		});

		// Apply the transaction if we made any changes
		if (appliedCount > 0) {
			console.log("✨ Applied highlights to editor:", {
				attempted: props.highlights.length,
				applied: appliedCount,
				mapSize: highlightMap.size,
			});
			setState(state.apply(tr));
		} else {
			console.warn("⚠️ No highlights were applied to editor");
		}
	}, [props.highlights, props.initialContent, state, setState, manager]);

	// Helper function to find the best match for a text snippet
	type MatchType = "exact" | "normalized" | "partial" | "none";
	type Match = {
		index: number;
		length: number;
		matchType: MatchType;
	};

	const findBestMatch = (searchText: string, inText: string): Match => {
		// Try exact match first
		const exactIndex = inText.indexOf(searchText);
		if (exactIndex !== -1) {
			return {
				index: exactIndex,
				length: searchText.length,
				matchType: "exact",
			};
		}

		// Try normalized match (case insensitive, trimmed)
		const normalizedSearch = searchText.toLowerCase().trim();
		const normalizedText = inText.toLowerCase();
		const normalizedIndex = normalizedText.indexOf(normalizedSearch);
		if (normalizedIndex !== -1) {
			return {
				index: normalizedIndex,
				length: searchText.trim().length,
				matchType: "normalized",
			};
		}

		// Try finding the longest common substring
		const words = searchText.split(" ");
		let bestMatch: Match = { index: -1, length: 0, matchType: "none" };

		for (let i = 0; i < words.length; i++) {
			for (let j = words.length; j > i; j--) {
				const phrase = words.slice(i, j).join(" ");
				if (phrase.length > bestMatch.length) {
					const index = inText.toLowerCase().indexOf(phrase.toLowerCase());
					if (index !== -1) {
						bestMatch = {
							index,
							length: phrase.length,
							matchType: "partial",
						};
					}
				}
			}
		}

		return bestMatch;
	};

	const handleChange: RemirrorEventListener<EntityReferenceExtension> =
		useCallback(
			(parameter: RemirrorEventListenerProps<EntityReferenceExtension>) => {
				// Check if this is just a selection change by looking at the transaction metadata
				const tr = parameter.tr;
				const isSelectionChangeOnly = tr?.selectionSet && !tr?.docChanged;

				console.log("🔄 Editor Change Event:", {
					type: tr?.getMeta("origin"),
					isSelectionChangeOnly,
					selectionFrom: parameter.state.selection.from,
					selectionTo: parameter.state.selection.to,
					hasStoredMarks: tr?.storedMarksSet,
					docChanged: tr?.docChanged,
					marks: parameter.state.selection.$from.marks(),
					storedMarks: parameter.state.storedMarks,
					transaction: {
						docChanged: tr?.docChanged,
						selectionSet: tr?.selectionSet,
						storedMarksSet: tr?.storedMarksSet,
						steps: tr?.steps.map((step) => step.toJSON()),
					},
				});

				// Always update the editor state
				setState(parameter.state);
				onChange?.(parameter);

				// Don't process changes if it's just a selection change
				if (isSelectionChangeOnly) {
					return;
				}

				// Start with existing highlights from props
				const existingHighlights = new Map(
					props.highlights?.map((h) => [h.id, h]) || []
				);

				// Extract current highlights from the editor state
				const currentHighlights: Highlight[] = [];
				const seenIds = new Set<string>();

				// Log the document structure
				console.log("📄 Document Structure:", {
					nodeCount: parameter.state.doc.nodeSize,
					content: parameter.state.doc.content.toJSON(),
					selection: {
						from: parameter.state.selection.from,
						to: parameter.state.selection.to,
						empty: parameter.state.selection.empty,
					},
				});

				// Traverse the document to find all marks
				parameter.state.doc.descendants((node, pos) => {
					if (node.marks && node.isText && node.text) {
						console.log("📍 Node at position", pos, {
							text: node.text,
							marks: node.marks.map((m) => ({
								type: m.type.name,
								attrs: m.attrs,
							})),
						});

						// Find all entity reference marks
						const entityMarks = node.marks.filter(
							(mark) =>
								mark.type.name === "entity-reference" &&
								mark.attrs.id &&
								mark.attrs.labelType
						);

						// Add each mark's highlight if we haven't seen it before
						entityMarks.forEach((mark) => {
							if (!seenIds.has(mark.attrs.id)) {
								// Use existing highlight data if available
								const existingHighlight = existingHighlights.get(mark.attrs.id);
								if (existingHighlight) {
									currentHighlights.push({
										...existingHighlight,
										startIndex: pos,
										endIndex: pos + (node.text?.length || 0),
									});
								} else {
									currentHighlights.push({
										id: mark.attrs.id,
										labelType: mark.attrs.labelType,
										text: node.text || "",
										startIndex: pos,
										endIndex: pos + (node.text?.length || 0),
										attrs: {
											labelType: mark.attrs.labelType,
											type: mark.attrs.labelType,
										},
									});
								}
								highlightMap.set(mark.attrs.id, mark.attrs.labelType);
								seenIds.add(mark.attrs.id);
							}
						});
					}
					return true;
				});

				// Add any existing highlights that weren't found in the editor state
				props.highlights?.forEach((highlight) => {
					if (!seenIds.has(highlight.id)) {
						currentHighlights.push(highlight);
						highlightMap.set(highlight.id, highlight.labelType);
					}
				});

				console.log("📊 Current highlights in editor state:", {
					count: currentHighlights.length,
					highlights: currentHighlights.map((h) => ({
						id: h.id,
						type: h.labelType,
						text: h.text
							? h.text.length > 20
								? h.text.slice(0, 20) + "..."
								: h.text
							: "",
					})),
				});

				// Save if we have content
				const json = parameter.state.doc.toJSON();
				if (json.content?.[0]?.content?.length > 0) {
					const contentWithHighlights = {
						...json,
						highlights: currentHighlights,
					};
					console.log("💾 Saving editor content:", {
						highlightCount: currentHighlights.length,
						isSelectionOnly: isSelectionChangeOnly,
						content: contentWithHighlights,
					});
					onChangeJSON?.(contentWithHighlights);
				}
			},
			[setState, onChange, onChangeJSON, props.highlights]
		);

	return (
		<Remirror
			manager={manager}
			state={state}
			onChange={handleChange}
			placeholder={props.placeholder || "Enter text..."}
		>
			<EditorComponent />
			{props.showHighlightButtons && (
				<div className="border-t border-gray-200 p-4">
					<HighlightButtons onSave={onChangeJSON!} />
				</div>
			)}
		</Remirror>
	);
});

Editor.displayName = "Editor";

export default Editor;
