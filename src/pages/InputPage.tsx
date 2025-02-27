import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams, useBeforeUnload } from "react-router-dom";
import type { RemirrorJSON } from "remirror";
import { useLiveQuery } from "dexie-react-hooks";
import Editor from "../components/Editor";
import { SessionManager } from "../utils/sessionManager";
import { modelServices } from "../services/models";
import { detailedPrompt } from "../evals/prompts";

export const InputPage = () => {
	const navigate = useNavigate();
	const { id } = useParams();
	const [topic, setTopic] = useState("");
	const [content, setContent] = useState<RemirrorJSON>({
		type: "doc",
		content: [{ type: "paragraph" }],
	});
	const [isCreating, setIsCreating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isDirty, setIsDirty] = useState(false);

	// Load existing session if we have an ID
	const session = useLiveQuery(async () => {
		if (!id) return null;
		return SessionManager.getSession(parseInt(id));
	}, [id]);

	// Initialize content from session if it exists
	useEffect(() => {
		if (session) {
			setTopic(session.title);
			setContent(session.inputContent.content);
		}
	}, [session]);

	// Save changes to existing session
	const saveChanges = useCallback(async () => {
		if (!id || !isDirty) return;

		try {
			await SessionManager.updateInputContent(parseInt(id), content);
			await SessionManager.updateSessionTitle(parseInt(id), topic);
			setIsDirty(false);
		} catch (error) {
			console.error("Failed to save changes:", error);
		}
	}, [id, content, topic, isDirty]);

	// Auto-save changes every 2 seconds if the content is dirty
	useEffect(() => {
		if (!isDirty) return;

		const timer = setTimeout(saveChanges, 2000);
		return () => clearTimeout(timer);
	}, [isDirty, saveChanges]);

	// Handle content changes
	const handleContentChange = (json: RemirrorJSON) => {
		setContent(json);
		setIsDirty(true);
	};

	// Handle topic changes
	const handleTopicChange = (newTopic: string) => {
		setTopic(newTopic);
		setIsDirty(true);
	};

	// Save before leaving
	useEffect(() => {
		return () => {
			if (isDirty && id) {
				saveChanges();
			}
		};
	}, [isDirty, id, saveChanges]);

	// Handle browser close/refresh
	useBeforeUnload(
		useCallback(() => {
			if (isDirty && id) {
				saveChanges();
			}
		}, [isDirty, id, saveChanges])
	);

	const handleAnalyse = async () => {
		setIsCreating(true);
		setError(null);
		try {
			let sessionId: number | null = id ? parseInt(id) : null;

			if (!sessionId) {
				// Create a new session if needed
				const newSession = await SessionManager.createSession(topic, content);
				if (!newSession.id) {
					throw new Error("Failed to create session: No session ID returned");
				}
				sessionId = newSession.id;
			} else {
				// Save any pending changes
				await SessionManager.updateInputContent(sessionId, content);
				await SessionManager.updateSessionTitle(sessionId, topic);
			}

			// Get the GPT-4o-mini service
			const service = modelServices["gpt4o-mini"];

			// Extract text content from the editor
			const textContent =
				content.content
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
				sessionId,
				"gpt4o-mini",
				detailedPrompt.id,
				content,
				analysis.highlights,
				analysis.relationships
			);

			// Navigate directly to editor page in analysis mode
			navigate(`/sessions/${sessionId}/analysis`);
		} catch (error) {
			console.error("Failed to create and analyse session:", error);
			setError(error instanceof Error ? error.message : "Unknown error");
		} finally {
			setIsCreating(false);
		}
	};

	// Determine if we can proceed with analysis
	const canProceed =
		Boolean(topic.trim()) &&
		content?.content?.some((p) =>
			p.content?.some((n) => n.text && n.text.trim().length > 0)
		);

	return (
		<div className="max-w-3xl mx-auto p-8 space-y-8 mb-24">
			<div>
				<label className="uppercase text-zinc-600 text-sm font-medium mb-2 block tracking-wider">
					Topic
				</label>
				<input
					type="text"
					value={topic}
					onChange={(e) => handleTopicChange(e.target.value)}
					placeholder="What do you want to write about?"
					className="w-full px-6 py-5 border rounded-lg remirror-theme"
				/>
			</div>

			<div>
				<label className="uppercase text-zinc-600 text-sm font-medium mb-2 block tracking-wider">
					Initial Ideas
				</label>
				<div className="min-h-[400px]">
					<Editor
						placeholder={`Write down all your initial ideas and opinions, unorganised and unfiltered. The more the better.

What do you currently believe about this?
What do you want to say about it?
Why is this an interesting problem?`}
						initialContent={content}
						onChangeJSON={handleContentChange}
					/>
				</div>
			</div>

			{error && (
				<div className="bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded relative">
					<strong className="font-bold">Error: </strong>
					<span className="block sm:inline">{error}</span>
				</div>
			)}

			<div className="mt-4">
				<button
					onClick={handleAnalyse}
					disabled={!canProceed || isCreating}
					className={`w-full p-4 rounded-lg text-white transition-colors duration-200 ${
						canProceed ? "bg-primary hover:bg-primaryDark" : "bg-zinc-400"
					}`}
				>
					{isCreating ? (
						<span className="flex items-center justify-center">
							<svg
								className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
							>
								<circle
									className="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									strokeWidth="4"
								></circle>
								<path
									className="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								></path>
							</svg>
							Analysing
						</span>
					) : (
						<>Analyse →</>
					)}
				</button>
			</div>
		</div>
	);
};
