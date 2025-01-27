export type LabelConfig = {
	id: string;
	name: string;
	color: string;
};

export const LABEL_CONFIGS: LabelConfig[] = [
	{ id: "claim", name: "Claim", color: "#FFE25B" },
	{ id: "evidence", name: "Evidence", color: "#1BE2C9" },
	{ id: "question", name: "Question", color: "#78DEFF" },
	{ id: "counterargument", name: "Counter Argument", color: "#ff8a65" },
	{ id: "implication", name: "Implication", color: "#FF8B38" },
];
