import { useState } from "react";
import type { EditorContent } from "../db";
import type { Relationship } from "../utils/relationshipTypes";
import { PROMPT_TEMPLATES } from "../evals/prompts";
import { TEST_CASES } from "../evals/testCases";

interface ModelResult {
	modelName: string;
	promptId: string;
	output: {
		highlights: EditorContent["highlights"];
		relationships: Relationship[];
	};
	error?: string;
}

export const EvalPage = () => {
	const [results, setResults] = useState<ModelResult[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [selectedTest, setSelectedTest] = useState(TEST_CASES[0]);
	const [selectedPrompt, setSelectedPrompt] = useState(PROMPT_TEMPLATES[0]);
	const [customPrompt, setCustomPrompt] = useState("");
	const [isCustomPrompt, setIsCustomPrompt] = useState(false);

	const evaluateModel = async (modelName: string) => {
		setIsLoading(true);
		try {
			const promptToUse = isCustomPrompt
				? customPrompt
				: selectedPrompt.template.replace("{{text}}", selectedTest.text);

			console.log(`Evaluating with prompt: ${promptToUse}`);

			// TODO: Implement model API calls
			setResults((prev) => [
				...prev,
				{
					modelName,
					promptId: isCustomPrompt ? "custom" : selectedPrompt.id,
					output: {
						highlights: [],
						relationships: [],
					},
				},
			]);
		} catch (error) {
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
		} finally {
			setIsLoading(false);
		}
	};

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
						disabled={isLoading}
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
						disabled={isLoading}
					/>
				) : (
					<pre className="whitespace-pre-wrap bg-gray-100 p-2 rounded text-sm">
						{selectedPrompt.template}
					</pre>
				)}
			</div>

			{/* Model Evaluation */}
			<div className="mb-8">
				<h3 className="text-lg font-semibold mb-4">Model Evaluation</h3>
				<div className="flex gap-2">
					<button
						onClick={() => evaluateModel("gpt4o-mini")}
						disabled={isLoading}
						className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
					>
						Test GPT-4o-mini
					</button>
					<button
						onClick={() => evaluateModel("gpt4o")}
						disabled={isLoading}
						className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
					>
						Test GPT-4o
					</button>
					<button
						onClick={() => evaluateModel("deepseek-r1")}
						disabled={isLoading}
						className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
					>
						Test DeepSeek R1
					</button>
					<button
						onClick={() => evaluateModel("claude-3.5")}
						disabled={isLoading}
						className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
					>
						Test Claude 3.5
					</button>
				</div>
			</div>

			{/* Model Outputs */}
			<div className="border p-4 rounded">
				<h3 className="text-lg font-semibold mb-2">Model Outputs</h3>
				{results.map((result, index) => (
					<div key={index} className="mb-4">
						<h4 className="font-medium">
							{result.modelName} (Prompt: {result.promptId})
						</h4>
						{result.error ? (
							<div className="text-red-500">{result.error}</div>
						) : (
							<pre className="whitespace-pre-wrap bg-gray-100 p-2 rounded">
								{JSON.stringify(result.output, null, 2)}
							</pre>
						)}
					</div>
				))}
			</div>
		</div>
	);
};
