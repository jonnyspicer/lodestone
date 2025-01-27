import { useCallback } from "react";
import { db } from "../db";
import { highlightMap } from "../utils/highlightMap";

export const ResetDatabaseButton = () => {
	const handleReset = useCallback(async () => {
		try {
			await db.editorContent.clear();
			highlightMap.clear();
			window.location.reload();
		} catch (error) {
			console.error("Failed to reset database:", error);
		}
	}, []);

	return (
		<button
			onClick={handleReset}
			className="mb-4 px-2 py-1 bg-rose-400 text-white rounded cursor-pointer hover:bg-rose-500 transition-colors"
		>
			Reset Database
		</button>
	);
};
