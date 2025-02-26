import { useState, useCallback } from "react";
import { SessionManager } from "../utils/sessionManager";
import { useNavigate } from "react-router-dom";

type AnalysisOptionsProps = {
	sessionId: number;
};

export const AnalysisOptions = ({ sessionId }: AnalysisOptionsProps) => {
	const [loading, setLoading] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [analysisType, setAnalysisType] = useState<string>("huggingface");
	const [confidenceThreshold, setConfidenceThreshold] = useState<number>(0.1);
	const [includeOverlapping, setIncludeOverlapping] = useState<boolean>(true);

	const navigate = useNavigate();

	const handleAnalyze = useCallback(async () => {
		setLoading(true);
		setError(null);

		try {
			// Set the session to analysis status
			await SessionManager.startAnalysis(sessionId);

			// Perform the analysis based on the selected type
			if (analysisType === "huggingface") {
				await SessionManager.analyzeWithHuggingFace(sessionId, {
					confidenceThreshold,
					includeOverlapping,
				});
			} else {
				// Default to OpenAI or other analysis methods
				console.log("Using default analysis method");
				// Add your existing analysis method here
			}

			// Navigate to the editor page to show results
			navigate(`/sessions/${sessionId}/analysis`);
		} catch (error) {
			console.error("Analysis error:", error);
			setError(`Failed to analyze: ${error}`);
		} finally {
			setLoading(false);
		}
	}, [
		sessionId,
		analysisType,
		confidenceThreshold,
		includeOverlapping,
		navigate,
	]);

	return (
		<div className="bg-white p-6 rounded-lg shadow-md">
			<h2 className="text-xl font-semibold mb-4">Analysis Options</h2>

			{error && (
				<div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
					{error}
				</div>
			)}

			<div className="mb-4">
				<label className="block text-gray-700 mb-2">Analysis Method</label>
				<select
					className="w-full p-2 border rounded"
					value={analysisType}
					onChange={(e) => setAnalysisType(e.target.value)}
					disabled={loading}
				>
					<option value="huggingface">
						Hugging Face (Zero-Shot Classification)
					</option>
					<option value="openai">OpenAI (Default Method)</option>
				</select>
			</div>

			{analysisType === "huggingface" && (
				<>
					<div className="mb-4">
						<label className="block text-gray-700 mb-2">
							Confidence Threshold: {confidenceThreshold}
						</label>
						<input
							type="range"
							min="0.1"
							max="0.5"
							step="0.05"
							value={confidenceThreshold}
							onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
							className="w-full"
							disabled={loading}
						/>
						<div className="flex justify-between text-xs text-gray-500">
							<span>0.1</span>
							<span>0.5</span>
						</div>
					</div>

					<div className="mb-4">
						<label className="flex items-center space-x-2">
							<input
								type="checkbox"
								checked={includeOverlapping}
								onChange={(e) => setIncludeOverlapping(e.target.checked)}
								disabled={loading}
							/>
							<span className="text-gray-700">
								Allow overlapping highlights
							</span>
						</label>
					</div>
				</>
			)}

			<button
				onClick={handleAnalyze}
				disabled={loading}
				className={`w-full py-2 px-4 rounded font-semibold ${
					loading
						? "bg-gray-300 text-gray-700 cursor-not-allowed"
						: "bg-blue-600 text-white hover:bg-blue-700"
				}`}
			>
				{loading ? "Analyzing..." : "Start Analysis"}
			</button>
		</div>
	);
};
