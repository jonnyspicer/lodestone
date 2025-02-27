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

// Define the Node type used in the code
interface NodeMark {
	type: string;
	attrs?: {
		id?: string;
		labelType?: string;
		type?: string;
		[key: string]: unknown;
	};
}

interface DocNode {
	type?: string;
	text?: string;
	marks?: NodeMark[];
	content?: DocNode[];
	[key: string]: unknown;
}

export class SessionManager {
	// Track recently removed highlights to prevent re-extraction
	static recentlyRemovedHighlights = new Set<string>();

	/**
	 * Mark a highlight as recently removed
	 * This helps prevent race conditions during highlight removal
	 */
	static markHighlightAsRemoved(id: string): void {
		this.recentlyRemovedHighlights.add(id);

		// Clear after a short delay to prevent memory leaks
		setTimeout(() => {
			this.recentlyRemovedHighlights.delete(id);
		}, 500); // 500ms should be enough time for any pending updates to complete
	}

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

		// Special case: Empty highlights array with content changes means we deliberately removed highlights
		// and we should keep the content as-is without trying to re-extract or re-apply highlights
		const isDeliberateHighlightRemoval =
			highlights.length === 0 && session.analysedContent.highlights.length > 0;

		// Determine which highlights to use
		let highlightsToUse = highlights;
		let contentWithHighlights = content;

		if (isDeliberateHighlightRemoval) {
			// Keep the content as-is, don't extract or reapply highlights
			highlightsToUse = [];
		} else if (highlightsToUse.length === 0) {
			// If no highlights provided and not explicitly removing, try to extract them
			highlightsToUse = await SessionManager.extractHighlightsFromContentMarks(
				content
			);

			// Apply highlights to ensure consistency
			const { createDocumentWithMarks } = await import(
				"../services/annotation/documentUtils"
			);
			contentWithHighlights = createDocumentWithMarks(content, highlightsToUse);
		} else {
			// Normal case - we have highlights provided

			// Don't re-apply highlights when explicitly updating with fewer highlights
			// (indicates intentional highlight removal)
			const highlightsWereRemoved =
				session.analysedContent.highlights.length > highlights.length;

			if (highlightsWereRemoved) {
				// Keep content as-is
			} else {
				// Apply highlights to ensure consistency
				const { createDocumentWithMarks } = await import(
					"../services/annotation/documentUtils"
				);
				contentWithHighlights = createDocumentWithMarks(
					content,
					highlightsToUse
				);
			}
		}

		const update = {
			...session,
			highlightCount: highlightsToUse.length,
			analysedContent: {
				...session.analysedContent,
				content: contentWithHighlights,
				highlights: highlightsToUse,
				relationships,
				highlightCount: highlightsToUse.length,
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
			// Use the stored highlights if they exist
			if (
				session.analysedContent.highlights &&
				session.analysedContent.highlights.length > 0
			) {
				return {
					content: session.analysedContent.content,
					highlights: session.analysedContent.highlights,
					relationships: session.analysedContent.relationships,
				};
			}

			// If no stored highlights, extract them from content marks
			const highlights = await this.extractHighlightsFromContentMarks(
				session.analysedContent.content
			);

			return {
				content: session.analysedContent.content,
				highlights: highlights,
				relationships: session.analysedContent.relationships,
			};
		}

		// If no analysed content, return input content
		return {
			content: session.inputContent.content,
		};
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
		const highlights: HighlightType = [];
		const seenIds = new Set<string>();

		// Recursive function to traverse the document and find entity reference marks
		const processNode = (node: DocNode, textPosition = 0): number => {
			// Handle text nodes with marks
			if (node.text && node.marks) {
				// Find entity reference marks
				const entityMarks = node.marks.filter(
					(mark) => mark.type === "entity-reference" && mark.attrs != null
				);

				for (const mark of entityMarks) {
					// Skip if no ID, already processed, or explicitly marked as removed
					if (
						!mark.attrs?.id ||
						seenIds.has(mark.attrs.id) ||
						SessionManager.recentlyRemovedHighlights.has(String(mark.attrs.id))
					) {
						continue;
					}

					const id = String(mark.attrs.id);
					seenIds.add(id);

					// Determine label type with simplified priority logic
					let labelType: string = "claim"; // Default fallback

					// Priority: 1. Mark's labelType, 2. Mark's type, 3. Global highlight map, 4. Default
					if (mark.attrs.labelType) {
						labelType = mark.attrs.labelType;
					} else if (mark.attrs.type) {
						labelType = mark.attrs.type;
					} else {
						const savedType = getHighlight(id);
						if (savedType) {
							labelType = savedType;
						}
					}

					// Always keep the highlight map in sync
					setHighlight(id, labelType);

					// Add to highlights list
					highlights.push({
						id,
						labelType,
						text: node.text,
						startIndex: textPosition,
						endIndex: textPosition + node.text.length,
					});
				}

				return node.text.length;
			}
			// Handle other node types recursively
			else if (node.content) {
				let position = textPosition;
				let length = 0;

				node.content.forEach((child) => {
					const nodeLength = processNode(child, position);
					position += nodeLength;
					length += nodeLength;
				});

				// Add newline for block nodes when they're not the last child
				if (node.type && ["paragraph", "heading"].includes(node.type)) {
					length += 1; // Account for newline
				}

				return length;
			}

			return 0;
		};

		// Process the document from the root
		if (content.content) {
			content.content.forEach((node) => processNode(node as DocNode));
		}

		return highlights;
	}

	// Register API for exposing functionality to window
	static registerWindowAPI() {
		// Make SessionManager methods available to the window object for cross-component communication
		try {
			// Define the window object with the sessionManagerApi property
			(
				window as Window & {
					sessionManagerApi: {
						markHighlightAsRemoved: (id: string) => void;
					};
				}
			).sessionManagerApi = {
				markHighlightAsRemoved: this.markHighlightAsRemoved.bind(this),
			};
			console.log("SessionManager window API registered");
		} catch (e) {
			console.error("Failed to register SessionManager window API:", e);
		}
	}
}

// Register the window API when this module loads
SessionManager.registerWindowAPI();
