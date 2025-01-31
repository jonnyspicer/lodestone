import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import { EditorPage } from "./pages/EditorPage";
import { EvalPage } from "./pages/EvalPage";
import { SessionsPage } from "./pages/SessionsPage";

const App = () => {
	return (
		<Router>
			<div>
				{/* Navigation */}
				<nav className="text-slate-600 p-4">
					<div className="mx-auto flex gap-4">
						<Link to="/" className="hover:text-slate-800">
							Sessions
						</Link>
						<Link to="/evals" className="hover:text-slate-800">
							Model Evaluation
						</Link>
					</div>
				</nav>

				{/* Routes */}
				<Routes>
					<Route path="/" element={<SessionsPage />} />
					<Route path="/evals" element={<EvalPage />} />
					<Route
						path="/sessions/:id/input"
						element={<EditorPage mode="input" />}
					/>
					<Route
						path="/sessions/:id/analysis"
						element={<EditorPage mode="analysis" />}
					/>
				</Routes>
			</div>
		</Router>
	);
};

export default App;
