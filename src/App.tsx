import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import { EditorPage } from "./pages/EditorPage";
import { EvalPage } from "./pages/EvalPage";
import { SessionsPage } from "./pages/SessionsPage";
import { InputPage } from "./pages/InputPage";

const App = () => {
	return (
		<Router>
			<div>
				{/* Navigation */}
				<nav className="text-slate-600 p-8">
					<div className="container mx-auto relative">
						<div className="flex justify-center">
							<Link to="/" className="hover:text-slate-800">
								<img
									src="/src/components/Logo.svg"
									alt="Logo"
									className="h-6 w-auto"
								/>
							</Link>
						</div>
						<div className="absolute right-0 top-0">
							<Link to="/evals" className="hover:text-slate-800 text-sm">
								Model Evaluation
							</Link>
						</div>
					</div>
				</nav>

				{/* Routes */}
				<Routes>
					<Route path="/" element={<SessionsPage />} />
					<Route path="/input" element={<InputPage />} />
					<Route path="/input/:id" element={<InputPage />} />
					<Route path="/evals" element={<EvalPage />} />
					<Route
						path="/sessions/:id/analysis"
						element={<EditorPage mode="analysis" />}
					/>
					<Route path="/sessions/:id/input" element={<InputPage />} />
				</Routes>
			</div>
		</Router>
	);
};

export default App;
