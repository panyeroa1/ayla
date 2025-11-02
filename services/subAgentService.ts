// FIX: Removed invalid file header.
import {
  generateImage,
  generateProText,
  analyzeTradingDataWithFlash,
  summarizeText,
  generateLowLatencyText,
} from './geminiService';
import { ActiveToolCall, AppSettings, WorkspaceContent } from '../types';

export async function executeTool(toolCall: ActiveToolCall, settings: AppSettings): Promise<WorkspaceContent> {
  console.log(`Executing tool: ${toolCall.name}`, toolCall.args);

  try {
    switch (toolCall.name) {
      case 'generateImage': {
        const defaultAspectRatio = settings.toolSettings.generateImage?.aspectRatio || '1:1';
        const aspectRatio = toolCall.args.aspectRatio || defaultAspectRatio;
        const result = await generateImage(toolCall.args.prompt, aspectRatio);
        return { type: 'image', data: result, prompt: toolCall.args.prompt };
      }

      case 'generateProText': {
        const result = await generateProText(toolCall.args.prompt);
        return {
          type: 'code',
          data: { text: result, language: toolCall.args.language || 'text' },
          prompt: toolCall.args.prompt
        };
      }

      case 'analyzeTradingData': {
        const result = await analyzeTradingDataWithFlash(toolCall.args.tradingData, toolCall.args.analysisPrompt);
        return { type: 'text', data: { text: result }, prompt: toolCall.args.analysisPrompt };
      }

      case 'generateFastText': {
        const result = await generateLowLatencyText(toolCall.args.prompt);
        return { type: 'text', data: { text: result }, prompt: toolCall.args.prompt };
      }

      case 'summarizeText': {
        const result = await summarizeText(toolCall.args.text);
        return { type: 'text', data: { text: result }, prompt: 'Summary' };
      }

      default:
        console.warn(`Unknown tool call: ${toolCall.name}`);
        return { type: 'text', data: { text: `Error: Tool "${toolCall.name}" is not implemented.` } };
    }
  } catch (error) {
    console.error(`Error executing tool ${toolCall.name}:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { type: 'text', data: { text: `Error executing tool "${toolCall.name}": ${errorMessage}` } };
  }
}