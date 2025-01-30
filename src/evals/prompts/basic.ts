import { LABEL_CONFIGS } from "../../utils/constants";
import type { PromptTemplate } from "./types";

export const basicPrompt: PromptTemplate = {
	id: "basic",
	name: "Basic Prompt",
	template: `Analyze the following text and identify key components of the argument. Label different parts of the text using these labels: ${LABEL_CONFIGS.map(
		(l) => l.name
	).join(", ")}.

Also identify relationships between these labeled components. A relationship is directional, showing how one part of the text connects to or supports another.

Text to analyze:
{{text}}

Return your analysis in the following JSON format:
{
    "highlights": [
        {
            "id": "1",
            "labelType": "claim",
            "text": "exact text from the input"
        }
    ],
    "relationships": [
        {
            "sourceHighlightId": "2",
            "targetHighlightId": "1"
        }
    ]
}`,
};
