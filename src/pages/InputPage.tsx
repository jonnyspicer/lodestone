import { useEffect, useMemo, useRef } from "react";
import { useBeforeUnload } from "react-router-dom";
import Editor from "../components/Editor";
import DynamicQuestionsPanel from "../components/DynamicQuestionsPanel";

// Import our custom hooks and utilities
import { useSessionManager } from "../hooks/useSessionManager";
import { useDynamicQuestions } from "../hooks/useDynamicQuestions";
import { useAnalysis } from "../hooks/useAnalysis";

export const InputPage = () => {
	// Session management
	const {
		session,
		isLoading,
		topic,
		content,
		isDirty,
		error,
		handleContentChange,
		handleTopicChange,
		handleInputBlur,
		saveChanges,
		sessionId,
	} = useSessionManager();

	// Track session ID for dynamic questions
	const sessionIdRef = useRef<number | null>(null);

	// Update ref when sessionId changes
	useEffect(() => {
		if (sessionId) {
			sessionIdRef.current = sessionId;
		}
	}, [sessionId]);

	// Dynamic questions
	const {
		questions,
		isLoadingQuestions,
		isQuestionsExpanded,
		handleToggleQuestionsExpand,
	} = useDynamicQuestions({
		sessionId: sessionIdRef.current,
		content,
		topic,
	});

	// Analysis functionality
	const { isCreating, handleAnalyse } = useAnalysis({
		sessionId: sessionIdRef.current,
		content,
		isDirty,
		saveChanges,
	});

	// Save before leaving
	useEffect(() => {
		return () => {
			if (isDirty && sessionId) {
				saveChanges();
			}
		};
	}, [isDirty, sessionId, saveChanges]);

	// Handle browser close/refresh
	useBeforeUnload(() => {
		if (isDirty && sessionId) {
			saveChanges();
		}
	});

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
