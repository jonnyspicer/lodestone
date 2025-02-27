import type { RemirrorJSON } from "remirror";
import { db, type Session } from "../db";
import type { ModelName, HighlightWithText } from "../services/models/types";
import type { Relationship } from "../utils/relationshipTypes";
import { LABEL_CONFIGS } from "../utils/constants";
import { annotateText } from "../services/annotation/huggingFaceService";
import { createDocumentWithMarks } from "../services/annotation/documentUtils";
import { extractTextFromRemirrorJSON } from "../services/annotation/huggingFaceService";
import { setHighlight, getHighlight } from "./highlightMap";

type HighlightType = HighlightWithText[];

interface HighlightMark {
	type: "entity-reference";
	attrs: {
		id: string;
		labelType: string;
		type: string;
	};
}

export class SessionManager {
	/**
	 * Create a new session with initial text content
	 */
	static async createSession(
		title: string,
		initialContent: RemirrorJSON
	): Promise<Session> {
		const session: Omit<Session, "id"> = {
			title,
			createdAt: new Date(),
			status: "input",
			highlightCount: 0,
			inputContent: {
				content: initialContent,
				updatedAt: new Date(),
			},
			lastModified: new Date(),
		};

		const id = await db.sessions.add(session);
		return { ...session, id };
	}

	/**
	 * Update the input content of a session
	 */
	static async updateInputContent(
		sessionId: number,
		content: RemirrorJSON
	): Promise<void> {
		await db.sessions.update(sessionId, {
			inputContent: {
				content,
				updatedAt: new Date(),
			},
			lastModified: new Date(),
		});
	}

	/**
	 * Start analysis for a session
	 */
	static async startAnalysis(sessionId: number): Promise<void> {
		const session = await this.getSession(sessionId);
		if (!session) throw new Error("Session not found");

		await db.sessions.update(sessionId, {
			...session,
			status: "analysis",
			lastModified: new Date(),
		});
	}

	/**
	 * Analyse text using Hugging Face zero-shot classification
	 * @param sessionId The session ID
	 * @param options Configuration options for the analysis
	 */
	static async analyseWithHuggingFace(
		sessionId: number,
		options: {
			modelName?: string;
			confidenceThreshold?: number;
			includeOverlapping?: boolean;
		} = {}
	): Promise<void> {
		const session = await this.getSession(sessionId);
		if (!session) throw new Error("Session not found");

		try {
			// Extract plain text from Remirror JSON
			const fullText = extractTextFromRemirrorJSON(
				session.inputContent.content
			);

			if (!fullText.trim()) {
				throw new Error("No text content to analyse");
			}

			// Annotate the text using Hugging Face
			const annotations = await annotateText(fullText, LABEL_CONFIGS, {
				model: options.modelName,
				confidenceThreshold: options.confidenceThreshold || 0.65,
				includeOverlapping: options.includeOverlapping || true,
			});

			if (annotations.length === 0) {
				console.warn("No annotations found");
			}

			// Create a new document with the annotations applied as marks
			const contentWithMarks = createDocumentWithMarks(
				session.inputContent.content,
				annotations
			);

			// Save the analysis results
			await this.saveAnalysis(
				sessionId,
				"huggingface" as ModelName,
				options.modelName || "zero-shot",
				contentWithMarks,
				annotations,
				[] // No relationships initially
			);

			console.log(`Analysed text with ${annotations.length} annotations`);
		} catch (error) {
			console.error("Error analysing with Hugging Face:", error);
			throw new Error(`Failed to analyse with Hugging Face: ${error}`);
		}
	}

	/**
	 * Save analysis results to a session
	 */
	static async saveAnalysis(
		sessionId: number,
		modelName: ModelName,
		promptId: string,
		content: RemirrorJSON,
		highlights: HighlightWithText[],
		relationships: Relationship[]
	): Promise<void> {
		const session = await this.getSession(sessionId);
		if (!session) throw new Error("Session not found");

		// Calculate highlight count
		const highlightCount = highlights?.length || 0;

		// Get the full text content
		const fullText =
			content.content
				?.map((paragraph) =>
					paragraph.content?.map((node) => node.text).join("")
				)
				.join("\n") || "";

		// Sort highlights by their position in the text
		const sortedHighlights = [...highlights].sort((a, b) => {
			const aIndex = fullText.indexOf(a.text);
			const bIndex = fullText.indexOf(b.text);
			return aIndex - bIndex;
		});

		// Create a new content structure with highlights as marks
		const contentWithHighlights: RemirrorJSON = {
			type: "doc",
			content:
				content.content?.map((paragraph) => {
					if (paragraph.type === "paragraph" && paragraph.content) {
						let currentPosition = 0;
						const newContent: Array<{
							type: "text";
							text: string;
							marks?: Array<{
								type: string;
								attrs: {
									id: string;
									labelType: string;
									type: string;
								};
							}>;
						}> = [];
						const paragraphText = paragraph.content
							.map((node) => node.text)
							.filter(Boolean)
							.join("");

						// Process text and add highlights for this paragraph
						for (const highlight of sortedHighlights) {
							const highlightStart = paragraphText.indexOf(
								highlight.text,
								currentPosition
							);
							if (highlightStart === -1) continue;

							// Add text before highlight if any
							if (highlightStart > currentPosition) {
								newContent.push({
									type: "text",
									text: paragraphText.slice(currentPosition, highlightStart),
								});
							}

							// Add highlighted text
							newContent.push({
								type: "text",
								text: highlight.text,
								marks: [
									{
										type: "entity-reference",
										attrs: {
											id: highlight.id,
											labelType: highlight.labelType,
											type: highlight.labelType,
										},
									},
								],
							});

							currentPosition = highlightStart + highlight.text.length;
						}

						// Add remaining text if any
						if (currentPosition < paragraphText.length) {
							newContent.push({
								type: "text",
								text: paragraphText.slice(currentPosition),
							});
						}

						return {
							...paragraph,
							content: newContent,
						};
					}
					return paragraph;
				}) || [],
		};

		const update: Session = {
			...session,
			status: "analysis" as const,
			highlightCount,
			analysedContent: {
				modelName,
				promptId,
				content: contentWithHighlights,
				highlights,
				relationships,
				highlightCount,
				updatedAt: new Date(),
			},
			lastModified: new Date(),
		};

		await db.sessions.update(sessionId, update);
	}

