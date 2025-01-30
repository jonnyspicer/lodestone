import type { ModelName } from "../services/models";

// Validate that required environment variables are set
const validateEnvVar = (key: string, value: string | undefined): string => {
	if (!value || value.trim() === "") {
		throw new Error(
			`Missing environment variable: ${key}. Please check your .env file and ensure it is set.`
		);
	}
	return value;
};

// Get environment variables with type safety and validation
const env = {
	OPENAI_API_KEY: validateEnvVar(
		"VITE_OPENAI_API_KEY",
		import.meta.env.VITE_OPENAI_API_KEY as string
	),
	ANTHROPIC_API_KEY: validateEnvVar(
		"VITE_ANTHROPIC_API_KEY",
		import.meta.env.VITE_ANTHROPIC_API_KEY as string
	),
};

// Map model names to their respective API keys
export const getApiKey = (modelName: ModelName): string => {
	switch (modelName) {
		case "gpt4o-mini":
		case "gpt-4o":
			return env.OPENAI_API_KEY;
		case "claude-3.5":
			return env.ANTHROPIC_API_KEY;
		default:
			throw new Error(`No API key configured for model: ${modelName}`);
	}
};

// Check if all required API keys are available for a given model
export const isModelAvailable = (modelName: ModelName): boolean => {
	try {
		getApiKey(modelName);
		return true;
	} catch {
		return false;
	}
};

// Get a list of all available models (those with valid API keys)
export const getAvailableModels = (): ModelName[] => {
	const allModels: ModelName[] = ["gpt4o-mini", "gpt-4o", "claude-3.5"];
	return allModels.filter(isModelAvailable);
};
