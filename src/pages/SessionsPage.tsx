import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { SessionManager } from "../utils/sessionManager";
import { formatDistanceToNowStrict } from "date-fns";
import { useState } from "react";

export const SessionsPage = () => {
	const navigate = useNavigate();
	const sessions = useLiveQuery(() => SessionManager.getSessions(), [], []);
	const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

	const handleDelete = async (sessionId: number) => {
		try {
			await SessionManager.deleteSession(sessionId);
		} catch (error) {
			console.error("Failed to delete session:", error);
		} finally {
			setConfirmDelete(null);
		}
	};

	const handleSessionClick = (sessionId: number, status: string) => {
		navigate(
			status === "input"
				? `/analyse/${sessionId}`
				: `/sessions/${sessionId}/analysis`
		);
	};

	return (
		<div className="p-4 max-w-6xl mx-auto">
			<div className="flex justify-between items-end mb-6">
				<h2>Sessions</h2>
				<button
					onClick={() => navigate("/input")}
					className="px-3 py-1.5 bg-white text-zinc-700 text-sm rounded-full hover:shadow-lg shadow-sm border border-zinc-100 hover:border-zinc-200 transition-all font-medium flex items-center gap-1"
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 16 16"
						fill="none"
						stroke="rgb(168 162 158)"
						strokeWidth="2"
					>
						<path d="M8 3v10M3 8h10" strokeLinecap="round" />
					</svg>
					New session
				</button>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{sessions?.map((session) => (
					<div
						key={session.id}
						className="border rounded-lg py-5 px-6 bg-offWhite hover:bg-white transition-all duration-300 shadow-sm hover:shadow-lg relative"
					>
						<div
							className="flex justify-between items-start cursor-pointer"
							onClick={() => handleSessionClick(session.id!, session.status)}
						>
							<div>
								<h2 className="text-xl font-semibold mb-2">{session.title}</h2>
								<div className="flex flex-row items-center gap-2">
									<p className="text-sm text-zinc-500 flex flex-row items-center gap-0.5">
										<svg
											className="w-4 h-4 inline-block mr-1"
											viewBox="0 0 24 24"
											width="16"
											height="16"
											fill="none"
											stroke="currentColor"
											strokeWidth="2"
										>
											<path
												d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
												strokeLinecap="round"
												strokeLinejoin="round"
											/>
										</svg>
										{formatDistanceToNowStrict(new Date(session.lastModified), {
											addSuffix: true,
										})}
									</p>

									<span className="py-0.5 px-2 text-sm rounded-full font-medium bg-zinc-200 text-zinc-700">
										{session.status === "input" ? "Draft" : "Analysed"}
									</span>
								</div>
							</div>
						</div>

						{/* Delete button */}
						<button
							onClick={(e) => {
								e.stopPropagation();
								setConfirmDelete(session.id!);
							}}
							className="absolute top-3 right-3 p-2 text-zinc-400 hover:text-red-500 transition-colors"
							aria-label="Delete session"
						>
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
							>
								<path
									d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							</svg>
						</button>

						{/* Confirmation dialog */}
						{confirmDelete === session.id && (
							<div className="absolute inset-0 bg-white bg-opacity-90 backdrop-blur-sm flex items-center justify-center z-10 rounded-lg">
								<div className="p-4 text-center">
									<p className="mb-4 font-medium">Delete this session?</p>
									<div className="flex gap-2 justify-center">
										<button
											onClick={(e) => {
												e.stopPropagation();
												handleDelete(session.id!);
											}}
											className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
										>
											Delete
										</button>
										<button
											onClick={(e) => {
												e.stopPropagation();
												setConfirmDelete(null);
											}}
											className="px-4 py-2 bg-zinc-200 text-zinc-700 rounded-md hover:bg-zinc-300 transition-colors"
										>
											Cancel
										</button>
									</div>
								</div>
							</div>
						)}
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
