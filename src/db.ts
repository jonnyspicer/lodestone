import Dexie, { type Table } from 'dexie';
import type { RemirrorJSON } from 'remirror';

// Define types for our database content
interface EditorContent {
  id?: number;
  content: RemirrorJSON;
  highlights: Array<{
    id: string;
    labelType: string;
  }>;
  updatedAt: Date;
}

// Create and export database class
export class EditorDatabase extends Dexie {
  editorContent!: Table<EditorContent>;

  constructor() {
    super('EditorDatabase');
    this.version(2).stores({
      editorContent: '++id, updatedAt'
    }).upgrade(tx => {
      return tx.table('editorContent').toCollection().modify(doc => {
        doc.highlights = [];
      });
    });
  }
}

// Create and export a db instance
export const db = new EditorDatabase(); 