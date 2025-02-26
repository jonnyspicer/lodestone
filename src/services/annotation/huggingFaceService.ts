import { HfInference } from "@huggingface/inference";
import type { LabelConfig } from "../../utils/constants";
import type { HighlightWithText } from "../models/types";

// Initialize the Hugging Face inference client
// You'll need to add your API key to your environment variables
const API_KEY = import.meta.env.VITE_HUGGINGFACE_API_KEY;
console.log("Hugging Face API key status:", API_KEY ? "Present" : "Missing");
const hf = new HfInference(API_KEY);

// Default model for zero-shot classification
const DEFAULT_MODEL = "facebook/bart-large-mnli";

/**
 * Configuration for the annotation process
 */
export interface AnnotationConfig {
	model?: string;
	confidenceThreshold?: number;
	includeOverlapping?: boolean;
}

/**
 * Extract text from Remirror JSON format
 */
export function extractTextFromRemirrorJSON(content: any): string {
	if (!content || !content.content) {
		return "";
	}

	return content.content
		.map((paragraph: any) => {
			if (paragraph.content) {
				return paragraph.content
					.map((node: any) => node.text || "")
					.filter(Boolean)
					.join("");
			}
			return "";
		})
		.filter(Boolean)
		.join("\n");
}

/**
 * Split text into meaningful spans for annotation
 * Uses sentences as primary spans and also creates clauses and phrases
 */
export function extractSpans(text: string) {
	const spans: { text: string; start: number; end: number }[] = [];

	// Extract sentences (simple regex approach)
	const sentences = text.match(/[^.!?]+[.!?]+/g) || [];

	// If no sentences found, use the whole text
	if (sentences.length === 0 && text.trim()) {
		spans.push({
			text: text.trim(),
			start: 0,
			end: text.length,
		});
	}

	// Process each sentence
	sentences.forEach((sentence) => {
		const trimmed = sentence.trim();
		if (!trimmed) return;

		const start = text.indexOf(trimmed);
		if (start === -1) return; // Should never happen but just in case

		spans.push({
			text: trimmed,
			start,
			end: start + trimmed.length,
		});

		// Add clauses within sentences (using commas, semicolons, etc.)
		const clauseDelimiters = [",", ";", ":", "but", "and", "or", "yet", "so"];
		let lastIndex = 0;

		clauseDelimiters.forEach((delimiter) => {
			const parts = trimmed.split(delimiter);
			if (parts.length > 1) {
				let currentPos = 0;
				parts.forEach((part, i) => {
					if (i > 0) currentPos += delimiter.length;
					if (part.trim().length < 10) {
						// Skip very short clauses
						currentPos += part.length;
						return;
					}

					const clauseStart = start + currentPos;
					const clauseEnd = clauseStart + part.length;

					// Only add if it doesn't largely overlap with existing spans
					const hasOverlap = spans.some(
						(span) =>
							(clauseStart >= span.start && clauseStart <= span.end) ||
							(clauseEnd >= span.start && clauseEnd <= span.end)
					);

					if (!hasOverlap) {
						spans.push({
							text: part.trim(),
							start: clauseStart,
							end: clauseEnd,
						});
					}

					currentPos += part.length;
				});
			}
		});
	});

	// Sort spans by start position
	return spans.sort((a, b) => a.start - b.start);
}

/**
 * Process classification results from Hugging Face
 */
