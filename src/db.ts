import Dexie, { type Table } from "dexie";
import type { RemirrorJSON } from "remirror";

// Define types for our database content
export interface EditorContent {
	id?: number;
	content: RemirrorJSON;
	highlights: Array<{
		id: string;
		labelType: string;
		attrs?: {
			labelType: string;
			type: string;
		};
	}>;
	updatedAt: Date;
}

// Create and export the database class
export class EditorDatabase extends Dexie {
	editorContent!: Table<EditorContent>;

	constructor() {
		super("EditorDatabase");
		this.version(1).stores({
			editorContent: "++id, updatedAt",
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
