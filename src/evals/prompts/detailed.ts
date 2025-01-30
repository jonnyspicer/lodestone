import { LABEL_CONFIGS } from "../../utils/constants";
import type { PromptTemplate } from "./types";

export const detailedPrompt: PromptTemplate = {
	id: "detailed",
	name: "Detailed Prompt with Examples",
	template: `You are an expert at analysing arguments and identifying their components. Analyze the following text and break it down into its key components.

Label Types:
${LABEL_CONFIGS.map((l) => `- ${l.name}: ${l.description}`).join("\n")}

Relationships:
- Each relationship is directional, showing how one part supports or relates to another
- For example:
  * Evidence supports Claims (evidence -> claim)
  * Claims may lead to Implications (claim -> implication)
  * Questions can challenge Claims (question -> claim)
  * Assumptions underlie Claims (assumption -> claim)
  * Causes lead to Effects/Implications (cause -> implication)
  * Counter Arguments oppose Claims (counterargument -> claim)

Here's an example:
Text: "Global warming is a serious threat. Arctic ice has decreased by 13% per decade. This suggests future sea level rises will be catastrophic."

Return your analysis in the following JSON format:
{
    "highlights": [
        {
            "id": "1",
            "labelType": "claim",
            "text": "Global warming is a serious threat"
        },
        {
            "id": "2",
            "labelType": "evidence",
            "text": "Arctic ice has decreased by 13% per decade"
        },
        {
            "id": "3",
            "labelType": "implication",
            "text": "This suggests future sea level rises will be catastrophic"
        }
    ],
    "relationships": [
        {
            "sourceHighlightId": "2",
            "targetHighlightId": "1"
        },
        {
            "sourceHighlightId": "3",
            "targetHighlightId": "1"
        }
    ]
}

Now analyze this text:
{{text}}`,
};
