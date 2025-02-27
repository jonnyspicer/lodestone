import {
	useCallback,
	forwardRef,
	useImperativeHandle,
	useEffect,
	useState,
} from "react";
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
import {
	clearHighlights,
	setHighlight,
	getHighlightCount,
} from "../utils/highlightMap";
import { decorateHighlights } from "../utils/decorateHighlights";
import type { Relationship } from "../utils/relationshipTypes";
import type { Highlight } from "../utils/types";
import type { HighlightWithText } from "../services/models/types";
import { HighlightButtons } from "./HighlightButtons";

// Extended RemirrorJSON interface to include highlights
interface RemirrorJSONWithHighlights extends RemirrorJSON {
	highlights?: Highlight[];
}

type EditorProps = {
	initialContent?: RemirrorJSONWithHighlights;
	placeholder?: string;
	showHighlightButtons?: boolean;
	highlights?: HighlightWithText[];
	relationships?: Relationship[];
	onChange?: RemirrorEventListener<EntityReferenceExtension>;
	onChangeJSON?: (json: RemirrorJSONWithHighlights) => void;
	renderSidebar?: boolean;
};

const Editor = forwardRef<
	ReactFrameworkOutput<EntityReferenceExtension>,
	EditorProps
>((props: EditorProps, ref) => {
	const { onChange, onChangeJSON } = props;
	const [errorState, setErrorState] = useState<string | null>(null);

	// First create the manager and state
	const { manager, state, setState, getContext } = useRemirror({
		extensions: () => [
			new EntityReferenceExtension({
				getStyle: decorateHighlights,
				extraAttributes: {
					labelType: {
						default: null,
					},
					type: {
						default: null,
					},
				},
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
			setErrorState("Invalid content detected. Resetting to empty document.");
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

	// Clear error state when content changes
	useEffect(() => {
		if (errorState) {
			setErrorState(null);
		}
	}, [errorState, props.initialContent]);

	// Sync highlight map with document marks when component mounts or highlights change
	useEffect(() => {
		if (!state || !manager) return;

		try {
			// Clear the highlight map
			clearHighlights();

			// Populate the highlight map from document marks
			state.doc.descendants((node) => {
				if (node.marks && node.isText) {
					const entityMarks = node.marks.filter(
						(mark) =>
							mark.type.name === "entity-reference" &&
							mark.attrs.id &&
							mark.attrs.labelType
					);

					entityMarks.forEach((mark) => {
						setHighlight(String(mark.attrs.id), String(mark.attrs.labelType));
					});
				}
				return true;
			});
		} catch (error) {
			console.error("Error syncing highlight map:", error);
			setErrorState("Error syncing highlights. Please refresh the page.");
		}
	}, [state, manager, props.highlights]);

	// After getting initial highlights but before they're applied to the content
	useEffect(() => {
		if (!props.initialContent || !props.highlights?.length || !manager) {
			return;
		}

		try {
			// Check if these highlights are already in the content
			// Get the existing content
			const content = props.initialContent;

			// Check if content already has highlight marks
			let markCount = 0;
			content.content?.forEach((paragraph) => {
				if (paragraph.content) {
					paragraph.content.forEach((node) => {
						if (
							node.marks?.some(
								(mark) =>
									typeof mark === "object" && mark.type === "entity-reference"
							)
						) {
							markCount++;
						}
					});
				}
			});

			// If we found marks but our highlight map is empty, that means
			// we need to regenerate the highlight map from the content
			if (markCount > 0 && !getHighlightCount()) {
				console.log(`Rebuilding highlight map from content marks`);
				content.content?.forEach((paragraph) => {
					if (paragraph.content) {
						paragraph.content.forEach((node) => {
							if (node.marks) {
								const entityMarks = node.marks.filter(
									(mark) =>
										typeof mark === "object" &&
										mark.type === "entity-reference" &&
										mark.attrs
								);

								entityMarks.forEach((mark) => {
									if (
										typeof mark === "object" &&
										mark.attrs?.id &&
										mark.attrs?.labelType
									) {
										setHighlight(
											String(mark.attrs.id),
											String(mark.attrs.labelType)
										);
									}
								});
							}
						});
					}
				});
			}

			// Create a new document with the highlights applied
			// Note: This is a simplified approach - in production you'd want to
			// use the createDocumentWithMarks utility from documentUtils
			const newContent = JSON.parse(JSON.stringify(content));

			// For each highlight, find its text in the document
			props.highlights.forEach((highlight) => {
				if (!highlight.text || !highlight.labelType) return;

				let foundText = false;

				// Look for the text in each paragraph
				newContent.content?.forEach(
					(paragraph: { content?: Array<{ text?: string }> }) => {
						if (paragraph.content && !foundText) {
							// Get the full paragraph text
							const paragraphText = paragraph.content
								.map((node) => node.text || "")
								.join("");

							// If this paragraph contains the text, apply the mark
							if (paragraphText.includes(highlight.text)) {
								foundText = true;

								// Create new content array for this paragraph
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
								}> = [];

								// Find the highlight text
								const highlightIndex = paragraphText.indexOf(highlight.text);

								// Add text before highlight
								if (highlightIndex > 0) {
									newParagraphContent.push({
										type: "text",
										text: paragraphText.substring(0, highlightIndex),
									});
								}

								// Add the highlighted text
								newParagraphContent.push({
									type: "text",
									text: highlight.text,
									marks: [
										{
											type: "entity-reference",
											attrs: {
												id: highlight.id,
												labelType: highlight.labelType,
												type: highlight.labelType,
											},
										},
									],
								});

								// Add text after highlight
								if (
									highlightIndex + highlight.text.length <
									paragraphText.length
								) {
									newParagraphContent.push({
										type: "text",
										text: paragraphText.substring(
											highlightIndex + highlight.text.length
										),
									});
								}

								// Replace the paragraph content
								paragraph.content = newParagraphContent;
							}
						}
					}
				);
			});

			// Update the state with the new content
			setState(
				manager.createState({
					content: newContent,
				})
			);
		} catch (error) {
			console.error("Error applying highlights to content:", error);
		}
	}, [props.initialContent, props.highlights, manager, setState]);

	const handleChange: RemirrorEventListener<EntityReferenceExtension> =
		useCallback(
			(parameter: RemirrorEventListenerProps<EntityReferenceExtension>) => {
				// Define countEntityReferences inside the callback
				const countEntityReferences = () => {
					if (!parameter.state) return 0;

					let count = 0;
					const refs = new Set();

					parameter.state.doc.descendants((node) => {
						if (node.marks) {
							const entityMarks = node.marks.filter(
								(mark) => mark.type.name === "entity-reference"
							);

							entityMarks.forEach((mark) => {
								if (mark.attrs.id) {
									count++;
									refs.add(mark.attrs.id);
								}
							});
						}
						return true;
					});
					return count;
				};

				// Add debug to track entity references after any change
				countEntityReferences();

				try {
					// Check if this is just a selection change by looking at the transaction metadata
					const tr = parameter.tr;
					const isSelectionChangeOnly = tr?.selectionSet && !tr?.docChanged;

					// Always update the editor state
					setState(parameter.state);
					onChange?.(parameter);

					// Don't process changes if it's just a selection change
					if (isSelectionChangeOnly) {
						return;
					}

					// Check if transaction has a specific metadata flag indicating it's a highlight operation
					// This helps avoid processing changes during highlight operations that might cause flickering
					const isHighlightOperation =
						tr?.getMeta("highlightOperation") === true;

					// If this is a highlight operation, we need to be extra careful to preserve existing highlights
					if (isHighlightOperation) {
						console.log(
							"Processing highlight operation, ensuring highlights are preserved"
						);
					}

					// Extract current highlights from the editor state
					const currentHighlights: Highlight[] = [];
					const seenIds = new Set<string>();

					// Traverse the document to find all marks
					parameter.state.doc.descendants((node, pos) => {
						if (node.marks && node.isText && node.text) {
							// Find all entity reference marks
							const entityMarks = node.marks.filter(
								(mark) =>
									mark.type.name === "entity-reference" &&
									mark.attrs.id &&
									mark.attrs.labelType
							);

							// Add each mark's highlight
							entityMarks.forEach((mark) => {
								if (!seenIds.has(mark.attrs.id)) {
									const highlight = {
										id: mark.attrs.id,
										labelType: mark.attrs.labelType,
										text: node.text || "",
										startIndex: pos,
										endIndex: pos + (node.text?.length || 0),
										attrs: {
											labelType: mark.attrs.labelType,
											type: mark.attrs.labelType,
										},
									};

									currentHighlights.push(highlight);

									// Update the highlight map
									setHighlight(
										String(mark.attrs.id),
										String(mark.attrs.labelType)
									);
									seenIds.add(mark.attrs.id);
								}
							});
						}
						return true;
					});

					// Get the existing highlights from the JSON to preserve any that might not be in the DOM
					const existingHighlights =
						(props.initialContent as RemirrorJSONWithHighlights)?.highlights ||
						[];

					// Merge existing highlights with current ones, prioritizing current ones
					const allHighlights = [...existingHighlights];

					// Add highlights from current document that aren't in the existing highlights
					currentHighlights.forEach((highlight) => {
						// Check if this highlight already exists
						const existingIndex = allHighlights.findIndex(
							(h) => h.id === highlight.id
						);

						if (existingIndex >= 0) {
							// Update existing highlight with current values
							allHighlights[existingIndex] = highlight;
						} else {
							// Add new highlight
							allHighlights.push(highlight);
						}
					});

					// Save if we have content
					const json =
						parameter.state.doc.toJSON() as RemirrorJSONWithHighlights;

					// Check if we have valid content before saving
					const hasContent =
						json.content !== undefined &&
						Array.isArray(json.content) &&
						json.content.length > 0 &&
						json.content[0].content !== undefined &&
						Array.isArray(json.content[0].content) &&
						json.content[0].content.length > 0;

					if (hasContent) {
						// Log found highlights
						console.log(
							`Found ${currentHighlights.length} highlights in document`
						);
						console.log(`Combined ${allHighlights.length} total highlights`);

						// If we have no highlights in the document but had highlights previously,
						// this might be a content-only update and we should preserve the previous highlights
						if (
							currentHighlights.length === 0 &&
							existingHighlights.length > 0
						) {
							console.log(
								"Preserving existing highlights during content-only change"
							);

							// Use existing highlights when we can't find any, to avoid losing highlights
							const contentWithHighlights = {
								...json,
								highlights: existingHighlights,
							};
							onChangeJSON?.(contentWithHighlights);
						} else {
							// Normal case - use the combined highlights
							const contentWithHighlights = {
								...json,
								highlights: allHighlights,
							};
							onChangeJSON?.(contentWithHighlights);
						}
					}
				} catch (error) {
					console.error("Error handling editor change:", error);
					setErrorState("Error updating content. Please try again.");
				}
			},
			[onChange, onChangeJSON, props.initialContent, setState]
		);

	return (
		<div className="remirror-theme h-full flex flex-col relative">
			{errorState && (
				<div className="bg-red-100 text-red-700 p-2 mb-2 rounded">
					{errorState}
				</div>
			)}

			<Remirror
				manager={manager}
				initialContent={state}
				autoFocus
				onChange={handleChange}
			>
				<div className="h-full">
					<div className="w-full">
						<EditorComponent
							// @ts-expect-error - placeholder prop is supported but has typing issues
							placeholder={props.placeholder || "Start typing..."}
						/>
					</div>

					{props.renderSidebar && props.showHighlightButtons && (
						<div className="absolute left-full top-0 ml-8 pt-4 min-w-[150px] highlight-buttons-sidebar">
							<HighlightButtons onSave={(json) => onChangeJSON?.(json)} />
						</div>
					)}
				</div>
			</Remirror>
		</div>
	);
});

Editor.displayName = "Editor";

export default Editor;
