import type { RemirrorJSON } from "remirror";
import { db, type Session } from "../db";
import type { ModelName, HighlightWithText } from "../services/models/types";
import type { Relationship } from "../utils/relationshipTypes";

type HighlightType = HighlightWithText[];

interface HighlightMark {
	type: "highlight";
	attrs: {
		id: string;
		labelType: string;
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

		console.log("💾 Saving analysis with data:", {
			sessionId,
			modelName,
			promptId,
			highlightCount,
			firstHighlight: highlights?.[0],
			relationshipCount: relationships?.length,
		});

		// Get the full text content
		const fullText =
			content.content
				?.map((paragraph) =>
					paragraph.content?.map((node) => node.text).join("")
				)
				.join("\n") || "";

		console.log("🔄 Content transformation:", {
			originalContent: content,
			fullText,
			textLength: fullText.length,
			highlightCount: highlights.length,
			firstHighlightText: highlights[0]?.text,
			firstHighlightLength: highlights[0]?.text.length,
		});

		// Create a new content structure with highlights as marks
		const contentWithHighlights: RemirrorJSON = {
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [],
				},
			],
		};

		// Sort highlights by their position in the text
		const sortedHighlights = [...highlights].sort((a, b) => {
			const aIndex = fullText.indexOf(a.text);
			const bIndex = fullText.indexOf(b.text);
			return aIndex - bIndex;
		});

		let currentPosition = 0;
		const paragraphContent = contentWithHighlights.content![0].content!;

		// Process text and add highlights
		for (const highlight of sortedHighlights) {
			const highlightStart = fullText.indexOf(highlight.text, currentPosition);
			if (highlightStart === -1) {
				console.warn("⚠️ Could not find highlight in text:", highlight);
				continue;
			}

			// Add text before highlight if any
			if (highlightStart > currentPosition) {
				paragraphContent.push({
					type: "text",
					text: fullText.slice(currentPosition, highlightStart),
				});
			}

			// Add highlighted text
			paragraphContent.push({
				type: "text",
				text: highlight.text,
				marks: [
					{
						type: "entity-reference",
						attrs: {
							id: highlight.id,
							labelType: highlight.labelType,
						},
					},
				],
			});

			currentPosition = highlightStart + highlight.text.length;
		}

		// Add remaining text if any
		if (currentPosition < fullText.length) {
			paragraphContent.push({
				type: "text",
				text: fullText.slice(currentPosition),
			});
		}

		const update: Session = {
			...session,
			status: "analysis" as const,
			highlightCount,
			analyzedContent: {
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

		console.log("📝 Full update object:", {
			id: update.id,
			status: update.status,
			highlightCount: update.highlightCount,
			analyzedContent: update.analyzedContent && {
				modelName: update.analyzedContent.modelName,
				promptId: update.analyzedContent.promptId,
				highlightCount: update.analyzedContent.highlightCount,
				relationships: update.analyzedContent.relationships,
			},
		});

		await db.sessions.update(sessionId, update);
	}

	/**
	 * Update analyzed content for a session
	 */
	static async updateAnalyzedContent(
		sessionId: number,
		content: RemirrorJSON,
		highlights: HighlightType,
		relationships: Relationship[]
	): Promise<void> {
		const session = await this.getSession(sessionId);
		if (!session?.analyzedContent) {
			throw new Error("No analyzed content exists to update");
		}

		// Calculate highlight count
		const highlightCount = highlights?.length || 0;

		// Convert highlights into marks within the RemirrorJSON structure
		const contentWithHighlights = {
			...content,
			content: content.content?.map((node) => {
				if (node.type === "paragraph" && node.content) {
					return {
						...node,
						content: node.content.map((textNode) => {
							const highlight = highlights.find(
								(h) => h.text === textNode.text
							);
							if (highlight) {
								return {
									...textNode,
									marks: [
										{
											type: "highlight",
											attrs: {
												id: highlight.id,
												labelType: highlight.labelType,
											},
										},
									],
								};
							}
							return textNode;
						}),
					};
				}
				return node;
			}),
		};

		await db.sessions.update(sessionId, {
			...session,
			highlightCount,
			analyzedContent: {
				...session.analyzedContent,
				content: contentWithHighlights,
				relationships,
				highlightCount,
				updatedAt: new Date(),
			},
			lastModified: new Date(),
		});
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
	 * Returns analyzed content if it exists, otherwise returns input content
	 */
	static async getEffectiveContent(sessionId: number): Promise<{
		content: RemirrorJSON;
		highlights?: HighlightType;
		relationships?: Relationship[];
	}> {
		const session = await this.getSession(sessionId);
		if (!session) throw new Error("Session not found");

		console.log("🔍 Full session data in getEffectiveContent:", {
			id: session.id,
			status: session.status,
			hasAnalyzedContent: !!session.analyzedContent,
			analyzedContent: session.analyzedContent && {
				highlightCount: session.analyzedContent.highlightCount,
				storedHighlights: session.analyzedContent.highlights?.length,
				contentHighlights:
					session.analyzedContent.content.content?.[0]?.content?.filter(
						(node) =>
							node.marks?.some(
								(mark) =>
									typeof mark === "object" &&
									"type" in mark &&
									mark.type === "entityReference"
							)
					).length,
			},
		});

		if (session.analyzedContent) {
			// Log the raw analyzed content structure
			console.log("📄 Raw analyzed content structure:", {
				contentType: session.analyzedContent.content.type,
				paragraphCount: session.analyzedContent.content.content?.length,
				firstParagraph: session.analyzedContent.content.content?.[0],
				storedHighlights: session.analyzedContent.highlights,
				fullText: session.analyzedContent.content.content?.[0]?.content
					?.map((node) => node.text)
					.join(""),
				contentNodes:
					session.analyzedContent.content.content?.[0]?.content?.length,
			});

			// Extract highlights from content marks
			const highlights: HighlightType = [];
			session.analyzedContent.content.content?.forEach((node) => {
				if (node.type === "paragraph" && node.content) {
					node.content.forEach((textNode) => {
						const highlightMark = textNode.marks?.find(
							(mark): mark is HighlightMark =>
								typeof mark === "object" &&
								mark.type === "entityReference" &&
								"attrs" in mark &&
								typeof mark.attrs === "object" &&
								mark.attrs !== null &&
								"id" in mark.attrs &&
								"labelType" in mark.attrs
						);
						if (highlightMark && textNode.text) {
							highlights.push({
								id: highlightMark.attrs.id,
								labelType: highlightMark.attrs.labelType,
								text: textNode.text,
							});
						}
					});
				}
			});

			const result = {
				content: session.analyzedContent.content,
				highlights: session.analyzedContent.highlights || [],
				relationships: session.analyzedContent.relationships,
			};
			console.log("📤 Returning analyzed content:", {
				highlightCount: highlights.length,
				relationshipCount: result.relationships?.length,
				firstHighlight: highlights[0],
				storedHighlights: session.analyzedContent.highlights?.length,
				extractedHighlights: highlights.length,
			});
			return result;
		}

		const result = {
			content: session.inputContent.content,
		};
		console.log("📤 Returning input content:", result);
		return result;
	}
}
