import type {
	ModelService,
	ModelConfig,
	ModelResponse,
	ModelName,
} from "./types";

export class OpenAIService implements ModelService {
	name: ModelName;
	private defaultModel: string;

	constructor(name: ModelName) {
		this.name = name;
		this.defaultModel =
			name === "gpt4o-mini" ? "gpt-4-0125-preview" : "gpt-4-turbo-preview";
	}

	async analyze(
		text: string,
		prompt: string,
		config: ModelConfig
	): Promise<ModelResponse> {
		if (!config.apiKey) {
			throw new Error("OpenAI API key is required");
		}

		console.log(`OpenAI Service (${this.name}): Starting request...`);
		console.log(
			`OpenAI Service (${this.name}): Using model ${this.defaultModel}`
		);

		const requestBody = {
			model: config.model || this.defaultModel,
			messages: [
				{
					role: "user",
					content: prompt,
				},
			],
			temperature: 0.3,
			response_format: { type: "json_object" },
			seed: 1234, // For consistent results during testing
		};

		console.log(
			`OpenAI Service (${this.name}): Request body:`,
			JSON.stringify(requestBody, null, 2)
		);

		const response = await fetch("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${config.apiKey}`,
				"OpenAI-Beta": "assistants=v1",
			},
			body: JSON.stringify(requestBody),
		});

		console.log(
			`OpenAI Service (${this.name}): Response status:`,
			response.status
		);

		if (!response.ok) {
			const error = await response.json();
			console.error(`OpenAI Service (${this.name}): API error:`, error);
			throw new Error(
				`OpenAI API error: ${error.error?.message || "Unknown error"}`
			);
		}

		const data = await response.json();
		console.log(
			`OpenAI Service (${this.name}): Raw response:`,
			JSON.stringify(data, null, 2)
		);

		try {
			// Log the raw content before trying to parse it
			const rawContent = data.choices[0].message.content;
			console.log(
				`OpenAI Service (${this.name}): Raw content from model:`,
				rawContent
			);

			// The content should be JSON with the response_format: json_object setting
			let result;
			try {
				// If it's a string, try to parse it
				result =
					typeof rawContent === "string" ? JSON.parse(rawContent) : rawContent;
			} catch (parseError) {
				console.error(
					`OpenAI Service (${this.name}): Failed to parse content as JSON:`,
					parseError
				);
				throw new Error(
					`Response was not valid JSON. Raw content: ${rawContent.slice(
						0,
						200
					)}...`
				);
			}

			if (!result || typeof result !== "object") {
				console.error(
					`OpenAI Service (${this.name}): Invalid response format:`,
					result
				);
				throw new Error(
					`Response was not a JSON object. Raw content: ${JSON.stringify(
						rawContent
					).slice(0, 200)}...`
				);
			}

			if (!result.highlights || !Array.isArray(result.highlights)) {
				console.error(
					`OpenAI Service (${this.name}): Missing or invalid highlights:`,
					result
				);
				throw new Error(
					`Response missing required 'highlights' array. Raw content: ${JSON.stringify(
						rawContent
					).slice(0, 200)}...`
				);
			}

			if (!result.relationships || !Array.isArray(result.relationships)) {
				console.error(
					`OpenAI Service (${this.name}): Missing or invalid relationships:`,
					result
				);
				throw new Error(
					`Response missing required 'relationships' array. Raw content: ${JSON.stringify(
						rawContent
					).slice(0, 200)}...`
				);
			}

			console.log(
				`OpenAI Service (${this.name}): Successfully parsed response`
			);
			return {
				highlights: result.highlights,
				relationships: result.relationships,
			};
		} catch (err) {
			console.error(
				`OpenAI Service (${this.name}): Failed to parse response:`,
				err,
				"Raw response:",
				data
			);
			if (err instanceof Error) {
				throw err; // Throw the detailed error we created above
			}
			throw new Error("Failed to parse model response");
		}
	}
}
