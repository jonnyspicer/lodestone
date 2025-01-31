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
import type { Mark } from "@remirror/pm/model";
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
		const content = props.initialContent.content?.[0]?.content?.[0]?.text || "";
		console.log("📝 Document content:", {
			length: content.length,
			content: content.slice(0, 50) + "...",
		});

		// Clear existing highlights
		highlightMap.clear();

		// Create a new state with highlights
		const tr = state.tr;
		let appliedCount = 0;

		// Add highlights to the map and mark the text
		props.highlights.forEach((highlight) => {
			if (!highlight.id || !highlight.labelType || !highlight.text) {
				return;
			}

			highlightMap.set(highlight.id, highlight.labelType);

			// Find position of highlight in content
			const match = findBestMatch(highlight.text, content);
			if (match.index !== -1) {
				console.log("✨ Adding highlight:", {
					id: highlight.id,
					text: highlight.text,
					at: { from: match.index, to: match.index + match.length },
				});

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
		console.log("🔍 Finding match for:", {
			searchText,
			searchLength: searchText.length,
			inTextLength: inText.length,
		});

		// Try exact match first
		const exactIndex = inText.indexOf(searchText);
		if (exactIndex !== -1) {
			console.log("✅ Found exact match at:", exactIndex);
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
			console.log("✅ Found normalized match at:", normalizedIndex);
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

		if (bestMatch.index !== -1) {
			console.log("✅ Found partial match:", {
				text: inText.slice(bestMatch.index, bestMatch.index + bestMatch.length),
				at: bestMatch.index,
			});
		} else {
			console.log("❌ No match found for:", searchText);
		}

		return bestMatch;
	};

	const handleChange: RemirrorEventListener<EntityReferenceExtension> =
		useCallback(
			(parameter: RemirrorEventListenerProps<EntityReferenceExtension>) => {
				setState(parameter.state);
				onChange?.(parameter);

				// Track current highlights in the editor
				const currentHighlights: Highlight[] = [];

				// First collect all marks and their positions
				const markPositions: { mark: Mark; from: number; to: number }[] = [];
				let charPos = 0;
				parameter.state.doc.descendants((node) => {
					if (node.marks) {
						node.marks.forEach((mark) => {
							if (
								mark.type.name === "entity-reference" &&
								mark.attrs.id &&
								mark.attrs.labelType
							) {
								markPositions.push({
									mark,
									from: charPos,
									to: charPos + node.nodeSize,
								});
							}
						});
					}
					if (node.isText) {
						charPos += node.text!.length;
					}
					return true;
				});

				// Then extract text for each mark
				markPositions.forEach(({ mark, from, to }) => {
					const text = parameter.state.doc.textBetween(from, to);
					currentHighlights.push({
						id: mark.attrs.id,
						labelType: mark.attrs.labelType,
						text,
						startIndex: from,
						endIndex: to,
						attrs: {
							labelType: mark.attrs.labelType,
							type: mark.attrs.labelType,
						},
					});
					highlightMap.set(mark.attrs.id, mark.attrs.labelType);
				});

				if (currentHighlights.length > 0) {
					console.log(
						"🎨 Current highlights in editor:",
						currentHighlights.map((h) => ({
							id: h.id,
							type: h.labelType,
							range: `${h.startIndex}-${h.endIndex}`,
							text: h.text,
						}))
					);
				}

				const json = parameter.state.doc.toJSON();
				if (json.content?.[0]?.content?.length > 0) {
					// Include highlights in the JSON
					const contentWithHighlights = {
						...json,
						highlights: currentHighlights,
					};
					onChangeJSON?.(contentWithHighlights);
				}
			},
			[setState, onChange, onChangeJSON]
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
