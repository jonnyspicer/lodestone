import type {
	ModelService,
	ModelConfig,
	ModelResponse,
	ModelName,
} from "./types";

export class AnthropicService implements ModelService {
	name: ModelName;
	private defaultModel: string;

	constructor() {
		this.name = "claude-3.5";
		this.defaultModel = "claude-3-sonnet-20240229";
	}

	async analyze(
		text: string,
		prompt: string,
		config: ModelConfig
	): Promise<ModelResponse> {
		if (!config.apiKey) {
			throw new Error("Anthropic API key is required");
		}

		const response = await fetch("https://api.anthropic.com/v1/messages", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": config.apiKey,
				"anthropic-version": "2023-06-01",
			},
			body: JSON.stringify({
				model: config.model || this.defaultModel,
				max_tokens: 4096,
				messages: [
					{
						role: "user",
						content: prompt,
					},
				],
				temperature: 0.3,
			}),
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(
				`Anthropic API error: ${error.error?.message || "Unknown error"}`
			);
		}

		const data = await response.json();
		try {
			const result = JSON.parse(data.content[0].text);
			return {
				highlights: result.highlights || [],
				relationships: result.relationships || [],
			};
		} catch (err) {
			console.error("Failed to parse Anthropic response:", err);
			throw new Error("Failed to parse model response as JSON");
		}
	}
}
