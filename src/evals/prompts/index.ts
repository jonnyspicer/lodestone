import { basicPrompt } from "./basic";
import { detailedPrompt } from "./detailed";
import type { PromptTemplate } from "./types";

export const PROMPT_TEMPLATES: PromptTemplate[] = [basicPrompt, detailedPrompt];

export type { PromptTemplate };
