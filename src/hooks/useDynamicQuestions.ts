import { useState, useEffect, useRef, useCallback } from "react";
import type { RemirrorJSON } from "remirror";
import { DynamicQuestionsService } from "../services/dynamicQuestions";
import { DynamicQuestion } from "../db";
import { extractTextFromContent } from "../utils/textUtils";

// Configuration for dynamic questions feature
const DYNAMIC_QUESTIONS_CONFIG = {
	minCharsBeforeGeneration: 100, // Minimum characters before generating questions
	minTimeBetweenCalls: 30000, // Minimum time between API calls (30 seconds)
	debounceTime: 500, // Debounce time for typing (ms)
};

interface UseDynamicQuestionsProps {
	sessionId: number | null;
	content: RemirrorJSON;
	topic: string;
}

export function useDynamicQuestions({
	sessionId,
	content,
	topic,
}: UseDynamicQuestionsProps) {
	// State for dynamic questions
	const [questions, setQuestions] = useState<DynamicQuestion[]>([]);
	const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
	const [isQuestionsExpanded, setIsQuestionsExpanded] = useState(false);

	// Refs for tracking question generation
	const lastGenerationTime = useRef<number>(0);
	const contentLengthRef = useRef<number>(0);
	const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const hasDefaultQuestionsRef = useRef<boolean>(false);
	const shouldReloadQuestionsRef = useRef<boolean>(false);

	// Toggle expand/collapse for questions
	const handleToggleQuestionsExpand = useCallback(() => {
		setIsQuestionsExpanded((prev) => !prev);
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

	// Effect to load questions when reload flag is set
	useEffect(() => {
		if (shouldReloadQuestionsRef.current && sessionId) {
			loadQuestions(sessionId);
		}
	}, [loadQuestions, sessionId]);

	// Add default questions when first loading
	useEffect(() => {
		if (
			sessionId &&
			!hasDefaultQuestionsRef.current &&
			questions.length === 0
		) {
			(async () => {
				try {
					// Check if we already have questions first
					const existingQuestions =
						await DynamicQuestionsService.getQuestionsForDisplay(sessionId);

					if (existingQuestions.length === 0) {
						// Add default questions if none exist
						const defaultQuestions =
							await DynamicQuestionsService.addDefaultQuestions(sessionId);
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
	}, [sessionId, questions.length, loadQuestions]);

	// Generate dynamic questions when content changes
	useEffect(() => {
		// Clear any existing debounce timer
		if (debounceTimerRef.current) {
			clearTimeout(debounceTimerRef.current);
		}

		// Only proceed if we have a sessionId
		if (!sessionId) {
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

				// Get previously asked questions to avoid repeating
				const allQuestions = await DynamicQuestionsService.getAllQuestions(
					sessionId
				);
				const previousQuestions = allQuestions.map((q) => q.question);

				// Generate new questions
				console.log("Calling OpenAI to generate new questions");
				const newQuestions = await DynamicQuestionsService.generateQuestions({
					text: textContent,
					sessionId: sessionId,
					topic: topic,
					apiKey,
					previousQuestions,
				});
				console.log("Generated new questions:", newQuestions.length);

				// Update the displayed questions
				if (newQuestions.length > 0) {
					// Signal that we need to reload questions on next render
					shouldReloadQuestionsRef.current = true;
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
	}, [content, topic, sessionId]);

	return {
		questions,
		isLoadingQuestions,
		isQuestionsExpanded,
		handleToggleQuestionsExpand,
		loadQuestions,
	};
}
