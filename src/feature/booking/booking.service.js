import { getSearchPersonalInfoTool } from './agent-tools.js';
import { Agent, run } from '@openai/agents';

export async function askToHector(message) {
  const searchPersonalInfo = await getSearchPersonalInfoTool();
  const agent = new Agent({
    name: 'PersonalInfoAgent',
    instructions: 'You answer questions about Hector using the searchPersonalInfo tool.',
    tools: [searchPersonalInfo],
  });
  const result = await run(agent, message);
  return { reply: result.finalOutput };
}

export async function askToHectorStream(message, res) {
  const searchPersonalInfo = await getSearchPersonalInfoTool();
  const agent = new Agent({
    name: 'PersonalInfoAgent',
    instructions: 'You answer questions about Hector using the searchPersonalInfo tool.',
    tools: [searchPersonalInfo],
  });
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = await run(agent, message, { stream: true });
    for await (const chunk of stream) {
      let delta = undefined;
      if (typeof chunk === 'string') {
        delta = chunk;
      } else if (chunk && typeof chunk === 'object') {
        if ('data' in chunk && typeof chunk.data === 'object') {
          const DataChuk = chunk.data;
          if ('delta' in DataChuk && typeof DataChuk.delta === 'string') {
            delta = DataChuk.delta;
          }
          if ('text' in DataChuk && typeof DataChuk.text === 'string') {
            delta = DataChuk.text;
          }
        } else if ('text' in chunk && typeof chunk.text === 'string') {
          delta = chunk.text;
        } else if ('data' in chunk && typeof chunk.data === 'string') {
          delta = chunk.data;
        }
      }
      if (delta) {
        res.write(`data: ${JSON.stringify(delta)}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    }
  } catch (err) {
    res.write(`data: {\"error\": \"Streaming error\"}\n\n`);
  } finally {
    res.write('event: end\ndata: [DONE]\n\n');
    res.end();
  }
}
