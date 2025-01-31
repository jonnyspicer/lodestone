import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { SessionManager } from "../utils/sessionManager";

export const SessionsPage = () => {
	const navigate = useNavigate();
	const [isCreating, setIsCreating] = useState(false);
	const [newSessionTitle, setNewSessionTitle] = useState("");

	// Live query sessions from the database
	const sessions = useLiveQuery(() => SessionManager.getSessions(), [], []);

	const handleCreateSession = async () => {
		if (!newSessionTitle.trim()) return;

		try {
			const session = await SessionManager.createSession(newSessionTitle, {
				type: "doc",
				content: [{ type: "paragraph" }],
			});
			setIsCreating(false);
			setNewSessionTitle("");
			navigate(`/sessions/${session.id}/input`);
		} catch (error) {
			console.error("Failed to create session:", error);
		}
	};

	const formatDate = (date: Date) => {
		return new Intl.DateTimeFormat("en-US", {
			dateStyle: "medium",
			timeStyle: "short",
		}).format(new Date(date));
	};

	return (
		<div className="p-4 max-w-4xl mx-auto">
			<div className="flex justify-between items-center mb-8">
				<h1 className="text-2xl font-bold">Lodestone Sessions</h1>
				{!isCreating ? (
					<button
						onClick={() => setIsCreating(true)}
						className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
					>
						New Session
					</button>
				) : (
					<div className="flex gap-2">
						<input
							type="text"
							value={newSessionTitle}
							onChange={(e) => setNewSessionTitle(e.target.value)}
							placeholder="Enter session title..."
							className="border rounded px-3 py-2"
							autoFocus
						/>
						<button
							onClick={handleCreateSession}
							disabled={!newSessionTitle.trim()}
							className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
						>
							Create
						</button>
						<button
							onClick={() => {
								setIsCreating(false);
								setNewSessionTitle("");
							}}
							className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
						>
							Cancel
						</button>
					</div>
				)}
			</div>

			<div className="grid gap-4">
				{sessions?.map((session) => (
					<div
						key={session.id}
						className="border rounded p-4 hover:border-blue-500 cursor-pointer"
						onClick={() =>
							navigate(`/sessions/${session.id}/${session.status}`)
						}
					>
						<div className="flex justify-between items-start">
							<div>
								<h2 className="text-xl font-semibold">{session.title}</h2>
								<p className="text-sm text-gray-500">
									Created: {formatDate(session.createdAt)}
								</p>
								<p className="text-sm text-gray-500">
									Last modified: {formatDate(session.lastModified)}
								</p>
							</div>
							<span className="px-2 py-1 text-sm rounded bg-gray-100">
								{session.status === "input" ? "Draft" : "Analysed"}
							</span>
						</div>
					</div>
				))}

				{sessions?.length === 0 && (
					<div className="text-center text-gray-500 py-8">
						No sessions yet. Click "New Session" to get started.
					</div>
				)}
			</div>
		</div>
	);
};
