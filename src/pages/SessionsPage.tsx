import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { SessionManager } from "../utils/sessionManager";
import { formatDistanceToNowStrict } from "date-fns";

export const SessionsPage = () => {
	const navigate = useNavigate();
	const sessions = useLiveQuery(() => SessionManager.getSessions(), [], []);

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
						className="border rounded-lg py-5 px-6 bg-offWhite hover:bg-white cursor-pointer transition-all"
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
												d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
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
