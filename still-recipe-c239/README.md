# Tandaan Replay AI Worker

Standalone Cloudflare Worker microservice for Tandaan AI features.

## Authentication

All endpoints require:

```http
x-api-key: <API_SECRET>
```

Invalid or missing keys return:

```json
{ "error": "Invalid API key" }
```

## POST /concept-deep-dive

Generates a Concept Deep Dive report: a personalized mastery path for one concept, grounded in the caller-provided document history, replay checkpoints, team debate, and edit friction signals.

The Worker does not store documents permanently. The Next.js app must send the relevant document and replay context on every request.

### Request

```json
{
  "documentId": "doc_123",
  "concept": "statistical significance",
  "subject": "Statistics",
  "assignmentTitle": "Research Methods Group Report",
  "studentLevel": "intermediate",
  "depth": "advanced",
  "documentContext": "[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"We used p < 0.05 to determine statistical significance...\"}]}]",
  "replayContext": {
    "versions": [
      {
        "versionId": "v1",
        "timestamp": "2026-05-24T10:00:00.000Z",
        "content": "Statistical significance means the result is probably true.",
        "summary": {
          "addedBlocks": 2,
          "updatedBlocks": 1,
          "removedBlocks": 0
        }
      },
      {
        "versionId": "v2",
        "timestamp": "2026-05-24T10:12:00.000Z",
        "content": "Statistical significance means the observed result is unlikely under the null hypothesis.",
        "aiNarrative": "The team corrected the definition after revision.",
        "summary": {
          "addedBlocks": 1,
          "updatedBlocks": 5,
          "removedBlocks": 2
        }
      }
    ],
    "struggleSignals": [
      {
        "versionId": "v2",
        "signal": "deleted_definition",
        "evidence": [
          "Original definition was replaced",
          "Several edits changed the meaning of p < 0.05"
        ]
      }
    ],
    "teamDebate": [
      {
        "authorName": "Alex",
        "text": "Does p < 0.05 mean the hypothesis is 95% likely?"
      },
      {
        "authorName": "Mia",
        "text": "I think it means the result is unlikely if the null is true."
      }
    ]
  },
  "options": {
    "includePracticeQuestions": true,
    "includeMisconceptions": true,
    "includeResearchDirections": true,
    "includeExternalSearchQueries": true
  }
}
```

### Response

```json
{
  "concept": "statistical significance",
  "subject": "Statistics",
  "masteryLevel": "developing",
  "confidence": 0.86,
  "whyThisConceptMatters": "This concept matters because the document uses p < 0.05 to justify the interpretation of research results.",
  "whereItAppeared": [
    {
      "versionId": "v2",
      "reason": "The definition was revised from a probability-of-truth framing to a null-hypothesis framing.",
      "evidence": [
        "Original definition was replaced",
        "Several edits changed the meaning of p < 0.05"
      ]
    }
  ],
  "groundedExplanation": {
    "shortExplanation": "Statistical significance means the observed result would be unlikely if the null hypothesis were true.",
    "deeperExplanation": "A p-value below 0.05 does not prove the hypothesis is true. It means that, assuming the null hypothesis is true, the observed result or something more extreme would be uncommon under the model.",
    "projectSpecificConnection": "Your document originally treated p < 0.05 as a confidence score, then revised it toward a null-hypothesis explanation.",
    "simpleExample": "If a coin is assumed fair but lands heads 95 times out of 100, that result would be surprising under the fair-coin assumption."
  },
  "misconceptionCheck": [
    {
      "misconception": "p < 0.05 means there is a 95% chance the hypothesis is true.",
      "whyItIsWrong": "The p-value is calculated assuming the null hypothesis, not by assigning probability to the research hypothesis.",
      "howToFixThinking": "Read p-values as evidence against a null model, not as the probability that your claim is correct."
    }
  ],
  "deepQuestions": [
    {
      "question": "Why does p < 0.05 not mean the research hypothesis has a 95% probability of being true?",
      "whyThisQuestionMatters": "Answering this separates statistical evidence from probability claims about hypotheses.",
      "expectedReasoningPath": [
        "Identify the null hypothesis",
        "Explain what the p-value is conditioned on",
        "Distinguish unlikely data under a model from probability that a hypothesis is true"
      ]
    }
  ],
  "practiceQuestions": [
    {
      "difficulty": "medium",
      "question": "A study reports p = 0.03. What can and cannot be concluded?",
      "answerGuide": "You can say the result is unlikely under the null hypothesis at the 0.05 threshold. You cannot say the hypothesis is 97% likely to be true."
    }
  ],
  "researchDirections": [
    {
      "title": "Common p-value misunderstandings",
      "whyExploreThis": "Your replay history suggests this exact misconception appeared in the project.",
      "searchQuery": "p-value common misconceptions null hypothesis explanation"
    }
  ],
  "nextStudyStep": "Rewrite the document's explanation of p < 0.05 in your own words, then answer the deep question without using the phrase 'chance the hypothesis is true.'",
  "processingTime": 842,
  "cached": false
}
```

### Cache Behavior

If the optional `CACHE` KV binding exists, responses are cached by endpoint, `documentId`, `concept`, `studentLevel`, `depth`, document context hash, latest relevant version content hash, and struggle/team debate signal hash.

TTL by depth:

- `standard`: 24 hours
- `advanced`: 12 hours
- `research`: 6 hours

The HTTP response always includes:

```http
Cache-Control: private, max-age=60
X-Content-Type-Options: nosniff
```

### Security Notes

- The Worker validates request bodies with Zod.
- The Worker does not perform web search, YouTube lookup, or paper lookup.
- Research directions are search queries only, not citations or links.
- The Worker does not log request bodies, full document content, or secrets.
- AI output is parsed and schema-validated. Invalid model output returns a deterministic fallback with HTTP 200.

### Recommended Next.js Caller Behavior

- Send only the relevant document/replay context for the requested concept.
- Prefer replay versions near high edit friction, comments, or definition changes.
- Show `confidence` and `nextStudyStep` in the UI.
- Treat `researchDirections.searchQuery` as a starting point for a future curated search workflow, not as verified recommendations.
- Reuse cached Worker responses when the same document history and concept are requested.
