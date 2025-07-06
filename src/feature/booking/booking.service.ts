import { Injectable } from '@nestjs/common';
import { getSearchPersonalInfoTool } from './agent-tools.js';
import { Agent, run } from '@openai/agents';
import type { Response } from 'express';

@Injectable()
export class BookingService {
  async askToHector(message: string): Promise<{ reply: string }> {
    // NOTA: El siguiente código solo funcionará si tu proyecto está configurado como ESM.
    // Si tu proyecto sigue en CommonJS, debes migrar a ESM para que @openai/agents funcione.
    const searchPersonalInfo = await getSearchPersonalInfoTool();

    const agent = new Agent({
      name: 'PersonalInfoAgent',
      instructions:
        'You answer questions about Hector using the searchPersonalInfo tool.',
      tools: [searchPersonalInfo],
    });
    const result = await run(agent, message);
    return { reply: result.finalOutput as string };
  }

  async askToHectorStream(message: string, res: Response): Promise<void> {
    const searchPersonalInfo = await getSearchPersonalInfoTool();
    const agent = new Agent({
      name: 'PersonalInfoAgent',
      instructions:
        'You answer questions about Hector using the searchPersonalInfo tool.',
      tools: [searchPersonalInfo],
    });
    // Habilita streaming en la respuesta
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      const stream = await run(agent, message, { stream: true });

      for await (const chunk of stream) {
        let delta: string | undefined = undefined;

        if (typeof chunk === 'string') {
          delta = chunk;
        } else if (chunk && typeof chunk === 'object') {
          if ('delta' in chunk && typeof chunk.delta === 'string') {
            delta = chunk.delta;
          } else if ('text' in chunk && typeof chunk.text === 'string') {
            delta = chunk.text;
          } else if ('data' in chunk && typeof chunk.data === 'string') {
            delta = chunk.data;
          }
        }

        if (delta) {
          res.write(`data: ${JSON.stringify(delta)}\n\n`);
        }
      }
    } catch (err) {
      res.write(`data: {"error": "Streaming error"}\n\n`);
    } finally {
      res.write('event: end\ndata: [DONE]\n\n');
      res.end();
    }
  }
}
