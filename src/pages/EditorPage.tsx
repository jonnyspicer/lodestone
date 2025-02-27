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
	const [isAnalysing, setIsAnalysing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const editorRef =
		useRef<ReactFrameworkOutput<EntityReferenceExtension>>(null);
	const [isDebugVisible, setIsDebugVisible] = useState(false);

	const session = useLiveQuery(async () => {
		if (!id) return null;
		const result = await SessionManager.getSession(parseInt(id));

		return result;
	}, [id]);

	const content = useLiveQuery(async () => {
		if (!id) return null;
		const result = await SessionManager.getEffectiveContent(parseInt(id));
		return result;
	}, [id]);

	const handleEditorChange = useCallback(
		async (json: RemirrorJSON & { highlights?: Highlight[] }) => {
			if (!id) return;

			// Extract highlights from the editor state
			const highlights = json.highlights || [];

			// Debug log for highlight stability tracking
			console.log(
				`handleEditorChange called with ${highlights.length} highlights`
			);

			// Check if we got an empty update that might just be a cursor movement
			const isEmpty =
				!json.content ||
				json.content.length === 0 ||
				!json.content[0].content ||
				json.content[0].content.length === 0;

			if (isEmpty && content?.highlights?.length) {
				console.log("Received empty update, preserving existing highlights");
				// Preserve existing highlights if we get an empty update
				return;
			}

			if (mode === "input") {
				await SessionManager.updateInputContent(parseInt(id), json);
			} else if (mode === "analysis" && session?.analysedContent) {
				// First check if we have highlights explicitly in the json
				if (highlights.length > 0) {
					// Update analysed content with current highlights and relationships
					await SessionManager.updateAnalysedContent(
						parseInt(id),
						json,
						highlights,
						session.analysedContent.relationships
					);
				} else {
					// Get the previous highlights if available
					const previousHighlights = session.analysedContent.highlights || [];

					// Try to extract highlights from the content first
					const extractedHighlights =
						await SessionManager.extractHighlightsFromContentMarks(json);

					// Use extracted highlights or fall back to previous highlights
					const highlightsToUse =
						extractedHighlights.length > 0
							? extractedHighlights
							: previousHighlights;

					// Update analysed content with the selected highlights
					await SessionManager.updateAnalysedContent(
						parseInt(id),
						json,
						highlightsToUse,
						session.analysedContent.relationships
					);
				}
			}
		},
		[id, mode, session, content]
	);

	const handleAnalyse = async () => {
		if (!id || !session || !content) return;
		setIsAnalysing(true);
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
			const analysis = await service.analyse(textContent, prompt, { apiKey });

			// Save the analysis results
			await SessionManager.saveAnalysis(
				parseInt(id),
				"gpt4o-mini",
				detailedPrompt.id,
				content.content,
				analysis.highlights,
				analysis.relationships
			);

			// Navigate to analysis view
			navigate(`/sessions/${id}/analysis`);
		} catch (error) {
			console.error("Analysis failed:", error);
			setError(error instanceof Error ? error.message : "Unknown error");
		} finally {
			setIsAnalysing(false);
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
		<div className="p-4 mx-auto mb-32">
			<div className="flex flex-col gap-4 mb-4">
				<div className="flex justify-between items-center">
					<h1 className="text-2xl font-serif text-center mx-auto">
						{session.title}
					</h1>
					{mode === "input" && (
						<button
							onClick={handleAnalyse}
							disabled={isAnalysing}
							className="px-4 py-2 bg-zinc-700 text-white rounded hover:bg-zinc-800 disabled:opacity-50 flex items-center gap-2"
						>
							{isAnalysing && (
								<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
							)}
							{isAnalysing ? "Analysing..." : "Analyse Text"}
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
				<div className="max-w-4xl mx-auto">
					<Editor
						ref={editorRef}
						initialContent={content.content}
						showHighlightButtons={mode === "analysis"}
						renderSidebar={mode === "analysis"}
						highlights={content.highlights || []}
						relationships={content.relationships || []}
						onChangeJSON={handleEditorChange}
					/>
				</div>

				{mode === "analysis" && (
					<div className="mt-4 p-4  rounded max-w-4xl mx-auto">
						<button
							className="flex items-center justify-between w-full"
							onClick={() => setIsDebugVisible(!isDebugVisible)}
						>
							<h3 className="font-semibold">Debug Info</h3>
							<svg
								className={`w-5 h-5 transition-transform ${
									isDebugVisible ? "rotate-180" : ""
								}`}
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M19 9l-7 7-7-7"
								/>
							</svg>
						</button>
						{isDebugVisible && (
							<pre className="mt-2 text-xs overflow-auto">
								{JSON.stringify(
									{
										highlights: content.highlights,
										relationships: content.relationships,
									},
									null,
									2
								)}
							</pre>
						)}
					</div>
				)}
			</div>
		</div>
	);
};
