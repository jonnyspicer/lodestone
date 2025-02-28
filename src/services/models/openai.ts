import type {
	ModelService,
	ModelConfig,
	ModelResponse,
	ModelName,
} from "./types";

type RawHighlight = {
	id: string;
	labelType: string;
	text: string;
	[key: string]: unknown;
};

export class OpenAIService implements ModelService {
	name: ModelName;
	private defaultModel: string;

	constructor(name: ModelName) {
		this.name = name;
		this.defaultModel =
			name === "gpt4o-mini" ? "gpt-4-0125-preview" : "gpt-4-turbo-preview";
	}

	async analyse(
		_text: string,
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
			max_tokens: 3000, // Set a token limit to ensure complete responses
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

			// Validate that each highlight has required properties
			const validHighlights = result.highlights.map(
				(highlight: RawHighlight) => {
					if (!highlight.id || !highlight.labelType || !highlight.text) {
						console.error(
							`OpenAI Service (${this.name}): Invalid highlight format:`,
							highlight
						);
						throw new Error(
							`Highlight missing required properties (id, labelType, text). Raw content: ${JSON.stringify(
								highlight
							).slice(0, 200)}...`
						);
					}
					return {
						id: highlight.id,
						labelType: highlight.labelType,
						text: highlight.text,
						attrs: {
							labelType: highlight.labelType,
							type: highlight.labelType,
						},
					};
				}
			);

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
				highlights: validHighlights,
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

	/**
	 * Special method for getting dynamic questions which doesn't require highlights array
	 * This method is used specifically for dynamic questions generation
	 */
	async generateQuestions(
		_text: string,
		prompt: string,
		config: ModelConfig
	): Promise<string[]> {
		if (!config.apiKey) {
			throw new Error("OpenAI API key is required");
		}

		console.log(
			`OpenAI: Starting question generation using model ${this.defaultModel}`
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
			max_tokens: 1000, // Lower token limit for questions
		};

		const response = await fetch("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${config.apiKey}`,
				"OpenAI-Beta": "assistants=v1",
			},
			body: JSON.stringify(requestBody),
		});

		if (!response.ok) {
			const error = await response.json();
			console.error(`OpenAI: API error:`, error);
			throw new Error(
				`OpenAI API error: ${error.error?.message || "Unknown error"}`
			);
		}

		const data = await response.json();

		try {
			// Get the raw content
			const rawContent = data.choices[0].message.content;
			console.log(`OpenAI: Received question generation response`);

			// The content should be JSON with the response_format: json_object setting
			let result;
			try {
				// If it's a string, try to parse it
				result =
					typeof rawContent === "string" ? JSON.parse(rawContent) : rawContent;
			} catch (parseError) {
				console.error(`OpenAI: Failed to parse content as JSON`);
				throw new Error("Response was not valid JSON");
			}

			if (!result || typeof result !== "object") {
				console.error(`OpenAI: Invalid response format`);
				throw new Error("Response was not a JSON object");
			}

			// Look for questions array in the response
			if (result.questions && Array.isArray(result.questions)) {
				console.log(
					`OpenAI: Found ${result.questions.length} questions in response`
				);
				return result.questions;
			}

			// If not found directly, try to extract from a regex pattern
			const contentString = JSON.stringify(result);
			const questionsMatch = contentString.match(/"questions"\s*:\s*(\[.*?\])/);
			if (questionsMatch && questionsMatch[1]) {
				try {
					const questions = JSON.parse(questionsMatch[1]);
					if (Array.isArray(questions)) {
						console.log(
							`OpenAI: Extracted ${questions.length} questions using regex`
						);
						return questions;
					}
				} catch (e) {
					console.error(`OpenAI: Error parsing questions using regex`);
				}
			}

			console.error(`OpenAI: Could not find questions in response`);
			throw new Error("No questions found in the response");
		} catch (err) {
			console.error(
				`OpenAI: Failed to process question generation response`,
				err
			);
			if (err instanceof Error) {
				throw err;
			}
			throw new Error("Failed to process model response for questions");
		}
	}
}