function processClassificationResults(
	spans: { text: string; start: number; end: number }[],
	classifications: any[],
	labels: LabelConfig[],
	config: AnnotationConfig
): HighlightWithText[] {
	// Use a much lower threshold to ensure we get some results
	const threshold = config.confidenceThreshold || 0.1;
	console.log("Processing classifications with threshold:", threshold);
	const annotations: HighlightWithText[] = [];

	spans.forEach((span, i) => {
		const result = classifications[i];

		// Skip if no result returned
		if (!result || !result.labels || !result.scores) {
			console.log(`No valid result for span ${i}`);
			return;
		}

		console.log(`Processing span ${i}: "${span.text.substring(0, 30)}..."`);
		console.log(`Top label: ${result.labels[0]}, score: ${result.scores[0]}`);

		// Always use the top label if above minimum threshold
		if (result.scores[0] >= threshold) {
			const labelText = result.labels[0].toLowerCase();

			// Find matching label config by checking case-insensitive
			const matchingLabelConfig = labels.find(
				(label) =>
					label.id.toLowerCase() === labelText ||
					label.name.toLowerCase() === labelText
			);

			if (matchingLabelConfig) {
				console.log(
					`Found matching label: ${matchingLabelConfig.id} with score ${result.scores[0]}`
				);
				annotations.push({
					id: crypto.randomUUID(),
					labelType: matchingLabelConfig.id,
					text: span.text,
					startIndex: span.start,
					endIndex: span.end,
					attrs: {
						labelType: matchingLabelConfig.id,
						type: matchingLabelConfig.id,
					},
				});
			} else {
				// If we have a high-confidence label but no exact match, use fuzzy matching
				if (result.scores[0] > 0.2) {
					console.log(
						`No exact match for "${labelText}", trying fuzzy matching`
					);

					// Find the closest label by string similarity
					const bestMatch = labels
						.map((label) => ({
							label,
							similarity: Math.max(
								stringSimilarity(label.id.toLowerCase(), labelText),
								stringSimilarity(label.name.toLowerCase(), labelText)
							),
						}))
						.sort((a, b) => b.similarity - a.similarity)[0];

					if (bestMatch && bestMatch.similarity > 0.6) {
						console.log(
							`Fuzzy matched "${labelText}" to "${bestMatch.label.id}" with similarity ${bestMatch.similarity}`
						);
						annotations.push({
							id: crypto.randomUUID(),
							labelType: bestMatch.label.id,
							text: span.text,
							startIndex: span.start,
							endIndex: span.end,
							attrs: {
								labelType: bestMatch.label.id,
								type: bestMatch.label.id,
							},
						});
					} else {
						console.log(`No fuzzy match found for "${labelText}"`);
					}
				}
			}
		} else {
			console.log(`Top score ${result.scores[0]} below threshold ${threshold}`);
		}
	});

	console.log(
		`Created ${annotations.length} annotations before overlap filtering`
	);

	// Filter out overlapping annotations if not including overlapping
	if (!config.includeOverlapping) {
		const filtered = filterOverlappingAnnotations(annotations);
		console.log(
			`Filtered to ${filtered.length} annotations after overlap removal`
		);
		return filtered;
	}

	return annotations;
}

/**
 * Filter out overlapping annotations, keeping those with highest confidence
 */
function filterOverlappingAnnotations(
	annotations: HighlightWithText[]
): HighlightWithText[] {
	if (annotations.length <= 1) {
		return annotations;
	}

	// Sort by length of text (descending) to prioritize longer annotations
	const sorted = [...annotations].sort((a, b) => {
		// Ensure startIndex and endIndex are defined with fallbacks
		const aStart = a.startIndex ?? 0;
		const aEnd = a.endIndex ?? 0;
		const bStart = b.startIndex ?? 0;
		const bEnd = b.endIndex ?? 0;

		// Prioritize longer text spans as they're often more meaningful
		return bEnd - bStart - (aEnd - aStart);
	});

	const result: HighlightWithText[] = [];
	const covered = new Set<number>();

	for (const annotation of sorted) {
		// Ensure startIndex and endIndex are defined with fallbacks
		const startIndex = annotation.startIndex ?? 0;
		const endIndex = annotation.endIndex ?? 0;

		let overlap = 0;
		let totalLength = 0;

		for (let i = startIndex; i < endIndex; i++) {
			totalLength++;
			if (covered.has(i)) {
				overlap++;
			}
		}

		// If less than 50% overlap, include it
		if (totalLength === 0 || overlap / totalLength < 0.5) {
			result.push(annotation);

			// Mark these positions as covered
			for (let i = startIndex; i < endIndex; i++) {
				covered.add(i);
			}
		}
	}

	return result;
}

/**
 * Simple string similarity function (Levenshtein-based)
 */
function stringSimilarity(a: string, b: string): number {
	if (a === b) return 1;
	if (a.length === 0 || b.length === 0) return 0;

	// Very simple similarity based on common substrings
	if (a.includes(b) || b.includes(a)) {
		return Math.min(a.length, b.length) / Math.max(a.length, b.length);
	}

	// Simple word overlap
	const wordsA = a.split(/\s+/);
	const wordsB = b.split(/\s+/);
	const commonWords = wordsA.filter((word) => wordsB.includes(word)).length;

	return commonWords / Math.max(wordsA.length, wordsB.length);
}

/**
 * Main function to annotate text with argument labels
 */
