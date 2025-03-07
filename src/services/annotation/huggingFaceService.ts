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
 * Note: Currently unused but kept for future reference
 */
/* 
function processClassificationResults(
	spans: { text: string; start: number; end: number }[],
	classifications: any[],
	labels: LabelConfig[],
	config: AnnotationConfig
): HighlightWithText[] {
// ... function implementation ...
}
*/

/**
 * Filter out overlapping annotations by keeping the longest ones
 * Note: Currently unused but kept for future reference
 */
/* 
function filterOverlappingAnnotations(
	annotations: HighlightWithText[]
): HighlightWithText[] {
  // ... function implementation ...
}
*/

/**
 * Calculate string similarity using Levenshtein distance
 * Note: Currently unused but kept for future reference
 */
/* 
function stringSimilarity(a: string, b: string): number {
  // ... function implementation ...
}
*/

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
          !classification["labels" as keyof typeof classification] ||
          !classification["scores" as keyof typeof classification]
        ) {
          console.log(`No valid classification for span ${i}`);
          continue;
        }

        // Get the top score and label
        const scoresArray =
          classification["scores" as keyof typeof classification];
        const labelsArray =
          classification["labels" as keyof typeof classification];

        // Type check and safely access arrays
        const topScore = Array.isArray(scoresArray) ? scoresArray[0] : 0;
        const topLabel =
          Array.isArray(labelsArray) && labelsArray[0]
            ? labelsArray[0].toString().toLowerCase()
            : "";

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
