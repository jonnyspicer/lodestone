import { useCallback, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { RemirrorJSON } from "remirror";
import { ReactFrameworkOutput } from "@remirror/react";
import { EntityReferenceExtension } from "remirror/extensions";
import { useLiveQuery } from "dexie-react-hooks";
import Editor from "../components/Editor";
import { SessionManager } from "../utils/sessionManager";
import { modelServices } from "../services/models";
import { detailedPrompt } from "../evals/prompts";

// Define the highlight type inline since we're using it in multiple places
type Highlight = {
	id: string;
	labelType: string;
	text: string;
	attrs?: {
		labelType: string;
		type: string;
	};
};

type EditorPageProps = {
	mode: "input" | "analysis";
};

export const EditorPage = ({ mode }: EditorPageProps) => {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const [isAnalyzing, setIsAnalyzing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const editorRef =
		useRef<ReactFrameworkOutput<EntityReferenceExtension>>(null);

	const session = useLiveQuery(async () => {
		if (!id) return null;
		const result = await SessionManager.getSession(parseInt(id));
		console.log("🔍 Session data loaded:", {
			id,
			title: result?.title,
			status: result?.status,
			hasAnalyzedContent: !!result?.analyzedContent,
			highlightCount:
				result?.analyzedContent?.content?.content?.reduce(
					(count, node) =>
						count +
						(node.content?.filter((textNode) =>
							textNode.marks?.some(
								(mark) => typeof mark === "object" && mark.type === "highlight"
							)
						).length || 0),
					0
				) ?? 0,
		});
		return result;
	}, [id]);

	const content = useLiveQuery(async () => {
		if (!id) return null;
		const result = await SessionManager.getEffectiveContent(parseInt(id));
		console.log("📄 Effective content loaded:", {
			mode,
			hasContent: !!result.content,
			highlightCount: result.highlights?.length ?? 0,
			highlights: result.highlights?.map((h) => ({
				id: h.id,
				type: h.labelType,
				text: h.text?.slice(0, 20) + "...",
			})),
		});
		return result;
	}, [id]);

	const handleEditorChange = useCallback(
		async (json: RemirrorJSON & { highlights?: Highlight[] }) => {
			if (!id) return;

			// Extract highlights from the editor state
			const highlights = json.highlights || [];

			console.log("✏️ Editor change:", {
				mode,
				highlightCount: highlights.length,
				action: highlights.length === 0 ? "clearing" : "updating",
				highlights: highlights.map((h) => ({
					id: h.id,
					type: h.labelType,
					text: h.text?.slice(0, 20) + "...",
				})),
			});

			if (mode === "input") {
				await SessionManager.updateInputContent(parseInt(id), json);
			} else if (mode === "analysis" && session?.analyzedContent) {
				// Update analyzed content with current highlights and relationships
				await SessionManager.updateAnalyzedContent(
					parseInt(id),
					json,
					highlights,
					session.analyzedContent.relationships
				);
			}
		},
		[id, mode, session]
	);

	const handleAnalyze = async () => {
		if (!id || !session || !content) return;
		setIsAnalyzing(true);
		setError(null);

		try {
			// Get the GPT-4o-mini service
			const service = modelServices["gpt4o-mini"];

			// Extract text content from the editor
			const textContent =
				content.content?.content
					?.map((paragraph) =>
						paragraph.content
							?.map((node) => node.text)
							.filter(Boolean)
							.join("")
					)
					.filter(Boolean)
					.join("\n") || "";

			// Log the content being analyzed
			console.log("📝 Content being analyzed:", {
				length: textContent.length,
				content: textContent,
			});

			// Prepare the prompt by replacing the text placeholder
			const prompt = detailedPrompt.template.replace("{{text}}", textContent);

			// Get API key from environment
			const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
			if (!apiKey) {
				throw new Error(
					"OpenAI API key not found in environment variables. Please set VITE_OPENAI_API_KEY in your .env file."
				);
			}

			// Send to OpenAI with API key
			const analysis = await service.analyze(textContent, prompt, { apiKey });

			console.log("📊 Analysis results:", {
				highlights: analysis.highlights,
				relationships: analysis.relationships,
			});

			// Save the analysis results
			await SessionManager.saveAnalysis(
				parseInt(id),
				"gpt4o-mini",
				detailedPrompt.id,
				content.content,
				analysis.highlights,
				analysis.relationships
			);

			// Verify the session state after saving
			const updatedSession = await SessionManager.getSession(parseInt(id));
			console.log("📝 Session after saving analysis:", {
				hasAnalyzedContent: !!updatedSession?.analyzedContent,
				highlightCount:
					updatedSession?.analyzedContent?.content?.content?.reduce(
						(count, node) =>
							count +
							(node.content?.filter((textNode) =>
								textNode.marks?.some(
									(mark) =>
										typeof mark === "object" && mark.type === "highlight"
								)
							).length || 0),
						0
					) ?? 0,
				highlights: updatedSession?.analyzedContent?.content?.content?.flatMap(
					(node) =>
						node.content?.filter((textNode) =>
							textNode.marks?.some(
								(mark) => typeof mark === "object" && mark.type === "highlight"
							)
						) || []
				),
			});

			// Navigate to analysis view
			navigate(`/sessions/${id}/analysis`);
		} catch (error) {
			console.error("Analysis failed:", error);
			setError(error instanceof Error ? error.message : "Unknown error");
		} finally {
			setIsAnalyzing(false);
		}
	};

	if (!session || !content) {
		return (
			<div className="flex items-center justify-center h-screen">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
				<span className="ml-2">Loading session...</span>
			</div>
		);
	}

	return (
		<div className="p-4 mx-auto">
			<div className="flex flex-col gap-4 mb-4">
				<div className="flex justify-between items-center">
					<h1 className="text-2xl font-bold">{session.title}</h1>
					{mode === "input" && (
						<button
							onClick={handleAnalyze}
							disabled={isAnalyzing}
							className="px-4 py-2 bg-slate-700 text-white rounded hover:bg-slate-800 disabled:opacity-50 flex items-center gap-2"
						>
							{isAnalyzing && (
								<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
							)}
							{isAnalyzing ? "Analyzing..." : "Analyze Text"}
						</button>
					)}
				</div>

				{error && (
					<div
						className="bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded relative"
						role="alert"
					>
						<strong className="font-bold">Error: </strong>
						<span className="block sm:inline">{error}</span>
						<button
							className="absolute top-0 bottom-0 right-0 px-4 py-3"
							onClick={() => setError(null)}
						>
							<span className="sr-only">Dismiss</span>
							<svg
								className="fill-current h-6 w-6 text-red-500"
								role="button"
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 20 20"
							>
								<title>Close</title>
								<path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z" />
							</svg>
						</button>
					</div>
				)}
			</div>

			<div className="remirror-theme">
				<Editor
					key={content.highlights?.length || 0}
					ref={editorRef}
					initialContent={content.content}
					showHighlightButtons={mode === "analysis"}
					highlights={content.highlights}
					relationships={content.relationships}
					onChangeJSON={handleEditorChange}
				/>
				{mode === "analysis" && (
					<div className="mt-4 p-4 bg-gray-50 rounded">
						<h3 className="font-semibold mb-2">Debug Info:</h3>
						<pre className="text-xs overflow-auto">
							{JSON.stringify(
								{
									highlights: content.highlights,
									relationships: content.relationships,
								},
								null,
								2
							)}
						</pre>
					</div>
				)}
			</div>
		</div>
	);
};
