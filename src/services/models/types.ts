import type { EditorContent } from "../../db";
import type { Relationship } from "../../utils/relationshipTypes";

export type ModelName = "gpt4o-mini" | "gpt-4o" | "claude-3.5";

export interface ModelResponse {
	highlights: EditorContent["highlights"];
	relationships: Relationship[];
}

export interface ModelConfig {
	apiKey?: string;
	baseUrl?: string;
	model?: string;
}

export interface ModelService {
	name: ModelName;
	analyze: (
		text: string,
		prompt: string,
		config: ModelConfig
	) => Promise<ModelResponse>;
}
