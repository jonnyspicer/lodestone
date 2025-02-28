import { useState, useEffect, memo, useRef } from "react";
import { DynamicQuestion } from "../db";

interface DynamicQuestionsPanelProps {
	questions: DynamicQuestion[];
	isLoading: boolean;
	isExpanded: boolean;
	onToggleExpand: () => void;
}

// Custom comparison function for memo to better control when re-renders occur
const areEqual = (
	prevProps: DynamicQuestionsPanelProps,
	nextProps: DynamicQuestionsPanelProps
) => {
	// If loading state changes, we should re-render
	if (prevProps.isLoading !== nextProps.isLoading) {
		return false;
	}

	// If expanded state changes, we should re-render
	if (prevProps.isExpanded !== nextProps.isExpanded) {
		return false;
	}

	// If the number of questions changes, we should re-render
	if (prevProps.questions.length !== nextProps.questions.length) {
		return false;
	}

	// If the questions themselves change (by ID), we should re-render
	const prevIds = new Set(prevProps.questions.map((q) => q.id));
	const nextIds = new Set(nextProps.questions.map((q) => q.id));

	// Check if any IDs were added or removed
	if (prevIds.size !== nextIds.size) {
		return false;
	}

	// Check if the IDs are the same
	for (const id of prevIds) {
		if (!nextIds.has(id)) {
			return false;
		}
	}

	// Check if the toggle handler reference changed
	if (prevProps.onToggleExpand !== nextProps.onToggleExpand) {
		return false;
	}

	// If we reach here, props are considered equal, no need to re-render
	return true;
};

const DynamicQuestionsPanel: React.FC<DynamicQuestionsPanelProps> = ({
	questions,
	isLoading,
	isExpanded,
	onToggleExpand,
}) => {
	// Add a ref to track component mounts
	const mountCountRef = useRef(0);

	// State to track which questions are currently visible (for animation)
	const [visibleQuestions, setVisibleQuestions] = useState<DynamicQuestion[]>(
		[]
	);

	// Add a ref to track if we've initialized questions
	const hasInitializedRef = useRef(false);

	// Log when component mounts/unmounts
	useEffect(() => {
		mountCountRef.current += 1;
		return () => {
			// Component unmount cleanup if needed
		};
	}, []);

	// Apply animations when questions change
	useEffect(() => {
		// CRITICAL FIX: Don't clear visibleQuestions if questions is empty but we previously had questions
		// This prevents the flickering when the database temporarily returns no questions
		if (questions.length === 0) {
			// Check if we already have questions in the visibleQuestions state
			if (visibleQuestions.length === 0 || !hasInitializedRef.current) {
				// We don't need to do anything - we'll wait for questions to arrive
			} else {
				// Keep existing questions to prevent flickering
			}
			return;
		}

		// Mark that we've initialized once we get real questions
		hasInitializedRef.current = true;

		// Animate questions in/out
		setVisibleQuestions((prev) => {
			// If we're expanding, just show all questions
			if (isExpanded) {
				return questions;
			}

			// If we're not expanded, keep only the maximum visible count
			const maxVisible = 3; // CRITICAL FIX: Changed from 4 to 3
			const newQuestions = questions.slice(0, maxVisible);

			// If we have the same number of questions, check if any are new
			if (prev.length === newQuestions.length) {
				const prevIds = new Set(prev.map((q) => q.id));
				const hasNewQuestions = newQuestions.some((q) => !prevIds.has(q.id));

				if (hasNewQuestions) {
					// Apply fade in/out animation for new questions
					// This is just setting the state - the actual animation is in CSS
					return newQuestions;
				}

				return prev;
			}

			return newQuestions;
		});
	}, [questions, isExpanded, visibleQuestions.length]);

	// Get the questions to display (either all or just the visible ones)
	// CRITICAL FIX: Prefer visibleQuestions over questions to prevent flickering
	const displayQuestions = isExpanded
		? questions.length > 0
			? questions
			: visibleQuestions
		: visibleQuestions.length > 0
		? visibleQuestions
		: questions;

	// CHANGE: Always render the container with content, use empty states instead of conditionals
	return (
		<div className="mt-4 transition-all duration-300 min-h-[100px]">
			<div className="mb-2 flex items-center justify-between">
				{questions.length > 3 && (
					<button
						onClick={onToggleExpand}
						className="text-xs text-primary hover:text-primaryDark"
					>
						{isExpanded ? "Show fewer" : `Show all (${questions.length})`}
					</button>
				)}
			</div>

			<div className="space-y-4 transition-all duration-300">
				{displayQuestions.length > 0 ? (
					displayQuestions.map((question) => (
						<div
							key={question.id}
							className="text-sm text-zinc-500 font-medium animate-fade-in"
						>
							{question.question}
						</div>
					))
				) : (
					// Empty state instead of not rendering anything
					<div className="p-3 bg-zinc-50 rounded border border-zinc-200 text-sm text-zinc-400 font-medium">
						{isLoading ? "Loading questions..." : "Questions will appear here"}
					</div>
				)}

				{isLoading && (
					<div className="flex items-center space-x-2 p-2">
						<div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse"></div>
						<span className="text-xs text-zinc-400">Thinking...</span>
					</div>
				)}
			</div>
		</div>
	);
};

// Export a memoized version of the component to prevent unnecessary re-renders
export default memo(DynamicQuestionsPanel, areEqual);
