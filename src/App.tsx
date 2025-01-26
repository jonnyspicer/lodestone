import {
	useCallback,
	useRef,
	forwardRef,
	useImperativeHandle,
	useEffect,
	useState,
} from "react";
import {
	useCommands,
	useHelpers,
	EditorComponent,
	Remirror,
	useRemirror,
	ReactFrameworkOutput,
	useRemirrorContext,
} from "@remirror/react";
import type { RemirrorJSON } from "remirror";
import {
	EntityReferenceExtension,
	EntityReferenceMetaData,
	findMinMaxRange,
} from "remirror/extensions";
import { Decoration } from "@remirror/pm/view";
import { db, type EditorContent } from "./db";
import { useLiveQuery } from "dexie-react-hooks";
import { mix, transparentize } from "color2k";

type AppProps = {
	placeholder?: string;
};

// Define a type for our label configuration
type LabelConfig = {
	id: string;
	name: string;
	color: string;
};

// Define our labels (this could come from a config file or API)
const LABEL_CONFIGS: LabelConfig[] = [
	{ id: "claim", name: "Claim", color: "#FFE25B" },
	{ id: "question", name: "Question", color: "#78DEFF" },
	{ id: "evidence", name: "Evidence", color: "#1BE2C9" },
	{ id: "counterargument", name: "Counter Argument", color: "#ff8a65" },
	{ id: "implication", name: "Implication", color: "#FF8B38" },
];

// Replace the old HighlightType and highlightMap with a more flexible system
const highlightMap = new Map<string, string>(); // Maps highlight ID to label ID

// Helper function to mix multiple colors with proper alpha blending
const mixColors = (colors: string[]): string => {
	if (colors.length === 0) return "transparent";
	if (colors.length === 1) {
		// For single colors, use a more visible transparency
		return transparentize(colors[0], 0.4); // Changed from 0.7 to 0.4 for better visibility
	}

	// Mix colors with proper alpha blending
	return colors.reduce((acc, color) =>
		mix(acc, transparentize(color, 0.3), 0.5)
	);
};

