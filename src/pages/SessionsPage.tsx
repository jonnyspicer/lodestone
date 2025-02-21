import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { SessionManager } from "../utils/sessionManager";

export const SessionsPage = () => {
	const navigate = useNavigate();
	const sessions = useLiveQuery(() => SessionManager.getSessions(), [], []);

	const formatDate = (date: Date) => {
		return new Intl.DateTimeFormat("en-US", {
			dateStyle: "medium",
			timeStyle: "short",
		}).format(new Date(date));
	};

	return (
		<div className="p-4 max-w-6xl mx-auto">
			<div className="flex justify-between items-center mb-8">
				<h2>Sessions</h2>
				<button
					onClick={() => navigate("/input")}
					className="px-3 py-1.5 bg-primary text-white text-sm rounded-full hover:bg-blue-600"
				>
					New
				</button>
			</div>

			<div className="grid gap-4">
				{sessions?.map((session) => (
					<div
						key={session.id}
						className="border rounded p-4 hover:border-blue-500 cursor-pointer"
						onClick={() =>
							navigate(
								session.status === "input"
									? `/input/${session.id}`
									: `/sessions/${session.id}/analysis`
							)
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
