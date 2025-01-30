import { chatbotsTest } from "./chatbots";
import { alienAiTest } from "./alien-ai";
import type { TestCase } from "./types";

export const TEST_CASES: TestCase[] = [chatbotsTest, alienAiTest];

export type { TestCase };