// Update the decorateHighlights function
const decorateHighlights = (
	highlights: EntityReferenceMetaData[][]
): Decoration[] => {
	return highlights.map((overlappingHighlights) => {
		// Get label IDs from the highlight map instead of attributes
		const labelIds = overlappingHighlights
			.map((h) => highlightMap.get(h.id))
			.filter(Boolean);

		// Get colors for these labels
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

// Update the HighlightButtons component to be dynamic
const HighlightButtons = ({
	onSave,
}: {
	onSave: (json: RemirrorJSON) => void;
}) => {
	const { getEntityReferencesAt, manager } =
		useHelpers<EntityReferenceExtension>();
	const commands = useCommands<EntityReferenceExtension>();
	const { getState } = useRemirrorContext();
	const highlightsAt = getEntityReferencesAt();

	const handleHighlight = useCallback(
		(labelId: string) => {
			console.log("=== Highlight Operation Start ===");

			// Only check for highlights of this type at the current selection
			const highlightsOfType = highlightsAt.filter(
				(h) => highlightMap.get(h.id) === labelId
			);

			// If there are highlights of this type at the current selection, remove them
			if (highlightsOfType.length > 0) {
				console.log("Removing highlights:", highlightsOfType);
				highlightsOfType.forEach((highlight) => {
					commands.removeEntityReference(highlight.id);
					highlightMap.delete(highlight.id);
				});
			} else {
				// Add new highlight with unique ID and explicitly store the labelType
				const id = crypto.randomUUID();
				console.log("Adding new highlight:", { id, labelId });

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

			// Get the current state and save
			const state = getState();
			const json = state.doc.toJSON();

			// Save both content and highlights
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
			console.log("=== Highlight Operation End ===");
		},
		[commands, highlightsAt, onSave, getState]
	);

	return (
		<div>
			{LABEL_CONFIGS.map((label) => {
				// Check if there are any highlights of this type at the current selection
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

// Reset database button
const ResetDatabaseButton = () => {
	const handleReset = useCallback(async () => {
		try {
			// Clear the database
			await db.editorContent.clear();
			// Clear in-memory highlights
			highlightMap.clear();
			// Reload the page to reset the editor state
			window.location.reload();
		} catch (error) {
			console.error("Failed to reset database:", error);
		}
	}, []);

	return (
		<button
			onClick={handleReset}
			className="mb-4 px-2 py-1 bg-rose-400 text-white rounded cursor-pointer hover:bg-rose-500 transition-colors"
		>
			Reset Database
		</button>
	);
};

type EditorProps = {
	initialContent?: RemirrorJSON;
	placeholder?: string;
	onChange?: (parameter: any) => void;
	onChangeJSON?: (json: RemirrorJSON) => void;
};

// Create a separate editor component that exposes its context via ref
const Editor = forwardRef<
	ReactFrameworkOutput<EntityReferenceExtension>,
	EditorProps
>((props: EditorProps, ref) => {
	const [isInitialized, setIsInitialized] = useState(false);
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
	});

	useImperativeHandle(
		ref,
		() => getContext() as ReactFrameworkOutput<EntityReferenceExtension>,
		[getContext]
	);

	// Initialize content when it's loaded
	useEffect(() => {
		if (!isInitialized && props.initialContent) {
			console.log("Initializing editor with content:", props.initialContent);
			setState(
				manager.createState({
					content: props.initialContent,
					stringHandler: "html",
				})
			);
			setIsInitialized(true);
		}
	}, [isInitialized, props.initialContent, manager, setState]);

	const handleChange = useCallback(
		(parameter: any) => {
			setState(parameter.state);
			props.onChange?.(parameter);

			// Extract all marks from the document
			parameter.state.doc.forEach((node: any, _pos: number, _parent: any) => {
				if (node.content) {
					node.content.forEach((textNode: any) => {
						if (textNode.marks) {
							textNode.marks.forEach((mark: any) => {
								if (mark.type === "entity-reference") {
									console.log("Found entity-reference mark:", mark);
									if (mark.attrs?.id && mark.attrs?.labelType) {
										highlightMap.set(mark.attrs.id, mark.attrs.labelType);
										console.log(
											"Updated highlightMap:",
											Array.from(highlightMap.entries())
										);
									}
								}
							});
						}
					});
				}
			});

			const json = parameter.state.doc.toJSON();
			if (json.content?.[0]?.content?.length > 0 || isInitialized) {
				props.onChangeJSON?.(json);
			}
		},
		[setState, props.onChange, props.onChangeJSON, isInitialized]
	);

	return (
		<Remirror
			manager={manager}
			state={state}
			onChange={handleChange}
			placeholder={props.placeholder || "Enter text..."}
		>
			<EditorComponent />
			<div className="border-t border-gray-200 p-3">
				<HighlightButtons onSave={props.onChangeJSON!} />
			</div>
		</Remirror>
	);
});

Editor.displayName = "Editor";

const App = ({ placeholder }: AppProps) => {
	const editorRef =
		useRef<ReactFrameworkOutput<EntityReferenceExtension>>(null);

	const dbContent = useLiveQuery(
		async () => {
			const record = await db.editorContent
				.orderBy("updatedAt")
				.reverse()
				.first();

			if (record) {
				console.log("Loaded record from database:", record);

				if (record.highlights) {
					highlightMap.clear();
					record.highlights.forEach((highlight) => {
						highlightMap.set(highlight.id, highlight.labelType);
					});
					console.log(
						"Restored highlights:",
						Array.from(highlightMap.entries())
					);
				}
			}

			return record;
		},
		[],
		{
			initialValue: null,
		}
	);

	const handleEditorChange = useCallback(
		async (
			json: RemirrorJSON & {
				highlights?: Array<{
					id: string;
					labelType: string;
					attrs?: { labelType: string; type: string };
				}>;
			}
		) => {
			try {
				if (json.type === "doc") {
					// Get the current record to preserve existing highlights if not explicitly changed
					const currentRecord = await db.editorContent
						.orderBy("updatedAt")
						.reverse()
						.first();

					// If highlightMap is empty but we have highlights in the current record,
					// restore them to maintain highlight state
					if (
						highlightMap.size === 0 &&
						currentRecord?.highlights?.length > 0
					) {
						currentRecord.highlights.forEach((highlight) => {
							highlightMap.set(highlight.id, highlight.labelType);
						});
					}

					const newContent = {
						content: { type: json.type, content: json.content },
						// Use the current highlightMap state instead of json.highlights
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
						updatedAt: new Date(),
					};

					if (currentRecord?.id) {
						await db.editorContent.update(currentRecord.id, newContent);
					} else {
						const id = await db.editorContent.add(newContent);
						console.log("Created record:", id, "with content:", newContent);
					}

					// Verify what was saved
					const savedRecord = await db.editorContent
						.orderBy("updatedAt")
						.reverse()
						.first();
					console.log("Verification - saved record:", savedRecord);
				}
			} catch (error) {
				console.error("Failed to save editor content:", error);
			}
		},
		[]
	);

	return (
		<div className="p-4 md:p-8 lg:p-12 mx-auto">
			<ResetDatabaseButton />
			<div className="remirror-theme">
				<Editor
					ref={editorRef}
					initialContent={(dbContent as EditorContent)?.content}
					placeholder={placeholder}
					onChangeJSON={handleEditorChange}
				/>
			</div>
		</div>
	);
};

export default App;