export async function annotateText(
	text: string,
	labels: LabelConfig[],
	config: AnnotationConfig = {}
): Promise<HighlightWithText[]> {
	try {
		console.log("Starting annotation with Hugging Face...");
		console.log("Text length:", text.length);
		console.log("Available labels:", labels.map((l) => l.name).join(", "));
		console.log("Config:", JSON.stringify(config));

		// Use provided model or default
		const model = config.model || DEFAULT_MODEL;
		console.log("Using model:", model);

		// Extract potential spans from the text
		const spans = extractSpans(text);
		console.log("Extracted spans:", spans.length);

		if (spans.length === 0) {
			console.warn("No spans extracted from text");
			return [];
		}

		console.log(
			"Sample spans:",
			spans.slice(0, 3).map((s) => s.text.substring(0, 50) + "...")
		);

		// Simplified approach: Use a single classification request for each span
		// instead of batching, to ensure more reliable processing
		const results: HighlightWithText[] = [];
		const candidateLabels = labels.map((l) => l.name);

		console.log("Using candidate labels:", candidateLabels.join(", "));

		// Process each span individually to avoid any batching issues
		for (let i = 0; i < Math.min(spans.length, 20); i++) {
			// Limit to 20 spans for now
			const span = spans[i];
			console.log(
				`Processing span ${i + 1}/${Math.min(
					spans.length,
					20
				)}: "${span.text.substring(0, 30)}..."`
			);

			try {
				const classification = await hf.zeroShotClassification({
					model,
					inputs: span.text,
					parameters: {
						candidate_labels: candidateLabels,
						multi_label: false,
					},
				});

				console.log(
					`Got classification for span ${i}:`,
					JSON.stringify(classification)
				);

				// Process this single result directly here instead of calling processClassificationResults
				const threshold = config.confidenceThreshold || 0.1;
				console.log(`Processing classification with threshold: ${threshold}`);

				// Skip if no result returned
				if (
					!classification ||
					!classification["labels"] ||
					!classification["scores"]
				) {
					console.log(`No valid classification for span ${i}`);
					continue;
				}

				// Get the top score and label
				const topScore = classification["scores"][0];
				const topLabel = classification["labels"][0].toLowerCase();

				console.log(`Top label: ${topLabel}, score: ${topScore}`);

				// Check if the score is above the threshold
				if (topScore >= threshold) {
					// Try to find a matching label
					const matchingLabel = labels.find(
						(label) => label.id.toLowerCase() === topLabel
					);

					if (matchingLabel) {
						// Found an exact match
						console.log(
							`Found exact matching label: ${matchingLabel.id} with score ${topScore}`
						);
						// Create the annotation
						const id = crypto.randomUUID();
						results.push({
							id,
							labelType: matchingLabel.id,
							text: span.text,
							startIndex: span.start,
							endIndex: span.end,
							attrs: {
								labelType: matchingLabel.id,
								type: matchingLabel.id,
							},
						});
						console.log(
							`Created annotation with id=${id}, labelType=${matchingLabel.id}`
						);
					} else {
						// Try to find a similar label
						console.log(
							`No exact match found for ${topLabel}, looking for similar labels`
						);
						const similarLabels = labels.filter(
							(label) =>
								topLabel.includes(label.id.toLowerCase()) ||
								label.id.toLowerCase().includes(topLabel)
						);

						if (similarLabels.length > 0) {
							// Use the first similar label
							const similarLabel = similarLabels[0];
							console.log(
								`Found similar label: ${similarLabel.id} for ${topLabel}`
							);
							// Create the annotation
							const id = crypto.randomUUID();
							results.push({
								id,
								labelType: similarLabel.id,
								text: span.text,
								startIndex: span.start,
								endIndex: span.end,
								attrs: {
									labelType: similarLabel.id,
									type: similarLabel.id,
								},
							});
							console.log(
								`Created annotation with id=${id}, labelType=${similarLabel.id}`
							);
						} else {
							console.log(`No similar labels found for ${topLabel}, skipping`);
						}
					}
				} else {
					console.log(
						`Score ${topScore} below threshold ${threshold}, skipping`
					);
				}

				// Add a small delay to avoid rate limiting
				if (i < spans.length - 1) {
					await new Promise((resolve) => setTimeout(resolve, 100));
				}
			} catch (error) {
				console.error(`Error classifying span ${i}:`, error);
			}
		}

		console.log("Total annotations created:", results.length);
		return results;
	} catch (error) {
		console.error("Error annotating text:", error);
		throw new Error(`Failed to annotate text: ${error}`);
	}
}
