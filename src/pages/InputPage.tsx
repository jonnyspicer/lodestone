import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate, useParams, useBeforeUnload } from "react-router-dom";
import type { RemirrorJSON } from "remirror";
import Editor from "../components/Editor";
import { SessionManager } from "../utils/sessionManager";
import { modelServices } from "../services/models";
import { detailedPrompt } from "../evals/prompts";
import { DynamicQuestionsService } from "../services/dynamicQuestions";
import DynamicQuestionsPanel from "../components/DynamicQuestionsPanel";
import { DynamicQuestion, Session } from "../db";

// Configuration for dynamic questions feature
const DYNAMIC_QUESTIONS_CONFIG = {
	minCharsBeforeGeneration: 100, // Minimum characters before generating questions
	minTimeBetweenCalls: 30000, // Minimum time between API calls (30 seconds)
	debounceTime: 500, // Debounce time for typing (ms)
};

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

	// Dynamic questions state
	const [questions, setQuestions] = useState<DynamicQuestion[]>([]);
	const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
	const [isQuestionsExpanded, setIsQuestionsExpanded] = useState(false);
	const lastGenerationTime = useRef<number>(0);
	const contentLengthRef = useRef<number>(0);
	const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const sessionIdRef = useRef<number | null>(null);
	const hasDefaultQuestionsRef = useRef<boolean>(false);
	// Add a ref to track when session ID changes to use in dependency arrays
	const sessionIdChangeTracker = useRef<number>(0);
	// Add a ref to track when we need to reload questions
	const shouldReloadQuestionsRef = useRef<boolean>(false);

	// Load existing session if we have an ID
	const [session, setSession] = useState<Session | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	// Memoize the content extraction function to prevent unnecessary recalculations
	const extractTextFromContent = useCallback((json: RemirrorJSON): string => {
		let text = "";

		const traverse = (node: unknown) => {
			// Type guard to check if the node has a text property
			if (
				node &&
				typeof node === "object" &&
				"text" in node &&
				typeof node.text === "string"
			) {
				text += node.text;
			}

			// Type guard to check if the node has content array
			if (
				node &&
				typeof node === "object" &&
				"content" in node &&
				Array.isArray(node.content)
			) {
				node.content.forEach((childNode) => traverse(childNode));
			}
		};

		// Start traversal from the root
		if (json.content && Array.isArray(json.content)) {
			json.content.forEach((node) => traverse(node));
		}

		return text;
	}, []);

	// Load existing questions for this session
	const loadQuestions = useCallback(async (sessionId: number) => {
		try {
			console.log(`Loading questions for session ${sessionId}`);

			// First clean up any duplicate default questions
			await DynamicQuestionsService.cleanupDuplicateDefaultQuestions(sessionId);

			// Get only questions to display (not all questions)
			const displayQuestions =
				await DynamicQuestionsService.getQuestionsForDisplay(sessionId);

			console.log(
				`Loaded ${displayQuestions.length} questions from the database`
			);

			// Only update questions state if we got non-empty results
			// This prevents flickering when the database temporarily returns empty results
			if (displayQuestions.length > 0) {
				setQuestions(displayQuestions);
				// Update ref to track if we have default questions
				hasDefaultQuestionsRef.current = displayQuestions.some(
					(q) => q.isInitialQuestion
				);
			} else {
				// If no questions were found, try adding default questions as a recovery mechanism
				console.log("No questions found, attempting to add default questions");
				const defaultQuestions =
					await DynamicQuestionsService.addDefaultQuestions(sessionId);

				if (defaultQuestions.length > 0) {
					console.log(
						`Added ${defaultQuestions.length} default questions as fallback`
					);
					setQuestions(defaultQuestions);
					hasDefaultQuestionsRef.current = true;
				} else {
					console.warn("Still no questions after recovery attempt");
				}
			}

			// Reset the reload flag since we've just loaded questions
			shouldReloadQuestionsRef.current = false;
		} catch (error) {
			console.error("Error loading questions:", error);
		}
	}, []);

	// Fetch session once on component mount
	useEffect(() => {
		const fetchSession = async () => {
			if (!id) return;
			try {
				setIsLoading(true);
				const fetchedSession = await SessionManager.getSession(parseInt(id));
				if (fetchedSession) {
					setSession(fetchedSession);
					setTopic(fetchedSession.title);
					setContent(fetchedSession.inputContent.content);

					// Store session ID in ref for question generation
					if (fetchedSession.id) {
						sessionIdRef.current = fetchedSession.id;
						// Increment the tracker to signal the session ID has changed
						sessionIdChangeTracker.current += 1;
						// Load questions for this session
						loadQuestions(fetchedSession.id);
					}
				}
			} catch (error) {
				console.error("Error fetching session:", error);
			} finally {
				setIsLoading(false);
			}
		};

		fetchSession();
	}, [id, loadQuestions]);

	// Create a new session when the user starts typing if they don't have one yet
	useEffect(() => {
		// If there's no ID in the URL, redirect to the sessions page
		// This should not happen with our new flow, but this is a safety measure
		if (!id) {
			navigate("/");
			return;
		}

		// Only run this effect if there's an ID from the URL but no session ID ref set yet
		if (id && !sessionIdRef.current) {
			// Store the ID for question generation
			sessionIdRef.current = parseInt(id);
			// Increment the tracker to signal the session ID has changed
			sessionIdChangeTracker.current += 1;
		}
	}, [id, navigate]);

	// Add default questions when first loading (if we have a session ID from the URL)
	useEffect(() => {
		// This effect only runs once when the session ID is first available
		const currentSessionId = sessionIdRef.current;
		const hasId = id && !isNaN(parseInt(id));

		if (
			hasId &&
			currentSessionId &&
			!hasDefaultQuestionsRef.current &&
			questions.length === 0
		) {
			(async () => {
				try {
					// Check if we already have questions first
					const existingQuestions =
						await DynamicQuestionsService.getQuestionsForDisplay(
							currentSessionId
						);

					if (existingQuestions.length === 0) {
						// Add default questions if none exist
						const defaultQuestions =
							await DynamicQuestionsService.addDefaultQuestions(
								currentSessionId
							);
						setQuestions(defaultQuestions);
						hasDefaultQuestionsRef.current = true;
					} else {
						// Use existing questions
						setQuestions(existingQuestions);
						hasDefaultQuestionsRef.current = existingQuestions.some(
							(q) => q.isInitialQuestion
						);
					}
				} catch (error) {
					console.error(
						"Error adding default questions on initial load:",
						error
					);
				}
			})();
		}
	}, [id, questions.length]); // Using the tracker value instead of the ref directly

	// Effect to load questions when reload flag is set
	// This separates the question loading from generation
	useEffect(() => {
		if (shouldReloadQuestionsRef.current && sessionIdRef.current) {
			loadQuestions(sessionIdRef.current);
		}
	}, [loadQuestions]);

	// Generate dynamic questions when content changes
	// IMPORTANT: questions is removed from dependencies to break circular updates!
	useEffect(() => {
		// Clear any existing debounce timer
		if (debounceTimerRef.current) {
			clearTimeout(debounceTimerRef.current);
		}

		// Only proceed if we have a sessionId
		const currentSessionId = sessionIdRef.current;
		if (!currentSessionId) {
			return;
		}

		// Extract text content from the editor
		const textContent = extractTextFromContent(content);
		const prevLength = contentLengthRef.current;
		contentLengthRef.current = textContent.length;

		// Don't generate questions if not enough content
		if (
			textContent.length < DYNAMIC_QUESTIONS_CONFIG.minCharsBeforeGeneration
		) {
			return;
		}

		// Check if enough time has passed since last generation
		const now = Date.now();
		const timeSinceLastGeneration = now - lastGenerationTime.current;
		const shouldGenerate =
			timeSinceLastGeneration >= DYNAMIC_QUESTIONS_CONFIG.minTimeBetweenCalls ||
			textContent.length >= prevLength + 100; // Or if 100+ new characters since last check

		if (!shouldGenerate) return;

		// Set a debounce timer to wait for user to stop typing
		debounceTimerRef.current = setTimeout(async () => {
			// Ensure the user has paused typing before generating questions
			try {
				setIsLoadingQuestions(true);

				// Get API key from environment
				const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
				if (!apiKey) {
					console.error("OpenAI API key not found");
					throw new Error("OpenAI API key not found in environment variables");
				}

				// Get previously asked questions to avoid repeating - but don't use state directly
				// Instead, fetch them from the database to avoid circular dependencies
				const allQuestions = await DynamicQuestionsService.getAllQuestions(
					currentSessionId
				);
				const previousQuestions = allQuestions.map((q) => q.question);

				// Generate new questions
				console.log("Calling OpenAI to generate new questions");
				const newQuestions = await DynamicQuestionsService.generateQuestions({
					text: textContent,
					sessionId: currentSessionId,
					topic: topic,
					apiKey,
					previousQuestions,
				});
				console.log("Generated new questions:", newQuestions.length);

				// Update the displayed questions
				if (newQuestions.length > 0) {
					// Signal that we need to reload questions on next render
					shouldReloadQuestionsRef.current = true;
					// Force an update without directly using questions state as a dependency
					// This is like poking React to run the other effect
					sessionIdChangeTracker.current += 1;
				}

				// Update the last generation time
				lastGenerationTime.current = Date.now();
			} catch (error) {
				console.error("Error generating questions:", error);
			} finally {
				setIsLoadingQuestions(false);
			}
		}, DYNAMIC_QUESTIONS_CONFIG.debounceTime);

		// Cleanup function to clear the timer
		return () => {
			if (debounceTimerRef.current) {
				clearTimeout(debounceTimerRef.current);
			}
		};
	}, [content, topic, extractTextFromContent, loadQuestions]); // Removed 'questions' from dependencies!

	// Save changes to existing session - but don't use a timer for auto-save
	const saveChanges = useCallback(async () => {
		if (!id || !isDirty) return;

		try {
			await SessionManager.updateInputContent(parseInt(id), content);
			await SessionManager.updateSessionTitle(parseInt(id), topic);
			setIsDirty(false);
			console.log("Changes saved successfully");
		} catch (error) {
			console.error("Failed to save changes:", error);
		}
	}, [id, content, topic, isDirty]);

	// Handle content changes
	const handleContentChange = useCallback((json: RemirrorJSON) => {
		setContent(json);
		setIsDirty(true);
	}, []);

	// Handle topic changes
	const handleTopicChange = useCallback((newTopic: string) => {
		setTopic(newTopic);
		setIsDirty(true);
	}, []);

	// Save when input field loses focus
	const handleInputBlur = useCallback(() => {
		if (isDirty) {
			saveChanges();
		}
	}, [isDirty, saveChanges]);

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

	const handleAnalyse = useCallback(async () => {
		setIsCreating(true);
		setError(null);
		try {
			// First save any pending changes
			if (isDirty) {
				await saveChanges();
			}

			const sessionId: number | null = id ? parseInt(id) : sessionIdRef.current;

			if (!sessionId) {
				throw new Error("No session ID available for analysis");
			}

			// Get the GPT-4o-mini service
			const service = modelServices["gpt4o-mini"];

			// Extract text content from the editor
			const textContent = extractTextFromContent(content);

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
			navigate(`/analysis/${sessionId}`);
		} catch (error) {
			console.error("Failed to create and analyse session:", error);
			setError(error instanceof Error ? error.message : "Unknown error");
		} finally {
			setIsCreating(false);
		}
	}, [
		id,
		content,
		isDirty,
		saveChanges,
		navigate,
		extractTextFromContent,
	]);

	// Toggle expand/collapse for questions - memoize to prevent new function references
	const handleToggleQuestionsExpand = useCallback(() => {
		setIsQuestionsExpanded((prev) => !prev);
	}, []);

	// Memoize the canProceed value
	const canProceed = useMemo(() => {
		return (
			Boolean(topic.trim()) &&
			content?.content?.some((p) =>
				p.content?.some((n) => n.text && n.text.trim().length > 0)
			)
		);
	}, [topic, content]);

	// Memoize props for DynamicQuestionsPanel to prevent unnecessary re-renders
	const questionsProps = useMemo(() => {
		return {
			questions,
			isLoading: isLoadingQuestions,
			isExpanded: isQuestionsExpanded,
			onToggleExpand: handleToggleQuestionsExpand,
		};
	}, [
		questions,
		isLoadingQuestions,
		isQuestionsExpanded,
		handleToggleQuestionsExpand,
	]);

	return (
		<div className="max-w-5xl mx-auto p-8 mb-24">
			{isLoading ? (
				<div className="flex items-center justify-center py-12">
					<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
					<span className="ml-3">Loading session...</span>
				</div>
			) : (
				<>
					<div>
						<label className="uppercase text-zinc-600 text-sm font-medium mb-2 block tracking-wider">
							Topic
						</label>
						<input
							type="text"
							value={topic}
							onChange={(e) => handleTopicChange(e.target.value)}
							onBlur={handleInputBlur}
							placeholder="What do you want to write about?"
							className="w-full px-6 py-5 border rounded-lg remirror-theme"
						/>
					</div>

					<div className="mt-8 flex">
						{/* Main content area */}
						<div className="flex-1">
							<label className="uppercase text-zinc-600 text-sm font-medium mb-2 block tracking-wider">
								Initial Ideas
							</label>
							<div className="min-h-[400px]">
								<Editor
									placeholder={`Write down all your initial ideas and opinions, unorganised and unfiltered. The more the better.`}
									initialContent={content}
									onChangeJSON={handleContentChange}
								/>
							</div>
						</div>

						<div className="ml-6 w-72">
							<DynamicQuestionsPanel {...questionsProps} />
						</div>
					</div>

					{error && (
						<div className="bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded relative mt-4">
							<strong className="font-bold">Error: </strong>
							<span className="block sm:inline">{error}</span>
						</div>
					)}

					<div className="mt-4">
						<button
							onClick={handleAnalyse}
							disabled={!canProceed || isCreating || !session}
							className={`w-full p-4 rounded-lg text-white transition-colors duration-200 ${
								canProceed && session
									? "bg-primary hover:bg-primaryDark"
									: "bg-zinc-400"
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
				</>
			)}
		</div>
	);
};
