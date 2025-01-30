import { LABEL_CONFIGS } from "../../utils/constants";
import type { PromptTemplate } from "./types";

export const detailedPrompt: PromptTemplate = {
	id: "detailed",
	name: "Detailed Prompt with Examples",
	template: `You are an expert at analyzing arguments and identifying their components. Analyze the following text and break it down into its key components.

Label Types:
${LABEL_CONFIGS.map(
	(l) => `- ${l.name}: [brief description of when to use this label]`
).join("\n")}

Relationships:
- Each relationship is directional, showing how one part supports or relates to another
- Example: Evidence supports Claims, Questions relate to Claims, etc.

Here's an example:
Text: "Global warming is a serious threat. Arctic ice has decreased by 13% per decade. This suggests future sea level rises will be catastrophic."

Analysis:
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
