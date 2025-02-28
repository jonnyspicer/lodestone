import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { RemirrorJSON } from "remirror";
import { performAnalysis } from "../utils/analysisUtils";

interface UseAnalysisProps {
	sessionId: number | null;
	content: RemirrorJSON;
	isDirty: boolean;
	saveChanges: () => Promise<void>;
}

export function useAnalysis({
	sessionId,
	content,
	isDirty,
	saveChanges,
}: UseAnalysisProps) {
	const navigate = useNavigate();
	const [isCreating, setIsCreating] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleAnalyse = useCallback(async () => {
		if (!sessionId) {
			setError("No session ID available for analysis");
			return;
		}

		setIsCreating(true);
		setError(null);

		try {
			// Perform the analysis
			const result = await performAnalysis({
				sessionId,
				content,
				isDirty,
				saveChanges,
			});

			if (!result.success) {
				setError(result.error || "Unknown error during analysis");
				return;
			}

			// Navigate directly to editor page in analysis mode
			navigate(`/analysis/${sessionId}`);
		} catch (error) {
			console.error("Failed to create and analyse session:", error);
			setError(error instanceof Error ? error.message : "Unknown error");
		} finally {
			setIsCreating(false);
		}
	}, [sessionId, content, isDirty, saveChanges, navigate]);

	return {
		isCreating,
		error,
		setError,
		handleAnalyse,
	};
}
