import { http, HttpResponse } from 'msw';

const AI_API_URL = 'http://localhost:20128/v1';

function aiStreamResponse(tokens: string[]) {
  const lines = tokens
    .map((t) =>
      JSON.stringify({
        choices: [{ delta: { content: t }, index: 0, finish_reason: null }],
      }),
    )
    .concat(
      JSON.stringify({
        choices: [
          { delta: { content: null }, index: 0, finish_reason: 'stop' },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    );

  // Prefix each line with "data: "
  const prefixedLines = lines.map((line) => `data: ${line}`);
  prefixedLines.push('data: [DONE]');

  return new HttpResponse(prefixedLines.join('\n'), {
    headers: { 'Content-Type': 'text/plain' },
  });
}

export const handlers = [
  http.post(`${AI_API_URL}/chat/completions`, () => {
    return aiStreamResponse(['Hello', ' world', '!']);
  }),
];
