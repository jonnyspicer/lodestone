# Dynamic Questions Feature Specification

## Overview

This document outlines the implementation of a new "Dynamic Questions" feature for the non-fiction writing app. The feature will provide users with contextually relevant, thought-provoking questions as they write their initial ideas, helping to stimulate deeper critical thinking and more comprehensive content generation.

## Core Functionality

As users type in the initial ideas input field, the application will:
1. Display default prompting questions when the user begins typing
2. Analyze the text being written and the topic
3. Generate dynamic, contextually relevant questions using OpenAI's GPT-4o mini
4. Display these questions alongside the input box
5. Cycle through questions as more content is written
6. Allow users to expand/collapse to see all generated questions

## User Interface Requirements

### Layout
- Questions will appear on the right side of the input box, aligned with the top
- 24px spacing between input box and questions section
- 16px spacing between individual questions
- Maximum of 3-4 questions visible at any time by default
- Toggle button to expand/collapse and show all questions

### Text & Styling
- Questions text: text-sm, text-zinc-600, font-medium (Tailwind classes)
- Subtle visual indication when new questions are loading
- Toggle button text: "Show all (X)" / "Show fewer"

### Animations
- Fade-in animation for questions appearing on the right when user starts typing
- Fade-out/fade-in animation when cycling questions
- Smooth transition for expanding/collapsing all questions
- Pulsing dot loading indicator (w-2 h-2 rounded-full bg-gray-400)

## Technical Architecture

### Data Model
```typescript
export interface DynamicQuestion {
    id?: number;
    sessionId: number;
    question: string;
    generatedAt: Date;
    triggeringText: string;  // The text that prompted this question
    isInitialQuestion: boolean;  // To distinguish between default and AI-generated questions
    wasShown: boolean;  // Track if it was ever displayed to user
    shownAt?: Date;    // When it was displayed
    removedAt?: Date;  // When it was cycled out
}

// Update Session interface
export interface Session {
    // ... existing fields ...
    dynamicQuestions?: DynamicQuestion[];
}
```

### Database Changes
Add a new `dynamicQuestions` table to the Dexie DB schema to store the questions.

### Components

1. **DynamicQuestionsPanel** - Container for displaying questions
   - Accepts questions array and loading status
   - Handles display and animation of questions

2. **ExpandableQuestionList** - Enhanced version with toggle functionality
   - Manages expanded/collapsed state
   - Shows loading indicator
   - Handles animation and transitions

3. **PulsingDot** - Loading indicator
   - Simple pulsing animation for loading state

### Services

1. **DynamicQuestionsService**
   - Handles API calls to OpenAI
   - Implements rate limiting
   - Manages question generation, storage and retrieval
   - Error handling and retry logic

## Interaction Flow

1. **Initial state:**
   - Default placeholder text in input box: "Write down all your initial ideas..."
   
2. **When user starts typing:**
   - Placeholder disappears (standard behavior)
   - Default questions fade in on the right side:
     - "What do you currently believe about this?"
     - "What do you want to say about it?"
     - "Why is this an interesting problem?"

3. **Question generation triggers:**
   - After user types 100+ characters OR
   - After 30 seconds has passed since last API call
   - Additional requirement: User must have paused typing (500ms debounce)

4. **Loading state:**
   - If API response takes >300ms, show subtle loading indicator
   - Pulsing dot appears near where new question will be placed

5. **Questions cycling:**
   - As new dynamic questions are generated, they replace the oldest questions (FIFO)
   - Questions fade out/in during replacement
   - Always maintain maximum 3-4 visible questions

6. **Expand/collapse functionality:**
   - Toggle button shows count of total questions
   - When expanded, all questions are visible
   - When collapsed, only 3-4 most recent questions are visible

## API Integration

### OpenAI Configuration
- Model: gpt-4o-mini
- Maximum token response: 50 tokens
- Default temperature
- System prompt: Instructions to act as critical thinking assistant

### Request Strategy
- Send only the most recent 1000 characters of content
- Include the topic/title of the session
- Include list of previously shown questions to avoid repetition

### Rate Limiting
- Maximum 10 calls per minute
- Minimum 6 seconds between calls
- Debounce user input by 500ms before checking if API call should be made

## Error Handling

1. **API Failures:**
   - First failure: retry after 3-second delay
   - Second failure: skip this trigger, wait for next natural trigger
   - No user-facing error messages for API failures

2. **Loading State:**
   - Only show loading indicator if response takes >300ms
   - This prevents flickering for quick responses

## Persistence Strategy
- Save questions to database as they're generated
- Don't update session's lastModified timestamp for question generation
- Maintain complete history of all questions for potential future reference

## Testing Plan

### Functional Testing
- Verify questions appear when typing begins
- Confirm new questions are generated after 100 characters typed
- Confirm new questions are generated after 30 seconds
- Verify loading indicator appears appropriately
- Test expand/collapse functionality
- Verify FIFO question cycling

### Performance Testing
- Measure impact on typing performance/input lag
- Verify API rate limiting works correctly
- Test with long input sessions (10+ minutes of writing)

### Error Handling Testing
- Test retry behavior with simulated API failures
- Verify graceful fallback when API is unavailable

## Developer Implementation Notes

1. Start with the database model changes to add the `dynamicQuestions` table
2. Implement the dynamic questions service with API integration
3. Create the UI components for displaying questions
4. Wire up the debounce and trigger logic for API calls
5. Implement the expand/collapse functionality
6. Add animations and transitions
7. Thoroughly test all error cases and edge conditions

## Additional Considerations

- All animations and transitions should be smooth and subtle
- The feature should never interrupt the user's writing flow
- Consider accessibility for all interactive elements
- Ensure mobile responsiveness for the questions panel
