import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import { EditorPage } from "./pages/EditorPage";
import { EvalPage } from "./pages/EvalPage";

type AppProps = {
	placeholder?: string;
};

const App = ({ placeholder }: AppProps) => {
	return (
		<Router>
			<div>
				{/* Navigation */}
				<nav className="text-slate-600 p-4">
					<div className="mx-auto flex gap-4">
						<Link to="/" className="hover:text-slate-800">
							Editor
						</Link>
						<Link to="/evals" className="hover:text-slate-800">
							Model Evaluation
						</Link>
					</div>
				</nav>

				{/* Routes */}
				<Routes>
					<Route path="/" element={<EditorPage placeholder={placeholder} />} />
					<Route path="/evals" element={<EvalPage />} />
				</Routes>
			</div>
		</Router>
	);
};

export default App;
