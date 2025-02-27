import Dexie, { type Table } from "dexie";
import type { RemirrorJSON } from "remirror";
import type { ModelName, HighlightWithText } from "./services/models/types";
import type { Relationship } from "./utils/relationshipTypes";

// Define types for our database content
export interface EditorContent {
	id?: number;
	content: RemirrorJSON;
	highlights: HighlightWithText[];
	relationships: Relationship[];
	updatedAt: Date;
}

// Define the Session type
export interface Session {
	id?: number;
	title: string;
	createdAt: Date;
	status: "input" | "analysis";
	highlightCount: number;

	// Input step content
	inputContent: {
		content: RemirrorJSON;
		updatedAt: Date;
	};

	// Analysis content (optional until analysis is performed)
	analysedContent?: AnalysedContent;

	lastModified: Date;
}

export interface AnalysedContent {
	modelName: ModelName;
	promptId: string;
	content: RemirrorJSON;
	highlights: HighlightWithText[];
	relationships: Relationship[];
	highlightCount: number;
	updatedAt: Date;
}

// Create and export the database class
export class EditorDatabase extends Dexie {
	editorContent!: Table<EditorContent>;
	sessions!: Table<Session>;

	constructor() {
		super("EditorDatabase");

		// Define schemas for all tables
		this.version(8).stores({
			editorContent: "++id, updatedAt",
			sessions: "++id, createdAt, status, lastModified, highlightCount",
		});

		// Add hooks to ensure content is properly handled
		this.sessions.hook("reading", (obj) => {
			if (obj.analysedContent?.content) {
				// Ensure the content is properly structured
				if (!obj.analysedContent.content.type) {
					obj.analysedContent.content = {
						type: "doc",
						content: [],
					};
				}
			}
			return obj;
		});

		// Log schema info after initialization
		console.log(
			"Database initialized with schema:",
			this.tables.map((table) => ({
				name: table.name,
				schema: table.schema,
			}))
		);
	}
}

// Create and export a single instance
export const db = new EditorDatabase();
