import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import type { RemirrorJSON } from "remirror";
import { Session } from "../db";
import { SessionManager } from "../utils/sessionManager";

export function useSessionManager() {
	const { id } = useParams();
	const [session, setSession] = useState<Session | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [topic, setTopic] = useState("");
	const [content, setContent] = useState<RemirrorJSON>({
		type: "doc",
		content: [{ type: "paragraph" }],
	});
	const [isDirty, setIsDirty] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Fetch session data
	useEffect(() => {
		const fetchSession = async () => {
			if (!id) return;
			try {
				setIsLoading(true);
				const fetchedSession = await SessionManager.getSession(parseInt(id));
				if (fetchedSession) {
					setSession(fetchedSession);
					setTopic(fetchedSession.title);
					setContent(fetchedSession.inputContent.content);
				}
			} catch (error) {
				console.error("Error fetching session:", error);
			} finally {
				setIsLoading(false);
			}
		};

		fetchSession();
	}, [id]);

	// Handle content changes
	const handleContentChange = useCallback((json: RemirrorJSON) => {
		setContent(json);
		setIsDirty(true);
	}, []);

	// Handle topic changes
	const handleTopicChange = useCallback((newTopic: string) => {
		setTopic(newTopic);
		setIsDirty(true);
	}, []);

	// Save changes to existing session
	const saveChanges = useCallback(async () => {
		if (!id || !isDirty) return;

		try {
			await SessionManager.updateInputContent(parseInt(id), content);
			await SessionManager.updateSessionTitle(parseInt(id), topic);
			setIsDirty(false);
			console.log("Changes saved successfully");
		} catch (error) {
			console.error("Failed to save changes:", error);
		}
	}, [id, content, topic, isDirty]);

	// Handle blur event (save when input loses focus)
	const handleInputBlur = useCallback(() => {
		if (isDirty) {
			saveChanges();
		}
	}, [isDirty, saveChanges]);

	return {
		session,
		isLoading,
		topic,
		content,
		isDirty,
		error,
		setError,
		handleContentChange,
		handleTopicChange,
		handleInputBlur,
		saveChanges,
		sessionId: id ? parseInt(id) : null,
	};
}