	/**
	 * Update analysed content for a session
	 */
	static async updateAnalysedContent(
		sessionId: number,
		content: RemirrorJSON,
		highlights: HighlightType,
		relationships: Relationship[]
	): Promise<void> {
		const session = await db.sessions.get(sessionId);
		if (!session || !session.analysedContent) {
			throw new Error(
				`Cannot update analysed content for session ${sessionId}: Session not found or has no analysed content`
			);
		}

		// Check if this content already has highlights embedded in the marks
		let hasHighlightsInContent = false;

		if (content.content) {
			// Check for entity reference marks in the content
			content.content.forEach((paragraph) => {
				if (paragraph.content) {
					paragraph.content.forEach((node) => {
						if (node.marks) {
							node.marks.forEach((mark) => {
								if (
									typeof mark === "object" &&
									mark.type === "entity-reference" &&
									mark.attrs
								) {
									hasHighlightsInContent = true;
								}
							});
						}
					});
				}
			});
		}
		// Determine which highlights to use for document creation
		// Priority:
		// 1. If highlights array is provided and not empty, use that
		// 2. If content has entity references but highlights array is empty, extract them
		// 3. Otherwise use existing highlights from session
		let highlightsToUse = highlights;

		if (highlights.length === 0 && hasHighlightsInContent) {
			// Extract highlights from content marks
			highlightsToUse = await SessionManager.extractHighlightsFromContentMarks(
				content
			);
		}

		if (highlightsToUse.length === 0 && session.analysedContent.highlights) {
			highlightsToUse = session.analysedContent.highlights;
		}

		// Get full text to help with highlight sorting
		const fullText =
			content.content
				?.map((paragraph) => {
					return paragraph.content
						?.map((node) => node.text || "")
						.filter(Boolean)
						.join("");
				})
				.filter(Boolean)
				.join("\n") || "";

		// Sort highlights by position in text
		const sortedHighlights = [...highlightsToUse].sort((a, b) => {
			const aIndex = fullText.indexOf(a.text);
			const bIndex = fullText.indexOf(b.text);
			return aIndex - bIndex;
		});

		// Import the createDocumentWithMarks function to apply highlights consistently
		const { createDocumentWithMarks } = await import(
			"../services/annotation/documentUtils"
		);

		// Always apply highlights to ensure consistency
		const contentWithHighlights = createDocumentWithMarks(
			content,
			sortedHighlights
		);

		const update = {
			...session,
			highlightCount: sortedHighlights.length,
			analysedContent: {
				...session.analysedContent,
				content: contentWithHighlights,
				highlights: sortedHighlights,
				relationships,
				highlightCount: sortedHighlights.length,
				updatedAt: new Date(),
			},
			lastModified: new Date(),
		};

		await db.sessions.update(sessionId, update);
	}

	/**
	 * Get a session by ID
	 */
	static async getSession(sessionId: number): Promise<Session | undefined> {
		return await db.sessions.get(sessionId);
	}

	/**
	 * Get all sessions, optionally filtered by status
	 */
	static async getSessions(status?: Session["status"]): Promise<Session[]> {
		let query = db.sessions.orderBy("lastModified").reverse();

		if (status) {
			query = query.filter((session) => session.status === status);
		}

		return await query.toArray();
	}

	/**
	 * Delete a session
	 */
	static async deleteSession(sessionId: number): Promise<void> {
		await db.sessions.delete(sessionId);
	}

