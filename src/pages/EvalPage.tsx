import { useState, useEffect } from "react";
import type { EditorContent } from "../db";
import type { Relationship } from "../utils/relationshipTypes";
import { PROMPT_TEMPLATES } from "../evals/prompts";
import { TEST_CASES } from "../evals/testCases";
import { modelServices, type ModelName } from "../services/models";
import { getApiKey, getAvailableModels } from "../config/env";

interface ModelResult {
	modelName: string;
	promptId: string;
	output: {
		highlights: EditorContent["highlights"];
		relationships: Relationship[];
	};
	error?: string;
}

interface LoadingState {
	[key: string]: {
		status:
			| "idle"
			| "sending"
			| "waiting"
			| "processing"
			| "complete"
			| "error";
		message?: string;
	};
}

export const EvalPage = () => {
	const [results, setResults] = useState<ModelResult[]>([]);
	const [loadingStates, setLoadingStates] = useState<LoadingState>({});
	const [selectedTest, setSelectedTest] = useState(TEST_CASES[0]);
	const [selectedPrompt, setSelectedPrompt] = useState(PROMPT_TEMPLATES[0]);
	const [customPrompt, setCustomPrompt] = useState("");
	const [isCustomPrompt, setIsCustomPrompt] = useState(false);
	const [availableModels, setAvailableModels] = useState<ModelName[]>([]);
	const [initError, setInitError] = useState<string | null>(null);

	useEffect(() => {
		try {
			const models = getAvailableModels();
			if (models.length === 0) {
				setInitError(
					"No models available. Please check your API keys in the .env file."
				);
			} else {
				setAvailableModels(models);
				setInitError(null);
			}
		} catch (error) {
			setInitError(
				error instanceof Error ? error.message : "Failed to initialize models"
			);
		}
	}, []);

	const evaluateModel = async (modelName: ModelName) => {
		console.log(`Starting evaluation for ${modelName}...`);
		setLoadingStates((prev) => ({
			...prev,
			[modelName]: { status: "sending", message: "Sending request..." },
		}));

		try {
			const service = modelServices[modelName];
			const promptToUse = isCustomPrompt
				? customPrompt
				: selectedPrompt.template.replace("{{text}}", selectedTest.text);

			console.log(`${modelName}: Getting API key...`);
			const apiKey = getApiKey(modelName);

			console.log(`${modelName}: Sending request to API...`);
			setLoadingStates((prev) => ({
				...prev,
				[modelName]: {
					status: "waiting",
					message: "Waiting for model response...",
				},
			}));

			const output = await service.analyze(selectedTest.text, promptToUse, {
				apiKey,
			});

			console.log(`${modelName}: Received response:`, output);
			setLoadingStates((prev) => ({
				...prev,
				[modelName]: { status: "complete" },
			}));

			setResults((prev) => [
				...prev,
				{
					modelName,
					promptId: isCustomPrompt ? "custom" : selectedPrompt.id,
					output,
				},
			]);
		} catch (error) {
			console.error(`${modelName}: Error during evaluation:`, error);
			setLoadingStates((prev) => ({
				...prev,
				[modelName]: {
					status: "error",
					message: error instanceof Error ? error.message : "Unknown error",
				},
			}));

			setResults((prev) => [
				...prev,
				{
					modelName,
					promptId: isCustomPrompt ? "custom" : selectedPrompt.id,
					output: {
						highlights: [],
						relationships: [],
					},
					error: error instanceof Error ? error.message : "Unknown error",
				},
			]);
		}
	};

	if (initError) {
		return (
			<div className="p-4 max-w-7xl mx-auto">
				<div
					className="bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded relative"
					role="alert"
				>
					<strong className="font-bold">Error: </strong>
					<span className="block sm:inline">{initError}</span>
				</div>
			</div>
		);
	}

	return (
		<div className="p-4 max-w-7xl mx-auto">
			<h2 className="text-2xl font-bold mb-4">Model Evaluation</h2>

			{/* Test Case Selection and Preview */}
			<div className="mb-8">
				<div className="flex items-center gap-4 mb-4">
					<h3 className="text-lg font-semibold">Test Case</h3>
					<select
						value={selectedTest.id}
						onChange={(e) =>
							setSelectedTest(
								TEST_CASES.find((t) => t.id === Number(e.target.value)) ||
									TEST_CASES[0]
							)
						}
						className="border p-2 rounded flex-grow"
					>
						{TEST_CASES.map((test) => (
							<option key={test.id} value={test.id}>
								{test.name}
							</option>
						))}
					</select>
				</div>

				{/* Test Case Preview */}
				<div className="border rounded p-4 bg-white">
					<h4 className="font-medium mb-2">Text to Analyze:</h4>
					<div className="whitespace-pre-wrap bg-gray-50 p-4 rounded">
						{selectedTest.text}
					</div>
				</div>
			</div>

			{/* Prompt Selection */}
			<div className="mb-8">
				<h3 className="text-lg font-semibold mb-4">Prompt Template</h3>
				<div className="flex gap-2 mb-2">
					<select
						value={isCustomPrompt ? "custom" : selectedPrompt.id}
						onChange={(e) => {
							const value = e.target.value;
							setIsCustomPrompt(value === "custom");
							if (value !== "custom") {
								const prompt = PROMPT_TEMPLATES.find((p) => p.id === value);
								if (prompt) setSelectedPrompt(prompt);
							}
						}}
						className="border p-2 rounded"
						disabled={Object.values(loadingStates).some(
							(state) =>
								state.status === "sending" || state.status === "waiting"
						)}
					>
						{PROMPT_TEMPLATES.map((prompt) => (
							<option key={prompt.id} value={prompt.id}>
								{prompt.name}
							</option>
						))}
						<option value="custom">Custom Prompt</option>
					</select>
				</div>
				{isCustomPrompt ? (
					<textarea
						value={customPrompt}
						onChange={(e) => setCustomPrompt(e.target.value)}
						className="w-full h-64 border p-2 rounded font-mono text-sm"
						placeholder="Enter your custom prompt here..."
						disabled={Object.values(loadingStates).some(
							(state) =>
								state.status === "sending" || state.status === "waiting"
						)}
					/>
				) : (
					<pre className="whitespace-pre-wrap bg-zinc-100 p-2 rounded text-sm">
						{selectedPrompt.template}
					</pre>
				)}
			</div>

			{/* Model Evaluation */}
			<div className="mb-8">
				<h3 className="text-lg font-semibold mb-4">Model Evaluation</h3>
				<div className="flex gap-2">
					{availableModels.map((modelName) => (
						<div key={modelName} className="flex flex-col gap-2">
							<button
								onClick={() => evaluateModel(modelName)}
								disabled={
									loadingStates[modelName]?.status === "sending" ||
									loadingStates[modelName]?.status === "waiting"
								}
								className="px-4 py-2 bg-primary text-white rounded hover:bg-primaryDark disabled:opacity-50"
							>
								Test {modelName}
							</button>
							{loadingStates[modelName] &&
								loadingStates[modelName].status !== "complete" && (
									<div className="text-sm">
										{loadingStates[modelName].status === "sending" && (
											<span className="text-primary">
												⏳ Sending request...
											</span>
										)}
										{loadingStates[modelName].status === "waiting" && (
											<span className="text-yellow-500">
												⌛ Waiting for response...
											</span>
										)}
										{loadingStates[modelName].status === "error" && (
											<span className="text-rose-500">
												❌ {loadingStates[modelName].message}
											</span>
										)}
									</div>
								)}
						</div>
					))}
				</div>
			</div>

			{/* Model Outputs */}
			<div className="border rounded">
				<h3 className="text-lg font-semibold mb-2">Model Outputs</h3>
				{results.map((result, index) => (
					<div key={index} className="mb-4">
						<h4 className="font-medium">
							{result.modelName} (Prompt: {result.promptId})
							{loadingStates[result.modelName]?.status === "complete" && (
								<span className="text-lime-700 ml-2">✓</span>
							)}
						</h4>
						{result.error ? (
							<div className="text-rose-700">{result.error}</div>
						) : (
							<pre className="text-sm whitespace-pre-wrap bg-zinc-100 p-2 rounded">
								{JSON.stringify(result.output, null, 2)}
							</pre>
						)}
					</div>
				))}
			</div>
		</div>
	);
};
