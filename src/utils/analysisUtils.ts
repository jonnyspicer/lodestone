import type { RemirrorJSON } from "remirror";
import { SessionManager } from "./sessionManager";
import { modelServices } from "../services/models";
import type { ModelName } from "../services/models/types";
import { detailedPrompt } from "../evals/prompts";
import { extractTextFromContent } from "./textUtils";

interface AnalysisOptions {
	sessionId: number;
	content: RemirrorJSON;
	modelName?: string;
	promptId?: string;
	isDirty: boolean;
	saveChanges: () => Promise<void>;
}

/**
 * Performs the analysis of text content using the specified model
 * and saves the results to the database
 */
export async function performAnalysis({
	sessionId,
	content,
	modelName = "gpt4o-mini",
	promptId = detailedPrompt.id,
	isDirty,
	saveChanges,
}: AnalysisOptions): Promise<{ success: boolean; error?: string }> {
	try {
		// First save any pending changes
		if (isDirty) {
			await saveChanges();
		}

		// Get the model service
		const service = modelServices[modelName as keyof typeof modelServices];
		if (!service) {
			throw new Error(`Model service '${modelName}' not found`);
		}

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

		// Send to model service with API key
		const analysis = await service.analyse(textContent, prompt, { apiKey });

		// Save the analysis results
		await SessionManager.saveAnalysis(
			sessionId,
			modelName as ModelName,
			promptId,
			content,
			analysis.highlights,
			analysis.relationships
		);

		return { success: true };
	} catch (error) {
		console.error("Failed to create and analyse session:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}
