import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { SessionManager } from "../utils/sessionManager";
import { AnalysisOptions } from "../components/AnalysisOptions";

export const AnalyzePage = () => {
	const { sessionId } = useParams<{ sessionId: string }>();
	const [sessionExists, setSessionExists] = useState<boolean>(false);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const navigate = useNavigate();

	useEffect(() => {
		const checkSession = async () => {
			if (!sessionId) {
				navigate("/");
				return;
			}

			try {
				const id = parseInt(sessionId, 10);
				const session = await SessionManager.getSession(id);

				if (!session) {
					navigate("/");
					return;
				}

				setSessionExists(true);
			} catch (error) {
				console.error("Error checking session:", error);
				navigate("/");
			} finally {
				setIsLoading(false);
			}
		};

		checkSession();
	}, [sessionId, navigate]);

	if (isLoading) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<p className="text-lg">Loading...</p>
			</div>
		);
	}

	if (!sessionExists) {
		return null; // Will navigate away
	}

	return (
		<div className="min-h-screen bg-gray-100 p-6">
			<div className="max-w-2xl mx-auto">
				<h1 className="text-2xl font-bold mb-8">Analyze Your Text</h1>

				<p className="mb-6 text-gray-700">
					Choose your analysis options below. The text will be analyzed and
					labeled according to your selected settings.
				</p>

				<AnalysisOptions sessionId={parseInt(sessionId as string, 10)} />
			</div>
		</div>
	);
};
