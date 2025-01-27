import { useCallback, useRef } from "react";
import type { RemirrorJSON } from "remirror";
import { ReactFrameworkOutput } from "@remirror/react";
import { EntityReferenceExtension } from "remirror/extensions";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type EditorContent } from "./db";
import { highlightMap } from "./utils/highlightMap";
import Editor from "./components/Editor";
import { ResetDatabaseButton } from "./components/ResetDatabaseButton";

type AppProps = {
	placeholder?: string;
};

const App = ({ placeholder }: AppProps) => {
	const editorRef =
		useRef<ReactFrameworkOutput<EntityReferenceExtension>>(null);

	const dbContent = useLiveQuery(
		async () => {
			const record = await db.editorContent
				.orderBy("updatedAt")
				.reverse()
				.first();

			if (record?.highlights) {
				highlightMap.clear();
				record.highlights.forEach((highlight) => {
					highlightMap.set(highlight.id, highlight.labelType);
				});
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
					const currentRecord = await db.editorContent
						.orderBy("updatedAt")
						.reverse()
						.first();

					if (highlightMap.size === 0 && currentRecord?.highlights) {
						currentRecord.highlights.forEach((highlight) => {
							highlightMap.set(highlight.id, highlight.labelType);
						});
					}

					const newContent = {
						content: { type: json.type, content: json.content },
						highlights: Array.from(highlightMap.entries()).map(
							([id, labelType]) => ({
								id,
								labelType,
								attrs: { labelType, type: labelType },
							})
						),
						updatedAt: new Date(),
					};

					if (currentRecord?.id) {
						await db.editorContent.update(currentRecord.id, newContent);
					} else {
						await db.editorContent.add(newContent);
					}
				}
			} catch (error) {
				console.error("Failed to save editor content:", error);
			}
		},
		[]
	);

	return (
		<div className="p-4 mx-auto">
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
