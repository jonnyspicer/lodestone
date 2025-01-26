import { useCallback, useEffect } from "react";
import {
	OnChangeJSON,
	useCommands,
	useHelpers,
	EditorComponent,
	Remirror,
	useRemirror,
} from "@remirror/react";
import type { RemirrorJSON } from "remirror";
import {
	EntityReferenceExtension,
	EntityReferenceMetaData,
	findMinMaxRange,
} from "remirror/extensions";
import { Decoration } from "@remirror/pm/view";
import { db } from "./db";
import { useLiveQuery } from "dexie-react-hooks";
import "remirror/styles/all.css";
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

// First, let's modify the EntityReferenceMetaData type to include our custom attributes
type HighlightData = {
	id: string;
	labelType: string;
	attrs?: {
		labelType: string;
		type: string;
	};
};

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

// Update the decorateHighlights function to add debugging
const decorateHighlights = (
	highlights: EntityReferenceMetaData[][]
): Decoration[] => {
	return highlights.map((overlappingHighlights) => {
		// Get label IDs directly from the highlight attributes
		const labelIds = overlappingHighlights
			.map((h) => h.attrs?.labelType || highlightMap.get(h.id))
			.filter((id): id is string => id !== undefined);

		// Get colors for these labels
		const colors = labelIds
			.map((labelId) => {
				const config = LABEL_CONFIGS.find((config) => config.id === labelId);
				if (!config) {
					console.warn(`No color config found for label: ${labelId}`);
				}
				return config?.color;
			})
			.filter((color): color is string => color !== undefined);

		if (colors.length === 0) {
			console.warn("No colors found for highlights:", overlappingHighlights);
		}

		const style = `background: ${mixColors(colors)}; padding: 2px 0;`;
		const [from, to] = findMinMaxRange(overlappingHighlights);
		return Decoration.inline(from, to, { style });
	});
};

// Update the HighlightButtons component to be dynamic
const HighlightButtons = () => {
	const { getEntityReferencesAt } = useHelpers<EntityReferenceExtension>();
	const commands = useCommands<EntityReferenceExtension>();
	const highlightsAt = getEntityReferencesAt();

	const handleHighlight = (labelId: string) => {
		// Only check for highlights of this type at the current selection
		const highlightsOfType = highlightsAt.filter(
			(h) => h.attrs?.labelType === labelId
		);

		// If there are highlights of this type at the current selection, remove them
		if (highlightsOfType.length > 0) {
			highlightsOfType.forEach((highlight) => {
				commands.removeEntityReference(highlight.id);
				highlightMap.delete(highlight.id);
			});
		} else {
			// Add new highlight with unique ID and explicitly store the labelType
			const id = crypto.randomUUID();
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
	};

	return (
		<div className="my-3">
			{LABEL_CONFIGS.map((label) => {
				// Check if there are any highlights of this type at the current selection
				const active = highlightsAt.some(
					(h) => h.attrs?.labelType === label.id
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

const App = ({ placeholder }: AppProps) => {
	const latestContent = useLiveQuery(async () => {
		const record = await db.editorContent
			.orderBy("updatedAt")
			.reverse()
			.first();

		if (record?.highlights) {
			highlightMap.clear();
			record.highlights.forEach((highlight: HighlightData) => {
				highlightMap.set(highlight.id, highlight.labelType);
			});
		}

		// Just return the content without trying to modify it
		return (
			record?.content ?? {
				type: "doc",
				content: [{ type: "paragraph" }],
			}
		);
	});

	const { manager, state, setState } = useRemirror({
		extensions: () => [
			new EntityReferenceExtension({
				getStyle: decorateHighlights,
			}),
		],
		content: latestContent,
		stringHandler: "html",
	});

	// Move all hooks before any conditional returns
	useEffect(() => {
		return () => {
			highlightMap.clear();
		};
	}, []);

	const handleEditorChange = useCallback(async (json: RemirrorJSON) => {
		try {
			if (json.type === "doc") {
				const latestRecord = await db.editorContent
					.orderBy("updatedAt")
					.reverse()
					.first();

				// Store the full highlight data including attrs
				const highlights = Array.from(highlightMap.entries()).map(
					([id, labelType]) => ({
						id,
						labelType,
						attrs: {
							labelType,
							type: labelType,
						},
					})
				);

				const hasChanged =
					JSON.stringify(latestRecord?.content) !== JSON.stringify(json) ||
					JSON.stringify(latestRecord?.highlights) !==
						JSON.stringify(highlights);

				if (hasChanged) {
					// Instead of clearing the entire table, just update or add the new record
					if (latestRecord?.id) {
						await db.editorContent.update(latestRecord.id, {
							content: json,
							highlights,
							updatedAt: new Date(),
						});
					} else {
						await db.editorContent.add({
							content: json,
							highlights,
							updatedAt: new Date(),
						});
					}
				}
			}
		} catch (error) {
			console.error("Failed to save editor content:", error);
		}
	}, []);

	// Add state management
	const handleChange = useCallback(
		(parameter: any) => {
			// Update the editor state
			setState(parameter.state);
		},
		[setState]
	);

	// Loading check after all hooks are defined
	if (latestContent === undefined) {
		return <div className="remirror-theme p-4">Loading...</div>;
	}

	console.log("latestContent:", latestContent);
	console.log("state:", state);

	return (
		<div className="remirror-theme p-12 mx-auto">
			<ResetDatabaseButton />
			<Remirror
				manager={manager}
				state={state}
				onChange={handleChange}
				placeholder={placeholder || "Enter text..."}
			>
				<EditorComponent />
				<HighlightButtons />
				<OnChangeJSON onChange={handleEditorChange} />
			</Remirror>
		</div>
	);
};

export default App;
