export type LabelConfig = {
	id: string;
	name: string;
	color: string;
};

export const LABEL_CONFIGS: LabelConfig[] = [
	{ id: "claim", name: "Claim", color: "#FADF18" },
	{ id: "evidence", name: "Evidence", color: "#1BE2C9" },
	{ id: "assumption", name: "Assumption", color: "#7E4CE9" },
	{ id: "implication", name: "Implication", color: "#83E927" },
	{ id: "question", name: "Question", color: "#27B9E9" },
	{ id: "counterargument", name: "Counter Argument", color: "#E92727" },
	{ id: "cause", name: "Cause", color: "#FF8B38" },
];
