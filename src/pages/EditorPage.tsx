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
	// Track highlight removal operations
	const [pendingHighlightRemoval, setPendingHighlightRemoval] = useState(false);
	// Track multiple document change events with the same ID to detect race conditions
	const currentChangeIds = useRef(new Set<string>());

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
		async (json: RemirrorJSON, options?: { skipExtraction?: boolean }) => {
			if (!id) return;

			// Create a unique ID for this change event to track it
			const changeId = Math.random().toString(36).substring(2, 8);

			// Check if we're already processing a change with this ID (prevent duplicates)
			if (currentChangeIds.current.has(changeId)) {
				return;
			}

			// Mark this change as being processed
			currentChangeIds.current.add(changeId);

			// Clear the change ID after processing (or after timeout)
			const clearChangeId = () => {
				currentChangeIds.current.delete(changeId);
			};
			setTimeout(clearChangeId, 500); // Safety cleanup after 500ms

			// Set pending highlight removal based on options
			if (options?.skipExtraction) {
				setPendingHighlightRemoval(true);

				// Auto-reset after a short timeout
				setTimeout(() => {
					setPendingHighlightRemoval(false);
				}, 500);
			}

			// Check if we got an empty update that might just be a cursor movement
			const isEmpty =
				!json.content ||
				json.content.length === 0 ||
				!json.content[0].content ||
				json.content[0].content.length === 0;

			if (isEmpty) {
				clearChangeId();
				return;
			}

			try {
				if (mode === "input") {
					await SessionManager.updateInputContent(parseInt(id), json);
				} else if (mode === "analysis" && session?.analysedContent) {
					// Check if this is a highlight removal operation, which can be detected by:
					// 1. Explicit skipExtraction flag
					// 2. Missing entity reference marks that were present in previous state
					// 3. We're in a pending highlight removal state

					// Get current highlight count from session
					const currentHighlightCount =
						session.analysedContent.highlights.length;

					// Skip extraction if explicitly requested or we're in pending removal state
					if (options?.skipExtraction || pendingHighlightRemoval) {
						// Empty array signals to preserve the content as-is
						await SessionManager.updateAnalysedContent(
							parseInt(id),
							json,
							[], // Empty highlight array
							session.analysedContent.relationships
						);
					} else {
						// Normal path: Extract highlights directly from the document
						const extractedHighlights =
							await SessionManager.extractHighlightsFromContentMarks(json);

						// If we found fewer highlights than expected, this might be a removal operation
						// triggered by automatic onChange rather than our explicit skipExtraction call
						if (extractedHighlights.length < currentHighlightCount) {
							// Preserve the new content with the extracted highlights
							await SessionManager.updateAnalysedContent(
								parseInt(id),
								json,
								extractedHighlights, // Use the extracted highlights directly
								session.analysedContent.relationships
							);
						} else {
							// Regular update with the extracted highlights
							await SessionManager.updateAnalysedContent(
								parseInt(id),
								json,
								extractedHighlights,
								session.analysedContent.relationships
							);
						}
					}
				}
			} catch (error) {
				console.error(`Error in handleEditorChange: ${error}`);
			} finally {
				// Ensure we clear the change ID even if there was an error
				clearChangeId();
			}
		},
		[id, mode, session, pendingHighlightRemoval]
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
			navigate(`/analysis/${id}`);
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

					{/* Debug Logs Section */}
					<div className="mt-8 border border-gray-200 rounded-md">
						<details className="group">
							<summary className="flex justify-between items-center font-medium cursor-pointer p-4  rounded-md">
								<span className="text-gray-700 font-mono text-sm">
									debug logs
								</span>
								<span className="transition group-open:rotate-180">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										fill="none"
										viewBox="0 0 24 24"
										strokeWidth={1.5}
										stroke="currentColor"
										className="w-5 h-5"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											d="M19.5 8.25l-7.5 7.5-7.5-7.5"
										/>
									</svg>
								</span>
							</summary>
							<pre className="p-4 rounded-md max-w-full overflow-auto mb-4 text-sm">
								Highlights:
								<br />
								{JSON.stringify(content.highlights || [], null, 2)}
								<br />
								<br />
								Relationships:
								<br />
								{JSON.stringify(content.relationships || [], null, 2)}
							</pre>
						</details>
					</div>
				</div>
			</div>
		</div>
	);
};
