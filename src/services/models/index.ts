import { OpenAIService } from "./openai";
import { AnthropicService } from "./anthropic";
import type {
	ModelService,
	ModelConfig,
	ModelResponse,
	ModelName,
} from "./types";

// Create instances of each service
const gpt4oMini = new OpenAIService("gpt4o-mini");
const gpt4o = new OpenAIService("gpt-4o");
const claude = new AnthropicService();

// Map model names to their services
export const modelServices: Record<ModelName, ModelService> = {
	"gpt4o-mini": gpt4oMini,
	"gpt-4o": gpt4o,
	"claude-3.5": claude,
};

export type { ModelService, ModelConfig, ModelResponse, ModelName };