	/**
	 * Get the effective content for a session
	 * Returns analysed content if it exists, otherwise returns input content
	 */
	static async getEffectiveContent(sessionId: number): Promise<{
		content: RemirrorJSON;
		highlights?: HighlightType;
		relationships?: Relationship[];
	}> {
		const session = await this.getSession(sessionId);
		if (!session) throw new Error("Session not found");

		if (session.analysedContent) {
			// First use the stored highlights array if it exists and has content
			if (
				session.analysedContent.highlights &&
				session.analysedContent.highlights.length > 0
			) {
				const result = {
					content: session.analysedContent.content,
					highlights: session.analysedContent.highlights,
					relationships: session.analysedContent.relationships,
				};
				return result;
			}

			// Fallback: Extract highlights from content marks if the array is empty
			const highlights: HighlightType = [];
			let markCount = 0;

			session.analysedContent.content.content?.forEach((node) => {
				if (node.type === "paragraph" && node.content) {
					node.content.forEach((textNode) => {
						const highlightMark = textNode.marks?.find(
							(mark): mark is HighlightMark =>
								typeof mark === "object" &&
								mark.type === "entity-reference" &&
								"attrs" in mark &&
								typeof mark.attrs === "object" &&
								mark.attrs !== null &&
								"id" in mark.attrs &&
								"labelType" in mark.attrs &&
								"type" in mark.attrs
						);

						if (highlightMark && textNode.text) {
							markCount++;
							highlights.push({
								id: highlightMark.attrs.id,
								labelType: highlightMark.attrs.labelType,
								text: textNode.text,
								attrs: {
									labelType: highlightMark.attrs.labelType,
									type: highlightMark.attrs.type,
								},
							});
						}
					});
				}
			});

			console.log(`Extracted ${markCount} highlight marks from content`);

			const result = {
				content: session.analysedContent.content,
				highlights: highlights,
				relationships: session.analysedContent.relationships,
			};
			return result;
		}

		const result = {
			content: session.inputContent.content,
		};
		return result;
	}

	/**
	 * Update the title of a session
	 */
	static async updateSessionTitle(
		sessionId: number,
		title: string
	): Promise<void> {
		await db.sessions.update(sessionId, {
			title,
			lastModified: new Date(),
		});
	}

	// Helper function to extract highlights from content marks
	static async extractHighlightsFromContentMarks(
		content: RemirrorJSON
	): Promise<HighlightType> {
		console.log("[DEBUG] Extracting highlights from content marks");
		const highlights: HighlightType = [];
		const seenIds = new Set<string>();

		// Process each paragraph and look for entity reference marks
		content.content?.forEach((paragraph, paragraphIndex) => {
			if (!paragraph.content) return;

			// Track position within the text
			let paragraphStart = 0;

			// Find the start position of this paragraph in the full text
			if (paragraphIndex > 0) {
				const previousText = content.content
					?.slice(0, paragraphIndex)
					.map((p) => {
						return p.content
							?.map((n) => n.text || "")
							.filter(Boolean)
							.join("");
					})
					.filter(Boolean)
					.join("\n");
				paragraphStart = (previousText?.length || 0) + paragraphIndex; // +1 for each newline
			}

			let nodeStart = paragraphStart;

			paragraph.content.forEach((node) => {
				if (!node.marks || !node.text) {
					nodeStart += node.text?.length || 0;
					return;
				}

				// Find entity reference marks
				const entityMarks = node.marks.filter(
					(mark): mark is HighlightMark =>
						typeof mark === "object" &&
						mark.type === "entity-reference" &&
						typeof mark.attrs === "object" &&
						mark.attrs !== null
				);

				for (const mark of entityMarks) {
					// Skip if no ID or already processed
					if (!mark.attrs.id || seenIds.has(mark.attrs.id)) {
						continue;
					}

					const id = String(mark.attrs.id);

					// Get the label type with fallbacks
					let labelType: string | null = null;

					// First check explicit labelType attribute
					if (
						typeof mark.attrs.labelType === "string" &&
						mark.attrs.labelType
					) {
						labelType = mark.attrs.labelType;
					}
					// Then fallback to type attribute
					else if (typeof mark.attrs.type === "string" && mark.attrs.type) {
						labelType = mark.attrs.type;
					}
					// If we still don't have a type, try to get it from the highlight map
					else {
						const highlightType = getHighlight(id);
						if (highlightType) {
							labelType = highlightType;
						}
					}

					if (!labelType) {
						// Check global highlight map before defaulting to claim
						const savedType = getHighlight(id);
						if (savedType) {
							labelType = savedType;
						} else {
							console.warn(
								`[DEBUG] Mark ${id} has no label type, using "claim" as fallback`
							);
							labelType = "claim"; // Default fallback to ensure we don't lose highlights
						}
					}

					// Ensure the highlight map is always updated with the correct label
					if (labelType) {
						setHighlight(id, labelType);
					}
					seenIds.add(id);

					// Add to highlights list with exact text
					highlights.push({
						id,
						labelType, // Ensure both attributes are set consistently
						text: node.text,
						startIndex: nodeStart,
						endIndex: nodeStart + node.text.length,
						attrs: {
							labelType,
							type: labelType,
						},
					});
				}

				nodeStart += node.text.length;
			});
		});

		console.log(
			`[DEBUG] Extracted ${highlights.length} highlight marks from content`
		);
		return highlights;
	}
}
